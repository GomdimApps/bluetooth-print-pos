import { describe, it, expect } from 'vitest'
import { loadImageFromSource, prepareImageForEncoder } from '../../src/Images/image'
import { withDom } from '../helpers/dom'
import { pixelFixture } from '../helpers/fixtures'
import { buildBytes } from '../helpers/receipt'
import { asciiBytes, containsBytes } from '../helpers/assertBytes'

describe('loadImageFromSource', () => {
  it('loads a base64 dataURL source into a real HTMLImageElement', () =>
    withDom(async () => {
      const fixture = pixelFixture(16, 24)
      const img = await loadImageFromSource(fixture.dataUrl)
      expect(img.naturalWidth).toBe(16)
      expect(img.naturalHeight).toBe(24)
    }))

  it('loads a Blob source (via URL.createObjectURL)', () =>
    withDom(async (dom) => {
      const fixture = pixelFixture(16, 16)
      const blob = dom.createLoadableBlob(fixture.bytes, 'image/png')
      const img = await loadImageFromSource(blob)
      expect(img.naturalWidth).toBe(16)
      expect(img.naturalHeight).toBe(16)
    }))

  it('resolves an already-loaded HTMLImageElement immediately, without re-fetching', () =>
    withDom(async () => {
      const fixture = pixelFixture(8, 8)
      const img = await loadImageFromSource(fixture.dataUrl) // loaded once
      const resolved = await loadImageFromSource(img) // passed straight back in
      expect(resolved).toBe(img)
    }))
})

describe('prepareImageForEncoder', () => {
  it('keeps the aspect ratio and rounds both dimensions down to a multiple of 8', () =>
    withDom(async () => {
      const fixture = pixelFixture(20, 30) // aspect ratio 1.5
      const img = await loadImageFromSource(fixture.dataUrl)
      const prepared = prepareImageForEncoder(img, { maxWidth: 384, minWidth: 1, minHeight: 1 })
      expect(prepared).toBeTruthy()
      expect(prepared!.width % 8).toBe(0)
      expect(prepared!.height % 8).toBe(0)
      // printWidth = 20 (within bounds), finalWidth = 20 - 20%8 = 16
      expect(prepared!.width).toBe(16)
    }))

  it('clamps a narrower-than-minWidth image up to minWidth', () =>
    withDom(async () => {
      const fixture = pixelFixture(10, 10)
      const img = await loadImageFromSource(fixture.dataUrl)
      const prepared = prepareImageForEncoder(img, { maxWidth: 384, minWidth: 100, minHeight: 1 })
      expect(prepared).toBeTruthy()
      // printWidth clamped to 100, finalWidth = 100 - 100%8 = 96
      expect(prepared!.width).toBe(96)
    }))

  it('clamps a wider-than-maxWidth image down to maxWidth', () =>
    withDom(async () => {
      const fixture = pixelFixture(500, 500)
      const img = await loadImageFromSource(fixture.dataUrl)
      const prepared = prepareImageForEncoder(img, { maxWidth: 100, minWidth: 1, minHeight: 1 })
      expect(prepared).toBeTruthy()
      // printWidth clamped to 100, finalWidth = 100 - 100%8 = 96
      expect(prepared!.width).toBe(96)
    }))

  it('returns null (not a throw) when rounding down leaves nothing to print', () =>
    withDom(async () => {
      const fixture = pixelFixture(10, 10)
      const img = await loadImageFromSource(fixture.dataUrl)
      // printWidth clamped into [1,4] (< 8) -> finalWidth = printWidth - printWidth%8 = 0
      const prepared = prepareImageForEncoder(img, { maxWidth: 4, minWidth: 1, minHeight: 1 })
      expect(prepared).toBeNull()
    }))
})

describe('image element, end-to-end through buildReceiptBytes()', () => {
  it('a normal image produces non-empty encoder.image() bytes', () =>
    withDom(async () => {
      const fixture = pixelFixture(32, 32)
      const bytes = await buildBytes([{ type: 'image', source: fixture.dataUrl }])
      expect(bytes.length).toBeGreaterThan(0)
    }))

  it('a degenerate image (rounds to 0px) is skipped with a warning, not a thrown error — the rest of the receipt still prints', () =>
    withDom(async () => {
      const fixture = pixelFixture(10, 10)
      const originalWarn = console.warn
      let warned = false
      console.warn = () => {
        warned = true
      }
      let bytes: Uint8Array
      try {
        bytes = await buildBytes([
          { type: 'image', source: fixture.dataUrl, maxWidth: 4, minWidth: 1, minHeight: 1 },
          { type: 'text', value: 'still here' },
        ])
      } finally {
        console.warn = originalWarn
      }
      expect(warned, 'expected applyImageElement to console.warn on a degenerate image').toBe(true)
      expect(containsBytes(bytes, asciiBytes('still here'))).toBe(true)
    }))
})
