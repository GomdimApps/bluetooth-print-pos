const DEFAULT_MESSAGE_SIZE = 100

/**
 * Not every printer's print characteristic supports "write with response"
 * (confirmed on real hardware: an MTP-II clone's characteristic only
 * advertises `writeWithoutResponse`, and calling `writeValueWithResponse()`
 * on it throws `NotSupportedError` — legacy DOMException code 9, which is
 * exactly what leaked to a consumer app as `error.code === 9` before
 * printerErrors.ts's isPrinterError() was tightened to catch it). Prefer
 * "with response" when available since it confirms delivery; otherwise
 * fall back to "without response" rather than assuming.
 */
function pickWriter(characteristic: BluetoothRemoteGATTCharacteristic): (data: BufferSource) => Promise<void> {
  const { properties } = characteristic
  if (properties.write) return (data) => characteristic.writeValueWithResponse(data)
  if (properties.writeWithoutResponse) return (data) => characteristic.writeValueWithoutResponse(data)
  throw new Error('This characteristic supports neither write-with-response nor write-without-response.')
}

/**
 * Writes `bytes` to a BLE characteristic in sequential chunks, since most
 * ESC/POS Bluetooth printers can't accept an arbitrarily large single
 * write. Ported from upstream WebBluetoothReceiptPrinter's print() +
 * CallbackQueue (both together): the original serializes chunk writes
 * through a small queue and optionally sleeps between them for printers
 * that need pacing — a plain sequential `for` + `await` has the same effect
 * here since PrinterWrapper already prevents overlapping print() calls
 * (its `printing` busy flag), so there's no need for the queue class
 * itself, just the chunking + optional sleep behavior it provided.
 */
export async function writeChunked(
  characteristic: BluetoothRemoteGATTCharacteristic,
  bytes: Uint8Array,
  options?: { messageSize?: number; sleepAfterCommand?: number },
): Promise<void> {
  const write = pickWriter(characteristic)
  const messageSize = options?.messageSize ?? DEFAULT_MESSAGE_SIZE
  const sleepAfterCommand = options?.sleepAfterCommand

  for (let offset = 0; offset < bytes.length; offset += messageSize) {
    await write(bytes.slice(offset, offset + messageSize))
    if (sleepAfterCommand) await sleep(sleepAfterCommand)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
