import type { PrinterWrapperConfig } from './src/types'

export const DEFAULT_CONFIG: PrinterWrapperConfig = {
  columns: 32,
  language: 'esc-pos',
  imageThreshold: 128,
  imageMaxWidth: 384,
  imageMinWidth: 224,
  imageMinHeight: 64,
  stripAccents: true,
}

/** Merges a partial config coming from the consumer (HTML/JS) with the defaults. */
export function resolveConfig(partial?: Partial<PrinterWrapperConfig>): PrinterWrapperConfig {
  return { ...DEFAULT_CONFIG, ...partial }
}
