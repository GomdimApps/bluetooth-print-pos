import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder'
import { applyTextElement } from '../Text/sample'
import { applyImageElement } from '../Images/image'
import type { PrintJob, PrinterWrapperConfig } from '../types'

/**
 * Walks `job.content` in order and builds the ESC/POS/StarPRNT bytes ready
 * to send to the printer. This is where the "generic" PrintJob shape (which
 * the calling HTML/JS builds without knowing anything about the encoder)
 * turns into real calls to the @point-of-sale/receipt-printer-encoder lib.
 */
export async function buildReceiptBytes(job: PrintJob, defaults: PrinterWrapperConfig): Promise<Uint8Array> {
  const stripAccentsEnabled = job.stripAccents ?? defaults.stripAccents

  const encoder = new ReceiptPrinterEncoder({
    columns: job.columns ?? defaults.columns,
    language: job.language ?? defaults.language,
  })

  encoder.initialize()

  for (const element of job.content) {
    switch (element.type) {
      case 'text':
        applyTextElement(encoder, element, stripAccentsEnabled)
        encoder.newline()
        break

      case 'newline':
        encoder.newline(element.lines ?? 1)
        break

      case 'rule':
        encoder.rule()
        break

      case 'image':
        // eslint-disable-next-line no-await-in-loop -- printing is inherently sequential, one image at a time.
        await applyImageElement(encoder, element, defaults)
        break

      case 'barcode':
        encoder.align(element.align ?? 'center')
        encoder.barcode(element.value, element.symbology ?? 'code128', {
          height: element.height,
          width: element.width,
        })
        break

      case 'qrcode':
        encoder.align(element.align ?? 'center')
        encoder.qrcode(element.value, { size: element.size })
        break

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
