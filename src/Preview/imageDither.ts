import CanvasDither from 'canvas-dither'
import { loadImageFromSource, prepareImageForEncoder } from '../Images/image'
import type { ImageSource } from '../types'

export interface DitheredImage {
  imageData: ImageData
  width: number
  height: number
}

export interface DitherOptions {
  maxWidth: number
  minWidth: number
  minHeight: number
  threshold: number
}

/**
 * Loads + resizes an image exactly like applyImageElement() does for the
 * real print path (same prepareImageForEncoder sizing), then runs it
 * through the same canvas-dither 'threshold' algorithm the encoder uses
 * internally — so the preview pixels match what actually gets printed,
 * not just a visual approximation. Returns null for a degenerate image,
 * same as the real path (caller should skip the element, not abort).
 */
export async function prepareDitheredImage(source: ImageSource, opts: DitherOptions): Promise<DitheredImage | null> {
  const img = await loadImageFromSource(source)
  const prepared = prepareImageForEncoder(img, opts)
  if (!prepared) return null

  const canvas = document.createElement('canvas')
  canvas.width = prepared.width
  canvas.height = prepared.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(img, 0, 0, prepared.width, prepared.height)
  const imageData = ctx.getImageData(0, 0, prepared.width, prepared.height)
  CanvasDither.threshold(imageData, opts.threshold)

  return { imageData, width: prepared.width, height: prepared.height }
}
