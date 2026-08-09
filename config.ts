import type { PaperWidth, PrinterWrapperConfig, PrinterWrapperConfigInput } from './src/types'

export const DEFAULT_CONFIG: PrinterWrapperConfig = {
  columns: 32,
  language: 'esc-pos',
  imageThreshold: 128,
  imageMaxWidth: 384,
  imageMinWidth: 224,
  imageMinHeight: 64,
  stripAccents: true,
  // Blank lines fed before the physical cut command. The underlying encoder
  // defaults this to 0 unless a recognized printerModel supplies its own
  // cutter.feed — with 0, the cutter fires before the last printed content
  // has advanced past it, slicing through it (confirmed on real hardware:
  // an Epson TM-T20X-II, whose exact model isn't in the encoder's known-model
  // table). 4 matches the encoder's own cutter.feed for the TM-T20X-II's
  // closest known relatives (epson-tm-t20iii/iv) and is also the single most
  // common value across its entire model table.
  feedBeforeCut: 4,
}

/**
 * Friendly paper-size shorthand -> {columns, imageMaxWidth}. Both derived
 * from the standard ESC/POS raster density (~8 dots/mm) over each size's
 * typical printable width: 58mm -> 48mm printable (384 dots, the validated
 * baseline/default), 80mm -> 72mm printable (576 dots), 112mm -> 104mm
 * printable (832 dots, estimated). imageMaxWidth also caps the preview
 * canvas width and the "too wide" barcode check, so it must scale with
 * paperWidth the same way columns does — not just columns alone.
 */
export const PAPER_WIDTH_SPECS: Record<PaperWidth, { columns: number; imageMaxWidth: number }> = {
  '58mm': { columns: 32, imageMaxWidth: 384 },
  '80mm': { columns: 42, imageMaxWidth: 576 },
  '112mm': { columns: 56, imageMaxWidth: 832 },
}

/** Explicit value wins; otherwise looks up `paperWidth`; otherwise falls back. Shared by resolveConfig() and per-job overrides. */
export function resolveColumns(explicit: number | undefined, paperWidth: PaperWidth | undefined, fallback: number): number {
  if (explicit !== undefined) return explicit
  if (paperWidth !== undefined) return PAPER_WIDTH_SPECS[paperWidth].columns
  return fallback
}

/** Same precedence as resolveColumns() — used for image resizing, the preview canvas width, and the barcode "too wide" check. */
export function resolveImageMaxWidth(explicit: number | undefined, paperWidth: PaperWidth | undefined, fallback: number): number {
  if (explicit !== undefined) return explicit
  if (paperWidth !== undefined) return PAPER_WIDTH_SPECS[paperWidth].imageMaxWidth
  return fallback
}

/** Merges a partial config coming from the consumer (HTML/JS) with the defaults. */
export function resolveConfig(input?: PrinterWrapperConfigInput): PrinterWrapperConfig {
  const { paperWidth, ...rest } = input ?? {}
  return {
    ...DEFAULT_CONFIG,
    ...rest,
    columns: resolveColumns(rest.columns, paperWidth, DEFAULT_CONFIG.columns),
    imageMaxWidth: resolveImageMaxWidth(rest.imageMaxWidth, paperWidth, DEFAULT_CONFIG.imageMaxWidth),
  }
}
