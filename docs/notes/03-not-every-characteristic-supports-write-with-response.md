# Gotcha #3: not every BLE characteristic supports `writeValueWithResponse()`

Confirmed on an MTP-II clone: its print characteristic only advertises
`writeWithoutResponse`, so `writeValueWithResponse()` throws
`NotSupportedError` on the first chunk. `writeChunked.ts#pickWriter()`
checks `characteristic.properties` and picks whichever method is
actually supported instead of assuming.

---
[AGENTS.md](../../AGENTS.md) gotcha #3.
