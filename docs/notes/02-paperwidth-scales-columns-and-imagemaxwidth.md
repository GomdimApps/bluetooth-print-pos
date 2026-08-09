# Gotcha #2: `paperWidth` must scale both `columns` and `imageMaxWidth`

**`paperWidth` must scale both `columns` and `imageMaxWidth`**
(`config.ts#PAPER_WIDTH_SPECS`) — `imageMaxWidth` also caps image
resizing, the preview canvas width, and the barcode "too wide" check.
Scaling only `columns` (an earlier bug) left `paperWidth: '80mm'` doing
nothing for images/barcodes.

`PaperWidth` is `'58mm' | '80mm' | '112mm'` — `80mm` cross-checked against
real hardware (576 dots); `112mm` is an estimate, not hardware-verified.

---
Referenced from [AGENTS.md](../../AGENTS.md)'s "Critical gotchas" section (gotcha #2).
