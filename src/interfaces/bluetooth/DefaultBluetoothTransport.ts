import type { PrinterInfo } from '../../types'
import type { PrinterTransport } from '../PrinterTransport'
import { normalizeConnectError, normalizePrintError, toPrinterError } from '../printerErrors'
import { ALL_FILTERS, ALL_SERVICE_UUIDS, findProfile, type BluetoothPrinterProfile } from './profiles'
import { writeChunked } from './writeChunked'

/** true if the current browser exposes the Web Bluetooth API. */
export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

export function deviceLabel(device: BluetoothDevice): string {
  return device.name ?? device.id
}

interface OpenedConnection {
  characteristic: BluetoothRemoteGATTCharacteristic
  profile: BluetoothPrinterProfile
  info: PrinterInfo
}

/**
 * GATT-connects to an already-picked device, matches it against a known
 * profile (same as upstream WebBluetoothReceiptPrinter's #evaluateFilter,
 * re-run after connecting) and grabs its write characteristic. Shared by
 * both transports — DefaultBluetoothTransport and CompatBluetoothTransport
 * only differ in how the device is picked (`requestDevice()`'s `filters`
 * vs `acceptAllDevices`), everything after that is identical.
 */
export async function openConnection(device: BluetoothDevice, manualProfile?: BluetoothPrinterProfile): Promise<OpenedConnection> {
  if (!device.gatt) {
    throw toPrinterError('connect-failed', `Printer "${deviceLabel(device)}" has no GATT server.`)
  }

  const server = await device.gatt.connect()
  const services = await server.getPrimaryServices()
  const serviceUuids = services.map((service) => service.uuid)

  // manualProfile (from connect({ profile })) skips the table lookup
  // entirely — the caller already knows their printer's profile.
  const profile = manualProfile ?? findProfile(device.name, serviceUuids)
  if (!profile) {
    server.disconnect()
    throw toPrinterError(
      'connect-failed',
      `Printer "${deviceLabel(device)}" connected, but no known ESC/POS/StarPRNT service was found. ` +
        `Available service UUIDs: ${serviceUuids.join(', ')}`,
    )
  }

  const service = await server.getPrimaryService(profile.service)
  const characteristic = await service.getCharacteristic(profile.characteristic)

  const info: PrinterInfo = {
    type: 'bluetooth',
    name: device.name ?? 'Unknown printer',
    id: device.id,
    language: profile.language,
    codepageMapping: profile.codepageMapping,
  }

  return { characteristic, profile, info }
}

/**
 * Default Bluetooth transport, ported from
 * github.com/NielsLeenheer/WebBluetoothReceiptPrinter's `main.js` (read in
 * full from its `main` branch): `requestDevice({ filters, optionalServices })`
 * restricts the OS device picker itself to the profiles in profiles.ts, so
 * it stays clean, at the cost of printers outside that list never showing
 * up as an option at all — see CompatBluetoothTransport.ts for a broader,
 * opt-in alternative that lists every device instead.
 */
export class DefaultBluetoothTransport implements PrinterTransport {
  private device: BluetoothDevice | null = null
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null
  private profile: BluetoothPrinterProfile | null = null
  private info: PrinterInfo | null = null

  getInfo(): PrinterInfo | null {
    return this.info
  }

  /**
   * `manualProfile` (from `WebEscposPrinter.connect({ profile })`) bypasses
   * profiles.ts's table entirely — for printers this library doesn't know
   * about. Its own `filters` restrict the device picker instead of
   * `ALL_FILTERS`, and its `service` is added to `optionalServices` so GATT
   * can access it even if it's outside every known profile's service.
   */
  async connect(manualProfile?: BluetoothPrinterProfile): Promise<PrinterInfo> {
    if (!isBluetoothSupported()) {
      throw toPrinterError('unsupported', 'This browser does not support Web Bluetooth.')
    }

    let device: BluetoothDevice
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: manualProfile ? manualProfile.filters : ALL_FILTERS,
        optionalServices: manualProfile ? [manualProfile.service, ...ALL_SERVICE_UUIDS] : ALL_SERVICE_UUIDS,
      })
    } catch (error) {
      throw normalizeConnectError(error)
    }

    try {
      const { characteristic, profile, info } = await openConnection(device, manualProfile)
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
