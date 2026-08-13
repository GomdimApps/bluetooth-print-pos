import qrcodeFactory from 'qrcode-generator'
import { roundUpToMultipleOf8, renderOntoWhiteCanvas } from './barcodeDrawing'
import { errorMessage } from '../../interfaces/printerErrors'

export interface QrCodeDrawing {
  widthPx: number
  heightPx: number
  render(ctx: CanvasRenderingContext2D, x: number, y: number): void
}

const MARGIN_MODULES = 2

// Matches ReceiptPrinterEncoder.qrcode()'s own default `size` — used both
// by the preview and, when unset, by buildQrCodeRasterImage() below.
export const QRCODE_DEFAULT_CELL_PX = 6

/** Builds a real, scannable QR code ready to render. `cellSizePx` is the module (dot) size. */
export function buildQrCode(value: string, cellSizePx: number): QrCodeDrawing {
  const qr = qrcodeFactory(0, 'M')
  qr.addData(value)
  qr.make()

  const moduleCount = qr.getModuleCount()
  const sizePx = (moduleCount + MARGIN_MODULES * 2) * cellSizePx

  return {
    widthPx: sizePx,
    heightPx: sizePx,
    render(ctx, x, y) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(x, y, sizePx, sizePx)

      ctx.save()
      ctx.translate(x + MARGIN_MODULES * cellSizePx, y + MARGIN_MODULES * cellSizePx)
      qr.renderTo2dContext(ctx, cellSizePx)
      ctx.restore()
    },
  }
}

/** Shape buildQrCodeRasterImage() needs from a `qrcode` PrintJobElement. */
export interface QrCodeElementLike {
  value: string
  size?: number
}

export interface QrCodeRasterImage {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

/**
 * Print-ready QR raster for `safeMode`, via the same buildQrCode() the
 * preview uses. Padded (never cropped/scaled — that could break the
 * symbol) to a multiple of 8, width capped at `maxWidthPx` (fails instead
 * of cropping if padding would exceed it); height is unbounded. Mirrors
 * content/pdf417.ts's buildPdf417RasterImage().
 */
export function buildQrCodeRasterImage(element: QrCodeElementLike, maxWidthPx: number): { image: QrCodeRasterImage } | { error: string } {
  let drawing: QrCodeDrawing
  try {
    drawing = buildQrCode(element.value, element.size ?? QRCODE_DEFAULT_CELL_PX)
  } catch (error) {
    return { error: errorMessage(error) }
  }

  const width = roundUpToMultipleOf8(drawing.widthPx)
  const height = roundUpToMultipleOf8(drawing.heightPx)
  if (width > maxWidthPx) {
    return { error: `QR code raster is ${width}px wide after padding, exceeding the ${maxWidthPx}px paper content width.` }
  }

  try {
    return { image: { canvas: renderOntoWhiteCanvas(drawing, width, height), width, height } }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}
