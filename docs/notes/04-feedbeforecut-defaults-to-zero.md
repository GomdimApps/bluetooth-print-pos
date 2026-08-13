# Gotcha #4: `cut()` defaults `feedBeforeCut` to `0`

Zero feed lets the physical cutter slice through the last printed content
before it clears — confirmed on a real Epson TM-T20X-II (QZ Tray).
`epson-tm-t20x` isn't in the encoder's known-models table, so no
auto-fallback applies. `4` is the most common `cutter.feed` value across
the encoder's model table (21/30) — `DEFAULT_CONFIG.feedBeforeCut = 4`
for that reason; `PreviewRenderer.ts` mirrors the same gap before its cut
mark.

Pinned by `test/config.test.ts`.

---
[AGENTS.md](../../AGENTS.md) gotcha #4.
