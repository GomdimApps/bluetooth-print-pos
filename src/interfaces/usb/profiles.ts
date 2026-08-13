import type { PrinterLanguage } from '../../types'

export interface UsbPrinterProfile {
  /**
   * OR'd list of device-picker filters (same shape as WebUSB's own
   * `requestDevice({ filters })`). A device matches the profile if it
   * satisfies *any* entry in this array.
   */
  filters: USBDeviceFilter[]
  /** USBConfiguration.configurationValue to select after opening the device. */
  configuration: number
  /** Interface number to claim, on the selected configuration. */
  interface: number
  language: PrinterLanguage | ((device: USBDevice) => PrinterLanguage)
  codepageMapping: unknown | ((device: USBDevice) => unknown)
}

/** Resolves a profile's `language`/`codepageMapping` field, which may be a plain value or a per-device resolver function. */
export function evaluate<T>(field: T | ((device: USBDevice) => T), device: USBDevice): T {
  return typeof field === 'function' ? (field as (device: USBDevice) => T)(device) : field
}

/**
 * Star's own USB vendor id covers several printer families that speak
 * different protocols — told apart only by `productName` once connected,
 * not by product id. This is a deliberately simplified resolver (not a
 * verbatim port — WebUSBReceiptPrinter's own regex-based model-normalizing
 * table couldn't be reproduced here, see usb/profiles.ts's docblock below)
 * covering the common current lines; anything unrecognized falls back to
 * `star-line`, the oldest/most broadly implemented Star protocol. Printers
 * that need the exact upstream mapping can be connected via `connect({
 * transport: 'usb', profile })` with a hand-built UsbPrinterProfile instead
 * — see the README's "Manual Bluetooth profile" section for the same
 * pattern (works identically for USB).
 */
function resolveStarLanguage(device: USBDevice): PrinterLanguage {
  const name = device.productName ?? ''
  if (/^(TSP100IV|mPOP|mC-Label3|mC-Print[23])/i.test(name)) return 'star-prnt'
  if (/^(BSC10)/i.test(name)) return 'esc-pos'
  return 'star-line'
}

/**
 * Every known USB printer profile. Vendor/product ids ported from
 * github.com/NielsLeenheer/WebUSBReceiptPrinter's `DeviceProfiles` table
 * (read in full from its `master` branch) — this project no longer depends
 * on that npm package, this table replaces it. Every profile there hard-
 * codes `configuration: 1, interface: 0`, carried over as-is here.
 *
 * To add a new printer, append a profile here — UsbTransport.ts itself
 * doesn't need to change.
 */
export const USB_PROFILES: UsbPrinterProfile[] = [
  // Zjiang POS-5805 / POS-8360 and similar.
  {
    filters: [{ vendorId: 0x0416, productId: 0x5011 }],
    configuration: 1,
    interface: 0,
    language: 'esc-pos',
    codepageMapping: 'zjiang',
  },
  // MTP-II clone.
  {
    filters: [{ vendorId: 0x0483, productId: 0x5840 }],
    configuration: 1,
    interface: 0,
    language: 'esc-pos',
    codepageMapping: 'mpt',
  },
  // POS-8022 and similar STMicroelectronics-based clones.
  {
    filters: [{ vendorId: 0x0483, productId: 0x5743 }],
    configuration: 1,
    interface: 0,
    language: 'esc-pos',
    codepageMapping: 'default',
  },
  // Dtronic.
  {
    filters: [{ vendorId: 0x0fe6, productId: 0x811e }],
    configuration: 1,
    interface: 0,
    language: 'esc-pos',
    codepageMapping: 'epson',
  },
  // Xprinter.
  {
    filters: [{ vendorId: 0x1fc9, productId: 0x2016 }],
    configuration: 1,
    interface: 0,
    language: 'esc-pos',
    codepageMapping: 'xprinter',
  },
  // Samsung SRP series — vendor-only, no single product id across the line.
  {
    filters: [{ vendorId: 0x0419 }, { vendorId: 0x1504 }],
    configuration: 1,
    interface: 0,
    language: 'esc-pos',
    codepageMapping: 'bixolon',
  },
  // Epson TM-* line — vendor-only.
  {
    filters: [{ vendorId: 0x04b8 }],
    configuration: 1,
    interface: 0,
    language: 'esc-pos',
    codepageMapping: 'epson',
  },
  // Citizen — vendor-only.
  {
    filters: [{ vendorId: 0x1d90 }],
    configuration: 1,
    interface: 0,
    language: 'esc-pos',
    codepageMapping: 'citizen',
  },
  // HP — vendor-only.
  {
    filters: [{ vendorId: 0x05d9 }],
    configuration: 1,
    interface: 0,
    language: 'esc-pos',
    codepageMapping: 'hp',
  },
  // Fujitsu — vendor-only.
  {
    filters: [{ vendorId: 0x04c5 }],
    configuration: 1,
    interface: 0,
    language: 'esc-pos',
    codepageMapping: 'epson',
  },
  // Star — vendor-only, protocol resolved per-device from productName (see resolveStarLanguage above).
  {
    filters: [{ vendorId: 0x0519 }],
    configuration: 1,
    interface: 0,
    language: resolveStarLanguage,
    codepageMapping: 'star',
  },
]

/** Every filter across all profiles, flattened — passed to `requestDevice({ filters })` by the default (no manual profile) connect path. */
export const ALL_FILTERS = USB_PROFILES.flatMap((profile) => profile.filters)

function matchesFilter(filter: USBDeviceFilter, device: USBDevice): boolean {
  if (filter.vendorId !== undefined && filter.vendorId !== device.vendorId) return false
  if (filter.productId !== undefined && filter.productId !== device.productId) return false
  return true
}

/** First profile whose filters match the connected device's vendor/product id. Used by UsbTransport.ts after requestDevice() resolves. */
export function findUsbProfile(device: USBDevice): UsbPrinterProfile | null {
  return USB_PROFILES.find((profile) => profile.filters.some((filter) => matchesFilter(filter, device))) ?? null
}
