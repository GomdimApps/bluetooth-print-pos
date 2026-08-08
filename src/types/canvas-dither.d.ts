/**
 * Ambient declaration for canvas-dither (ships no types). Only the methods
 * this project actually uses are declared. Same instance the underlying
 * @point-of-sale/receipt-printer-encoder uses internally for its
 * 'threshold' dithering, reused here so preview and real print match.
 */
declare module 'canvas-dither' {
  interface CanvasDither {
    grayscale(image: ImageData): ImageData
    threshold(image: ImageData, threshold: number): ImageData
    bayer(image: ImageData, threshold: number): ImageData
    floydsteinberg(image: ImageData): ImageData
    atkinson(image: ImageData): ImageData
  }

  const instance: CanvasDither
  export default instance
}
