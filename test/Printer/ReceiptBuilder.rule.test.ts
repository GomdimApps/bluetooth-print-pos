import { describe, it, expect } from 'vitest'
import { buildBytes } from '../helpers/receipt'
import { asciiBytes, containsBytes } from '../helpers/assertBytes'

/**
 * docs/notes/10-clone-printers-mangle-rule-character.md: encoder.rule()
 * sends a cp437 box-drawing character some clone printers' font tables
 * don't match, printing garbage instead of a line. safeMode: true swaps in
 * a plain ASCII '-' line, which is safe across every codepage.
 */
describe('ReceiptBuilder: rule element', () => {
  it('native rule() does not contain the plain-ASCII safeMode line', async () => {
    const bytes = await buildBytes([{ type: 'rule' }], {}, { columns: 32 })
    expect(containsBytes(bytes, asciiBytes('-'.repeat(32)))).toBe(false)
  })

  it('safeMode: true sends a plain ASCII dash line, columns wide', async () => {
    const bytes = await buildBytes([{ type: 'rule', safeMode: true }], {}, { columns: 32 })
    expect(containsBytes(bytes, asciiBytes('-'.repeat(32)))).toBe(true)
  })

  it('safeMode false (default) and safeMode true produce different bytes for the same columns', async () => {
    const native = await buildBytes([{ type: 'rule' }], {}, { columns: 32 })
    const safe = await buildBytes([{ type: 'rule', safeMode: true }], {}, { columns: 32 })
    expect(native).not.toEqual(safe)
  })
})
