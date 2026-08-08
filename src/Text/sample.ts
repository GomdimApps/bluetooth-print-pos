import type ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder'
import type { Alignment, PrintJobElement, TextAlignment } from '../types'
import { wrapText, type WrappedLine } from './wrap'
import { justifyLine } from './justify'
import { sendLine } from './sendLine'

/**
 * Thermal printers usually only have reliable ASCII code pages.
 * Strips accents to avoid garbled characters on paper.
 * (Adapted from example/ReceiptEncoderHelpers.ts)
 */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** 'justify' stretches every wrapped line except a paragraph's last (kept ragged, see wrapText()). */
function resolveLineText(wrapped: WrappedLine, align: TextAlignment, columns: number): string {
  const shouldJustify = align === 'justify' && !wrapped.isLastLineOfParagraph
  return shouldJustify ? justifyLine(wrapped.text, columns) : wrapped.text
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
  columns: number,
): void {
  const value = stripAccentsEnabled ? stripAccents(element.value) : element.value
  const [sizeWidth, sizeHeight] = Array.isArray(element.size)
    ? element.size
    : [element.size, element.size]
  const align: TextAlignment = element.align ?? 'left'
  // 'justify' positions text entirely via the assembled line content (see
  // resolveLineText()), not the native align command — encoder.align()
  // only accepts left/center/right, so it gets the neutral 'left' base state.
  const nativeAlign: Alignment = align === 'justify' ? 'left' : align

  encoder.align(nativeAlign)
  if (element.bold) encoder.bold(true)
  if (element.underline) encoder.underline(true)
  if (sizeWidth) encoder.size(sizeWidth, sizeHeight)

  for (const wrapped of wrapText(value, columns)) {
    sendLine(encoder, resolveLineText(wrapped, align, columns), columns, nativeAlign)
  }

  // Reset state so it doesn't affect the next elements of the receipt.
  if (sizeWidth) encoder.size(1, 1)
  if (element.underline) encoder.underline(false)
  if (element.bold) encoder.bold(false)
}
