import { describe, it, expect } from 'vitest'
import { buildBytes } from '../helpers/receipt'

describe('ReceiptBuilder: barcode element, end-to-end through buildReceiptBytes()', () => {
  it('code128 (the default symbology) produces non-empty bytes', async () => {
    const bytes = await buildBytes([{ type: 'barcode', value: '123456789012' }])
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('itf produces non-empty bytes for a digits-only value (real encoder\'s symbology name is "itf", not "interleaved2of5" — that\'s bwip-js\'s/Preview-only naming)', async () => {
    const bytes = await buildBytes([{ type: 'barcode', value: '123456', symbology: 'itf' }])
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('an explicit height/width changes the encoded bytes vs. the defaults (encoder only accepts width 1-3)', async () => {
    const defaults = await buildBytes([{ type: 'barcode', value: '123456789012' }])
    const custom = await buildBytes([{ type: 'barcode', value: '123456789012', height: 120, width: 3 }])
    expect(defaults).not.toEqual(custom)
  })

  it('regression guard: an unsupported symbology name does NOT throw — the real encoder silently skips it (its own "relaxed" error mode)', async () => {
    // Confirmed against the real installed library: unlike bwip-js (Preview,
    // strict), the real encoder's default error mode just no-ops on an
    // unknown/unsupported symbology instead of throwing. If a future
    // encoder version starts throwing here instead, this test should flip
    // to assert the rejection.
    await buildBytes([{ type: 'barcode', value: '123456', symbology: 'not-a-real-symbology' }])
  })
})
