import type { PrinterError, PrinterErrorCode } from '../types'

const PRINTER_ERROR_CODES = new Set<PrinterErrorCode>([
  'unsupported',
  'user-gesture-required',
  'connect-cancelled',
  'connect-failed',
  'not-connected',
  'busy',
  'print-failed',
])

/** Shared by every printer transport so error codes stay consistent across strategies. */
export function toPrinterError(code: PrinterError['code'], message: string): PrinterError {
  return { code, message }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * A native `DOMException` (e.g. from `requestDevice()`/GATT calls) also has
 * both a `.code` and a `.message` property — its legacy numeric error code,
 * not one of ours — so checking for `'code' in error` alone misidentifies
 * it as an already-normalized PrinterError and lets it pass through
 * unnormalized, leaking a numeric `.code` to callers instead of the
 * documented PrinterErrorCode strings. Only treat `error` as ours if its
 * `code` is actually one of PrinterErrorCode's values.
 */
export function isPrinterError(error: unknown): error is PrinterError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    'code' in error &&
    PRINTER_ERROR_CODES.has((error as { code: unknown }).code as PrinterErrorCode)
  )
}

/**
 * Normalizes the native DOMExceptions thrown by requestDevice()/gatt.connect()
 * into the wrapper's error codes. Used by both Bluetooth transports.
 */
export function normalizeConnectError(error: unknown): PrinterError {
  if (isPrinterError(error)) return error

  const name = (error as { name?: string })?.name

  // requestDevice() throws SecurityError when connect() wasn't called from
  // a user gesture (e.g. triggered automatically on load).
  if (name === 'SecurityError') {
    return toPrinterError('user-gesture-required', 'connect() must be called from a user click.')
  }

  // User closed the Bluetooth device picker without choosing one.
  if (name === 'NotFoundError') {
    return toPrinterError('connect-cancelled', 'Connection cancelled by the user.')
  }

  return toPrinterError('connect-failed', errorMessage(error))
}

/** Normalizes any error thrown while printing into a `print-failed` PrinterError. */
export function normalizePrintError(error: unknown): PrinterError {
  if (isPrinterError(error)) return error
  return toPrinterError('print-failed', errorMessage(error))
}
