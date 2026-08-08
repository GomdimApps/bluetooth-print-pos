import type { PrinterError } from '../types'

/** Shared by every Bluetooth transport so error codes stay consistent across strategies. */
export function toPrinterError(code: PrinterError['code'], message: string): PrinterError {
  return { code, message }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function isPrinterError(error: unknown): error is PrinterError {
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error
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
