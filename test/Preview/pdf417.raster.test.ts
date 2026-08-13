import { describe, it, expect } from 'vitest'
import { buildPdf417RasterImage, resolvePdf417Columns } from '../../src/Preview/content/pdf417'
import { withDom } from '../helpers/dom'

function hasNonWhitePixel(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) return true
  }
  return false
}

describe('buildPdf417RasterImage (safeMode raster for pdf417)', () => {
  it('renders a real PDF417 symbol padded to a multiple of 8, with actual dark pixels drawn', () =>
    withDom(async () => {
      const result = buildPdf417RasterImage({ value: 'hello world' }, 576)
      expect('image' in result, `expected success, got ${'error' in result ? result.error : ''}`).toBe(true)
      if (!('image' in result)) return
      expect(result.image.width % 8).toBe(0)
      expect(result.image.height % 8).toBe(0)
      expect(hasNonWhitePixel(result.image.canvas)).toBe(true)
    }))

  it('fails (does not crop/scale) when the padded symbol would exceed the paper content width', () =>
    withDom(async () => {
      const result = buildPdf417RasterImage({ value: 'hello world' }, 8)
      expect('error' in result).toBe(true)
    }))

  it('propagates bwip-js\'s own capacity error when explicit columns/rows are too small for the value (docs/notes/05)', () =>
    withDom(async () => {
      const longValue = 'x'.repeat(2000)
      const result = buildPdf417RasterImage({ value: longValue, columns: 1, rows: 3 }, 10000)
      expect('error' in result).toBe(true)
    }))
})

describe('resolvePdf417Columns (docs/notes/05, docs/notes/06)', () => {
  it('returns the explicit columns unchanged when set, skipping the capacity dry-run entirely', () => {
    expect(resolvePdf417Columns({ value: 'hi', columns: 7 }, 1)).toBe(7)
  })

  it('auto mode: falls back to undefined (fully automatic) instead of forwarding a columns count that would overflow the real encoder', () => {
    // A tiny width budget makes preferredColumns() clamp to 1 column, which
    // can't possibly fit this much data — must come back undefined, never a
    // columns value the real (non-validating) encoder.pdf417() would choke on.
    const longValue = 'x'.repeat(2000)
    expect(resolvePdf417Columns({ value: longValue }, 1)).toBeUndefined()
  })

  it('auto mode: returns a real columns count for a value that comfortably fits', () => {
    const columns = resolvePdf417Columns({ value: 'hi' }, 576)
    expect(typeof columns).toBe('number')
  })
})
