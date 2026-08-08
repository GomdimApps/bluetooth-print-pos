import type ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder'
import type { Alignment, PrintJobElement, TextAlignment } from '../types'

/**
 * Thermal printers usually only have reliable ASCII code pages.
 * Strips accents to avoid garbled characters on paper.
 * (Adapted from example/ReceiptEncoderHelpers.ts)
 */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export interface WrappedLine {
  text: string
  /** true if this is the last wrapped line of its paragraph — kept unjustified/ragged by convention. */
  isLastLineOfParagraph: boolean
}

/**
 * Word-wraps text at a fixed column count, mirroring the greedy line-fill
 * behavior ReceiptPrinterEncoder's own text() wrapping uses. Shared by the
 * preview renderer and applyTextElement() below, so both wrap identically.
 */
export function wrapText(text: string, columns: number): WrappedLine[] {
  const lines: WrappedLine[] = []

  for (const paragraph of text.split('\n')) {
    const paragraphLines = wrapParagraph(paragraph, columns)
    paragraphLines.forEach((line, index) => {
      lines.push({ text: line, isLastLineOfParagraph: index === paragraphLines.length - 1 })
    })
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

/**
 * Hard-splits a single word longer than `columns` so it doesn't overflow
 * the line forever. Chunks (other than the last) end with a `-` to show
 * the word continues, using `columns - 1` real characters so the hyphen
 * still fits within the column width.
 */
function splitOversizedWord(word: string, columns: number): string[] {
  if (word.length <= columns) return [word]

  if (columns <= 1) {
    // Degenerate width: no room for a hyphen either, fall back to a plain hard split.
    const chunks: string[] = []
    for (let offset = 0; offset < word.length; offset += columns) chunks.push(word.slice(offset, offset + columns))
    return chunks
  }

  const chunkWidth = columns - 1
  const chunks: string[] = []
  let offset = 0
  while (word.length - offset > columns) {
    chunks.push(word.slice(offset, offset + chunkWidth) + '-')
    offset += chunkWidth
  }
  chunks.push(word.slice(offset))
  return chunks
}

/**
 * For `align: 'justify'`: distributes the line's slack evenly between
 * words so the result is exactly `columns` characters wide. A single-word
 * line has no gaps to stretch, so it's returned unchanged.
 */
export function justifyLine(line: string, columns: number): string {
  const words = line.split(' ').filter((word) => word.length > 0)
  if (words.length <= 1) return line

  const wordsLength = words.reduce((sum, word) => sum + word.length, 0)
  const totalGap = columns - wordsLength
  if (totalGap <= 0) return line

  const gapCount = words.length - 1
  const baseGap = Math.floor(totalGap / gapCount)
  const extraGaps = totalGap % gapCount

  let result = words[0]
  for (let i = 1; i < words.length; i++) {
    const gapSize = baseGap + (i <= extraGaps ? 1 : 0)
    result += ' '.repeat(gapSize) + words[i]
  }
  return result
}

/** true if every character is in the printable ASCII range (32-126) — safe to send as raw bytes under any codepage. */
function isPrintableAscii(text: string): boolean {
  return [...text].every((char) => {
    const code = char.charCodeAt(0)
    return code >= 32 && code <= 126
  })
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

/**
 * Sends a single already-wrapped (and, for justify, already-stretched)
 * line. Confirmed by testing directly against the installed encoder:
 * `encoder.text()` trims leading/trailing whitespace internally (its own
 * word-wrap step does this even when no wrapping is needed), which
 * silently eats our alignment padding before it ever reaches the printer.
 * `encoder.raw()` bypasses that pipeline entirely and still gets
 * bold/underline/size styling applied correctly (verified: identical style
 * bytes around the content either way) — so pure-ASCII padded lines go
 * through raw(). Non-ASCII content (only possible with `stripAccents:
 * false`) falls back to the normal, unpadded text() call, since raw()
 * bypasses the codepage-aware encoding those characters need — that case
 * relies on the printer's own align command instead.
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
  const align: TextAlignment = element.align ?? 'left'
  // 'justify' positions text entirely via the assembled line content (see
  // below), not the native align command — encoder.align() only accepts
  // left/center/right, so it gets the neutral 'left' base state.
  const nativeAlign: Alignment = align === 'justify' ? 'left' : align

  encoder.align(nativeAlign)
  if (element.bold) encoder.bold(true)
  if (element.underline) encoder.underline(true)
  if (sizeWidth) encoder.size(sizeWidth, sizeHeight)

  for (const wrapped of wrapText(value, columns)) {
    const shouldJustify = align === 'justify' && !wrapped.isLastLineOfParagraph
    const line = shouldJustify ? justifyLine(wrapped.text, columns) : wrapped.text
    // Already stretched (or intentionally left ragged) — padLine() inside
    // sendLine() is a no-op for 'left', so this doesn't double-pad.
    sendLine(encoder, line, columns, nativeAlign)
  }

  // Reset state so it doesn't affect the next elements of the receipt.
  if (sizeWidth) encoder.size(1, 1)
  if (element.underline) encoder.underline(false)
  if (element.bold) encoder.bold(false)
}
