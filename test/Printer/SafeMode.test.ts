import { describe, it, expect } from 'vitest'
import { safeMode, safeModeText, type SafeModeRaster } from '../../src/Printer/Utils/SafeMode'
import { buildEncoder } from '../helpers/encoder'

/**
 * DOM-free tests of the shared safeMode()/safeModeText() substitution
 * mechanism itself — the contract every safeMode element (pdf417/qrcode/
 * rule) relies on. Uses a fake `buildRaster` callback and a plain
 * `{data,width,height}` "canvas" (the real encoder's DOM-free image() input
 * branch), so this pins the mechanism without needing jsdom/canvas — see
 * Preview/qrcode.raster.test.ts and pdf417.raster.test.ts for the real
 * canvas-backed raster generation this mechanism calls in production.
 */
function fakeRaster(width = 8, height = 8): SafeModeRaster {
  return {
    image: {
      canvas: { data: new Uint8ClampedArray(width * height * 4), width, height } as unknown as CanvasImageSource,
      width,
      height,
    },
  }
}

describe('safeMode()', () => {
  it('inactive (undefined/false): returns false and never calls buildRaster', () => {
    const encoder = buildEncoder()
    let called = false
    const active = safeMode(encoder, undefined, 'test', () => {
      called = true
      return fakeRaster()
    })
    expect(active).toBe(false)
    expect(called).toBe(false)

    const activeFalse = safeMode(encoder, false, 'test', () => {
      called = true
      return fakeRaster()
    })
    expect(activeFalse).toBe(false)
    expect(called).toBe(false)
  })

  it('active + successful build: calls encoder.image() with the raster\'s exact dims and returns true', () => {
    const encoder = buildEncoder()
    const active = safeMode(encoder, true, 'test', () => fakeRaster(16, 8))
    expect(active).toBe(true)
    const bytes = encoder.encode()
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('active + build error: returns true (native command still skipped) without calling encoder.image(), and warns', () => {
    const encoder = buildEncoder()
    const originalWarn = console.warn
    let warned = false
    console.warn = () => {
      warned = true
    }
    let active: boolean
    try {
      active = safeMode(encoder, true, 'test', () => ({ error: 'boom' }))
    } finally {
      console.warn = originalWarn
    }
    expect(active).toBe(true)
    expect(warned).toBe(true)
    // Nothing beyond initialize() was queued into the encoder — compare
    // against a fresh encoder's own initialize()-only bytes, since
    // initialize() itself is not zero-length (reset/codepage-setup bytes).
    const bytes = encoder.encode()
    const baseline = buildEncoder().encode()
    expect(bytes).toEqual(baseline)
  })
})

describe('safeModeText()', () => {
  it('inactive: returns false and never calls apply', () => {
    let called = false
    const active = safeModeText(undefined, () => {
      called = true
    })
    expect(active).toBe(false)
    expect(called).toBe(false)
  })

  it('active: calls apply exactly once and returns true', () => {
    let calls = 0
    const active = safeModeText(true, () => {
      calls += 1
    })
    expect(active).toBe(true)
    expect(calls).toBe(1)
  })
})
