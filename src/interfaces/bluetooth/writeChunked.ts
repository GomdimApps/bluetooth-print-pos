const DEFAULT_MESSAGE_SIZE = 100

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
  const messageSize = options?.messageSize ?? DEFAULT_MESSAGE_SIZE
  const sleepAfterCommand = options?.sleepAfterCommand

  for (let offset = 0; offset < bytes.length; offset += messageSize) {
    await characteristic.writeValueWithResponse(bytes.slice(offset, offset + messageSize))
    if (sleepAfterCommand) await sleep(sleepAfterCommand)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
