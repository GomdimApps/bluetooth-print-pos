/** Shape returned by every real (scannable) barcode builder — code128.ts, itf.ts, pdf417.ts. */
export interface BarcodeDrawing {
  widthPx: number
  heightPx: number
  render(ctx: CanvasRenderingContext2D, x: number, y: number): void
}

/**
 * Result of attempting to build a real barcode/2D symbol: either a ready
 * `BarcodeDrawing`, or the reason it couldn't be built — surfaced directly
 * in the preview's placeholder instead of a generic message, so e.g.
 * "Interleaved 2 of 5 must contain only digits" is visible instead of a
 * misleading "unsupported symbology" for a symbology that IS supported but
 * got a value it can't encode.
 */
export type BarcodeBuildResult = { drawing: BarcodeDrawing } | { error: string }

/**
 * Strips bwip-js/BWIPP's internal diagnostic prefix (e.g.
 * "bwipp.interleaved2of5badCharacter#11136: ") from a thrown error message,
 * keeping just the human-readable reason after it. Messages that don't
 * match that shape (e.g. bwip-js's own "bwip-js: bar code text not
 * specified.") are already readable and pass through unchanged.
 */
export function cleanEncoderError(message: string): string {
  return message.replace(/^bwipp\.[\w#]+:\s*/, '')
}
