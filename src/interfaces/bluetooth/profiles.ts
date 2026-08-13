import type { PrinterLanguage } from '../../types'

export interface BluetoothPrinterProfile {
  /**
   * OR'd list of device-picker filters (same shape as Web Bluetooth's own
   * `requestDevice({ filters })`) that identify this profile. A device
   * matches the profile if it satisfies *any* entry in this array.
   */
  filters: BluetoothLEScanFilter[]
  service: string
  characteristic: string
  language: PrinterLanguage
  codepageMapping: string
  /** Max bytes per BLE write. Defaults to 100 if unset (see writeChunked.ts). */
  messageSize?: number
  /** Delay in ms after each chunk write, for printers that need pacing. */
  sleepAfterCommand?: number
}

/**
 * Every known Bluetooth printer profile, shared by both transports:
 * DefaultBluetoothTransport.ts uses `filters` to restrict the OS device
 * picker up front; CompatBluetoothTransport.ts lets the picker show every
 * device and matches against `service`/`filters` after connecting. Either
 * way, `findProfile()` below is what actually decides which profile a
 * connected device is.
 *
 * The first 6 entries are ported directly from
 * github.com/NielsLeenheer/WebBluetoothReceiptPrinter's `DeviceProfiles`
 * (read in full from its `main` branch) — this project no longer depends on
 * that npm package, this table replaces it. Its "Cat printer" profile
 * (`language: 'meow'`) was NOT ported: it's a different, non-ESC/POS/StarPRNT
 * protocol that ReceiptPrinterEncoder doesn't support, so there would be
 * nothing to print with it. Its `status` characteristic + notification
 * support wasn't ported either — nothing in this project listens for
 * printer status notifications today.
 *
 * The last 2 entries are extra profiles this project already carried
 * (originally ported from example/configPrint.ts) that upstream doesn't
 * know about: a generic FF00 service (GolderSky/Xprinter-style) and
 * PrinterBT/innoPrint.
 *
 * To add a new printer, append a profile here — neither transport file
 * itself needs to change.
 */
export const BLUETOOTH_PROFILES: BluetoothPrinterProfile[] = [
  // Epson TM-P series, e.g. TM-P20II.
  {
    filters: [{ namePrefix: 'TM-P' }],
    service: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    characteristic: '49535343-8841-43f4-a8d4-ecbe34729bb3',
    language: 'esc-pos',
    codepageMapping: 'epson',
  },
  // Star SM-L series, e.g. SM-L200.
  {
    filters: [{ namePrefix: 'STAR L' }],
    service: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    characteristic: '49535343-8841-43f4-a8d4-ecbe34729bb3',
    language: 'star-line',
    codepageMapping: 'star',
  },
  // POS-5805, POS-8360 and similar printers.
  {
    filters: [{ name: 'BlueTooth Printer', services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
    service: '000018f0-0000-1000-8000-00805f9b34fb',
    characteristic: '00002af1-0000-1000-8000-00805f9b34fb',
    language: 'esc-pos',
    codepageMapping: 'zjiang',
  },
  // Xprinter.
  {
    filters: [{ name: 'Printer001', services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
    service: '000018f0-0000-1000-8000-00805f9b34fb',
    characteristic: '00002af1-0000-1000-8000-00805f9b34fb',
    language: 'esc-pos',
    codepageMapping: 'xprinter',
  },
  // MTP-II clone. Was `name: 'MPT-II'` (letters transposed) with an exact
  // name match — the real device advertises as e.g. "MTP-II_4D4C" (MAC
  // suffix), so it could never match either way and always fell through to
  // the generic fallback below instead (wrong codepageMapping, no pacing).
  // messageSize/sleepAfterCommand added after a real GATT disconnect mid-print
  // sending a larger payload (a PDF417 safeMode raster image) at the
  // fallback's un-paced 100-bytes-per-write default — unconfirmed exact
  // values, a starting point to retest against, not a confirmed-safe pacing.
  {
    filters: [{ namePrefix: 'MTP-II', services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
    service: '000018f0-0000-1000-8000-00805f9b34fb',
    characteristic: '00002af1-0000-1000-8000-00805f9b34fb',
    language: 'esc-pos',
    codepageMapping: 'mpt',
    messageSize: 20,
    sleepAfterCommand: 20,
  },
  // Generic fallback for any other device advertising the 000018f0 service.
  {
    filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
    service: '000018f0-0000-1000-8000-00805f9b34fb',
    characteristic: '00002af1-0000-1000-8000-00805f9b34fb',
    language: 'esc-pos',
    codepageMapping: 'default',
  },
  // GolderSky 80M / Xprinter FF00 profile — not known upstream.
  {
    filters: [{ services: ['0000ff00-0000-1000-8000-00805f9b34fb'] }],
    service: '0000ff00-0000-1000-8000-00805f9b34fb',
    characteristic: '0000ff02-0000-1000-8000-00805f9b34fb',
    language: 'esc-pos',
    codepageMapping: 'default',
  },
  // PrinterBT / innoPrint — not known upstream.
  {
    filters: [{ services: ['e7810a71-73ae-499d-8c15-faa9aef0c3f2'] }],
    service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    characteristic: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
    language: 'esc-pos',
    codepageMapping: 'default',
  },
]

/** Every distinct service UUID across all profiles — needed as `optionalServices` so GATT can access them after connecting. */
export const ALL_SERVICE_UUIDS = [...new Set(BLUETOOTH_PROFILES.map((profile) => profile.service))]

/** Every filter across all profiles, flattened — used by the default transport to pre-filter the device picker itself. */
export const ALL_FILTERS = BLUETOOTH_PROFILES.flatMap((profile) => profile.filters)

function matchesFilter(filter: BluetoothLEScanFilter, deviceName: string | undefined, serviceUuids: string[]): boolean {
  if (filter.services && !filter.services.every((service) => serviceUuids.includes(service as string))) return false
  if (filter.name && deviceName !== filter.name) return false
  if (filter.namePrefix && !(deviceName ?? '').startsWith(filter.namePrefix)) return false
  return true
}

/** First profile whose filters match the connected device's name/services. Used by both transports after GATT-connecting. */
export function findProfile(deviceName: string | undefined, serviceUuids: string[]): BluetoothPrinterProfile | null {
  return BLUETOOTH_PROFILES.find((profile) => profile.filters.some((filter) => matchesFilter(filter, deviceName, serviceUuids))) ?? null
}
