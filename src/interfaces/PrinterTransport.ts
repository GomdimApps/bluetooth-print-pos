import type { PrinterInfo } from '../types'

/**
 * Shape shared by every printer connection strategy. Currently implemented
 * only by the two Bluetooth transports in `./bluetooth/` (the default,
 * filtered one and the accept-all/compat one), but kept transport-agnostic
 * on purpose — a future WebUSB transport (`./usb/`, not implemented yet)
 * would implement this exact same interface, so `PrinterWrapper` never has
 * to change shape to support it.
 */
export interface PrinterTransport {
  getInfo(): PrinterInfo | null
  connect(): Promise<PrinterInfo>
  disconnect(): Promise<void>
  isConnected(): boolean
  print(bytes: Uint8Array): Promise<void>
}
