import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder'
import { resolveColumns, resolveImageMaxWidth } from '../../config'
import { applyTextElement } from '../Text/sample'
import { applyImageElement } from '../Images/image'
import { resolvePdf417Columns } from '../Preview/content/pdf417'
import type { PrintJob, PrinterWrapperConfig } from '../types'

// Barcode height/width defaults (encoder has none of its own). Matches
// PreviewRenderer.ts's defaults so preview and real print line up.
const BARCODE_DEFAULT_MODULE_WIDTH = 2
const BARCODE_DEFAULT_HEIGHT = 64

/**
 * Walks `job.content` in order and builds the ESC/POS/StarPRNT bytes ready
 * to send to the printer. This is where the "generic" PrintJob shape (which
 * the calling HTML/JS builds without knowing anything about the encoder)
 * turns into real calls to the @point-of-sale/receipt-printer-encoder lib.
 */
export async function buildReceiptBytes(job: PrintJob, defaults: PrinterWrapperConfig): Promise<Uint8Array> {
  const stripAccentsEnabled = job.stripAccents ?? defaults.stripAccents

  // job.paperWidth scales both columns and the image size ceiling, so a
  // wider paperWidth actually gives images more room — not just text.
  const columns = resolveColumns(job.columns, job.paperWidth, defaults.columns)
  const imageMaxWidth = resolveImageMaxWidth(undefined, job.paperWidth, defaults.imageMaxWidth)
  const jobDefaults: PrinterWrapperConfig = { ...defaults, columns, imageMaxWidth }

  // Only included when set — the encoder overwrites its own defaults if
  // these keys are present at all, even with value `undefined`.
  const codepageMapping = job.codepageMapping ?? defaults.codepageMapping
  const printerModel = job.printerModel ?? defaults.printerModel

  const encoder = new ReceiptPrinterEncoder({
    columns,
    language: job.language ?? defaults.language,
    // Always a resolved number (unlike codepageMapping/printerModel above),
    // so no undefined-guard spread needed — see gotcha #1 in AGENTS.md,
    // which doesn't apply here since this key is never omitted/undefined.
    feedBeforeCut: job.feedBeforeCut ?? defaults.feedBeforeCut,
    ...(codepageMapping !== undefined ? { codepageMapping } : {}),
    ...(printerModel !== undefined ? { printerModel } : {}),
  })

  encoder.initialize()

  for (const element of job.content) {
    switch (element.type) {
      case 'text':
        // Emits its own newline(s), one per wrapped line — no extra newline() here.
        applyTextElement(encoder, element, stripAccentsEnabled, columns)
        break

      case 'newline':
        encoder.newline(element.lines ?? 1)
        break

      case 'rule':
        encoder.rule()
        break

      case 'image':
        // eslint-disable-next-line no-await-in-loop -- printing is inherently sequential, one image at a time.
        await applyImageElement(encoder, element, jobDefaults)
        break

      case 'barcode':
        encoder.align(element.align ?? 'center')
        encoder.barcode(element.value, element.symbology ?? 'code128', {
          height: element.height ?? BARCODE_DEFAULT_HEIGHT,
          width: element.width ?? BARCODE_DEFAULT_MODULE_WIDTH,
        })
        break

      case 'qrcode': {
        // Same undefined-key hazard as codepageMapping/printerModel — omit when not set.
        encoder.align(element.align ?? 'center')
        const qrOptions = element.size !== undefined ? { size: element.size } : {}
        encoder.qrcode(element.value, qrOptions)
        break
      }

      case 'pdf417': {
        encoder.align(element.align ?? 'center')
        // Paper-width-preferred columns when unset, matching PreviewRenderer.ts — AGENTS.md gotchas #4/#20/#21.
        const columns = resolvePdf417Columns(element, imageMaxWidth)
        encoder.pdf417(element.value, {
          ...(columns !== undefined ? { columns } : {}),
          ...(element.rows !== undefined ? { rows: element.rows } : {}),
          ...(element.width !== undefined ? { width: element.width } : {}),
          ...(element.height !== undefined ? { height: element.height } : {}),
          ...(element.errorlevel !== undefined ? { errorlevel: element.errorlevel } : {}),
          ...(element.truncated !== undefined ? { truncated: element.truncated } : {}),
        })
        break
      }

      default: {
        const exhaustiveCheck: never = element
        throw new Error(`Unknown receipt element type: ${JSON.stringify(exhaustiveCheck)}`)
      }
    }
  }

  const cut = job.cut ?? 'full'
  if (cut !== false) encoder.cut(cut)

  return encoder.encode()
}
