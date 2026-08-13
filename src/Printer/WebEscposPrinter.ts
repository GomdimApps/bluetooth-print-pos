import { resolveConfig } from '../../config'
import { DefaultBluetoothTransport, isBluetoothSupported } from '../interfaces/bluetooth/DefaultBluetoothTransport'
import { CompatBluetoothTransport } from '../interfaces/bluetooth/CompatBluetoothTransport'
import { QzTransport, isQzSupported } from '../interfaces/qz/QzTransport'
import { SerialTransport, isSerialSupported, type SerialConnectOptions, type SerialPortIdentity } from '../interfaces/serial/SerialTransport'
import { UsbTransport, isUsbSupported, type UsbDeviceIdentity } from '../interfaces/usb/UsbTransport'
import { buildReceiptBytes } from './ReceiptBuilder'
import { normalizePrintError } from '../interfaces/printerErrors'
import { renderPreviewCanvas } from '../Preview/PreviewRenderer'
import type { PrinterTransport } from '../interfaces/PrinterTransport'
import type { BluetoothPrinterProfile } from '../interfaces/bluetooth/profiles'
import type { UsbPrinterProfile } from '../interfaces/usb/profiles'
import type {
  PrinterError,
  PrinterInfo,
  PrinterStatusEvent,
  PrinterStatusName,
  WebEscposPrinterConfig,
  WebEscposPrinterConfigInput,
  PrintJob,
  PrintPreview,
} from '../types'

type Unsubscribe = () => void

export type ConnectOptions =
  | {
      transport?: 'bluetooth'
      /**
       * Uses a broader Bluetooth device picker (`acceptAllDevices: true`) and a
       * larger set of known printer profiles instead of the default's small,
       * filtered picker. Try this when a printer doesn't show up, or doesn't
       * connect, with the default `connect()`. See ../interfaces/bluetooth/CompatBluetoothTransport.ts.
       */
      compat?: boolean
      /**
       * Skips profiles.ts's built-in profile table entirely and connects
       * using this exact filters/service/characteristic/language/codepageMapping
       * — for printers this library doesn't recognize. See
       * BluetoothPrinterProfile (src/interfaces/bluetooth/profiles.ts) for
       * the full field shape, and the README's "Manual Bluetooth profile"
       * section for how to build one. Works combined with `compat: true` too.
       */
      profile?: BluetoothPrinterProfile
    }
  | {
      transport: 'qz'
      /**
       * Target QZ printer name, normally chosen from a prior
       * `listQzPrinters()` call. Falls back to QZ Tray's own default
       * printer (`qz.printers.getDefault()`) when omitted.
       */
      printerName?: string
    }
  | {
      transport: 'serial'
      /**
       * Overrides for `SerialPort.open()` (baudRate/dataBits/stopBits/
       * parity/flowControl/bufferSize). Defaults to 9600 8N1, no flow
       * control — see SerialTransport.ts. The device picker itself shows
       * every COM port; Web Serial has no vendor/product-id-based printer
       * profile to filter it by, unlike Bluetooth/WebUSB.
       */
      options?: SerialConnectOptions
    }
  | {
      transport: 'usb'
      /**
       * Skips profiles.ts's built-in USB profile table entirely and
       * connects using this exact filters/configuration/interface/
       * language/codepageMapping — for printers this library doesn't
       * recognize. See UsbPrinterProfile
       * (src/interfaces/usb/profiles.ts) for the full field shape — same
       * escape hatch as Bluetooth's manual profile, see the README's
       * "Manual Bluetooth profile" section.
       */
      profile?: UsbPrinterProfile
    }

/**
 * Public API of the wrapper. This is what gets exposed as `window.WebEscposPrinter`
 * in the UMD build, so any plain HTML/JS can do:
 *
 *   const printer = new WebEscposPrinter()
 *   connectButton.onclick = () => printer.connect()
 *   printButton.onclick = () => printer.printReceipt({ content: [...] })
 */
export class WebEscposPrinter {
  private readonly config: WebEscposPrinterConfig
  private readonly bluetooth = new DefaultBluetoothTransport()
  private readonly compatBluetooth = new CompatBluetoothTransport()
  private readonly qz: QzTransport
  private readonly serial: SerialTransport
  private readonly usb = new UsbTransport()
  private active: PrinterTransport | null = null
  private readonly listeners = new Set<(event: PrinterStatusEvent) => void>()
  private printing = false

  constructor(config?: WebEscposPrinterConfigInput) {
    this.config = resolveConfig(config)
    // Must be assigned here in the constructor body, not as class-field
    // initializers above — field initializers run in declaration order
    // before any of the constructor's own statements, so `this.config`
    // wouldn't be populated yet if these were too.
    this.qz = new QzTransport({ language: this.config.language, codepageMapping: this.config.codepageMapping })
    this.serial = new SerialTransport({ language: this.config.language, codepageMapping: this.config.codepageMapping })
  }

  /** true if the current browser supports Web Bluetooth. Never throws. */
  static isSupported(): boolean {
    return isBluetoothSupported()
  }

  /**
   * true if this environment has WebSocket support (what the QZ Tray
   * transport is built on). Does NOT mean the QZ Tray desktop app
   * (https://qz.io) is actually installed/running — only connect() can
   * determine that. Never throws.
   */
  static isQzSupported(): boolean {
    return isQzSupported()
  }

  /** true if the current browser supports Web Serial. Never throws. */
  static isSerialSupported(): boolean {
    return isSerialSupported()
  }

