# Gotcha #2: `paperWidth` must scale both `columns` and `imageMaxWidth`

`config.ts#PAPER_WIDTH_SPECS` scales both — `imageMaxWidth` also caps
image resizing, preview canvas width, and the barcode "too wide" check.
`PaperWidth`: `'58mm'|'80mm'|'112mm'`. `80mm` verified against real
hardware (576 dots); `112mm` is an estimate.

**Open bug**: `112mm` → `columns: 56`, but the real encoder only accepts
32/35/42/44/48 columns — throws, fails to build *any* receipt. `58mm`/
`80mm` unaffected. Pinned (failing on purpose) by
`ReceiptBuilder.pdf417.test.ts`'s "paperWidth" suite.

---
[AGENTS.md](../../AGENTS.md) gotcha #2.
