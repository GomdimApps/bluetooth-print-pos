import { buildReceiptBytes } from '../../src/Printer/ReceiptBuilder'
import { DEFAULT_CONFIG } from '../../config'
import type { PrintJob, PrintJobElement, WebEscposPrinterConfig } from '../../src/types'

/**
 * Runs the real ReceiptBuilder.ts pipeline end-to-end — the exact function
 * WebEscposPrinter.printReceipt() calls — so tests exercise the actual
 * integration point instead of a hand-rolled mirror of its internals.
 * `cut: false` by default so assertions can focus on the element(s) under
 * test without the trailing feed/cut bytes; override via `jobOverrides`.
 */
export function buildBytes(
  content: PrintJobElement[],
  jobOverrides: Partial<Omit<PrintJob, 'content'>> = {},
  defaultsOverrides: Partial<WebEscposPrinterConfig> = {},
): Promise<Uint8Array> {
  const defaults: WebEscposPrinterConfig = { ...DEFAULT_CONFIG, ...defaultsOverrides }
  const job: PrintJob = { cut: false, content, ...jobOverrides }
  return buildReceiptBytes(job, defaults)
}
