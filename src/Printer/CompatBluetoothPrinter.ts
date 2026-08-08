import type { PrinterInfo } from '../types'
import type { BluetoothTransport } from './BluetoothTransport'
import { isBluetoothSupported } from './BluetoothPrinter'
import { ALL_SERVICE_UUIDS, findCompatProfile } from './bluetoothProfiles'
import { normalizeConnectError, normalizePrintError, toPrinterError } from './printerErrors'

const WRITE_CHUNK_SIZE = 100

/**
 * Compatibility Bluetooth transport: instead of restricting the device
 * picker to a small set of known filters, it lists every nearby BLE device
 * (`acceptAllDevices: true`) and only checks which known printer profile
 * applies *after* the user picks one and GATT-connects. Reaches printers
 * the default BluetoothPrinter transport can't even list, at the cost of a
 * noisier device picker. Ported from example/configPrint.ts's btConnect/btWrite.
 * Printer profiles themselves live in bluetoothProfiles.ts.
 */
export class CompatBluetoothPrinter implements BluetoothTransport {
  private device: BluetoothDevice | null = null
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null
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
      const info = await this.connectToDevice(device)
      this.device = device
      this.info = info
      return info
    } catch (error) {
      this.reset()
      throw normalizeConnectError(error)
    }
  }

  /** GATT-connects, matches a known profile and grabs its write characteristic. Throws on any failure. */
  private async connectToDevice(device: BluetoothDevice): Promise<PrinterInfo> {
    if (!device.gatt) {
      throw toPrinterError('connect-failed', `Printer "${deviceLabel(device)}" has no GATT server.`)
    }

    const server = await device.gatt.connect()
    const services = await server.getPrimaryServices()
    const serviceUuids = services.map((service) => service.uuid)

    const profile = findCompatProfile(device.name, serviceUuids)
    if (!profile) {
      server.disconnect()
      throw toPrinterError(
        'connect-failed',
        `Printer "${deviceLabel(device)}" connected, but no known ESC/POS/StarPRNT service was found. ` +
          `Available service UUIDs: ${serviceUuids.join(', ')}`,
      )
    }

    const service = await server.getPrimaryService(profile.service)
    this.characteristic = await service.getCharacteristic(profile.characteristic)

    return {
      type: 'bluetooth',
      name: device.name ?? 'Unknown printer',
      id: device.id,
      language: profile.language,
      codepageMapping: profile.codepageMapping,
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
      await writeChunked(this.characteristic, bytes)
    } catch (error) {
      throw normalizePrintError(error)
    }
  }

  private reset(): void {
    this.device = null
    this.characteristic = null
    this.info = null
  }
}

function deviceLabel(device: BluetoothDevice): string {
  return device.name ?? device.id
}

async function writeChunked(characteristic: BluetoothRemoteGATTCharacteristic, bytes: Uint8Array): Promise<void> {
  for (let offset = 0; offset < bytes.length; offset += WRITE_CHUNK_SIZE) {
    await characteristic.writeValueWithResponse(bytes.slice(offset, offset + WRITE_CHUNK_SIZE))
  }
}
