import qrcodeFactory from 'qrcode-generator'

export interface QrCodeDrawing {
  widthPx: number
  heightPx: number
  render(ctx: CanvasRenderingContext2D, x: number, y: number): void
}

const MARGIN_MODULES = 2

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
