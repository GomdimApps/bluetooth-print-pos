import { resolveConfig } from '../../config'
import { DefaultBluetoothTransport, isBluetoothSupported } from '../interfaces/bluetooth/DefaultBluetoothTransport'
import { CompatBluetoothTransport } from '../interfaces/bluetooth/CompatBluetoothTransport'
import { buildReceiptBytes } from './ReceiptBuilder'
import { normalizePrintError } from '../interfaces/printerErrors'
import { renderPreviewCanvas } from '../Preview/PreviewRenderer'
import type { PrinterTransport } from '../interfaces/PrinterTransport'
import type {
  PrinterError,
  PrinterInfo,
  PrinterStatusEvent,
  PrinterStatusName,
  PrinterWrapperConfig,
  PrinterWrapperConfigInput,
  PrintJob,
  PrintPreview,
} from '../types'

type Unsubscribe = () => void

export interface ConnectOptions {
  /**
   * Uses a broader Bluetooth device picker (`acceptAllDevices: true`) and a
   * larger set of known printer profiles instead of the default's small,
   * filtered picker. Try this when a printer doesn't show up, or doesn't
   * connect, with the default `connect()`. See ../interfaces/bluetooth/CompatBluetoothTransport.ts.
   */
  compat?: boolean
}

/**
 * Public API of the wrapper. This is what gets exposed as `window.PrinterWrapper`
 * in the UMD build, so any plain HTML/JS can do:
 *
 *   const printer = new PrinterWrapper()
 *   connectButton.onclick = () => printer.connect()
 *   printButton.onclick = () => printer.printReceipt({ content: [...] })
 */
export class PrinterWrapper {
  private readonly config: PrinterWrapperConfig
  private readonly bluetooth = new DefaultBluetoothTransport()
  private readonly compatBluetooth = new CompatBluetoothTransport()
  private active: PrinterTransport | null = null
  private readonly listeners = new Set<(event: PrinterStatusEvent) => void>()
  private printing = false

  constructor(config?: PrinterWrapperConfigInput) {
    this.config = resolveConfig(config)
  }

  /** true if the current browser supports Web Bluetooth. Never throws. */
  static isSupported(): boolean {
    return isBluetoothSupported()
  }

  /** Subscribes to status/error changes. Returns a function to cancel the subscription. */
  onStatusChange(callback: (event: PrinterStatusEvent) => void): Unsubscribe {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  isConnected(): boolean {
    return this.active?.isConnected() ?? false
  }

  getPrinterInfo(): PrinterInfo | null {
    return this.active?.getInfo() ?? null
  }

  /**
   * Connects to the Bluetooth printer. MUST be called from a user gesture
   * (e.g. inside an onclick) — this is a requirement of the browser's own
   * Web Bluetooth API, not a limitation of this wrapper.
   *
   * Pass `{ compat: true }` to reach printers the default device picker
   * doesn't list — see `ConnectOptions.compat`.
   */
  async connect(options?: ConnectOptions): Promise<PrinterInfo> {
    const transport = options?.compat ? this.compatBluetooth : this.bluetooth

    this.emit('connecting')
    try {
      const info = await transport.connect()
      this.active = transport
      this.emit('connected', info)
      return info
    } catch (error) {
      const printerError = error as PrinterError
      this.emit('error', null, printerError)
      throw printerError
    }
  }

  async disconnect(): Promise<void> {
    await this.active?.disconnect()
    this.emit('disconnected')
  }

  /**
   * Renders `job` to a canvas simulating exactly what would be printed —
   * same column wrapping, same image resize/dithering, real scannable
   * Code128/QR — without a printer. Never touches Bluetooth, so it works
   * even in browsers without Web Bluetooth support. Uses this instance's
   * configured defaults (paperWidth/codepageMapping/etc.), just like
   * `printReceipt()`. `preview.dataUrl` drops straight into an `<img src>`
   * in plain HTML, React or Vue.
   */
  renderPreview(job: PrintJob): Promise<PrintPreview> {
    return renderPreviewCanvas(job, this.config)
  }

  /** Same as the instance method, but usable with zero setup — no instance or connection needed at all. */
  static renderPreview(job: PrintJob, config?: PrinterWrapperConfigInput): Promise<PrintPreview> {
    return renderPreviewCanvas(job, resolveConfig(config))
  }

  /** Builds the receipt from a JSON-serializable object and sends it to the printer. */
  async printReceipt(job: PrintJob): Promise<void> {
    if (!this.active?.isConnected()) {
      const error: PrinterError = { code: 'not-connected', message: 'Call connect() before printing.' }
      this.emit('error', null, error)
      throw error
    }

    if (this.printing) {
      const error: PrinterError = { code: 'busy', message: 'A print job is already in progress.' }
      this.emit('error', null, error)
      throw error
    }

    this.printing = true
    this.emit('printing')

    try {
      const bytes = await buildReceiptBytes(job, this.config)
      await this.active.print(bytes)
      this.emit('connected', this.active.getInfo())
    } catch (error) {
      const printerError = normalizePrintError(error)
      this.emit('error', this.active.getInfo(), printerError)
      throw printerError
    } finally {
      this.printing = false
    }
  }

  /** Escape hatch: sends bytes that are already encoded (e.g. built by hand with ReceiptPrinterEncoder). */
  async printRaw(bytes: Uint8Array | number[]): Promise<void> {
    if (!this.active?.isConnected()) {
      const error: PrinterError = { code: 'not-connected', message: 'Call connect() before printing.' }
      this.emit('error', null, error)
      throw error
    }

    if (this.printing) {
      const error: PrinterError = { code: 'busy', message: 'A print job is already in progress.' }
      this.emit('error', null, error)
      throw error
    }

    this.printing = true
    this.emit('printing')

    try {
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
      await this.active.print(data)
      this.emit('connected', this.active.getInfo())
    } catch (error) {
      const printerError = normalizePrintError(error)
      this.emit('error', this.active.getInfo(), printerError)
      throw printerError
    } finally {
      this.printing = false
    }
  }

  private emit(status: PrinterStatusName, info?: PrinterInfo | null, error?: PrinterError | null): void {
    const event: PrinterStatusEvent = { status, info: info ?? this.getPrinterInfo(), error: error ?? null }
    for (const listener of this.listeners) listener(event)
  }
}
