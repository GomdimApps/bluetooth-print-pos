# AGENTS.md

Technical reference for anyone (human or AI) maintaining this repo. Read this
before touching code — several bugs here were caused by not knowing the
quirks below.

## What this is

`bluetooth-print-pos` — a wrapper around ESC/POS receipt printing over Web
Bluetooth, runnable **entirely in the browser, no Node at runtime**. It
ships in two forms from the same source, built by `webpack.config.js`
(array of two configs):

- **Standalone UMD** (`build/printer-wrapper.js`) — fully self-contained,
  bundles `@point-of-sale/*`, `canvas-dither`, `qrcode-generator` inside.
  Drop into a `<script>` tag, no bundler, no `npm install` on the consumer
  side. `output.library.type: 'umd'`, `export: 'default'` so
  `window.PrinterWrapper` is the class directly, not `{default: ...}`.
- **ESM** (`build/printer-wrapper.esm.js`) — for bundler consumers
  (Vite/webpack). `@point-of-sale/*` are `externals` here (regex
  `/^@point-of-sale\//` in webpack.config.js) so they come in as the
  consumer's own npm `dependencies` instead of being duplicated —
  `canvas-dither`/`qrcode-generator` stay bundled (too small to bother
  externalizing).
- `package.json#exports` routes `require` → UMD, `import` → ESM. So
  `require('bluetooth-print-pos')` in a Vue2/CJS project gets the exact
  same self-contained bundle as the `<script>` tag, not the ESM one.

`npm run build:standalone` builds only the UMD config — useful when you
just need to refresh `build/printer-wrapper.js` for the demo without the
full `build` (which also runs `tsc -p tsconfig.build.json` for
`build/types/`).

## Directory map

```
index.ts                        # webpack entry — re-exports PrinterWrapper + all public types
config.ts                       # DEFAULT_CONFIG, PAPER_WIDTH_SPECS, resolveConfig/resolveColumns/resolveImageMaxWidth
webpack.config.js               # array: umdConfig() + esmConfig()
tsconfig.json / tsconfig.build.json   # the latter only for `build:types` (.d.ts emission)

src/types.ts                    # all public types (PrintJob, PrintJobElement, PrinterWrapperConfig, ...)
src/types/point-of-sale.d.ts    # hand-written ambient types for @point-of-sale/* (they ship none)
src/types/canvas-dither.d.ts    # same, for canvas-dither

src/Printer/
  PrinterWrapper.ts             # public API class — connect/disconnect/printReceipt/printRaw/renderPreview
  BluetoothTransport.ts         # interface both Bluetooth transports implement
  BluetoothPrinter.ts           # default transport — thin wrapper over @point-of-sale/webbluetooth-receipt-printer
  CompatBluetoothPrinter.ts     # fallback transport — acceptAllDevices + own profile matching
  bluetoothProfiles.ts          # the printer profile table CompatBluetoothPrinter matches against
  printerErrors.ts              # shared PrinterError normalization (toPrinterError/normalizeConnectError/normalizePrintError)
  ReceiptBuilder.ts             # PrintJob -> ESC/POS bytes via @point-of-sale/receipt-printer-encoder

src/Text/
  sample.ts                     # applyTextElement() — orchestrator, calls wrap/justify/sendLine
  wrap.ts                       # wrapText/wrapParagraph/splitOversizedWord (hyphenates hard word-breaks)
  justify.ts                    # justifyLine() — inter-word space distribution
  sendLine.ts                   # sendLine()/padLine() — how a line actually reaches the encoder

src/Images/image.ts             # loadImageFromSource/prepareImageForEncoder/applyImageElement (real print path)

src/Preview/
  PreviewRenderer.ts            # PrintJob -> <canvas>, mirrors ReceiptBuilder.ts's element switch
  imageDither.ts                # reuses Images/image.ts sizing + canvas-dither for pixel-identical preview images
  code128.ts                    # real Code128 Subset B encoder + canvas renderer
  itf.ts                        # real ITF (Interleaved 2 of 5) encoder + canvas renderer
  qrcode.ts                     # wraps qrcode-generator for a real, scannable QR
  barcodeDrawing.ts             # shared BarcodeDrawing interface (code128.ts + itf.ts)

demo/index.html                 # manual test page — loads ../build/printer-wrapper.js directly
Dockerfile / docker-compose.yml / nginx/default.conf   # serves demo/ + build/ on :3000
```

