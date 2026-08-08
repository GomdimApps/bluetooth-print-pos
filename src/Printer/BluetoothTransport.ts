import type { PrinterInfo } from '../types'

/**
 * Shape shared by every Bluetooth connection strategy (the default one
 * backed by @point-of-sale/webbluetooth-receipt-printer, and the
 * accept-all/compat one in CompatBluetoothPrinter.ts), so PrinterWrapper
 * can talk to whichever one is currently active without caring which it is.
 */
export interface BluetoothTransport {
  getInfo(): PrinterInfo | null
  connect(): Promise<PrinterInfo>
  disconnect(): Promise<void>
  isConnected(): boolean
  print(bytes: Uint8Array): Promise<void>
}
