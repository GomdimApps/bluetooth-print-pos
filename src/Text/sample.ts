import type ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder'
import type { Alignment, PrintJobElement } from '../types'

/**
 * Thermal printers usually only have reliable ASCII code pages.
 * Strips accents to avoid garbled characters on paper.
 * (Adapted from example/ReceiptEncoderHelpers.ts)
 */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Word-wraps text at a fixed column count, mirroring the greedy line-fill
 * behavior ReceiptPrinterEncoder's own text() wrapping uses. Shared by the
 * preview renderer and applyTextElement() below, so both wrap identically.
 */
export function wrapText(text: string, columns: number): string[] {
  const lines: string[] = []

  for (const paragraph of text.split('\n')) {
    lines.push(...wrapParagraph(paragraph, columns))
  }

  return lines
}

function wrapParagraph(paragraph: string, columns: number): string[] {
  if (paragraph.length === 0) return ['']

  const lines: string[] = []
  let current = ''

  for (const word of paragraph.split(' ')) {
    for (const chunk of splitOversizedWord(word, columns)) {
      if (current.length === 0) {
        current = chunk
        continue
      }

      if (current.length + 1 + chunk.length <= columns) {
        current += ' ' + chunk
      } else {
        lines.push(current)
        current = chunk
      }
    }
  }

  if (current.length > 0 || lines.length === 0) lines.push(current)
  return lines
}

/** Hard-splits a single word longer than `columns` so it doesn't overflow the line forever. */
function splitOversizedWord(word: string, columns: number): string[] {
  if (word.length <= columns) return [word]

  const chunks: string[] = []
  for (let offset = 0; offset < word.length; offset += columns) {
    chunks.push(word.slice(offset, offset + columns))
  }
  return chunks
}

/**
 * Left-pads a single line with literal spaces so it's already positioned
 * correctly for `align`, regardless of whether the physical printer's
 * firmware honors the ESC/POS align command for plain text (cheap clones
 * often don't — see applyTextElement()).
 */
function padLine(line: string, columns: number, align: Alignment): string {
  const gap = Math.max(0, columns - line.length)
  if (align === 'right') return ' '.repeat(gap) + line
  if (align === 'center') return ' '.repeat(Math.floor(gap / 2)) + line
  return line
}

/** true if every character is in the printable ASCII range (32-126) — safe to send as raw bytes under any codepage. */
function isPrintableAscii(text: string): boolean {
  return [...text].every((char) => {
    const code = char.charCodeAt(0)
    return code >= 32 && code <= 126
  })
}

/**
 * Sends a single already-wrapped line, padded for alignment. Confirmed by
 * testing directly against the installed encoder: `encoder.text()` trims
 * leading/trailing whitespace internally (its own word-wrap step does this
 * even when no wrapping is needed), which silently eats our alignment
 * padding before it ever reaches the printer. `encoder.raw()` bypasses that
 * pipeline entirely and still gets bold/underline/size styling applied
 * correctly (verified: identical style bytes around the content either
 * way) — so pure-ASCII padded lines go through raw(). Non-ASCII content
 * (only possible with `stripAccents: false`) falls back to the normal,
 * unpadded text() call, since raw() bypasses the codepage-aware encoding
 * those characters need — that case relies on the printer's own align
 * command instead.
 */
function sendLine(encoder: ReceiptPrinterEncoder, line: string, columns: number, align: Alignment): void {
  const padded = padLine(line, columns, align)
  if (isPrintableAscii(padded)) {
    encoder.raw([...padded].map((char) => char.charCodeAt(0)))
  } else {
    encoder.text(line)
  }
  encoder.newline()
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
  const align = element.align ?? 'left'

  encoder.align(align)
  if (element.bold) encoder.bold(true)
  if (element.underline) encoder.underline(true)
  if (sizeWidth) encoder.size(sizeWidth, sizeHeight)

  for (const line of wrapText(value, columns)) {
    sendLine(encoder, line, columns, align)
  }

  // Reset state so it doesn't affect the next elements of the receipt.
  if (sizeWidth) encoder.size(1, 1)
  if (element.underline) encoder.underline(false)
  if (element.bold) encoder.bold(false)
}
