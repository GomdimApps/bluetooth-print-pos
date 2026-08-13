# Gotcha #2: `paperWidth` must scale both `columns` and `imageMaxWidth`

**`paperWidth` must scale both `columns` and `imageMaxWidth`**
(`config.ts#PAPER_WIDTH_SPECS`) — `imageMaxWidth` also caps image
resizing, the preview canvas width, and the barcode "too wide" check.
Scaling only `columns` (an earlier bug) left `paperWidth: '80mm'` doing
nothing for images/barcodes.

`PaperWidth` is `'58mm' | '80mm' | '112mm'` — `80mm` cross-checked against
real hardware (576 dots); `112mm` is an estimate, not hardware-verified.

**Known bug, found by the test suite below, not yet fixed**: `112mm` maps
to `columns: 56`, but the real encoder's constructor only accepts columns
of 32/35/42/44/48 (confirmed by reading the installed library) — it throws
`"The width of the paper must me either 32, 35, 42, 44 or 48 columns"`.
`paperWidth: '112mm'` therefore currently fails to build *any* receipt at
all, not just images. `58mm`(32)/`80mm`(42) are unaffected (both valid).
Pinned (as a currently-failing-on-purpose regression) by
`test/Printer/ReceiptBuilder.pdf417.test.ts`'s "paperWidth" suite — flip
that test to `doesNotReject` once this is actually fixed.

---
Referenced from [AGENTS.md](../../AGENTS.md)'s "Critical gotchas" section (gotcha #2).
