import { describe, it, expect } from 'vitest'
import { ALL_FILTERS, USB_PROFILES, evaluate, findUsbProfile } from '../../../src/interfaces/usb/profiles'

/**
 * `USBDevice` (from @types/w3c-web-usb) declares only public readonly
 * fields/methods, so a plain object literal satisfies it structurally —
 * no real WebUSB API needed to unit test findUsbProfile()/evaluate(),
 * unlike UsbTransport.ts itself (not covered — see AGENTS.md's "Testing"
 * section).
 */
function fakeUsbDevice(overrides: Partial<USBDevice>): USBDevice {
  return {
    vendorId: 0,
    productId: 0,
    productName: null,
    manufacturerName: null,
    serialNumber: null,
    ...overrides,
  } as USBDevice
}

describe('usb/profiles: findUsbProfile()', () => {
  it('matches a vendor+product-id-specific profile (Zjiang POS-5805/8360)', () => {
    const profile = findUsbProfile(fakeUsbDevice({ vendorId: 0x0416, productId: 0x5011 }))
    expect(profile?.codepageMapping).toBe('zjiang')
  })

  it('matches a vendor-only profile regardless of product id (Epson)', () => {
    const profile = findUsbProfile(fakeUsbDevice({ vendorId: 0x04b8, productId: 0x1234 }))
    expect(profile?.codepageMapping).toBe('epson')
  })

  it('returns null for an unrecognized vendor id', () => {
    expect(findUsbProfile(fakeUsbDevice({ vendorId: 0xffff, productId: 0xffff }))).toBeNull()
  })

  it('every profile in the table is reachable through ALL_FILTERS (used to pre-filter the device picker)', () => {
    for (const profile of USB_PROFILES) {
      for (const filter of profile.filters) {
        expect(ALL_FILTERS).toContain(filter)
      }
    }
  })
})

describe('usb/profiles: evaluate()', () => {
  it('returns a plain value as-is', () => {
    expect(evaluate('esc-pos', fakeUsbDevice({}))).toBe('esc-pos')
  })

  it('calls a resolver function with the device and returns its result (Star language resolution)', () => {
    const starProfile = findUsbProfile(fakeUsbDevice({ vendorId: 0x0519, productId: 0x1234 }))
    expect(starProfile).not.toBeNull()

    expect(evaluate(starProfile!.language, fakeUsbDevice({ productName: 'mC-Print3' }))).toBe('star-prnt')
    expect(evaluate(starProfile!.language, fakeUsbDevice({ productName: 'BSC10' }))).toBe('esc-pos')
    expect(evaluate(starProfile!.language, fakeUsbDevice({ productName: 'TSP654II' }))).toBe('star-line')
    expect(evaluate(starProfile!.language, fakeUsbDevice({ productName: null }))).toBe('star-line')
  })
})
