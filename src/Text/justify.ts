/**
 * For `align: 'justify'`: distributes a wrapped line's slack evenly between
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
