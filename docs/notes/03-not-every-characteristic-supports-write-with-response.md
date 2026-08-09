# Gotcha #3: not every characteristic supports `writeValueWithResponse()`

**Not every characteristic supports `writeValueWithResponse()`.**
Confirmed on real hardware (MTP-II clone): its print characteristic
only advertises `writeWithoutResponse`, so `writeValueWithResponse()`
throws `NotSupportedError` (legacy DOMException `.code === 9`) on the
first chunk. `writeChunked.ts`'s `pickWriter()` checks
`characteristic.properties` and picks whichever method is actually
supported (`write` preferred, `writeWithoutResponse` fallback) instead
of assuming.

---
Referenced from [AGENTS.md](../../AGENTS.md)'s "Critical gotchas" section (gotcha #3).
