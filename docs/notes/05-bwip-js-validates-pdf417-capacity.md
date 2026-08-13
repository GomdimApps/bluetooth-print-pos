# Gotcha #5: bwip-js validates PDF417 capacity; the real encoder does not

**bwip-js validates PDF417 capacity and throws when it doesn't fit; the
real encoder does not validate at all.** Confirmed: encoding 2000 chars
with `columns: 3` makes bwip-js reject with `pdf417insufficientCapacity`,
while the real encoder happily emits ESC/POS bytes requesting that same
impossible layout, leaving firmware behavior unverified. This is *why*
`resolvePdf417Columns()` (`Preview/content/pdf417.ts`, AGENTS.md gotcha #1) exists: the
shared capacity check both `ReceiptBuilder.ts` and `PreviewRenderer.ts`
run before committing to a non-auto `columns`, falling back to
fully-automatic (the pre-existing, safe behavior) when it doesn't fit.
Never pass a fixed `columns` to the real encoder without this check.

Pinned by `test/Preview/pdf417.raster.test.ts`'s `resolvePdf417Columns`
suite (auto mode must fall back to `undefined` instead of forwarding an
overflowing `columns`) and its own capacity-error propagation test.

---
Referenced from [AGENTS.md](../../AGENTS.md)'s "Critical gotchas" section (gotcha #5).
