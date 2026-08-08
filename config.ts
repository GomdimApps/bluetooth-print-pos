import type { PaperWidth, PrinterWrapperConfig, PrinterWrapperConfigInput } from './src/types'

export const DEFAULT_CONFIG: PrinterWrapperConfig = {
  columns: 32,
  language: 'esc-pos',
  imageThreshold: 128,
  imageMaxWidth: 384,
  imageMinWidth: 224,
  imageMinHeight: 64,
  stripAccents: true,
}

/** Friendly paper-size shorthand -> character columns. '80mm' matches example/configPrint.ts's verified value; '112mm' is an estimate. */
export const PAPER_WIDTH_COLUMNS: Record<PaperWidth, number> = {
  '58mm': 32,
  '80mm': 42,
  '112mm': 56,
}

/** Explicit `columns` wins; otherwise looks up `paperWidth`; otherwise falls back. Shared by resolveConfig() and per-job overrides in ReceiptBuilder.ts. */
export function resolveColumns(explicit: number | undefined, paperWidth: PaperWidth | undefined, fallback: number): number {
  if (explicit !== undefined) return explicit
  if (paperWidth !== undefined) return PAPER_WIDTH_COLUMNS[paperWidth]
  return fallback
}

/** Merges a partial config coming from the consumer (HTML/JS) with the defaults. */
export function resolveConfig(input?: PrinterWrapperConfigInput): PrinterWrapperConfig {
  const { paperWidth, ...rest } = input ?? {}
  return {
    ...DEFAULT_CONFIG,
    ...rest,
    columns: resolveColumns(rest.columns, paperWidth, DEFAULT_CONFIG.columns),
  }
}
