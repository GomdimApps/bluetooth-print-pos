import { describe, it, expect } from 'vitest'
import { buildItf } from '../../src/Preview/content/itf'
import { withDom } from '../helpers/dom'

describe('buildItf (Preview-only ITF/interleaved2of5 rendering)', () => {
  it('renders an even-length digit value to a real, non-empty drawing', () =>
    withDom(() => {
      const result = buildItf('123456', 2, 40)
      expect('drawing' in result, `expected success, got ${'error' in result ? result.error : ''}`).toBe(true)
      if (!('drawing' in result)) return
      expect(result.drawing.widthPx).toBeGreaterThan(0)
      expect(result.drawing.heightPx).toBe(40)
    }))

  it('auto-pads an odd-length value with a leading zero instead of failing', () =>
    withDom(() => {
      const odd = buildItf('12345', 2, 40)
      const padded = buildItf('012345', 2, 40)
      expect('drawing' in odd && 'drawing' in padded).toBe(true)
      if ('drawing' in odd && 'drawing' in padded) {
        // Same effective barcode -> same rendered width.
        expect(odd.drawing.widthPx).toBe(padded.drawing.widthPx)
      }
    }))

  it('rejects non-digit input with a readable error instead of throwing', () =>
    withDom(() => {
      const result = buildItf('abc', 2, 40)
      expect('error' in result).toBe(true)
    }))
})
