import { interleaved2of5 as bwipInterleaved2of5 } from '@bwip-js/browser'
import { errorMessage } from '../../interfaces/printerErrors'
import { cleanEncoderError, type BarcodeBuildResult } from '../core/barcodeDrawing'

/**
 * Real ITF (Interleaved 2 of 5) rendering, via @bwip-js/browser (already a
 * dependency for pdf417.ts's preview — see that file's comment for why).
 * This used to be a hand-ported encoder; bwip-js's `interleaved2of5`
 * (confirmed by reading its actual runtime source, not assumed) is
 * digits-only and auto-pads an odd-length value with a leading zero — same
 * behavior the hand-rolled version had, so this is a behavior-preserving
 * swap. Imports the `interleaved2of5` *named* export, not the generic
 * `toCanvas` + `bcid` string API — see AGENTS.md gotcha #22.
 *
 * Same height-stretching approach as code128.ts — see that file's comment.
 */
export function buildItf(value: string, moduleWidthPx: number, heightPx: number): BarcodeBuildResult {
  const offscreen = document.createElement('canvas')

  try {
    // `bcid` only satisfies bwip-js's RenderOptions type — never consulted at runtime here.
    bwipInterleaved2of5(offscreen, { bcid: 'interleaved2of5', text: value, scale: moduleWidthPx })
  } catch (error) {
    return { error: cleanEncoderError(errorMessage(error)) }
  }

  const widthPx = offscreen.width

  return {
    drawing: {
      widthPx,
      heightPx,
      render(ctx, x, y) {
        ctx.drawImage(offscreen, x, y, widthPx, heightPx)
      },
    },
  }
}
