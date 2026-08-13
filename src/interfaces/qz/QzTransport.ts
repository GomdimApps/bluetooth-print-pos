import * as qz from 'qz-tray'
import type { PrinterInfo, PrinterLanguage } from '../../types'
import type { PrinterTransport } from '../PrinterTransport'
import { normalizeConnectError, normalizePrintError, toPrinterError } from '../printerErrors'

/**
 * true if this environment has WebSocket support (what qz-tray's own
 * transport is built on). This does NOT mean the QZ Tray desktop app
 * (https://qz.io) is actually installed/running — only connect() calling
 * qz.websocket.connect() can determine that.
 */
export function isQzSupported(): boolean {
  return typeof WebSocket !== 'undefined'
}

/**
 * Talks to the QZ Tray desktop app over its local websocket API instead of
 * Web Bluetooth — same ESC/POS bytes ReceiptBuilder.ts already builds for
 * Bluetooth, just handed to a different transport. QZ Tray owns the actual
 * printer pairing (USB or otherwise); this only needs to reach the already
 * running QZ Tray process and tell it which OS-registered printer to use.
 *
 * Unlike Bluetooth, QZ has no protocol to auto-detect (no BLE profile
 * matching) and no native OS device picker (no requestDevice()-style
 * dialog) — so `language`/`codepageMapping` on the resulting PrinterInfo
 * are just mirrored from whatever WebEscposPrinterConfig this instance was
 * constructed with (purely informational: ReceiptBuilder.ts's
 * buildReceiptBytes() always encodes using job.language ?? defaults.language,
 * never PrinterInfo.language), and printer selection is done via
 * listPrinters() + an explicit printerName passed to connect().
 *
 * Unsigned/demo mode only: no qz.security.setCertificatePromise/
 * setSignaturePromise plumbing here — that requires a private-key signing
 * operation only a consumer's own backend can safely perform. Without it,
 * QZ Tray shows its own permission dialog per connect/print instead of
 * printing silently. See AGENTS.md.
 */
export class QzTransport implements PrinterTransport {
  private printerName: string | null = null
  private info: PrinterInfo | null = null

  constructor(private readonly reported: { language: PrinterLanguage; codepageMapping?: unknown }) {}

  getInfo(): PrinterInfo | null {
    return this.info
  }

  /**
   * printerName: explicit target, normally chosen from listPrinters()'s
   * result. Falls back to qz.printers.getDefault() when omitted. Note this
   * has a different param list than PrinterTransport's zero-arg connect()
   * — fine structurally (an extra optional param), but WebEscposPrinter.connect()
   * has to call this directly (not through the generic PrinterTransport
   * interface) to actually pass printerName through.
   */
  async connect(printerName?: string): Promise<PrinterInfo> {
    if (!isQzSupported()) {
      throw toPrinterError('unsupported', 'This environment has no WebSocket support (required by qz-tray).')
    }

    try {
      await ensureSocketOpen()

      const name = printerName ?? (await qz.printers.getDefault())
      const info: PrinterInfo = {
        type: 'qz',
        name,
        id: name,
        language: this.reported.language,
        codepageMapping: this.reported.codepageMapping,
      }
      this.printerName = name
      this.info = info
      return info
    } catch (error) {
      this.reset()
      // normalizeConnectError()'s DOMException-name branches (SecurityError/
      // NotFoundError) are Bluetooth-specific and never match here — qz-tray
      // rejects with plain Error objects, so this always falls through to
      // its generic connect-failed branch, which is correct as-is.
      throw normalizeConnectError(error)
    }
  }

  async disconnect(): Promise<void> {
    if (qz.websocket.isActive()) {
      try {
        await qz.websocket.disconnect()
      } catch {
        // Already closing/closed — nothing actionable, mirrors the
        // Bluetooth transports' fire-and-forget disconnect().
      }
    }
    this.reset()
  }

  isConnected(): boolean {
    return this.info !== null
  }

  async print(bytes: Uint8Array): Promise<void> {
    if (!this.printerName || !this.info) {
      throw toPrinterError('not-connected', 'Call connect() before printing.')
    }

    try {
      // qz-tray's own internal compatible.data() step base64-encodes
      // Uint8Array print data itself (a binary-safe byte-loop
      // implementation, confirmed by reading the installed qz-tray.js
      // source) — so the raw bytes are passed straight through here, no
      // custom Uint8Array -> base64 helper needed.
      await qz.print(qz.configs.create(this.printerName), [
        { type: 'raw', format: 'command', flavor: 'base64', data: bytes },
      ])
    } catch (error) {
      throw normalizePrintError(error)
    }
  }

  /**
   * Lists printer names QZ Tray knows about (opens the QZ websocket session
   * if not already open — either this or connect() can be called first).
   * Use this to populate a consumer-rendered picker UI, since QZ has no
   * native OS device-selection dialog the way Web Bluetooth's
   * requestDevice() does.
   */
  async listPrinters(query?: string): Promise<string[]> {
    if (!isQzSupported()) {
      throw toPrinterError('unsupported', 'This environment has no WebSocket support (required by qz-tray).')
    }

    try {
      await ensureSocketOpen()
      const result = await qz.printers.find(query)
      // find() returns a bare string (not string[]) when `query` is given
      // and matches — only an array when called with no query. Confirmed
      // in @types/qz-tray's own Promise<string[] | string> return type and
      // by reading qz-tray.js's source. Normalize either way.
      return Array.isArray(result) ? result : [result]
    } catch (error) {
      throw normalizeConnectError(error)
    }
  }

  private reset(): void {
    this.printerName = null
    this.info = null
  }
}

/**
 * qz.websocket.connect() REJECTS outright if a connection is already open
 * or still connecting ("An open connection with QZ Tray already exists" /
 * "...has not returned yet" — confirmed by reading qz-tray.js's source), so
 * every call site here must guard with isActive() first to stay idempotent.
 */
async function ensureSocketOpen(): Promise<void> {
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect()
  }
}
