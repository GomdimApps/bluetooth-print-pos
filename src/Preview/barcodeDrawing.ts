/** Shape returned by every real (scannable) barcode builder — code128.ts, itf.ts. */
export interface BarcodeDrawing {
  widthPx: number
  heightPx: number
  render(ctx: CanvasRenderingContext2D, x: number, y: number): void
}
