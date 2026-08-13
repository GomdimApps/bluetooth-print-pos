# Gotcha #9: `safeMode` — raster-image fallback for unsupported commands

**`safeMode: true` on a PrintJobElement prints it as a raster image instead
of its native ESC/POS command, for printers that don't support that
command.** There's no code-level way to detect ahead of time whether a
given printer's firmware supports a given command — it doesn't report
that — so `safeMode` is an opt-in per-element escape hatch, not something
this library can decide automatically. `ReceiptBuilder.ts`'s
`safeMode()` helper (`Printer/Utils/safemode.ts`) is shared plumbing:
build a raster via the element's own builder, send it with
`encoder.image()` instead of the native command, or warn-and-skip if it
doesn't fit. Off by default — the native command produces a smaller
payload and is confirmed working on real hardware that does support it.

Confirmed case, and the only one implemented so far: some cheap/clone
Bluetooth thermal printers don't implement the native PDF417 command
(`GS ( k`) at all, even though this library's own encoder emits correct
ESC/POS bytes for it — confirmed on a real Epson TM-T20X-II (prints it
correctly) vs. a clone Bluetooth printer (silently drops it, same bytes).
`pdf417` elements can set `safeMode: true` to work around it:
`buildPdf417RasterImage()` (`Preview/content/pdf417.ts`) reuses the same
bwip-js renderer `renderPreview()` already uses for the PDF417 preview.
Other element types may gain the same flag later.

---
Referenced from [AGENTS.md](../../AGENTS.md)'s "Critical gotchas" section (gotcha #9).
