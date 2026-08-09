# Gotcha #6: bwip-js's default PDF417 `eclevel` differs from the real encoder's default `errorlevel`

**bwip-js's default PDF417 `eclevel` differs from the real encoder's
default `errorlevel`.** Confirmed by decoding actual ESC/POS bytes: the
real encoder, with `errorlevel` omitted, encodes level `1` (ASCII
`"01"`); bwip-js, with `eclevel` omitted, renders exactly like its own
`eclevel: 2`. Higher error-correction needs more codewords (more rows)
for identical data/columns — a second, subtler cause of preview-vs-print
shape mismatch that survived even after `columns` was aligned ([gotcha #5](05-bwip-js-validates-pdf417-capacity.md)). `Preview/content/pdf417.ts`'s `toBwipOptions()` now applies
`DEFAULT_ERRORLEVEL` (`= 1`) uniformly whenever the job doesn't set
`errorlevel`, so both `buildPdf417()` and `resolvePdf417Columns()`
render/validate against the same level the real print already assumes.

---
Referenced from [AGENTS.md](../../AGENTS.md)'s "Critical gotchas" section (gotcha #6).
