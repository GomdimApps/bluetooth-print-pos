import { describe, it, expect } from 'vitest'
import { justifyLine } from '../../src/Text/justify'

describe('justifyLine', () => {
  it('distributes slack evenly across gaps, extra space going to the leftmost gaps first', () => {
    // words total length 3, columns 10 -> totalGap 7, gapCount 2, base 3, extra 1
    const result = justifyLine('a b c', 10)
    expect(result.length).toBe(10)
    expect(result).toBe('a    b   c')
  })

  it('returns the line unchanged when there is 1 word or fewer', () => {
    expect(justifyLine('solo', 10)).toBe('solo')
    expect(justifyLine('', 10)).toBe('')
  })

  it('returns the line unchanged when words already fill or exceed columns (no slack to distribute)', () => {
    expect(justifyLine('aaaaa bbbbb', 10)).toBe('aaaaa bbbbb')
    expect(justifyLine('aaaaaa bbbbb', 10)).toBe('aaaaaa bbbbb')
  })
})
