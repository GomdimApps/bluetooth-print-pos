/**
 * Minimal Code128 Subset B encoder + canvas renderer, for the preview only.
 * Subset B covers printable ASCII 32-126, which covers virtually every
 * receipt/tracking barcode value in practice.
 *
 * BARS is the standard Code128 symbol table: each entry is an 11-bit
 * pattern (13-bit for the STOP symbol) where each digit is one module —
 * '1' is a black bar, '0' is white space. Ported from JsBarcode
 * (https://github.com/lindell/JsBarcode, MIT license), which itself
 * implements the published Code128 / ISO-IEC 15417 symbol table — there's
 * no meaningful room for "creative" variation in this table, it's a fixed
 * industry standard, so reusing a mature, widely-deployed implementation's
 * copy is safer than retyping 107 values by hand.
 */
import type { BarcodeDrawing } from './barcodeDrawing'

const BARS: number[] = [
  11011001100, 11001101100, 11001100110, 10010011000, 10010001100,
  10001001100, 10011001000, 10011000100, 10001100100, 11001001000,
  11001000100, 11000100100, 10110011100, 10011011100, 10011001110,
  10111001100, 10011101100, 10011100110, 11001110010, 11001011100,
  11001001110, 11011100100, 11001110100, 11101101110, 11101001100,
  11100101100, 11100100110, 11101100100, 11100110100, 11100110010,
  11011011000, 11011000110, 11000110110, 10100011000, 10001011000,
  10001000110, 10110001000, 10001101000, 10001100010, 11010001000,
  11000101000, 11000100010, 10110111000, 10110001110, 10001101110,
  10111011000, 10111000110, 10001110110, 11101110110, 11010001110,
  11000101110, 11011101000, 11011100010, 11011101110, 11101011000,
  11101000110, 11100010110, 11101101000, 11101100010, 11100011010,
  11101111010, 11001000010, 11110001010, 10100110000, 10100001100,
  10010110000, 10010000110, 10000101100, 10000100110, 10110010000,
  10110000100, 10011010000, 10011000010, 10000110100, 10000110010,
  11000010010, 11001010000, 11110111010, 11000010100, 10001111010,
  10100111100, 10010111100, 10010011110, 10111100100, 10011110100,
  10011110010, 11110100100, 11110010100, 11110010010, 11011011110,
  11011110110, 11110110110, 10101111000, 10100011110, 10001011110,
  10111101000, 10111100010, 11110101000, 11110100010, 10111011110,
  10111101110, 11101011110, 11110101110, 11010000100, 11010010000,
  11010011100, 1100011101011,
]

const START_B = 104
const STOP = 106
const MODULO = 103
const QUIET_ZONE_MODULES = 10

/** true if `value` can be encoded with Code128 Subset B (printable ASCII 32-126). */
export function isCode128Encodable(value: string): boolean {
  if (value.length === 0) return false
  return [...value].every((char) => {
    const code = char.charCodeAt(0)
    return code >= 32 && code <= 126
  })
}

function encodeSymbolValues(value: string): number[] {
  const dataValues = [...value].map((char) => char.charCodeAt(0) - 32)
  let checksum = START_B
  dataValues.forEach((symbolValue, index) => {
    checksum += symbolValue * (index + 1)
  })
  checksum %= MODULO
  return [START_B, ...dataValues, checksum, STOP]
}

function toModulePattern(value: string): string {
  return encodeSymbolValues(value)
    .map((symbolValue) => BARS[symbolValue].toString())
    .join('')
}

/** Builds a Code128 barcode ready to render, or null if `value` isn't Subset-B-encodable. */
export function buildCode128(value: string, moduleWidthPx: number, heightPx: number): BarcodeDrawing | null {
  if (!isCode128Encodable(value)) return null

  const pattern = toModulePattern(value)
  const quietZonePx = QUIET_ZONE_MODULES * moduleWidthPx
  const widthPx = pattern.length * moduleWidthPx + quietZonePx * 2

  return {
    widthPx,
    heightPx,
    render(ctx, x, y) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(x, y, widthPx, heightPx)

      ctx.fillStyle = '#000'
      let cursor = x + quietZonePx
      for (const moduleDigit of pattern) {
        if (moduleDigit === '1') ctx.fillRect(cursor, y, moduleWidthPx, heightPx)
        cursor += moduleWidthPx
      }
    },
  }
}
