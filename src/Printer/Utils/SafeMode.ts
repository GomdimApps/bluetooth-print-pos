import type ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder'

export type SafeModeRaster = { image: { canvas: CanvasImageSource; width: number; height: number } } | { error: string }

/**
 * Shared `safeMode` handling: when `active`, runs `buildRaster()` and
 * either prints the result via `encoder.image()` or warns-and-skips it
 * (same convention `applyImageElement` uses for degenerate images — the
 * rest of the receipt keeps printing) — the caller never has to branch on
 * the raster result itself. Returns whether `safeMode` was active, so the
 * caller knows to skip its native ESC/POS command path when true and fall
 * through to it when false. Only `pdf417` uses this today; kept generic
 * (any `buildRaster()` matching `SafeModeRaster`) so a future safeMode
 * element type (e.g. barcode/qrcode) can reuse it as-is — see `safeMode`
 * on `PrintJobElement`'s `pdf417` variant in `types.ts`.
 */
export function safeMode(
  encoder: ReceiptPrinterEncoder,
  active: boolean | undefined,
  label: string,
  buildRaster: () => SafeModeRaster,
  context?: unknown,
): boolean {
  if (!active) return false

  const raster = buildRaster()
  if ('error' in raster) {
    console.warn(`[WebEscposPrinter] ${label} safeMode skipped: ${raster.error}`, context)
    return true
  }

  encoder.image(raster.image.canvas, raster.image.width, raster.image.height, 'threshold')
  return true
}

/**
 * Lighter safeMode variant for fallbacks that just need to run a callback
 * when active — no raster/error handling, since a fallback like `rule`'s
 * `'-'.repeat(columns)` can't fail the way a raster build can. Returns
 * whether safeMode was active, same contract as safeMode() above, so
 * ReceiptBuilder.ts's per-element cases branch on it the same way.
 */
export function safeModeText(active: boolean | undefined, apply: () => void): boolean {
  if (!active) return false
  apply()
  return true
}
