# Gotcha #10: some clone printers mangle the native rule character

`encoder.rule()` repeats a cp437 box-drawing character (`─`/`═`) —
confirmed on the same clone Bluetooth printer as gotcha #9: prints as
`^^^^^^^^^` instead of a line (its font ROM doesn't map that byte the
same way). `rule` elements can set `safeMode: true` to send
`'-'.repeat(columns)` via `sendLine()` instead — plain ASCII is identical
across every codepage, so no raster image is needed (unlike gotcha #9).
Off by default — native looks different (solid vs. dashed) and works
where supported.

Pinned by `test/Printer/ReceiptBuilder.rule.test.ts`.

---
[AGENTS.md](../../AGENTS.md) gotcha #10.
