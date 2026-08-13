# Gotcha #6: bwip-js's default PDF417 `eclevel` differs from the real encoder's default

The real encoder defaults to `errorlevel: 1`; bwip-js's omitted `eclevel`
renders like `eclevel: 2` — different error-correction means different
row counts for identical data, a subtler preview/print shape mismatch
than gotcha #5. `Preview/content/pdf417.ts#toBwipOptions()` applies
`DEFAULT_ERRORLEVEL = 1` whenever the job doesn't set one.

Pinned by `ReceiptBuilder.pdf417.test.ts`.

---
[AGENTS.md](../../AGENTS.md) gotcha #6.
