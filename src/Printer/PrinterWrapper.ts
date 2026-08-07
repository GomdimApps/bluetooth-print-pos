import { resolveConfig } from '../../config'
import { BluetoothPrinter, isBluetoothSupported } from './BluetoothPrinter'
import { buildReceiptBytes } from './ReceiptBuilder'
import type {
  PrinterError,
  PrinterInfo,
  PrinterStatusEvent,
  PrinterStatusName,
  PrinterWrapperConfig,
  PrintJob,
} from '../types'

type Unsubscribe = () => void

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
  private readonly bluetooth = new BluetoothPrinter()
  private readonly listeners = new Set<(event: PrinterStatusEvent) => void>()
  private printing = false

  constructor(config?: Partial<PrinterWrapperConfig>) {
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
    return this.bluetooth.isConnected()
  }

  getPrinterInfo(): PrinterInfo | null {
    return this.bluetooth.getInfo()
  }

  /**
   * Connects to the Bluetooth printer. MUST be called from a user gesture
   * (e.g. inside an onclick) — this is a requirement of the browser's own
   * Web Bluetooth API, not a limitation of this wrapper.
   */
  async connect(): Promise<PrinterInfo> {
    this.emit('connecting')
    try {
      const info = await this.bluetooth.connect()
      this.emit('connected', info)
      return info
    } catch (error) {
      const printerError = error as PrinterError
      this.emit('error', null, printerError)
      throw printerError
    }
  }

  async disconnect(): Promise<void> {
    await this.bluetooth.disconnect()
    this.emit('disconnected')
  }

  /** Builds the receipt from a JSON-serializable object and sends it to the printer. */
  async printReceipt(job: PrintJob): Promise<void> {
    if (!this.bluetooth.isConnected()) {
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
      await this.bluetooth.print(bytes)
      this.emit('connected', this.bluetooth.getInfo())
    } catch (error) {
      const printerError = normalizePrintError(error)
      this.emit('error', this.bluetooth.getInfo(), printerError)
      throw printerError
    } finally {
      this.printing = false
    }
  }

  /** Escape hatch: sends bytes that are already encoded (e.g. built by hand with ReceiptPrinterEncoder). */
  async printRaw(bytes: Uint8Array | number[]): Promise<void> {
    if (!this.bluetooth.isConnected()) {
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
      await this.bluetooth.print(data)
      this.emit('connected', this.bluetooth.getInfo())
    } catch (error) {
      const printerError = normalizePrintError(error)
      this.emit('error', this.bluetooth.getInfo(), printerError)
      throw printerError
    } finally {
      this.printing = false
    }
  }

  private emit(status: PrinterStatusName, info?: PrinterInfo | null, error?: PrinterError | null): void {
    const event: PrinterStatusEvent = { status, info: info ?? this.bluetooth.getInfo(), error: error ?? null }
    for (const listener of this.listeners) listener(event)
  }
}

function normalizePrintError(error: unknown): PrinterError {
  if (isPrinterError(error)) return error
  return { code: 'print-failed', message: error instanceof Error ? error.message : String(error) }
}

function isPrinterError(error: unknown): error is PrinterError {
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error
}
