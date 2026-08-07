import type ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder'
import type { PrintJobElement } from '../types'

/**
 * Thermal printers usually only have reliable ASCII code pages.
 * Strips accents to avoid garbled characters on paper.
 * (Adapted from example/ReceiptEncoderHelpers.ts)
 */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Applies a `{ type: 'text' }` PrintJob element to the encoder: alignment,
 * bold, underline and size are set before the text, then reset afterwards
 * so they don't leak into the next elements of the receipt.
 */
export function applyTextElement(
  encoder: ReceiptPrinterEncoder,
  element: PrintJobElement & { type: 'text' },
  stripAccentsEnabled: boolean,
): void {
  const value = stripAccentsEnabled ? stripAccents(element.value) : element.value
  const [sizeWidth, sizeHeight] = Array.isArray(element.size)
    ? element.size
    : [element.size, element.size]

  encoder.align(element.align ?? 'left')
  if (element.bold) encoder.bold(true)
  if (element.underline) encoder.underline(true)
  if (sizeWidth) encoder.size(sizeWidth, sizeHeight)

  encoder.text(value)

  // Reset state so it doesn't affect the next elements of the receipt.
  if (sizeWidth) encoder.size(1, 1)
  if (element.underline) encoder.underline(false)
  if (element.bold) encoder.bold(false)
}