## Critical gotchas (read before editing ReceiptBuilder.ts / Text / Preview)

These cost real debugging time. Don't reintroduce them.

1. **`new ReceiptPrinterEncoder(options)` uses `Object.assign(defaults, ...,
   options)` internally.** An explicit `key: undefined` in `options`
   *overwrites* the library's internal default (unlike `??`, `Object.assign`
   does not skip own-properties whose value is `undefined`). Concretely:
   `codepageMapping: undefined` wipes the encoder's default codepage and
   crashes with `Cannot convert undefined or null to object` inside
   `Object.keys(this.#m)`. **Fix pattern**: only spread a key into the
   options object when it's actually defined —
   `...(value !== undefined ? { key: value } : {})`. Same hazard applies to
   `printerModel` and to `qrcode()`'s `{ size }` option. See
   `ReceiptBuilder.ts` for the working pattern.

2. **`encoder.text()` trims leading/trailing whitespace internally**, even
   on a single line that doesn't need wrapping. This makes manual
   space-padding for alignment silently disappear before it reaches the
   printer. **Fix**: build the padded/justified line yourself, then send it
   via `encoder.raw(byteArray)` instead of `encoder.text()` — `raw()`
   bypasses the trimming pipeline entirely and still gets bold/underline/size
   styling applied correctly (verified by diffing the byte output of both
   paths). Only safe for pure printable-ASCII (32-126) content, since
   `raw()` skips codepage-aware encoding — non-ASCII falls back to
   `encoder.text()` unpadded (see `sendLine.ts`).

3. **`encoder.align()` only actually helps for barcode/qrcode/image** — the
   library explicitly wraps those with align-before/align-reset-after. For
   plain text it just sets a queued flag; whether the *physical printer*
   honors the resulting `ESC a n` command is a firmware matter, and cheap
   ESC/POS clones often don't. That's why text alignment is done via manual
   space-padding (`sendLine.ts`/`justify.ts`), not by trusting the native
   command. `encoder.align()` is still called (harmless, needed for
   barcode/qrcode elsewhere).

4. **`.barcode()`/`.qrcode()`/`.image()` don't generate any matrix/bars
   themselves** — they just emit the ESC/POS command bytes and let the
   *printer's firmware* draw the symbol. There is nothing to reuse from
   `@point-of-sale/receipt-printer-encoder` for the preview's real
   barcode/QR rendering — `Preview/code128.ts`, `Preview/itf.ts`,
   `Preview/qrcode.ts` are fully independent implementations.

5. **QR `size` option is dots-per-module directly** (encoder default: `6`),
   not a multiplier. `Preview/PreviewRenderer.ts`'s `QRCODE_DEFAULT_CELL_PX`
   must equal that same `6` — a mismatch here is exactly what caused the
   preview QR to render visibly smaller than the real print (fixed once).

6. **`paperWidth` must scale both `columns` AND `imageMaxWidth` together**
   (`config.ts#PAPER_WIDTH_SPECS`). `imageMaxWidth` is the shared ceiling for
   image resizing, the preview canvas width, and the barcode "too wide"
   check — scaling only `columns` (an earlier bug) means switching to
   `paperWidth: '80mm'` does nothing for images/barcodes.

7. **Web Bluetooth's `requestDevice()` with `filters` restricts the device
   picker to matching devices** — a printer whose name/service isn't in the
   filter list never appears, regardless of whether it would work if
   selected. That's why there are two transports: `BluetoothPrinter.ts`
   (default, filtered, via the npm lib) and `CompatBluetoothPrinter.ts`
   (`acceptAllDevices: true`, matches its own broader profile table in
   `bluetoothProfiles.ts` *after* connecting). `connect({ compat: true })`
   selects the latter.

8. **`connect()` must be called from a real user gesture** (click handler),
   both transports — browser requirement, not ours. `SecurityError` from
   `requestDevice()` means it wasn't.

