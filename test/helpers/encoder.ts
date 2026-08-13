import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder'
import type { ReceiptPrinterEncoderOptions } from '@point-of-sale/receipt-printer-encoder'

/**
 * Builds a real, initialized ReceiptPrinterEncoder — same construction
 * ReceiptBuilder.ts uses (columns/language/feedBeforeCut), minus the
 * PrintJob-specific plumbing. Tests that need to drive the encoder directly
 * (not through buildReceiptBytes()) should go through this, not
 * `new ReceiptPrinterEncoder()` — keeps the "known-good defaults" in one
 * place instead of copy-pasted per test file.
 *
 * Note: the real encoder only accepts `columns` of 32/35/42/44/48 (confirmed
 * by reading the installed library — see ReceiptBuilder.pdf417.test.ts's
 * "112mm" case for why this matters).
 */
export function buildEncoder(overrides: ReceiptPrinterEncoderOptions = {}): ReceiptPrinterEncoder {
  const encoder = new ReceiptPrinterEncoder({ columns: 32, language: 'esc-pos', feedBeforeCut: 4, ...overrides })
  encoder.initialize()
  return encoder
}
