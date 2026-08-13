import type ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder'
import type { ImageSource, PrintJobElement, WebEscposPrinterConfig } from '../types'

/**
 * Loads any of the supported image sources into an HTMLImageElement ready
 * to be drawn. Covers the 4 formats accepted by the wrapper:
 *  - base64 dataURL (preferred: no network request, never hits CORS)
 *  - File/Blob (e.g. <input type="file">, more efficient than converting to base64)
 *  - remote http(s) URL (needs the server to allow CORS)
 *  - HTMLImageElement already present on the page
 */
export function loadImageFromSource(source: ImageSource): Promise<HTMLImageElement> {
  if (source instanceof HTMLImageElement) {
    if (source.complete && source.naturalWidth > 0) {
      return Promise.resolve(source)
    }
    return new Promise((resolve, reject) => {
      source.addEventListener('load', () => resolve(source), { once: true })
      source.addEventListener('error', () => reject(new Error('Failed to load HTMLImageElement.')), {
        once: true,
      })
    })
  }

  if (source instanceof Blob) {
    const objectUrl = URL.createObjectURL(source)
    return loadImageUrl(objectUrl, true).finally(() => URL.revokeObjectURL(objectUrl))
  }

  // string: doesn't matter if it's a base64 dataURL or a remote URL, same flow.
  const isRemote = /^https?:\/\//i.test(source)
  return loadImageUrl(source, isRemote)
}

function loadImageUrl(url: string, useCrossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // Needed so the encoder's internal canvas doesn't get "tainted" when
    // processing an image from another origin (the server must respond with CORS allowed).
    if (useCrossOrigin) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

export interface ImagePrepOpts {
  maxWidth: number
  minWidth: number
  minHeight: number
}

export interface PreparedImage {
  width: number
  height: number
}

/**
 * Computes the final print dimensions from the image's natural size,
 * respecting min/max width and the ESC/POS raster requirement that width
 * and height be multiples of 8.
 * (Adapted from example/ReceiptEncoderHelpers.ts -> appendLogo())
 *
 * Returns `null` when the image is too small/narrow for anything to be left
 * after rounding — the caller should skip that element, not abort the
 * whole receipt.
 */
export function prepareImageForEncoder(img: HTMLImageElement, opts: ImagePrepOpts): PreparedImage | null {
  const aspectRatio = img.height / img.width

  const printWidth = Math.min(Math.max(img.width, opts.minWidth), opts.maxWidth)
  const printHeight = Math.max(Math.round(printWidth * aspectRatio), opts.minHeight)

  const finalWidth = printWidth - (printWidth % 8)
  const finalHeight = printHeight - (printHeight % 8)

  if (finalWidth <= 0 || finalHeight <= 0) return null

  return { width: finalWidth, height: finalHeight }
}

/**
 * Applies a `{ type: 'image' }` PrintJob element to the encoder: loads,
 * resizes and calls encoder.image(). Doesn't throw on a degenerate image
 * after resizing — just warns via console.warn and draws nothing, so the
 * rest of the receipt keeps printing.
 */
export async function applyImageElement(
  encoder: ReceiptPrinterEncoder,
  element: PrintJobElement & { type: 'image' },
  defaults: WebEscposPrinterConfig,
): Promise<void> {
  const img = await loadImageFromSource(element.source)

  const prepared = prepareImageForEncoder(img, {
    maxWidth: element.maxWidth ?? defaults.imageMaxWidth,
    minWidth: element.minWidth ?? defaults.imageMinWidth,
    minHeight: element.minHeight ?? defaults.imageMinHeight,
  })

  if (!prepared) {
    console.warn('[WebEscposPrinter] Image skipped: invalid dimensions after resizing.', element)
    return
  }

  encoder.align(element.align ?? 'center')
  encoder.image(img, prepared.width, prepared.height, 'threshold', element.threshold ?? defaults.imageThreshold)
}
