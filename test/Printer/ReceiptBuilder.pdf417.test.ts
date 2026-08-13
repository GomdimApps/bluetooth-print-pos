import { describe, it, expect } from 'vitest'
import { buildBytes } from '../helpers/receipt'
import { withDom } from '../helpers/dom'

describe('ReceiptBuilder: pdf417 element, end-to-end through buildReceiptBytes()', () => {
  it('native pdf417 produces non-empty bytes', async () => {
    const bytes = await buildBytes([{ type: 'pdf417', value: 'hello world' }])
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('an explicit errorlevel changes the encoded bytes vs. the default (docs/notes/06: default must stay 1, matching the real encoder)', async () => {
    const withDefault = await buildBytes([{ type: 'pdf417', value: 'hello world' }])
    const withErrorlevel1 = await buildBytes([{ type: 'pdf417', value: 'hello world', errorlevel: 1 }])
    const withErrorlevel4 = await buildBytes([{ type: 'pdf417', value: 'hello world', errorlevel: 4 }])
    // The real encoder's own default errorlevel is 1 — an explicit 1 must
    // produce identical bytes to leaving it unset, while a different level
    // must diverge. If the encoder's default ever changes out from under
    // this library, this is the test that would catch it.
    expect(withDefault).toEqual(withErrorlevel1)
    expect(withDefault).not.toEqual(withErrorlevel4)
  })

  it('safeMode: true renders a raster image instead of the native command (docs/notes/09)', () =>
    withDom(async () => {
      const bytes = await buildBytes([{ type: 'pdf417', value: 'hello world', safeMode: true }])
      expect(bytes.length).toBeGreaterThan(0)
    }))

  it('safeMode true and false produce different bytes for the same value', () =>
    withDom(async () => {
      const native = await buildBytes([{ type: 'pdf417', value: 'hello world' }])
      const safe = await buildBytes([{ type: 'pdf417', value: 'hello world', safeMode: true }])
      expect(native).not.toEqual(safe)
    }))
})

describe('ReceiptBuilder: paperWidth (58mm/80mm/112mm)', () => {
  it('58mm and 80mm build a full receipt without throwing', async () => {
    await buildBytes([{ type: 'text', value: 'hi' }], { paperWidth: '58mm' })
    await buildBytes([{ type: 'text', value: 'hi' }], { paperWidth: '80mm' })
  })

  it('BUG (pre-existing, not introduced by this test suite): 112mm currently throws building ANY receipt, because the real encoder only accepts columns of 32/35/42/44/48, and PAPER_WIDTH_SPECS maps 112mm to 56', async () => {
    // If this test starts failing because 112mm was fixed, that's good news
    // — drop the .rejects assertion and update PAPER_WIDTH_SPECS/docs/notes
    // accordingly.
    await expect(buildBytes([{ type: 'text', value: 'hi' }], { paperWidth: '112mm' })).rejects.toThrow(
      /width of the paper must me either 32, 35, 42, 44 or 48 columns/,
    )
  })
})
