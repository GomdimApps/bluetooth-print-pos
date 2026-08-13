# Gotcha #4: `cut()` defaults `feedBeforeCut` to `0`

**`cut()` defaults `feedBeforeCut` to `0`** unless a recognized
`printerModel` supplies its own `cutter.feed` (confirmed:
`feedBeforeCut = printerModel?.cutter?.feed || options.feedBeforeCut` —
model's value always wins). With zero feed, the physical cutter fires
before the last content clears it, slicing through it — confirmed on
real hardware: an Epson TM-T20X-II via QZ Tray cut text/barcodes/PDF417
too close or clean through, worse for taller elements. `epson-tm-t20x`
isn't in the encoder's known-models table (`Unknown printer model`), so
no auto-fallback — its closest relatives (`epson-tm-t20iii`/`iv`) use
`cutter: { feed: 4 }`, also the single most common value across the
whole table (21/30 models). `DEFAULT_CONFIG.feedBeforeCut = 4` for this
reason — `ReceiptBuilder.ts` always passes it explicitly;
`PreviewRenderer.ts` mirrors the same gap before its "✂ cut" mark (see
AGENTS.md's "preview/print parity" rule in "Coding conventions").

Pinned by `test/config.test.ts` (`DEFAULT_CONFIG.feedBeforeCut` must stay `4`).

---
Referenced from [AGENTS.md](../../AGENTS.md)'s "Critical gotchas" section (gotcha #4).
