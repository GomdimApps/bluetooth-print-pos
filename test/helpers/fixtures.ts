import { createCanvas } from 'canvas'

export interface PixelFixture {
  bytes: Uint8Array
  dataUrl: string
  width: number
  height: number
}

/**
 * A real, freshly-encoded small PNG — left half red, right half blue, so
 * pixel-level assertions can check both halves survived a resize/dither.
 * Generated at runtime via the `canvas` devDependency instead of a
 * hand-typed/hardcoded base64 string: a hand-typed one turned out to
 * actually be invalid (confirmed — `canvas`'s decoder failed on it with an
 * opaque "out of memory" error), and this repo's own AGENTS.md already
 * warns against hand-typing binary-ish literals in this environment.
 */
export function pixelFixture(width = 16, height = 16): PixelFixture {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ff0000'
  ctx.fillRect(0, 0, width / 2, height)
  ctx.fillStyle = '#0000ff'
  ctx.fillRect(width / 2, 0, width / 2, height)

  const dataUrl = canvas.toDataURL('image/png')
  const bytes = new Uint8Array(Buffer.from(dataUrl.split(',')[1], 'base64'))
  return { bytes, dataUrl, width, height }
}
