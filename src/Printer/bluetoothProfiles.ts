import type { PrinterLanguage } from '../types'

export interface CompatProfile {
  service: string
  characteristic: string
  /** Exact advertised device name required for this entry to match (if set). */
  matchName?: string
  /** Advertised device name prefix required for this entry to match (if set). */
  matchNamePrefix?: string
  language: PrinterLanguage
  codepageMapping: string
}

/**
 * Union of every printer profile we know about: the 7 built into
 * @point-of-sale/webbluetooth-receipt-printer (read out of its installed
 * bundle, since it doesn't expose them for reuse) plus the 2 extra ones
 * from example/configPrint.ts that library doesn't know (FF00 generic,
 * PrinterBT/innoPrint). Order matters: name-specific entries are checked
 * before a same-service generic fallback, same precedence as the source.
 *
 * To add a new printer, append a profile here — CompatBluetoothPrinter.ts
 * itself never needs to change.
 */
export const COMPAT_PROFILES: CompatProfile[] = [
  // Epson TM-P / Star Line — same service, disambiguated by device name.
  {
    matchNamePrefix: 'TM-P',
    service: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    characteristic: '49535343-8841-43f4-a8d4-ecbe34729bb3',
    language: 'esc-pos',
    codepageMapping: 'epson',
  },
  {
    matchNamePrefix: 'STAR L',
    service: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    characteristic: '49535343-8841-43f4-a8d4-ecbe34729bb3',
    language: 'star-line',
    codepageMapping: 'star',
  },
  // Named 000018f0 variants (zjiang/xprinter/mpt), then the generic fallback for any name.
  {
    matchName: 'BlueTooth Printer',
    service: '000018f0-0000-1000-8000-00805f9b34fb',
    characteristic: '00002af1-0000-1000-8000-00805f9b34fb',
    language: 'esc-pos',
    codepageMapping: 'zjiang',
  },
  {
    matchName: 'Printer001',
    service: '000018f0-0000-1000-8000-00805f9b34fb',
    characteristic: '00002af1-0000-1000-8000-00805f9b34fb',
    language: 'esc-pos',
    codepageMapping: 'xprinter',
  },
  {
    matchName: 'MPT-II',
    service: '000018f0-0000-1000-8000-00805f9b34fb',
    characteristic: '00002af1-0000-1000-8000-00805f9b34fb',
    language: 'esc-pos',
    codepageMapping: 'mpt',
  },
  {
    service: '0000ae30-0000-1000-8000-00805f9b34fb',
    characteristic: '0000ae01-0000-1000-8000-00805f9b34fb',
    language: 'esc-pos',
    codepageMapping: 'default',
  },
  {
    service: '000018f0-0000-1000-8000-00805f9b34fb',
    characteristic: '00002af1-0000-1000-8000-00805f9b34fb',
    language: 'esc-pos',
    codepageMapping: 'default',
  },
  // GolderSky 80M / Xprinter FF00 profile — not known to the default transport.
  {
    service: '0000ff00-0000-1000-8000-00805f9b34fb',
    characteristic: '0000ff02-0000-1000-8000-00805f9b34fb',
    language: 'esc-pos',
    codepageMapping: 'default',
  },
  // PrinterBT / innoPrint — not known to the default transport.
  {
    service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    characteristic: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
    language: 'esc-pos',
    codepageMapping: 'default',
  },
]

export const ALL_SERVICE_UUIDS = [...new Set(COMPAT_PROFILES.map((profile) => profile.service))]

/** First profile whose service the device advertises and whose name requirement (if any) it satisfies. */
export function findCompatProfile(deviceName: string | undefined, serviceUuids: string[]): CompatProfile | null {
  for (const profile of COMPAT_PROFILES) {
    if (!serviceUuids.includes(profile.service)) continue
    if (profile.matchName && deviceName !== profile.matchName) continue
    if (profile.matchNamePrefix && !(deviceName ?? '').startsWith(profile.matchNamePrefix)) continue
    return profile
  }
  return null
}
