import type { PrinterInfo, PrinterLanguage } from '../../types'
import type { PrinterTransport } from '../PrinterTransport'
import { normalizeConnectError, normalizeOpenError, normalizePrintError, toPrinterError } from '../printerErrors'

/** true if this browser exposes the Web Serial API. Never throws. */
export function isSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

/** Overrides for `SerialPort.open()`, merged over DEFAULT_SERIAL_OPTIONS below. */
export type SerialConnectOptions = Partial<SerialOptions>

const DEFAULT_SERIAL_OPTIONS: SerialOptions = {
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  bufferSize: 255,
  flowControl: 'none',
}

/** Identifies a previously granted port for reconnect() — see SerialPortInfo. */
export interface SerialPortIdentity {
  usbVendorId?: number
  usbProductId?: number
}

/**
 * Talks to a printer over the virtual COM port its USB cable exposes (Web
 * Serial), instead of Web Bluetooth or QZ Tray — the transport confirmed
 * to reliably reach USB thermal printers across Windows/Linux/macOS with
 * no extra software installed. WebUSB, by contrast, is blocked outright
 * the moment another driver has already claimed the device — an OS
 * printer driver on Windows, or the kernel's own `usblp` module on Linux
 * (see ../usb/UsbTransport.ts) — but a device's virtual serial port stays
 * reachable either way. See AGENTS.md gotcha #11.
 *
 * Ported independently from reading
 * github.com/NielsLeenheer/WebSerialReceiptPrinter's `main.js` (read in
 * full from its `main` branch) — same wire defaults (9600 baud, 8 data
 * bits, 1 stop bit, no parity, no flow control) and the same choice to
 * pass **no filters** to the device picker (any COM port is selectable;
 * unlike Bluetooth/WebUSB, Web Serial has no vendor/product-ID-based
 * printer-profile concept to filter by in the first place) and **no write
 * chunking** (the underlying WritableStream's own backpressure paces
 * writes) — this project no longer depends on that npm package, this file
 * replaces it. Unlike that reference, there's no background read loop/
 * `data` event here: nothing in this project parses printer status
 * responses today (same scope limit as the Bluetooth transports).
 *
 * `language`/`codepageMapping` can't be auto-detected over serial — a
 * SerialPort only reports a USB vendor/product id (SerialPortInfo), not a
 * product name, and this project doesn't ship a vendor/product-id table for
 * serial the way UsbTransport.ts does for WebUSB (a serial device's
 * vendor/product id says which USB-to-serial bridge chip is on the cable,
 * not which printer is attached). `language`/`codepageMapping` therefore
 * always come from whatever this instance was constructed with — same as
 * QzTransport.
 */
export class SerialTransport implements PrinterTransport {
  private port: SerialPort | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private info: PrinterInfo | null = null

  constructor(private readonly reported: { language: PrinterLanguage; codepageMapping?: unknown }) {}

  getInfo(): PrinterInfo | null {
    return this.info
  }

  /** Shows the native port picker (must be called from a user gesture) and opens whatever the user selects. */
  async connect(options?: SerialConnectOptions): Promise<PrinterInfo> {
    if (!isSerialSupported()) {
      throw toPrinterError('unsupported', 'This browser does not support Web Serial.')
    }

    try {
      const port = await navigator.serial.requestPort()
      return await this.open(port, options)
    } catch (error) {
      this.reset()
      throw normalizeConnectError(error)
    }
  }

  /**
   * Re-opens a port the user already granted access to in a previous
   * session, with no picker prompt — matched by the vendor/product id
   * `getInfo()` reported back then (store `PrinterInfo.id` — see the class
   * docblock — and split it back into `{ usbVendorId, usbProductId }` to
   * pass in here). Resolves to `null`, not an error, when nothing matches
   * (nothing to silently reconnect to); the caller should fall back to a
   * normal `connect()` in that case.
   */
  async reconnect(previous: SerialPortIdentity, options?: SerialConnectOptions): Promise<PrinterInfo | null> {
    if (!isSerialSupported() || previous.usbVendorId === undefined || previous.usbProductId === undefined) {
      return null
    }

    const ports = await navigator.serial.getPorts()
    const match = ports.find((port) => {
      const info = port.getInfo()
      return info.usbVendorId === previous.usbVendorId && info.usbProductId === previous.usbProductId
    })
    if (!match) return null

    try {
      return await this.open(match, options)
    } catch (error) {
      this.reset()
      throw normalizeConnectError(error)
    }
  }

  private async open(port: SerialPort, options?: SerialConnectOptions): Promise<PrinterInfo> {
    try {
      await port.open({ ...DEFAULT_SERIAL_OPTIONS, ...options })
    } catch (error) {
      // A port already picked in the browser's own dialog can still fail
      // to open — not a missing-user-gesture problem (that's only true for
      // requestPort() itself, above), the port is more likely already in
      // use by another app or OS service.
      throw normalizeOpenError(error, 'the port may already be in use by another app or OS service')
    }

    const { usbVendorId, usbProductId } = port.getInfo()
    const id =
      usbVendorId !== undefined && usbProductId !== undefined
        ? `${usbVendorId.toString(16).padStart(4, '0')}:${usbProductId.toString(16).padStart(4, '0')}`
        : 'serial'

    const info: PrinterInfo = {
      type: 'serial',
      name: `Serial printer (${id})`,
      id,
      language: this.reported.language,
      codepageMapping: this.reported.codepageMapping,
    }
    this.port = port
    this.info = info
    return info
  }

  async disconnect(): Promise<void> {
    try {
      // A held writer must release its lock before the port can close —
      // the Web Serial API throws otherwise.
      this.writer?.releaseLock()
      await this.port?.close()
    } catch {
      // Already closing/closed — nothing actionable, mirrors the other
      // transports' fire-and-forget disconnect().
    }
    this.reset()
  }

  isConnected(): boolean {
    return this.info !== null
  }

  async print(bytes: Uint8Array): Promise<void> {
    if (!this.port || !this.info) {
      throw toPrinterError('not-connected', 'Call connect() before printing.')
    }

    try {
      // Acquired once and kept for the life of the connection — matches
      // the reference implementation, which relies on the stream's own
      // backpressure rather than chunking writes by hand.
      const writer = this.writer ?? this.port.writable?.getWriter()
      if (!writer) throw new Error('Serial port has no writable stream.')
      this.writer = writer
      await writer.write(bytes)
    } catch (error) {
      throw normalizePrintError(error)
    }
  }

  private reset(): void {
    this.writer = null
    this.port = null
    this.info = null
  }
}
