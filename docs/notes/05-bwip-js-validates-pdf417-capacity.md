# Gotcha #5: bwip-js validates PDF417 capacity; the real encoder does not

bwip-js throws (`pdf417insufficientCapacity`) when data doesn't fit a
fixed `columns`; the real encoder emits the bytes anyway, with unverified
firmware behavior. `resolvePdf417Columns()` (`Preview/content/pdf417.ts`)
runs this capacity check before `ReceiptBuilder`/`PreviewRenderer` commit
to a non-auto `columns`, falling back to automatic when it doesn't fit.
Never pass a fixed `columns` to the real encoder without it.

Pinned by `test/Preview/pdf417.raster.test.ts`.

---
[AGENTS.md](../../AGENTS.md) gotcha #5.
