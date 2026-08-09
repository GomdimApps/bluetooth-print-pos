# Gotcha #7: `@bwip-js/browser`'s generic API pulls in its entire ~100-symbology engine

**`@bwip-js/browser`'s generic `toCanvas()`/`toSVG()`/`render()` API
resolves the symbology via a runtime string (`bcid`), which pulls its
*entire* ~100-symbology engine into the bundle — always use the
per-symbology named exports instead.** The generic API calls
`bwipp_lookup(bcid)` internally, a dispatch table that references
every bundled symbology; since `bcid` is a runtime string (not a
static import), webpack can't prove which symbologies are actually
reachable and can't tree-shake the rest. Confirmed with a real
throwaway build: the generic pattern minified to 907 KiB; switching
`Preview/content/pdf417.ts`/`code128.ts`/`itf.ts` to the named exports
(`pdf417`/`code128`/`interleaved2of5`, each calling its own BWIPP
encoder directly, bypassing `bwipp_lookup` entirely) dropped that to
168 KiB combined — confirmed byte-identical behavior between the two
(same capacity-check results, same errors) since both paths go
through the same internal `_ToAny`/`_Render` machinery either way.
For the SVG capacity-check path (`resolvePdf417Columns()`, no
`<canvas>` available), use `drawingSVG()` as the drawing argument —
`pdf417(opts, drawingSVG())` — instead of `toSVG({bcid: 'pdf417', ...})`.
Note `RenderOptions` still requires a `bcid` field on the options
object for typing purposes even when calling a named export directly —
it's structurally mandatory but never actually read on this path, so
keep it, just don't call `toCanvas`/`toSVG`/`render` with it.

bwip-js was chosen for `code128`/`itf`/`pdf417` preview over hand-rolled
encoders for correctness, not just size: it auto-selects Code128 Subsets
A/B/C, where the hand-rolled version this project used to have only did
Subset B.

---
Referenced from [AGENTS.md](../../AGENTS.md)'s "Critical gotchas" section (gotcha #7).
