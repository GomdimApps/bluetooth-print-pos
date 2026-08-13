import { describe, it, expect } from 'vitest'
import { sendLine } from '../../src/Text/sendLine'
import { buildEncoder } from '../helpers/encoder'
import { asciiBytes, containsBytes } from '../helpers/assertBytes'

// The real encoder only accepts columns of 32/35/42/44/48 (see
// ReceiptBuilder.pdf417.test.ts's "112mm" case) — 32 here, expected padding
// computed from it rather than hardcoded, so the numbers stay consistent if
// this ever changes.
const COLUMNS = 32

/**
 * Pins the regression sendLine.ts's own comment documents: `encoder.text()`
 * trims leading/trailing whitespace internally (confirmed against the real
 * installed encoder below), silently eating alignment padding — sendLine()
 * exists specifically to route pure-ASCII padded lines through `raw()`
 * instead, which doesn't have that problem.
 */
describe('sendLine', () => {
  it('right-aligned ASCII text keeps its left padding, via raw() not text()', () => {
    const encoder = buildEncoder({ columns: COLUMNS })
    sendLine(encoder, 'abc', COLUMNS, 'right')
    const bytes = encoder.encode()
    const expected = ' '.repeat(COLUMNS - 3) + 'abc'
    expect(containsBytes(bytes, asciiBytes(expected))).toBe(true)
  })

  it('center-aligned ASCII text keeps its floor()-ed left padding', () => {
    const encoder = buildEncoder({ columns: COLUMNS })
    sendLine(encoder, 'abc', COLUMNS, 'center')
    const bytes = encoder.encode()
    const expected = ' '.repeat(Math.floor((COLUMNS - 3) / 2)) + 'abc'
    expect(containsBytes(bytes, asciiBytes(expected))).toBe(true)
  })

  it('left-aligned ASCII text is sent unpadded', () => {
    const encoder = buildEncoder({ columns: COLUMNS })
    sendLine(encoder, 'abc', COLUMNS, 'left')
    const bytes = encoder.encode()
    expect(containsBytes(bytes, asciiBytes('abc'))).toBe(true)
    expect(containsBytes(bytes, asciiBytes(' abc'))).toBe(false)
  })

  it('regression: encoder.text() alone (the pre-fix approach) trims that same leading padding', () => {
    const encoder = buildEncoder({ columns: COLUMNS })
    const padded = ' '.repeat(COLUMNS - 3) + 'abc' // what padLine() would have produced, sent the naive way
    encoder.text(padded)
    const bytes = encoder.encode()
    expect(
      containsBytes(bytes, asciiBytes(padded)),
      'encoder.text() should have trimmed the leading spaces here — confirms why sendLine() routes padded lines through raw() instead',
    ).toBe(false)
  })

  it('non-ASCII content bypasses raw() and falls back to encoder.text() without throwing', () => {
    const encoder = buildEncoder({ columns: COLUMNS })
    // "café" — a literal precomposed character, never a hand-typed \uXXXX escape (AGENTS.md gotcha).
    expect(() => sendLine(encoder, 'café', COLUMNS, 'left')).not.toThrow()
    const bytes = encoder.encode()
    expect(bytes.length).toBeGreaterThan(0)
  })
})
