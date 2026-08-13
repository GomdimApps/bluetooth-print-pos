import { describe, it, expect } from 'vitest'
import { wrapText } from '../../src/Text/wrap'

function texts(lines: ReturnType<typeof wrapText>): string[] {
  return lines.map((line) => line.text)
}

describe('wrapText', () => {
  it('greedily fills lines up to columns', () => {
    expect(texts(wrapText('aaa bbb ccc', 8))).toEqual(['aaa bbb', 'ccc'])
  })

  it('keeps a word that exactly fits the column width on one line', () => {
    expect(texts(wrapText('12345678', 8))).toEqual(['12345678'])
  })

  it('hard-splits an oversized single word, hyphenating every chunk but the last', () => {
    expect(texts(wrapText('abcdefghij', 4))).toEqual(['abc-', 'def-', 'ghij'])
  })

  it('falls back to a plain hard split with no hyphen when columns <= 1', () => {
    expect(texts(wrapText('abc', 1))).toEqual(['a', 'b', 'c'])
  })

  it('splits on \\n into independent paragraphs, each wrapped separately', () => {
    expect(texts(wrapText('aa bb\ncc dd', 5))).toEqual(['aa bb', 'cc dd'])
  })

  it('marks only the last wrapped line of each paragraph as isLastLineOfParagraph', () => {
    const lines = wrapText('aa bb cc\ndd', 5)
    expect(texts(lines)).toEqual(['aa bb', 'cc', 'dd'])
    expect(lines.map((line) => line.isLastLineOfParagraph)).toEqual([false, true, true])
  })

  it('an empty paragraph produces a single empty line, not zero lines', () => {
    expect(texts(wrapText('', 5))).toEqual([''])
    expect(texts(wrapText('a\n\nb', 5))).toEqual(['a', '', 'b'])
  })
})