  /** true if the current browser supports WebUSB. Never throws. */
  static isUsbSupported(): boolean {
    return isUsbSupported()
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
   * Connects to a printer. Defaults to Bluetooth, which MUST be called from
   * a user gesture (e.g. inside an onclick) — a requirement of the
   * browser's own Web Bluetooth API, not a limitation of this wrapper.
   *
   * Pass `{ compat: true }` to reach Bluetooth printers the default device
   * picker doesn't list — see `ConnectOptions.compat`.
   *
   * Pass `{ transport: 'qz', printerName }` to connect through the QZ Tray
   * desktop app instead — see `listQzPrinters()` to discover `printerName`,
   * since QZ has no native OS device picker the way Web Bluetooth does.
   *
   * Pass `{ transport: 'serial' }` for a USB-cable printer reachable over
   * its virtual COM port — the reliable no-extra-software option on
   * Windows (see SerialTransport.ts). Pass `{ transport: 'usb' }` to talk
   * to its USB bulk endpoint directly instead — cleaner where it works
   * (Linux/macOS/Android), but blocked on Windows the moment an OS printer
   * driver has already claimed the device (see UsbTransport.ts). Both also
   * require a user gesture, same as Bluetooth. `reconnectSerial()`/
   * `reconnectUsb()` re-open a previously granted port/device silently, no
   * user gesture needed.
   */
  async connect(options?: ConnectOptions): Promise<PrinterInfo> {
    this.emit('connecting')
    try {
      const { transport, info } = await this.connectTransport(options)
      this.active = transport
      this.emit('connected', info)
      return info
    } catch (error) {
      const printerError = error as PrinterError
      this.emit('error', null, printerError)
      throw printerError
    }
  }

  /**
   * One case per transport — adding a new one means adding a case here,
   * not touching an if/else chain.
   */
  private async connectTransport(options?: ConnectOptions): Promise<{ transport: PrinterTransport; info: PrinterInfo }> {
    switch (options?.transport) {
      case 'qz': {
        const info = await this.qz.connect(options.printerName)
        return { transport: this.qz, info }
      }

      case 'serial': {
        const info = await this.serial.connect(options.options)
        return { transport: this.serial, info }
      }

      case 'usb': {
        const info = await this.usb.connect(options.profile)
        return { transport: this.usb, info }
      }

      case 'bluetooth':
      case undefined: {
        const transport = options?.compat ? this.compatBluetooth : this.bluetooth
        const info = await transport.connect(options?.profile)
        return { transport, info }
      }
    }
  }

  /**
   * Lists printer names QZ Tray knows about (opens the QZ websocket session
   * if not already open — safe to call before `connect()`, and shares the
   * same underlying QZ transport instance so the session it opens is
   * reused by a later `connect({ transport: 'qz' })` call). Use this to
   * populate a picker UI, since QZ has no native OS device-selection
   * dialog the way Web Bluetooth's `requestDevice()` does.
   */
  async listQzPrinters(query?: string): Promise<string[]> {
    return this.qz.listPrinters(query)
  }

  /**
   * Silently re-opens a serial port the user already granted access to in
   * a previous session — no native picker prompt, so this is safe to call
   * on page load without a user gesture. `previous` is matched against
   * `navigator.serial.getPorts()` by vendor/product id — see
   * SerialTransport.reconnect(). Resolves to `null`, not an error, when
   * nothing matches (e.g. first visit, or the port was revoked); call
   * `connect({ transport: 'serial' })` in that case instead, which does
   * show the picker.
   */
  async reconnectSerial(previous: SerialPortIdentity, options?: SerialConnectOptions): Promise<PrinterInfo | null> {
    this.emit('connecting')
    try {
      const info = await this.serial.reconnect(previous, options)
      if (info) {
        this.active = this.serial
        this.emit('connected', info)
      } else {
        this.emit('idle')
      }
      return info
    } catch (error) {
      const printerError = error as PrinterError
      this.emit('error', null, printerError)
      throw printerError
    }
  }

  /**
   * Silently re-opens a USB device the user already granted access to in a
   * previous session — no native picker prompt, safe to call on page load.
   * `previous` is matched against `navigator.usb.getDevices()` by
   * serialNumber first, falling back to vendor/product id — see
   * UsbTransport.reconnect(). Resolves to `null`, not an error, when
   * nothing matches; call `connect({ transport: 'usb' })` in that case
   * instead, which does show the picker.
   */
  async reconnectUsb(previous: UsbDeviceIdentity, profile?: UsbPrinterProfile): Promise<PrinterInfo | null> {
    this.emit('connecting')
    try {
      const info = await this.usb.reconnect(previous, profile)
      if (info) {
        this.active = this.usb
        this.emit('connected', info)
      } else {
        this.emit('idle')
      }
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
  static renderPreview(job: PrintJob, config?: WebEscposPrinterConfigInput): Promise<PrintPreview> {
    return renderPreviewCanvas(job, resolveConfig(config))
  }

  /** Builds the receipt from a JSON-serializable object and sends it to the printer. */
  async printReceipt(job: PrintJob): Promise<void> {
    return this.guardedPrint(() => buildReceiptBytes(job, this.config))
  }

  /** Escape hatch: sends bytes that are already encoded (e.g. built by hand with ReceiptPrinterEncoder). */
  async printRaw(bytes: Uint8Array | number[]): Promise<void> {
    return this.guardedPrint(async () => (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)))
  }

  /**
   * Shared by printReceipt()/printRaw(): checks connection/busy state,
   * holds the `printing` lock while `buildBytes()` runs and the result is
   * sent, and normalizes/emits any error either step throws.
   */
  private async guardedPrint(buildBytes: () => Promise<Uint8Array>): Promise<void> {
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
      const bytes = await buildBytes()
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

  private emit(status: PrinterStatusName, info?: PrinterInfo | null, error?: PrinterError | null): void {
    const event: PrinterStatusEvent = { status, info: info ?? this.getPrinterInfo(), error: error ?? null }
    for (const listener of this.listeners) listener(event)
  }
}
