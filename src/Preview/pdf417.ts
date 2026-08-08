import { toCanvas } from '@bwip-js/browser'
import type { BarcodeDrawing } from './barcodeDrawing'

/**
 * Real PDF417 rendering, unlike Code128/ITF (src/Preview/code128.ts,
 * itf.ts): those are small, fixed, standardized tables safely hand-ported
 * and cross-checked against a second source. PDF417 needs text/byte/numeric
 * compaction, a ~2800-entry codeword table and Reed-Solomon error correction
 * over GF(929) — getting that right by hand with no way to physically
 * scan-test it here is real risk, so this wraps `@bwip-js/browser` (MIT,
 * years of production use against real 2D scanners) instead.
 *
 * Option names/defaults below were confirmed by reading the installed
 * package's actual runtime source (node_modules/@bwip-js/browser/dist/bwipp.mjs),
 * not from docs — `columns`/`rows`/`eclevel`/`compact` all validate and
 * default exactly like this. `compact` is BWIPP's name for what the real
 * ESC/POS encoder (ReceiptBuilder.ts) calls `truncated` — same PDF417
 * variant, different library, different name. Print-side correctness is
 * completely independent of this library: printReceipt() only ever calls
 * the real encoder's own `.pdf417()`, which is a separate, unrelated
 * implementation (the printer firmware's).
 */
export interface Pdf417Options {
  columns?: number
  rows?: number
  errorlevel?: number
  truncated?: boolean
}

/** Builds a real PDF417 symbol ready to render, or null if `value` is empty (bwip-js throws on empty input). */
export function buildPdf417(value: string, moduleScale: number, options: Pdf417Options): BarcodeDrawing | null {
  const offscreen = document.createElement('canvas')

  try {
    toCanvas(offscreen, {
      bcid: 'pdf417',
      text: value,
      scale: moduleScale,
      ...(options.columns !== undefined ? { columns: options.columns } : {}),
      ...(options.rows !== undefined ? { rows: options.rows } : {}),
      ...(options.errorlevel !== undefined ? { eclevel: options.errorlevel } : {}),
      ...(options.truncated !== undefined ? { compact: options.truncated } : {}),
    })
  } catch {
    return null
  }

  const widthPx = offscreen.width
  const heightPx = offscreen.height

  return {
    widthPx,
    heightPx,
    render(ctx, x, y) {
      ctx.drawImage(offscreen, x, y)
    },
  }
}
