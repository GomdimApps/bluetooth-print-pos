import { pdf417 as bwipPdf417, drawingSVG } from '@bwip-js/browser'
import { errorMessage } from '../../interfaces/printerErrors'
import type { BarcodeBuildResult, BarcodeDrawing } from '../core/barcodeDrawing'

/**
 * Real PDF417 rendering, via `@bwip-js/browser` — an independent
 * implementation from the real encoder's `.pdf417()` (which just emits
 * ESC/POS bytes; the printer firmware draws the actual symbol), used only
 * for preview. `compact` is bwip-js's name for what the real encoder calls
 * `truncated`. See AGENTS.md gotcha #1 for why print-side correctness never
 * depends on this file.
 *
 * Imports the `pdf417`/`drawingSVG` *named* exports, not the generic
 * `toCanvas`/`toSVG` + `bcid` string API — the generic API resolves the
 * symbology via a runtime string lookup that references all ~100 bundled
 * symbologies, defeating tree-shaking. See AGENTS.md gotcha #7.
 */
export interface Pdf417Options {
  columns?: number
  rows?: number
  errorlevel?: number
  truncated?: boolean
}

/** Shape both resolvePdf417Columns() and buildPdf417RasterImage() need from a `pdf417` PrintJobElement. */
export interface Pdf417ElementLike {
  value: string
  columns?: number
  width?: number
  rows?: number
  errorlevel?: number
  truncated?: boolean
}

// The real encoder's own pdf417() defaults — bwip-js defaults these
// differently, which visibly changes the symbol's shape for identical
// data (AGENTS.md gotchas #5/#6). Used below so an unset value renders
// the same way the real print already assumes.
const DEFAULT_MODULE_WIDTH = 3
const DEFAULT_ERRORLEVEL = 1

/**
 * Shared option mapping for both bwip-js calls below — avoids repeating the
 * same conditional spreads twice. `bcid` is only here to satisfy bwip-js's
 * `RenderOptions` type (still mandatory there for every symbology) — the
 * named `pdf417()` call below never actually consults it at runtime, since
 * it calls the PDF417 encoder directly instead of dispatching on `bcid`.
 */
function toBwipOptions(value: string, columns: number | undefined, opts: Pdf417Options) {
  return {
    bcid: 'pdf417' as const,
    text: value,
    eclevel: opts.errorlevel ?? DEFAULT_ERRORLEVEL,
    ...(columns !== undefined ? { columns } : {}),
    ...(opts.rows !== undefined ? { rows: opts.rows } : {}),
    ...(opts.truncated !== undefined ? { compact: opts.truncated } : {}),
  }
}

/** Largest PDF417 `columns` that fits `widthBudgetPx` at `moduleWidthDots`, per PDF417's standard width formula (17 modules/column + 69 fixed overhead — confirmed against real @bwip-js/browser measurements). Clamped to PDF417's valid 1-30 range. */
function preferredColumns(widthBudgetPx: number, moduleWidthDots: number): number {
  const maxColumns = Math.floor((widthBudgetPx / moduleWidthDots - 69) / 17)
  return Math.min(30, Math.max(1, maxColumns))
}

/**
 * Picks the `columns` to use for a pdf417 element: its own explicit value if
 * set, otherwise the paper-width's preferred count — but only if a DOM-free
 * bwip-js dry-run (`toSVG`) confirms it actually fits `element.value` at the
 * given `rows`/`errorlevel`/`truncated`. Falls back to `undefined` (fully
 * automatic) when it doesn't fit, since the real encoder never validates
 * PDF417 capacity itself (AGENTS.md gotcha #5) — a preferred `columns` that
 * doesn't fit must never reach it unchecked.
 *
 * `ReceiptBuilder.ts` and `PreviewRenderer.ts` both call this, so real print
 * and preview always agree on the same `columns` (AGENTS.md gotcha #1).
 */
export function resolvePdf417Columns(element: Pdf417ElementLike, widthBudgetPx: number): number | undefined {
  if (element.columns !== undefined) return element.columns

  const preferred = preferredColumns(widthBudgetPx, element.width ?? DEFAULT_MODULE_WIDTH)
  try {
    bwipPdf417({ ...toBwipOptions(element.value, preferred, element), scale: 1 }, drawingSVG())
    return preferred
  } catch {
    return undefined
  }
}

/** Builds a real PDF417 symbol ready to render, or the reason it failed (e.g. empty value — bwip-js throws on that). */
export function buildPdf417(value: string, moduleScale: number, options: Pdf417Options): BarcodeBuildResult {
  const offscreen = document.createElement('canvas')

  try {
    bwipPdf417(offscreen, { ...toBwipOptions(value, options.columns, options), scale: moduleScale })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  return {
    drawing: {
      widthPx: offscreen.width,
      heightPx: offscreen.height,
      render(ctx, x, y) {
        ctx.drawImage(offscreen, x, y)
      },
    },
  }
}

export interface Pdf417RasterImage {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

/** Smallest multiple of 8 >= px — encoder.image() throws ("Width/Height must be a multiple of 8") otherwise. */
function roundUpToMultipleOf8(px: number): number {
  return Math.ceil(px / 8) * 8
}

/**
 * Draws `drawing` onto a fresh `width`x`height` canvas, white-filled first.
 * Used to pad a symbol up to a multiple of 8 without cropping/scaling it —
 * matches encoder.image()'s own unconditional white-flatten step (confirmed
 * by reading the bundled encoder), done explicitly so this canvas is
 * correct on its own terms too.
 */
function renderOntoWhiteCanvas(drawing: BarcodeDrawing, width: number, height: number): HTMLCanvasElement {
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

/**
 * Print-ready PDF417 raster for `safeMode`, via the same buildPdf417()
 * the preview uses. Padded (never cropped/scaled — that could break the
 * symbol) to a multiple of 8, width capped at `maxWidthPx` (fails instead
 * of cropping if padding would exceed it); height is unbounded.
 */
export function buildPdf417RasterImage(element: Pdf417ElementLike, maxWidthPx: number): { image: Pdf417RasterImage } | { error: string } {
  const moduleScale = element.width ?? DEFAULT_MODULE_WIDTH
  const columns = resolvePdf417Columns(element, maxWidthPx)
  const result = buildPdf417(element.value, moduleScale, {
    columns,
    rows: element.rows,
    errorlevel: element.errorlevel,
    truncated: element.truncated,
  })
  if ('error' in result) return result

  const { drawing } = result
  const width = roundUpToMultipleOf8(drawing.widthPx)
  const height = roundUpToMultipleOf8(drawing.heightPx)
  if (width > maxWidthPx) {
    return { error: `PDF417 raster is ${width}px wide after padding, exceeding the ${maxWidthPx}px paper content width.` }
  }

  try {
    return { image: { canvas: renderOntoWhiteCanvas(drawing, width, height), width, height } }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}
