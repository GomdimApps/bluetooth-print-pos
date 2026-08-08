import { resolveColumns } from '../../config'
import { stripAccents } from '../Text/sample'
import { wrapText } from './textLayout'
import { prepareDitheredImage, type DitheredImage } from './imageDither'
import { buildCode128, type Code128Barcode } from './code128'
import { buildQrCode, type QrCodeDrawing } from './qrcode'
import type { Alignment, PrintJob, PrinterWrapperConfig, PrintPreview } from '../types'

const MARGIN_PX = 16
const FONT_FAMILY = 'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace'
const LINE_HEIGHT_RATIO = 1.35
const CUT_HEIGHT_PX = 32
const BARCODE_DEFAULT_MODULE_PX = 2
const BARCODE_DEFAULT_HEIGHT_PX = 64
const QRCODE_DEFAULT_CELL_PX = 6 // matches ReceiptPrinterEncoder.qrcode()'s own default `size`
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
  const contentWidthPx = defaults.imageMaxWidth

  const measureCtx = document.createElement('canvas').getContext('2d')
  if (!measureCtx) throw new Error('Canvas 2D is not supported in this browser.')
  const baseFontSizePx = calibrateFontSize(measureCtx, columns, contentWidthPx)
  const lineHeightPx = Math.round(baseFontSizePx * LINE_HEIGHT_RATIO)

  const drawables: Drawable[] = []

  for (const element of job.content) {
    switch (element.type) {
      case 'text': {
        const value = stripAccentsEnabled ? stripAccents(element.value) : element.value
        const [, sizeHeight] = Array.isArray(element.size) ? element.size : [element.size, element.size]
        const scale = sizeHeight ?? 1
        drawables.push(
          textDrawable(
            wrapText(value, columns),
            element.align ?? 'left',
            element.bold ?? false,
            element.underline ?? false,
            baseFontSizePx * scale,
            lineHeightPx * scale,
          ),
        )
        break
      }

      case 'newline':
        drawables.push(spaceDrawable(lineHeightPx * (element.lines ?? 1)))
        break

      case 'rule':
        drawables.push(ruleDrawable())
        break

      case 'image': {
        // eslint-disable-next-line no-await-in-loop -- preview mirrors the sequential real print path.
        const dithered = await prepareDitheredImage(element.source, {
          maxWidth: element.maxWidth ?? defaults.imageMaxWidth,
          minWidth: element.minWidth ?? defaults.imageMinWidth,
          minHeight: element.minHeight ?? defaults.imageMinHeight,
          threshold: element.threshold ?? defaults.imageThreshold,
        })
        if (dithered) drawables.push(imageDrawable(dithered, element.align ?? 'center'))
        break
      }

      case 'barcode': {
        const symbology = element.symbology ?? 'code128'
        const moduleWidthPx = element.width ?? BARCODE_DEFAULT_MODULE_PX
        const heightPx = element.height ?? BARCODE_DEFAULT_HEIGHT_PX
        const barcode = symbology === 'code128' ? buildCode128(element.value, moduleWidthPx, heightPx) : null
        drawables.push(
          barcode
            ? barcodeDrawable(barcode, element.align ?? 'center')
            : placeholderDrawable(symbology, element.value, heightPx, element.align ?? 'center'),
        )
        break
      }

      case 'qrcode': {
        const cellSizePx = element.size ?? QRCODE_DEFAULT_CELL_PX
        drawables.push(qrDrawable(buildQrCode(element.value, cellSizePx), element.align ?? 'center'))
        break
      }

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

function barcodeDrawable(barcode: Code128Barcode, align: Alignment): Drawable {
  return {
    heightPx: barcode.heightPx,
    draw(ctx, contentWidthPx, y) {
      const x = MARGIN_PX + alignOffset(align, contentWidthPx, barcode.widthPx)
      barcode.render(ctx, x, y)
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

/** Used for barcode symbologies other than 'code128', which we don't encode for real — see code128.ts. */
function placeholderDrawable(symbology: string, value: string, heightPx: number, align: Alignment): Drawable {
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
      ctx.fillText('not rendered — unsupported symbology', x + 4, y + heightPx / 2 - 14)
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
