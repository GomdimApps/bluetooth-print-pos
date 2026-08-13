import type { PrinterError, PrinterErrorCode } from '../types'
import { logger } from './logger'

const PRINTER_ERROR_CODES = new Set<PrinterErrorCode>([
  'unsupported',
  'user-gesture-required',
  'connect-cancelled',
  'connect-failed',
  'not-connected',
  'busy',
  'print-failed',
])

// ---- primitives, shared by every normalizer below ----

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

// ---- lifecycle-stage normalizers, in connection-flow order: pick a
// device/port -> open/claim it -> print to it ----

/**
 * Normalizes the native DOMExceptions thrown by requestDevice()/requestPort()/
 * gatt.connect() — the device/port *picker* call itself — into the
 * wrapper's error codes. Used by every transport's connect().
 */
export function normalizeConnectError(error: unknown): PrinterError {
  if (isPrinterError(error)) return error

  const name = (error as { name?: string })?.name

  // requestDevice()/requestPort() throws SecurityError when connect()
  // wasn't called from a user gesture (e.g. triggered automatically on load).
  if (name === 'SecurityError') {
    return toPrinterError('user-gesture-required', 'connect() must be called from a user click.')
  }

  // User closed the device picker without choosing one.
  if (name === 'NotFoundError') {
    return toPrinterError('connect-cancelled', 'Connection cancelled by the user.')
  }

  return toPrinterError('connect-failed', errorMessage(error))
}

/**
 * For failures *after* a device/port is already chosen — opening/claiming
 * it (WebUSB's `open()`/`claimInterface()`, Web Serial's `port.open()`) —
 * unlike normalizeConnectError() above (the picker call itself). Confirmed
 * on real hardware: `SecurityError` here means another process already has
 * exclusive access (e.g. a Windows printer driver holding the USB
 * interface), not "missing user gesture" — mapped to `connect-failed`
 * instead, with `hint` naming the real cause.
 */
export function normalizeOpenError(error: unknown, hint: string): PrinterError {
  if (isPrinterError(error)) return error

  const name = (error as { name?: string })?.name
  if (name !== 'SecurityError' && name !== 'NetworkError' && name !== 'InvalidStateError') {
    return toPrinterError('connect-failed', errorMessage(error))
  }

  warnIfLinuxUsbAccessDenied(name)
  return toPrinterError('connect-failed', `${errorMessage(error)} — ${hint}`)
}

/** Normalizes any error thrown while printing into a `print-failed` PrinterError. */
export function normalizePrintError(error: unknown): PrinterError {
  if (isPrinterError(error)) return error
  return toPrinterError('print-failed', errorMessage(error))
}

/**
 * Confirmed fix by a user of this library, on Linux specifically: the
 * kernel's usblp driver auto-claims USB Printer-Class devices, or udev
 * hasn't granted the browser access (gotcha #11) — a `console.warn()`-only
 * devtools hint pointing at the full fix, never appended to the thrown
 * `PrinterError.message` above (which stays short/UI-safe).
 */
function warnIfLinuxUsbAccessDenied(errorName: string): void {
  if (errorName !== 'SecurityError') return
  if (typeof navigator === 'undefined' || !/Linux/.test(navigator.userAgent) || /Android/.test(navigator.userAgent)) return

  logger.warn(
    'web-escpos-printer: "Access denied" on Linux usually means the kernel\'s usblp driver claimed the device, or udev hasn\'t granted access — see docs/notes/11-webusb-blocked-by-kernel-driver-claims.md (lsusb, a udev rule, `sudo modprobe -r usblp`).',
  )
}
