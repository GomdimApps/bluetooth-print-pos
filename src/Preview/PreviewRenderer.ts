import { resolveColumns, resolveImageMaxWidth } from '../../config'
import { stripAccents } from '../Text/sample'
import { wrapText } from '../Text/wrap'
import { justifyLine } from '../Text/justify'
import { prepareDitheredImage, type DitheredImage } from './imageDither'
import { buildCode128 } from './code128'
import { buildItf } from './itf'
import { buildQrCode, type QrCodeDrawing } from './qrcode'
import { buildPdf417 } from './pdf417'
import type { BarcodeDrawing, BarcodeBuildResult } from './barcodeDrawing'
import type { Alignment, PrintJob, PrintJobElement, PrinterWrapperConfig, PrintPreview } from '../types'

const MARGIN_PX = 16
const FONT_FAMILY = 'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace'
const LINE_HEIGHT_RATIO = 1.35
const CUT_HEIGHT_PX = 32
const BARCODE_DEFAULT_MODULE_PX = 2
const BARCODE_DEFAULT_HEIGHT_PX = 64
const QRCODE_DEFAULT_CELL_PX = 6 // matches ReceiptPrinterEncoder.qrcode()'s own default `size`
const PDF417_DEFAULT_SCALE = 3
const PDF417_DEFAULT_HEIGHT_PX = 64 // only used for the placeholder shown when bwip-js rejects the value (e.g. empty)
const TOO_WIDE_LABEL_HEIGHT_PX = 16
const BLOCK_GAP_PX = 6
const BACKGROUND = '#fff'

/** One laid-out chunk of the receipt: knows its own height upfront, draws itself once the canvas exists. */
interface Drawable {
  heightPx: number
  draw(ctx: CanvasRenderingContext2D, contentWidthPx: number, y: number): void
}

/**
 * Renders a PrintJob to a canvas that simulates exactly what would be
 * printed — same column wrapping, same image resize + dithering (via the
 * same canvas-dither the real encoder uses), real scannable Code128/QR —
 * without ever touching a printer. Two-phase: first build a Drawable per
 * element (this also resolves async image loading and computes exact
 * sizes), then size the canvas once and draw everything.
 */
