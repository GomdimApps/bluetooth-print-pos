import { describe, it, expect } from 'vitest'
import { buildQrCodeRasterImage } from '../../src/Preview/core/qrcode'
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

describe('buildQrCodeRasterImage (safeMode raster for qrcode)', () => {
  it('renders a real QR symbol padded to a multiple of 8, with actual dark pixels drawn', () =>
    withDom(async () => {
      const result = buildQrCodeRasterImage({ value: 'https://example.com' }, 384)
      expect('image' in result, `expected success, got ${'error' in result ? result.error : ''}`).toBe(true)
      if (!('image' in result)) return
      expect(result.image.width % 8).toBe(0)
      expect(result.image.height % 8).toBe(0)
      expect(result.image.canvas.width).toBe(result.image.width)
      expect(result.image.canvas.height).toBe(result.image.height)
      expect(hasNonWhitePixel(result.image.canvas)).toBe(true)
    }))

  it('fails (does not crop/scale) when the padded symbol would exceed the paper content width', () =>
    withDom(async () => {
      const result = buildQrCodeRasterImage({ value: 'https://example.com/a-fairly-long-url-to-force-a-bigger-qr-code' }, 8)
      expect('error' in result).toBe(true)
    }))

  it('a larger cell size produces a larger raster (size option is honored)', () =>
    withDom(async () => {
      const small = buildQrCodeRasterImage({ value: 'hi', size: 2 }, 1000)
      const large = buildQrCodeRasterImage({ value: 'hi', size: 10 }, 1000)
      expect('image' in small && 'image' in large).toBe(true)
      if ('image' in small && 'image' in large) {
        expect(large.image.width).toBeGreaterThan(small.image.width)
      }
    }))
})
