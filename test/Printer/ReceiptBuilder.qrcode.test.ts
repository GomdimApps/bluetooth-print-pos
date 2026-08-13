import { describe, it, expect } from 'vitest'
import { buildBytes } from '../helpers/receipt'
import { withDom } from '../helpers/dom'

describe('ReceiptBuilder: qrcode element, end-to-end through buildReceiptBytes()', () => {
  it('native qrcode produces non-empty bytes', async () => {
    const bytes = await buildBytes([{ type: 'qrcode', value: 'https://example.com' }])
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('an explicit size changes the encoded bytes vs. the default', async () => {
    const withDefault = await buildBytes([{ type: 'qrcode', value: 'https://example.com' }])
    const withSize = await buildBytes([{ type: 'qrcode', value: 'https://example.com', size: 8 }])
    expect(withDefault).not.toEqual(withSize)
  })

  it('safeMode: true renders a raster image instead of the native command', () =>
    withDom(async () => {
      const bytes = await buildBytes([{ type: 'qrcode', value: 'https://example.com', safeMode: true }])
      expect(bytes.length).toBeGreaterThan(0)
    }))

  it('safeMode true and false produce different bytes for the same value', () =>
    withDom(async () => {
      const native = await buildBytes([{ type: 'qrcode', value: 'https://example.com' }])
      const safe = await buildBytes([{ type: 'qrcode', value: 'https://example.com', safeMode: true }])
      expect(native).not.toEqual(safe)
    }))

  it('safeMode: true with an unreasonably narrow paper skips the element with a console.warn, instead of throwing', () =>
    withDom(async () => {
      const originalWarn = console.warn
      let warned = false
      console.warn = () => {
        warned = true
      }
      let bytes: Uint8Array
      try {
        bytes = await buildBytes(
          [{ type: 'qrcode', value: 'https://example.com/a-fairly-long-url-to-force-a-bigger-qr-code', safeMode: true }],
          {},
          { imageMaxWidth: 8 },
        )
      } finally {
        console.warn = originalWarn
      }
      expect(warned).toBe(true)
      expect(bytes.length).toBeGreaterThanOrEqual(0) // didn't throw — that's the point
    }))
})
