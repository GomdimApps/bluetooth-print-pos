import type { BarcodeDrawing } from './barcodeDrawing'

/**
 * Minimal ITF (Interleaved 2 of 5) encoder + canvas renderer, for the
 * preview only. This is what Brazilian bank slip (boleto) barcodes use —
 * 44 numeric digits, always even-length. Digit pattern table cross-checked
 * against two independent sources before use (own knowledge + a Wikipedia
 * fetch), same diligence as the Code128 table in code128.ts.
 */
const PATTERNS: Record<string, string> = {
  '0': 'NNWWN', '1': 'WNNNW', '2': 'NWNNW', '3': 'WWNNN', '4': 'NNWNW',
  '5': 'WNWNN', '6': 'NWWNN', '7': 'NNNWW', '8': 'WNNWN', '9': 'NWNWN',
}
const START = 'NNNN' // bar, space, bar, space — all narrow
const STOP = 'WNN' // wide bar, narrow space, narrow bar
const WIDE_RATIO = 3 // a "wide" element is 3x a "narrow" one — a common, reliably scannable ratio
const QUIET_ZONE_MODULES = 10

/** true if `value` is non-empty and digits-only — ITF is numeric-only. */
export function isItfEncodable(value: string): boolean {
  return value.length > 0 && [...value].every((char) => char >= '0' && char <= '9')
}

/** ITF encodes digits in pairs — pad an odd-length value with a leading zero, same as most ITF encoders. */
function normalizeItfValue(value: string): string {
  return value.length % 2 === 0 ? value : '0' + value
}

/**
 * Interleaves each digit pair: the first digit's pattern becomes bars, the
 * second's becomes the spaces between them. Returns a flat sequence of
 * 'N'/'W', alternating bar/space starting with a bar (even index = bar).
 */
function buildElementSequence(digits: string): string[] {
  const elements = [...START]

  for (let i = 0; i < digits.length; i += 2) {
    const bars = PATTERNS[digits[i]]
    const spaces = PATTERNS[digits[i + 1]]
    for (let m = 0; m < 5; m++) {
      elements.push(bars[m], spaces[m])
    }
  }

  elements.push(...STOP)
  return elements
}

/** Builds a real ITF barcode ready to render, or null if `value` isn't digits-only. */
export function buildItf(value: string, moduleWidthPx: number, heightPx: number): BarcodeDrawing | null {
  if (!isItfEncodable(value)) return null

  const elements = buildElementSequence(normalizeItfValue(value))
  const unitWidth = (unit: string) => (unit === 'W' ? WIDE_RATIO : 1) * moduleWidthPx
  const barsWidthPx = elements.reduce((sum, unit) => sum + unitWidth(unit), 0)
  const quietZonePx = QUIET_ZONE_MODULES * moduleWidthPx
  const widthPx = barsWidthPx + quietZonePx * 2

  return {
    widthPx,
    heightPx,
    render(ctx, x, y) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(x, y, widthPx, heightPx)

      ctx.fillStyle = '#000'
      let cursor = x + quietZonePx
      elements.forEach((unit, index) => {
        const w = unitWidth(unit)
        if (index % 2 === 0) ctx.fillRect(cursor, y, w, heightPx) // even index = bar, odd = space
        cursor += w
      })
    },
  }
}
