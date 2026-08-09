import { code128 as bwipCode128 } from '@bwip-js/browser'
import { errorMessage } from '../../interfaces/printerErrors'
import { cleanEncoderError, type BarcodeBuildResult } from '../core/barcodeDrawing'

/**
 * Real Code128 rendering, via @bwip-js/browser (already a dependency for
 * pdf417.ts's preview — see that file's comment for why). This used to be
 * a hand-ported Subset-B-only encoder; bwip-js's `code128` auto-selects
 * between Subsets A/B/C per the real spec, so it also encodes control
 * characters and packs long numeric runs tighter — strictly broader than
 * what the hand-rolled version supported. Imports the `code128` *named*
 * export, not the generic `toCanvas` + `bcid` string API — see AGENTS.md
 * gotcha #7 for why that distinction is worth ~740KB.
 *
 * bwip-js's `height` option is millimeters at ~72dpi internally, not
 * literal pixels (confirmed by measuring real output at several values) —
 * rather than hardcode that conversion, the rendered canvas is stretched
 * to the exact requested `heightPx` via drawImage's destination-size
 * overload. Safe for a 1D symbol: bar *width* encodes the data, height is
 * purely a visual/scan-tolerance choice, so resizing it freely doesn't
 * affect scannability (verified: stretched output still scans/renders
 * cleanly in a real render check).
 */
export function buildCode128(value: string, moduleWidthPx: number, heightPx: number): BarcodeBuildResult {
  const offscreen = document.createElement('canvas')

  try {
    // `bcid` is only here to satisfy bwip-js's RenderOptions type (still
    // mandatory there); the named call below never actually consults it.
    bwipCode128(offscreen, { bcid: 'code128', text: value, scale: moduleWidthPx })
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
