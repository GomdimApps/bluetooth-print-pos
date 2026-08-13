# Gotcha #7: `@bwip-js/browser`'s generic API pulls in the full ~100-symbology engine

`toCanvas()`/`toSVG()`/`render()` resolve the symbology via a runtime
string (`bcid`) through `bwipp_lookup()`, so webpack can't tree-shake
anything — confirmed: 907 KiB minified. Always use the per-symbology
named exports instead (`pdf417`/`code128`/`interleaved2of5`, each calling
its own encoder directly) — same behavior, 168 KiB combined. For the
capacity-check path with no `<canvas>`, pass `drawingSVG()` as the
drawing arg instead of `toSVG()`. `RenderOptions.bcid` is still
structurally required for typing even when unused this way — keep it,
just don't call the generic API with it.

bwip-js was chosen over hand-rolled encoders for correctness too — it
auto-selects Code128 Subsets A/B/C.

---
[AGENTS.md](../../AGENTS.md) gotcha #7.
