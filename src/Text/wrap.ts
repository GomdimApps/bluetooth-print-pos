export interface WrappedLine {
  text: string
  /** true if this is the last wrapped line of its paragraph — kept unjustified/ragged by convention. */
  isLastLineOfParagraph: boolean
}

/**
 * Word-wraps text at a fixed column count, mirroring the greedy line-fill
 * behavior ReceiptPrinterEncoder's own text() wrapping uses. Shared by the
 * preview renderer and applyTextElement(), so both wrap identically.
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
