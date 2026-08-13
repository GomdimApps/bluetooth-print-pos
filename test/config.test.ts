import { describe, it, expect } from 'vitest'
import { resolveColumns, resolveImageMaxWidth, PAPER_WIDTH_SPECS, DEFAULT_CONFIG } from '../config'

describe('config: paperWidth resolution (docs/notes/02-paperwidth-scales-columns-and-imagemaxwidth.md)', () => {
  it('58mm/80mm/112mm map to their documented columns/imageMaxWidth', () => {
    expect(PAPER_WIDTH_SPECS['58mm']).toEqual({ columns: 32, imageMaxWidth: 384 })
    expect(PAPER_WIDTH_SPECS['80mm']).toEqual({ columns: 42, imageMaxWidth: 576 })
    expect(PAPER_WIDTH_SPECS['112mm']).toEqual({ columns: 56, imageMaxWidth: 832 })
  })

  it('resolveColumns: explicit value wins over paperWidth, which wins over the fallback', () => {
    expect(resolveColumns(99, '80mm', 10)).toBe(99)
    expect(resolveColumns(undefined, '80mm', 10)).toBe(42)
    expect(resolveColumns(undefined, undefined, 10)).toBe(10)
  })

  it('resolveImageMaxWidth: same precedence, and actually scales with paperWidth — regression for the bug where only columns scaled', () => {
    expect(resolveImageMaxWidth(undefined, '58mm', 999)).toBe(384)
    expect(resolveImageMaxWidth(undefined, '112mm', 999)).toBe(832)
    expect(resolveImageMaxWidth(undefined, '112mm', 999)).not.toBe(DEFAULT_CONFIG.imageMaxWidth)
  })

  it('DEFAULT_CONFIG.feedBeforeCut is 4, not the encoder default of 0 (docs/notes/04)', () => {
    expect(DEFAULT_CONFIG.feedBeforeCut).toBe(4)
  })
})