export async function renderPreviewCanvas(job: PrintJob, defaults: PrinterWrapperConfig): Promise<PrintPreview> {
  const columns = resolveColumns(job.columns, job.paperWidth, defaults.columns)
  const stripAccentsEnabled = job.stripAccents ?? defaults.stripAccents
  // Images are already sized against imageMaxWidth (in px/dots); reusing it as the
  // paper's content width keeps text, images, barcodes and rules visually aligned.
  // job.paperWidth scales this too, not just columns — a wider paper actually
  // widens the canvas and the barcode "too wide" threshold.
  const contentWidthPx = resolveImageMaxWidth(undefined, job.paperWidth, defaults.imageMaxWidth)

  const measureCtx = document.createElement('canvas').getContext('2d')
  if (!measureCtx) throw new Error('Canvas 2D is not supported in this browser.')
  const baseFontSizePx = calibrateFontSize(measureCtx, columns, contentWidthPx)
  const lineHeightPx = Math.round(baseFontSizePx * LINE_HEIGHT_RATIO)

  const drawables: Drawable[] = []

  for (const element of job.content) {
    switch (element.type) {
      case 'text':
        drawables.push(buildTextDrawable(element, columns, stripAccentsEnabled, baseFontSizePx, lineHeightPx))
        break

      case 'newline':
        drawables.push(spaceDrawable(lineHeightPx * (element.lines ?? 1)))
        break

      case 'rule':
        drawables.push(ruleDrawable())
        break

      case 'image': {
        // eslint-disable-next-line no-await-in-loop -- preview mirrors the sequential real print path.
        const drawable = await buildImageDrawable(element, defaults, contentWidthPx)
        if (drawable) drawables.push(drawable)
        break
      }

      case 'barcode':
        drawables.push(buildBarcodeDrawable(element, contentWidthPx))
        break

      case 'qrcode':
        drawables.push(buildQrDrawable(element))
        break

      case 'pdf417':
        drawables.push(buildPdf417Drawable(element, contentWidthPx))
        break

      default: {
        const exhaustiveCheck: never = element
        throw new Error(`Unknown receipt element type: ${JSON.stringify(exhaustiveCheck)}`)
      }
    }
  }

  if ((job.cut ?? 'full') !== false) drawables.push(cutDrawable())

  const canvas = document.createElement('canvas')
  canvas.width = contentWidthPx + MARGIN_PX * 2
  canvas.height = layoutHeight(drawables)

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not supported in this browser.')

  ctx.fillStyle = BACKGROUND
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textBaseline = 'top'

  let y = MARGIN_PX
  for (const drawable of drawables) {
    drawable.draw(ctx, contentWidthPx, y)
    y += drawable.heightPx + BLOCK_GAP_PX
  }

  return { canvas, dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
}

function layoutHeight(drawables: Drawable[]): number {
  const contentHeightPx = drawables.reduce((sum, d) => sum + d.heightPx, 0)
  const gapsPx = BLOCK_GAP_PX * Math.max(0, drawables.length - 1)
  return MARGIN_PX * 2 + contentHeightPx + gapsPx
}

/** One-shot linear calibration: monospace char width scales ~linearly with font size, so a single probe measurement is enough. */
function calibrateFontSize(ctx: CanvasRenderingContext2D, columns: number, targetWidthPx: number): number {
  const probeFontSizePx = 20
  ctx.font = `${probeFontSizePx}px ${FONT_FAMILY}`
  const probeWidthPx = ctx.measureText('0'.repeat(columns)).width
  if (probeWidthPx <= 0) return probeFontSizePx
  return Math.max(6, probeFontSizePx * (targetWidthPx / probeWidthPx))
}

function alignOffset(align: Alignment, contentWidthPx: number, blockWidthPx: number): number {
  if (align === 'center') return Math.max(0, (contentWidthPx - blockWidthPx) / 2)
  if (align === 'right') return Math.max(0, contentWidthPx - blockWidthPx)
  return 0
}

function buildTextDrawable(
  element: PrintJobElement & { type: 'text' },
  columns: number,
  stripAccentsEnabled: boolean,
  baseFontSizePx: number,
  lineHeightPx: number,
): Drawable {
  const value = stripAccentsEnabled ? stripAccents(element.value) : element.value
  const [, sizeHeight] = Array.isArray(element.size) ? element.size : [element.size, element.size]
  const scale = sizeHeight ?? 1
  const align = element.align ?? 'left'

  // 'justify' bakes its spacing into the line text itself (same as the
  // real print path) — textDrawable only ever sees left/center/right.
  const lines = wrapText(value, columns).map((wrapped) =>
    align === 'justify' && !wrapped.isLastLineOfParagraph ? justifyLine(wrapped.text, columns) : wrapped.text,
  )

  return textDrawable(
    lines,
    align === 'justify' ? 'left' : align,
    element.bold ?? false,
    element.underline ?? false,
    baseFontSizePx * scale,
    lineHeightPx * scale,
  )
}

async function buildImageDrawable(
  element: PrintJobElement & { type: 'image' },
  defaults: PrinterWrapperConfig,
  contentWidthPx: number,
): Promise<Drawable | null> {
  const dithered = await prepareDitheredImage(element.source, {
    maxWidth: element.maxWidth ?? contentWidthPx,
    minWidth: element.minWidth ?? defaults.imageMinWidth,
    minHeight: element.minHeight ?? defaults.imageMinHeight,
    threshold: element.threshold ?? defaults.imageThreshold,
  })
  return dithered ? imageDrawable(dithered, element.align ?? 'center') : null
}

function buildBarcodeDrawable(element: PrintJobElement & { type: 'barcode' }, contentWidthPx: number): Drawable {
  const symbology = element.symbology ?? 'code128'
  const moduleWidthPx = element.width ?? BARCODE_DEFAULT_MODULE_PX
  const heightPx = element.height ?? BARCODE_DEFAULT_HEIGHT_PX
  const result = buildRealBarcode(symbology, element.value, moduleWidthPx, heightPx)
  return 'drawing' in result
    ? realBarcodeDrawable(result.drawing, element.align ?? 'center', contentWidthPx)
    : placeholderDrawable(symbology, element.value, result.error, heightPx, element.align ?? 'center')
}

function buildQrDrawable(element: PrintJobElement & { type: 'qrcode' }): Drawable {
  const cellSizePx = element.size ?? QRCODE_DEFAULT_CELL_PX
  return qrDrawable(buildQrCode(element.value, cellSizePx), element.align ?? 'center')
}

/** Reuses realBarcodeDrawable()'s "too wide for paper" handling — PDF417 can overflow the paper just like a 1D barcode. */
function buildPdf417Drawable(element: PrintJobElement & { type: 'pdf417' }, contentWidthPx: number): Drawable {
  const moduleScale = element.width ?? PDF417_DEFAULT_SCALE
  const result = buildPdf417(element.value, moduleScale, {
    columns: element.columns,
    rows: element.rows,
    errorlevel: element.errorlevel,
    truncated: element.truncated,
  })
  return 'drawing' in result
    ? realBarcodeDrawable(result.drawing, element.align ?? 'center', contentWidthPx)
    : placeholderDrawable('pdf417', element.value, result.error, PDF417_DEFAULT_HEIGHT_PX, element.align ?? 'center')
}

function textDrawable(
  lines: string[],
  align: Alignment,
  bold: boolean,
  underline: boolean,
  fontSizePx: number,
  lineHeightPx: number,
): Drawable {
  return {
    heightPx: lines.length * lineHeightPx,
    draw(ctx, contentWidthPx, y) {
      ctx.font = `${bold ? 'bold ' : ''}${fontSizePx}px ${FONT_FAMILY}`
      ctx.fillStyle = '#000'
      lines.forEach((line, index) => {
        const lineY = y + index * lineHeightPx
        const lineWidthPx = ctx.measureText(line).width
        const x = MARGIN_PX + alignOffset(align, contentWidthPx, lineWidthPx)
        ctx.fillText(line, x, lineY)
        if (underline) {
          const underlineY = lineY + fontSizePx * 1.05
          ctx.fillRect(x, underlineY, lineWidthPx, Math.max(1, Math.round(fontSizePx * 0.06)))
        }
      })
    },
  }
}

function spaceDrawable(heightPx: number): Drawable {
  return { heightPx, draw() {} }
}

function ruleDrawable(): Drawable {
  return {
    heightPx: 1,
    draw(ctx, contentWidthPx, y) {
      ctx.fillStyle = '#000'
      ctx.fillRect(MARGIN_PX, y, contentWidthPx, 1)
    },
  }
}

function imageDrawable(dithered: DitheredImage, align: Alignment): Drawable {
  return {
    heightPx: dithered.height,
    draw(ctx, contentWidthPx, y) {
      const x = MARGIN_PX + alignOffset(align, contentWidthPx, dithered.width)
      ctx.putImageData(dithered.imageData, x, y)
    },
  }
}

/** 'itf'/'interleaved-2-of-5' matches the real encoder's own symbology aliases for ITF. */
function buildRealBarcode(symbology: string, value: string, moduleWidthPx: number, heightPx: number): BarcodeBuildResult {
  if (symbology === 'code128') return buildCode128(value, moduleWidthPx, heightPx)
  if (symbology === 'itf' || symbology === 'interleaved-2-of-5') return buildItf(value, moduleWidthPx, heightPx)
  return { error: 'unsupported symbology' }
}

/** Draws a real barcode at its true computed size — if that's wider than the paper, it's left to
 * overflow/clip naturally (showing exactly what would get cut off) plus a red "too wide" warning. */
function realBarcodeDrawable(barcode: BarcodeDrawing, align: Alignment, paperContentWidthPx: number): Drawable {
  const tooWide = barcode.widthPx > paperContentWidthPx
  return {
    heightPx: barcode.heightPx + (tooWide ? TOO_WIDE_LABEL_HEIGHT_PX : 0),
    draw(ctx, contentWidthPx, y) {
      const x = MARGIN_PX + alignOffset(align, contentWidthPx, barcode.widthPx)
      barcode.render(ctx, x, y)

      if (!tooWide) return
      ctx.strokeStyle = '#c00'
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, barcode.widthPx, barcode.heightPx)
      ctx.fillStyle = '#c00'
      ctx.font = `11px ${FONT_FAMILY}`
      ctx.fillText(
        `too wide for paper (${Math.round(barcode.widthPx)}px > ${Math.round(paperContentWidthPx)}px) — try a smaller width or a wider paperWidth`,
        MARGIN_PX,
        y + barcode.heightPx + 3,
      )
    },
  }
}

