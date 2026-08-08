/**
 * Word-wraps text at a fixed column count, mirroring the greedy line-fill
 * behavior ReceiptPrinterEncoder's own text() wrapping uses. Only used by
 * the preview renderer — the real print path lets the encoder wrap itself.
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
