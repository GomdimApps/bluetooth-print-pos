import { describe, it, expect } from 'vitest'
import { buildEncoder } from '../helpers/encoder'

/**
 * Direct contract tests against the real encoder's `.image()` — the
 * primitive every safeMode raster (pdf417/qrcode) and applyImageElement()
 * ultimately call. Uses a plain `{ data, width, height }` object (the real
 * encoder's DOM-free input branch, confirmed by reading its source) so this
 * file needs no jsdom/canvas — see Images/image.test.ts for the full
 * DOM-backed applyImageElement() pipeline.
 */
function solidImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0
    data[i + 1] = 0
    data[i + 2] = 0
    data[i + 3] = 255
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData
}

describe('encoder.image() contract', () => {
  it('throws when width is not a multiple of 8', () => {
    const encoder = buildEncoder()
    expect(() => encoder.image(solidImageData(10, 8), 10, 8)).toThrow()
  })

  it('throws when height is not a multiple of 8', () => {
    const encoder = buildEncoder()
    expect(() => encoder.image(solidImageData(8, 10), 8, 10)).toThrow()
  })

  it('accepts a plain {data,width,height} object with dimensions that are multiples of 8', () => {
    const encoder = buildEncoder()
    expect(() => encoder.image(solidImageData(16, 8), 16, 8, 'threshold')).not.toThrow()
    const bytes = encoder.encode()
    expect(bytes.length).toBeGreaterThan(0)
  })
})
