# Gotcha #9: `safeMode` — raster-image fallback for unsupported commands

`safeMode: true` prints an element as a raster image instead of its
native ESC/POS command — firmware support can't be detected ahead of
time, so it's opt-in per element. `Printer/Utils/safemode.ts#safeMode()`
is the shared plumbing (build via the element's own builder, send via
`encoder.image()`, or warn-and-skip if it doesn't fit). Off by default —
native is smaller and works where supported.

Confirmed case: some clone Bluetooth printers silently drop the native
PDF417 command (`GS ( k`) entirely — a real Epson TM-T20X-II prints the
same bytes fine. `pdf417`'s `safeMode: true` reuses the PDF417 preview's
bwip-js renderer as the raster source. `qrcode` has the same flag,
proactively (no confirmed hardware case yet).

Pinned by `test/Printer/SafeMode.test.ts` + `ReceiptBuilder.pdf417/qrcode.test.ts`.

---
[AGENTS.md](../../AGENTS.md) gotcha #9.
