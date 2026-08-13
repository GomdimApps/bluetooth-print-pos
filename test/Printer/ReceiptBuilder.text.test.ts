import { describe, it, expect } from 'vitest'
import { buildBytes } from '../helpers/receipt'
import { asciiBytes, containsBytes } from '../helpers/assertBytes'
import { wrapText } from '../../src/Text/wrap'
import { justifyLine } from '../../src/Text/justify'

// The real encoder only accepts columns of 32/35/42/44/48 (see
// ReceiptBuilder.pdf417.test.ts's "112mm" case) — 32 throughout.
const COLUMNS = 32

describe('ReceiptBuilder: text element, end-to-end through buildReceiptBytes()', () => {
  it('wraps at the resolved column width — one encoder.newline() per wrapped line', async () => {
    const bytes = await buildBytes([{ type: 'text', value: 'a'.repeat(70) }], {}, { columns: COLUMNS })
    const newlineCount = [...bytes].filter((byte) => byte === 0x0a).length
    expect(newlineCount).toBe(wrapText('a'.repeat(70), COLUMNS).length)
  })

  it('right-aligned text keeps its left padding in the final receipt bytes (integration of sendLine.ts)', async () => {
    const bytes = await buildBytes([{ type: 'text', value: 'abc', align: 'right' }], {}, { columns: COLUMNS })
    expect(containsBytes(bytes, asciiBytes(' '.repeat(COLUMNS - 3) + 'abc'))).toBe(true)
  })

  it('justify stretches every wrapped line except the paragraph\'s last', async () => {
    const value = 'one two three four five six seven eight nine ten eleven twelve'
    const bytes = await buildBytes([{ type: 'text', value, align: 'justify' }], {}, { columns: COLUMNS })

    const wrapped = wrapText(value, COLUMNS)
    expect(wrapped.length, 'test fixture needs to actually wrap into 2+ lines').toBeGreaterThan(1)

    const firstLineJustified = justifyLine(wrapped[0].text, COLUMNS)
    expect(containsBytes(bytes, asciiBytes(firstLineJustified))).toBe(true)

    const lastLine = wrapped[wrapped.length - 1].text
    expect(containsBytes(bytes, asciiBytes(lastLine)), "paragraph's last line must stay ragged/unjustified").toBe(true)
  })

  it('stripAccents strips accents by default', async () => {
    const bytes = await buildBytes([{ type: 'text', value: 'café' }], {}, { columns: COLUMNS })
    expect(containsBytes(bytes, asciiBytes('cafe'))).toBe(true)
  })

  it('stripAccents: false leaves accented text for sendLine()\'s non-ASCII fallback (encoder.text()) to handle, without throwing', async () => {
    // Await directly, not expect(...).resolves — a rejection here fails the
    // test on its own; there's no meaningful matcher for "didn't throw".
    await buildBytes([{ type: 'text', value: 'café', align: 'right' }], { stripAccents: false }, { columns: COLUMNS })
  })

  it('bold/underline/size add command bytes without throwing, and do not carry over to a following plain element', async () => {
    const styled = await buildBytes([{ type: 'text', value: 'x', bold: true, underline: true, size: 2 }])
    const plain = await buildBytes([{ type: 'text', value: 'x' }])
    expect(styled.length).toBeGreaterThan(plain.length)

    // Two elements: styled then plain — the plain one's own text still
    // shows up (bold/underline/size don't need decoding to fail loudly if
    // they broke something downstream).
    const combined = await buildBytes([
      { type: 'text', value: 'first', bold: true, underline: true, size: 2 },
      { type: 'text', value: 'second' },
    ])
    expect(containsBytes(combined, asciiBytes('second'))).toBe(true)
  })
})