9. **Neither `@point-of-sale/*` package ships TypeScript types.** The
   ambient declarations in `src/types/point-of-sale.d.ts` were hand-written
   by reading the installed `dist/*.esm.js` bundles directly (they're
   minified but readable) — not a complete typing of their APIs, only what
   this project calls. If you need another method from either library,
   read the installed bundle first; don't guess the signature.

10. **The webpack UMD config needs `resolve.conditionNames` including
    `'browser'` explicitly.** `@point-of-sale/webbluetooth-receipt-printer`'s
    `package.json#exports` only declares a `"browser"` condition (no
    top-level `import`/`require` fallback) — without it, resolution fails.

## Coding conventions in this repo

- **Extract data tables and error-handling into their own files** once a
  file starts mixing "static data" with "logic that uses it" — e.g.
  `bluetoothProfiles.ts` (data) vs `CompatBluetoothPrinter.ts` (logic using
  it), `printerErrors.ts` (shared across transports). Keep orchestrator
  files (`applyTextElement`, `renderPreviewCanvas`, `buildReceiptBytes`)
  thin — they should read as "call step 1, step 2, step 3", not contain the
  step implementations inline.
- **Preview (`src/Preview/`) and real print (`ReceiptBuilder.ts`,
  `src/Text/`) must stay behaviorally identical.** Whenever you change one,
  check the other — `wrapText`, `justifyLine`, image sizing/dithering
  (`imageDither.ts` reuses `Images/image.ts`) are already shared modules for
  exactly this reason. New alignment/layout logic should be shared the same
  way, not reimplemented per side.
- **No test framework in this repo.** Verification is: `npm run build` +
  `npx tsc --noEmit` (catches type errors) + one-off Node scripts that
  `import('@point-of-sale/receipt-printer-encoder')` directly and inspect
  the encoded byte output (this is how every encoder-interaction bug above
  was actually confirmed, not guessed) + the Docker demo for real hardware
  testing. When fixing an encoder-interaction bug, write a throwaway Node
  script that reproduces it against the *real* installed library before
  trusting a fix.
- **Comments explain "why", not "what"**, especially around anything in the
  gotchas list above — the reasoning isn't obvious from the code alone and
  has already been lost/rediscovered once.
- **Don't hand-type `\uXXXX` regex escapes directly into file content** —
  this environment has repeatedly corrupted literal `\u0300-\u036f` (used in
  `stripAccents()`) into raw combining Unicode characters when typed
  directly in a Write/Edit call. If you need to (re)introduce such an
  escape, write the file with a placeholder token, then patch it in via a
  small Python script that constructs the string as `"\\u0300-\\u036f"` — a
  Python string literal, not the file content directly — and confirm with
  `cat -A` that the bytes are plain ASCII (`\`, `u`, `0`, `3`, `0`, `0`),
  not `M-`-prefixed multi-byte garbage.

## Scope limits (intentional, not bugs)

- Real barcode rendering (scannable, in both preview and print) covers
  `symbology: 'code128'` and `'itf'`/`'interleaved-2-of-5'` only. Anything
  else renders as a labeled placeholder box in the preview; the real print
  path still sends it to the encoder as-is (works if the encoder/printer
  supports that symbology, just isn't preview-visualized).
- `PaperWidth` is `'58mm' | '80mm' | '112mm'`. `'80mm'` values are
  cross-checked against real hardware constants (576 dots); `'112mm'` is an
  estimate, not yet hardware-verified.
- The "barcode too wide for paper" warning in the preview is advisory only
  — `printReceipt()` never blocks on it (confirmed product decision: the
  width estimate is a heuristic, not a hardware guarantee, and false
  positives should not prevent printing).
- Justify/alignment padding is computed for any content, but only
  pure-ASCII (32-126) lines actually get delivered via the padding-preserving
  `raw()` path; non-ASCII lines (only reachable with `stripAccents: false`)
  fall back to unpadded `encoder.text()` and rely on the printer's native
  align command.

## Docker demo

`docker compose up --build -d` → `http://localhost:3000/` (redirects to
`/demo/`). Rebuild after **any** change under `src/`, `index.ts`,
`config.ts`, `demo/`, or the Dockerfile itself — the image bakes a full
`npm run build` in its `build` stage (see `Dockerfile`), it does not mount
source live. Web Bluetooth works fine over `http://localhost:3000` — Chrome
treats `localhost` as a secure context regardless of port.
