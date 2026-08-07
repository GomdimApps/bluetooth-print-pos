import WebBluetoothReceiptPrinter from '@point-of-sale/webbluetooth-receipt-printer'
import type { PrinterError, PrinterInfo } from '../types'

/** true if the current browser exposes the Web Bluetooth API. */
export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

/**
 * Thin adapter over WebBluetoothReceiptPrinter: normalizes native errors
 * (SecurityError for a missing gesture, device picker cancellation, etc.)
 * into the wrapper's error codes, and translates the native lib's
 * `connected` event into the wrapper's public `PrinterInfo`.
 */
export class BluetoothPrinter {
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
      throw toPrinterError('print-failed', errorMessage(error))
    }
  }
}

function normalizeConnectError(error: unknown): PrinterError {
  const name = (error as { name?: string })?.name

  // requestDevice() throws SecurityError when connect() wasn't called from
  // a user gesture (e.g. triggered automatically on load).
  if (name === 'SecurityError') {
    return toPrinterError('user-gesture-required', 'connect() must be called from a user click.')
  }

  // User closed the Bluetooth device picker without choosing one.
  if (name === 'NotFoundError') {
    return toPrinterError('connect-cancelled', 'Connection cancelled by the user.')
  }

  return toPrinterError('connect-failed', errorMessage(error))
}

function toPrinterError(code: PrinterError['code'], message: string): PrinterError {
  return { code, message }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
