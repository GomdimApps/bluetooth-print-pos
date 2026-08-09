import type { PrinterInfo } from '../types'

/**
 * Shape shared by every printer connection strategy. Implemented by the two
 * Bluetooth transports in `./bluetooth/` (the default, filtered one and the
 * accept-all/compat one) and by `./qz/QzTransport.ts` (talks to the QZ Tray
 * desktop app over its local websocket API instead of Web Bluetooth) — kept
 * transport-agnostic on purpose so `PrinterWrapper` never has to change
 * shape to support a new one.
 */
export interface PrinterTransport {
  getInfo(): PrinterInfo | null
  connect(): Promise<PrinterInfo>
  disconnect(): Promise<void>
  isConnected(): boolean
  print(bytes: Uint8Array): Promise<void>
}
