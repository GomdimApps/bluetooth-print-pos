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

/** Smallest multiple of 8 >= px — encoder.image() throws ("Width/Height must be a multiple of 8") otherwise. */
export function roundUpToMultipleOf8(px: number): number {
  return Math.ceil(px / 8) * 8
}

/**
 * Draws `drawing` onto a fresh `width`x`height` canvas, white-filled first.
 * Used to pad a symbol up to a multiple of 8 without cropping/scaling it —
 * matches encoder.image()'s own unconditional white-flatten step (confirmed
 * by reading the bundled encoder). Shared by every safeMode raster builder
 * (pdf417.ts, core/qrcode.ts).
 */
export function renderOntoWhiteCanvas(drawing: BarcodeDrawing, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not supported in this browser.')

  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  drawing.render(ctx, 0, 0)

  return canvas
}
