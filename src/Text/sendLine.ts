import type ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder'
import type { Alignment } from '../types'

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
 * often don't — see sendLine() below).
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
export function sendLine(encoder: ReceiptPrinterEncoder, line: string, columns: number, align: Alignment): void {
  const padded = padLine(line, columns, align)
  if (isPrintableAscii(padded)) {
    encoder.raw([...padded].map((char) => char.charCodeAt(0)))
  } else {
    encoder.text(line)
  }
  encoder.newline()
}
