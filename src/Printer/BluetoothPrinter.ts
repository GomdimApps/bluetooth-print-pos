import WebBluetoothReceiptPrinter from '@point-of-sale/webbluetooth-receipt-printer'
import type { PrinterInfo } from '../types'
import type { BluetoothTransport } from './BluetoothTransport'
import { normalizeConnectError, normalizePrintError, toPrinterError } from './printerErrors'

/** true if the current browser exposes the Web Bluetooth API. */
export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

/**
 * Default Bluetooth transport: a thin adapter over WebBluetoothReceiptPrinter.
 * It restricts the device picker to a small set of known printer profiles
 * (via requestDevice({ filters })), which keeps the picker clean but means
 * printers outside that list never show up — see CompatBluetoothPrinter.ts
 * for a broader, opt-in alternative.
 */
export class BluetoothPrinter implements BluetoothTransport {
  private native: WebBluetoothReceiptPrinter | null = null
  private info: PrinterInfo | null = null

  getInfo(): PrinterInfo | null {
    return this.info
  }

  async connect(): Promise<PrinterInfo> {
    if (!isBluetoothSupported()) {
      throw toPrinterError('unsupported', 'This browser does not support Web Bluetooth.')
    }

    this.native = this.native ?? new WebBluetoothReceiptPrinter()

    const connected = new Promise<PrinterInfo>((resolve) => {
      this.native!.addEventListener('connected', (event: any) => {
        const info: PrinterInfo = {
          type: 'bluetooth',
          name: event.name,
          id: event.id,
          language: event.language,
          codepageMapping: event.codepageMapping,
        }
        this.info = info
        resolve(info)
      })
    })

    try {
      await this.native.connect()
    } catch (error) {
      this.native = null
      throw normalizeConnectError(error)
    }

    return connected
  }

  async disconnect(): Promise<void> {
    if (!this.native) return
    await this.native.disconnect()
    this.info = null
  }

  isConnected(): boolean {
    return this.info !== null
  }

  async print(bytes: Uint8Array): Promise<void> {
    if (!this.native || !this.info) {
      throw toPrinterError('not-connected', 'Call connect() before printing.')
    }

    try {
      await this.native.print(bytes)
    } catch (error) {
      throw normalizePrintError(error)
    }
  }
}
