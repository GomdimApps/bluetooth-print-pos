import type { PrinterInfo } from '../../types'
import type { PrinterTransport } from '../PrinterTransport'
import { normalizeConnectError, normalizePrintError, toPrinterError } from '../printerErrors'
import { isBluetoothSupported, openConnection } from './DefaultBluetoothTransport'
import { ALL_SERVICE_UUIDS, type BluetoothPrinterProfile } from './profiles'
import { writeChunked } from './writeChunked'

/**
 * Compatibility Bluetooth transport: instead of restricting the device
 * picker to the profiles in profiles.ts, it lists every nearby BLE device
 * (`acceptAllDevices: true`) and only checks which known printer profile
 * applies *after* the user picks one and GATT-connects — via the same
 * `openConnection()` DefaultBluetoothTransport.ts uses, they only differ in
 * how the device gets picked. Reaches printers DefaultBluetoothTransport.ts
 * can't even list, at the cost of a noisier device picker.
 */
export class CompatBluetoothTransport implements PrinterTransport {
  private device: BluetoothDevice | null = null
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null
  private profile: BluetoothPrinterProfile | null = null
  private info: PrinterInfo | null = null

  getInfo(): PrinterInfo | null {
    return this.info
  }

  async connect(): Promise<PrinterInfo> {
    if (!isBluetoothSupported()) {
      throw toPrinterError('unsupported', 'This browser does not support Web Bluetooth.')
    }

    let device: BluetoothDevice
    try {
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ALL_SERVICE_UUIDS,
      })
    } catch (error) {
      throw normalizeConnectError(error)
    }

    try {
      const { characteristic, profile, info } = await openConnection(device)
      this.device = device
      this.characteristic = characteristic
      this.profile = profile
      this.info = info
      return info
    } catch (error) {
      this.reset()
      throw normalizeConnectError(error)
    }
  }

  async disconnect(): Promise<void> {
    if (this.device?.gatt?.connected) this.device.gatt.disconnect()
    this.reset()
  }

  isConnected(): boolean {
    return this.info !== null
  }

  async print(bytes: Uint8Array): Promise<void> {
    if (!this.characteristic || !this.info) {
      throw toPrinterError('not-connected', 'Call connect() before printing.')
    }

    try {
      await writeChunked(this.characteristic, bytes, {
        messageSize: this.profile?.messageSize,
        sleepAfterCommand: this.profile?.sleepAfterCommand,
      })
    } catch (error) {
      throw normalizePrintError(error)
    }
  }

  private reset(): void {
    this.device = null
    this.characteristic = null
    this.profile = null
    this.info = null
  }
}