function qrDrawable(qr: QrCodeDrawing, align: Alignment): Drawable {
  return {
    heightPx: qr.heightPx,
    draw(ctx, contentWidthPx, y) {
      const x = MARGIN_PX + alignOffset(align, contentWidthPx, qr.widthPx)
      qr.render(ctx, x, y)
    },
  }
}

/**
 * Shown whenever a real barcode/2D symbol couldn't be built — either the
 * symbology is out of scope entirely, or it is supported but `value` was
 * rejected by the real encoder (e.g. ITF given non-digit input). `reason`
 * is the specific message for either case, surfaced directly rather than
 * a single generic label, so the two situations aren't confused.
 */
function placeholderDrawable(symbology: string, value: string, reason: string, heightPx: number, align: Alignment): Drawable {
  const label = `[${symbology}] ${value}`
  return {
    heightPx,
    draw(ctx, contentWidthPx, y) {
      const widthPx = Math.min(contentWidthPx, Math.max(120, label.length * 8))
      const x = MARGIN_PX + alignOffset(align, contentWidthPx, widthPx)

      ctx.fillStyle = '#eee'
      ctx.fillRect(x, y, widthPx, heightPx)
      ctx.strokeStyle = '#999'
      ctx.strokeRect(x, y, widthPx, heightPx)

      ctx.fillStyle = '#333'
      ctx.font = `12px ${FONT_FAMILY}`
      ctx.fillText(`not rendered — ${reason}`, x + 4, y + heightPx / 2 - 14)
      ctx.fillText(label, x + 4, y + heightPx / 2)
    },
  }
}

function cutDrawable(): Drawable {
  return {
    heightPx: CUT_HEIGHT_PX,
    draw(ctx, contentWidthPx, y) {
      const lineY = y + CUT_HEIGHT_PX / 2

      ctx.save()
      ctx.strokeStyle = '#999'
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(MARGIN_PX, lineY)
      ctx.lineTo(MARGIN_PX + contentWidthPx, lineY)
      ctx.stroke()
      ctx.restore()

      ctx.fillStyle = '#999'
      ctx.font = `11px ${FONT_FAMILY}`
      ctx.fillText('✂ cut', MARGIN_PX, lineY + 4)
    },
  }
}
