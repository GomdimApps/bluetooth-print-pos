# AGENTS.md

Technical reference for anyone (human or AI) maintaining this repo. Read this
before touching code — several bugs here were caused by not knowing the
quirks below.

## What this is

`bluetooth-print-pos` — a wrapper around ESC/POS receipt printing, runnable
**entirely in the browser, no Node at runtime**. Two independent transports
are supported behind the same `PrinterTransport` interface: Web Bluetooth
(talks directly to the printer) and QZ Tray (talks to the
[QZ Tray](https://qz.io) desktop app over its local websocket API, which in
turn talks to an OS-registered printer — USB or otherwise). It ships in two
forms from the same source, built by `webpack.config.js` (array of two
configs):

- **Standalone UMD** (`build/printer-wrapper.js`) — fully self-contained,
  bundles `@point-of-sale/*`, `canvas-dither`, `qrcode-generator`, `qz-tray`
  inside. Drop into a `<script>` tag, no bundler, no `npm install` on the
  consumer side. `output.library.type: 'umd'`, `export: 'default'` so
  `window.PrinterWrapper` is the class directly, not `{default: ...}`.
- **ESM** (`build/printer-wrapper.esm.js`) — for bundler consumers
  (Vite/webpack). `@point-of-sale/*` and `qz-tray` are `externals` here
  (`pointOfSaleExternals`/`qzTrayExternals` in webpack.config.js) so they
  come in as the consumer's own npm `dependencies` instead of being
  duplicated — `canvas-dither`/`qrcode-generator` stay bundled (too small to
  bother externalizing). Unlike `@point-of-sale/*`, `qz-tray` has no
  `package.json#exports`/ESM entry (just a legacy `main` UMD script), so
  this emits a bare `import ... from 'qz-tray'` that relies on the
  *consumer's own bundler* resolving a CJS/UMD package via CJS interop —
  confirmed working with webpack 5's default externals handling in this
  repo's own build, see gotcha #13.
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
src/types/point-of-sale.d.ts    # hand-written ambient types for @point-of-sale/receipt-printer-encoder (it ships none)
src/types/canvas-dither.d.ts    # same, for canvas-dither

src/interfaces/
  PrinterTransport.ts           # transport-agnostic interface (getInfo/connect/disconnect/isConnected/print) — implemented by both the Bluetooth transports and QzTransport
  printerErrors.ts              # shared PrinterError normalization (toPrinterError/normalizeConnectError/normalizePrintError)

  bluetooth/
    profiles.ts                 # BLUETOOTH_PROFILES table + findProfile() — every known printer profile, shared by both transports
    writeChunked.ts             # chunked BLE characteristic writes (messageSize/sleepAfterCommand per profile)
    DefaultBluetoothTransport.ts   # default transport — requestDevice({ filters }) restricted to known profiles
    CompatBluetoothTransport.ts    # fallback transport — acceptAllDevices + post-connect profile matching

  qz/
    QzTransport.ts               # QZ Tray transport — talks to the QZ Tray desktop app over its local websocket API, hands it the same ESC/POS bytes Bluetooth uses

src/Printer/
  PrinterWrapper.ts             # public API class — connect/disconnect/printReceipt/printRaw/renderPreview
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
  code128.ts                    # wraps @bwip-js/browser for a real, scannable Code128
  itf.ts                        # wraps @bwip-js/browser for a real, scannable ITF (Interleaved 2 of 5)
  qrcode.ts                     # wraps qrcode-generator for a real, scannable QR
  pdf417.ts                     # wraps @bwip-js/browser for a real, scannable PDF417
  barcodeDrawing.ts             # shared BarcodeDrawing interface (code128.ts + itf.ts + pdf417.ts)

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
   `printerModel` and to `qrcode()`'s `{ size }` option, and identically to
   `pdf417()`'s `{ columns, rows, width, height, errorlevel, truncated }` —
   its defaults (`{width:3,height:3,columns:0,rows:0,errorlevel:1,truncated:false}`)
   get merged the exact same way, confirmed by reading its source. See
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

4. **`.barcode()`/`.qrcode()`/`.pdf417()`/`.image()` don't generate any
   matrix/bars themselves** — they just emit the ESC/POS command bytes and
   let the *printer's firmware* draw the symbol. There is nothing to reuse
   from `@point-of-sale/receipt-printer-encoder` for the preview's real
   barcode/QR/PDF417 rendering. `Preview/code128.ts`, `Preview/itf.ts` and
   `Preview/pdf417.ts` are thin `@bwip-js/browser` wrappers (`bcid:
   'code128'`/`'interleaved2of5'`/`'pdf417'`); `Preview/qrcode.ts` is the
   one independent implementation, via `qrcode-generator`. Either way,
   print-side correctness never depends on any of them: a bug in any
   `Preview/*.ts` renderer cannot break a real print, and vice versa —
   `ReceiptBuilder.ts` only ever calls the real encoder's own methods.

   **One narrow, deliberate exception**: `ReceiptBuilder.ts`'s `pdf417` case
   imports `resolvePdf417Columns()` from `Preview/pdf417.ts` — not to draw
   anything, only to decide the `columns` *value* to send to the real
   encoder. Without an explicit `columns` in the job, the printer firmware
   and bwip-js would each pick their own PDF417 grid shape independently,
   producing visibly different (though both correctly-scannable) symbols
   between print and preview — confirmed on real hardware (Epson TM-T20X-II
   via QZ Tray). `resolvePdf417Columns()` makes both sides agree on the same
   paper-width-appropriate `columns` (`Preview/pdf417.ts`'s internal
   `preferredColumns()`, `17*columns+69` modules — PDF417's standard width
   formula, confirmed against real `@bwip-js/browser` measurements), with a
   capacity-checked fallback to fully-automatic `columns` when that preferred count doesn't
   fit a given value. This still doesn't violate the invariant above: actual
   print-*byte* generation never depends on Preview rendering succeeding,
   only this one upstream numeric choice does, and its fallback is always
   safe. See gotcha #19 for why the fallback specifically has to be there.

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
   selected. That's why there are two transports, both in
   `src/interfaces/bluetooth/`: `DefaultBluetoothTransport.ts` (filtered,
   `requestDevice({ filters: ALL_FILTERS })`) and
   `CompatBluetoothTransport.ts` (`acceptAllDevices: true`, matches *after*
   connecting instead). Both call the same exported `openConnection()` in
   `DefaultBluetoothTransport.ts` (GATT-connect, `findProfile()`, grab the
   write characteristic) — the only real difference between them is the
   `requestDevice()` call itself. `connect({ compat: true })` selects the
   latter. This whole layer was ported in-house from
   [WebBluetoothReceiptPrinter](https://github.com/NielsLeenheer/WebBluetoothReceiptPrinter)
   (read in full from its `main` branch, not guessed) — this project no
   longer depends on that npm package. Its "Cat printer" profile (a
   different, non-ESC/POS/StarPRNT protocol, `language: 'meow'`) and its
   status-characteristic notifications were deliberately not ported — see
   Scope limits below.

8. **`connect()` must be called from a real user gesture** (click handler),
   both transports — browser requirement, not ours. `SecurityError` from
   `requestDevice()` means it wasn't.

9. **`@point-of-sale/receipt-printer-encoder` ships no TypeScript types.**
   The ambient declarations in `src/types/point-of-sale.d.ts` were
   hand-written by reading the installed `dist/*.esm.js` bundle directly
   (minified but readable) — not a complete typing of its API, only what
   this project calls. If you need another method from it, read the
   installed bundle first; don't guess the signature. (Bluetooth
   connectivity used to be a second untyped `@point-of-sale/*` package —
   now it's this project's own TypeScript in `src/interfaces/bluetooth/`,
   so it needs no ambient declarations at all.)

10. **The webpack UMD config needs `resolve.conditionNames` including
    `'browser'` explicitly.** `@point-of-sale/receipt-printer-encoder`'s
    `package.json#exports` only declares a `"browser"` condition (no
    top-level `import`/`require` fallback) — without it, resolution fails.

11. **Not every printer characteristic supports `writeValueWithResponse()`.**
    Confirmed on real hardware (an MTP-II clone): its print characteristic
    only advertises `properties.writeWithoutResponse`, so calling
    `writeValueWithResponse()` on it throws `NotSupportedError` (legacy
    DOMException `.code === 9`) on the very first chunk.
    `writeChunked.ts`'s `pickWriter()` checks `characteristic.properties`
    and picks whichever write method the characteristic actually supports
    (`write` preferred, `writeWithoutResponse` as fallback) instead of
    assuming.

12. **A native `DOMException` structurally matches `PrinterError`** — it has
    both a `.code` and a `.message` property, same as our type, just with a
    legacy *numeric* `.code` (e.g. `9` for `NotSupportedError`) instead of
    one of our string codes. This is exactly how gotcha #11 above was first
    spotted: a raw DOMException slipped past `isPrinterError()`'s old
    `'code' in error && 'message' in error` check, so `normalizePrintError()`
    treated it as already-normalized and let a numeric code leak to
    callers. `isPrinterError()` (`printerErrors.ts`) now also checks that
    `code` is one of the actual `PrinterErrorCode` strings.

13. **`qz-tray`'s `package.json` has no `exports`/ESM entry**, just a legacy
    `"main": "qz-tray.js"` (a UMD script) + a `"browser": {"path": false}`
    field. Confirmed by reading the installed package directly: externalizing
    it in the ESM build (`externalsType: 'module'`, same as
    `pointOfSaleExternals`) still works — webpack 5 emits a clean
    `import{...}from"qz-tray"` and lets the *consumer's* bundler resolve it
    via CJS interop — but this is a property of the consumer's tooling, not
    guaranteed by `qz-tray` itself the way `@point-of-sale/*`'s own
    `"browser"` exports condition is (see gotcha #10).

14. **`qz-tray.js` has one `require('path')` call**, in a Node-only branch
    dead in browser bundles. Bundling it into the UMD standalone build
    (`target: 'web'`) works with no extra webpack config: webpack 5's
    default `resolve.aliasFields: ['browser']` (auto-on for `target: 'web'`)
    already honors qz-tray's own `package.json#browser: {"path": false}`
    field and neutralizes the call — confirmed by a real `npm run build`
    (the UMD bundle's stats show `path (ignored)` rather than a resolve
    error). If this ever regresses, the fix is `resolve.fallback: { path:
    false }` in `umdConfig()`.

15. **`qz.printers.find(query)` returns a bare `string`, not `string[]`,
    when `query` is given and matches** — only an array when called with no
    query (`Promise<string[] | string>` in `@types/qz-tray`, confirmed live
    against the installed package). `QzTransport.listPrinters()` normalizes
    this with `Array.isArray(result) ? result : [result]`.

16. **`qz.websocket.connect()` rejects outright if a connection is already
    open or still connecting** (`"An open connection with QZ Tray already
    exists"` / `"...has not returned yet"`, read directly from qz-tray.js's
    source) — every call site must guard with `qz.websocket.isActive()`
    first. `QzTransport.ts`'s `ensureSocketOpen()` is the shared guard,
    used by both `connect()` and `listPrinters()` since either can be
    called first.

17. **`qz.print()`'s `data` entries accept a raw `Uint8Array` directly**
    with `flavor: 'base64'` — qz-tray's own internal `compatible.data()`
    step base64-encodes `Uint8Array` data itself, via a hand-rolled,
    binary-safe byte-loop `uint8ArrayToBase64()` (not `btoa`/
    `String.fromCharCode` spread, so no call-stack risk on large
    receipts) — confirmed by reading qz-tray.js's source. Don't hand-roll a
    `Uint8Array -> base64` helper for this; `QzTransport.print()` passes
    bytes straight through.

18. **QZ Tray has no protocol to auto-detect and no native OS device
    picker.** Unlike Bluetooth (which detects `language`/`codepageMapping`
    from a matched BLE profile in `profiles.ts`, and whose device picker is
    a `requestDevice()` browser dialog), `QzTransport`'s reported
    `PrinterInfo.language`/`codepageMapping` are just mirrors of whatever
    `PrinterWrapperConfig` the transport was constructed with (confirmed:
    `ReceiptBuilder.ts#buildReceiptBytes` always encodes using
    `job.language ?? defaults.language`, never `PrinterInfo.language`, so
    this is purely informational either way), and printer selection is a
    consumer-built UI backed by `PrinterWrapper.listQzPrinters()`
    (`qz.printers.find()`) instead of a browser-native picker.

19. **`ReceiptPrinterEncoder`'s `cut()` defaults `feedBeforeCut` to `0`**
    unless a *recognized* `printerModel` supplies its own `cutter.feed`
    (confirmed by reading the installed encoder source: `feedBeforeCut =
    printerModel?.cutter?.feed || options.feedBeforeCut` — the model's own
    value always wins when present). With zero feed, the physical cutter
    (positioned some distance below the print head on every thermal
    printer) fires before the last printed content has advanced far enough
    to clear it — slicing through it. Confirmed on real hardware: an Epson
    TM-T20X-II via the QZ Tray transport cut text/barcodes/PDF417 too close
    or clean through them, worse for taller elements. The model's exact
    string (`epson-tm-t20x`) isn't in the encoder's known-models table
    (throws `Unknown printer model`), so no auto-fallback applied — its
    closest known relatives (`epson-tm-t20iii`/`epson-tm-t20iv`) both use
    `cutter: { feed: 4 }`, and `4` is also the single most common
    `cutter.feed` value across the encoder's entire model table (21 of 30
    models). `config.ts`'s `DEFAULT_CONFIG.feedBeforeCut` is `4` for exactly
    this reason — `ReceiptBuilder.ts` always passes it explicitly so real
    prints never rely on the encoder's own zero default.
    `PreviewRenderer.ts` mirrors the same gap before its "✂ cut" mark, per
    the "preview and real print must stay behaviorally identical" rule
    below.

20. **`@bwip-js/browser` validates PDF417 capacity and throws when it
    doesn't fit; the real `@point-of-sale/receipt-printer-encoder` does
    not validate at all.** Confirmed live: encoding a 2000-character value
    with `columns: 3` makes bwip-js reject it with
    `pdf417insufficientCapacity`, while the real encoder happily emits
    ESC/POS bytes requesting that same physically-impossible 3-column
    layout, with whatever the printer firmware does with it left completely
    unverified. This asymmetry is *why* `resolvePdf417Columns()`
    (`Preview/pdf417.ts`, see gotcha #4's addendum) exists at all — it's
    the shared bwip-js-backed capacity check both `ReceiptBuilder.ts` and
    `PreviewRenderer.ts` run before committing to a non-auto `columns`
    value, falling back to fully-automatic `columns` (the pre-existing,
    always-safe behavior) whenever the preferred count doesn't fit. Never
    pass a fixed/preferred PDF417 `columns` value straight to the real
    encoder without running it through this check first.

21. **bwip-js's own default PDF417 `eclevel` (error-correction level) is
    NOT the same as the real encoder's default `errorlevel`.** Confirmed by
    reading back the actual ESC/POS bytes: the real
    `@point-of-sale/receipt-printer-encoder`, with `errorlevel` omitted,
    encodes the error-correction-level command parameter as ASCII `"01"`
    (level `1`). bwip-js, with `eclevel` omitted, renders at a height that
    exactly matches its own `eclevel: 2` output — a different default.
    Since a higher error-correction level needs more codewords (hence more
    rows) for identical data/columns, this was a second, more subtle source
    of preview-vs-print PDF417 shape mismatches — one that survived even
    after `columns` was aligned (gotcha #20). `Preview/pdf417.ts`'s
    `PDF417_ENCODER_DEFAULT_ERRORLEVEL` (`= 1`) is passed to bwip-js
    whenever the job doesn't set `errorlevel` itself, in both
    `buildPdf417()` and `resolvePdf417Columns()` — so an unset `errorlevel`
    now renders/validates against the *same* level the real print silently
    already assumes, instead of bwip-js's own different one. Both bwip-js
    call sites must stay in sync on this (a mismatch between the capacity
    *check* and the actual *render* would make the check validate against
    the wrong assumption).

## Coding conventions in this repo

- **Extract data tables and error-handling into their own files** once a
  file starts mixing "static data" with "logic that uses it" — e.g.
  `src/interfaces/bluetooth/profiles.ts` (data) vs
  `DefaultBluetoothTransport.ts`/`CompatBluetoothTransport.ts` (logic using
  it), `src/interfaces/printerErrors.ts` (shared across transports). Keep orchestrator
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
  supports that symbology, just isn't preview-visualized). `pdf417` is a
  separate `PrintJobElement` type (its own encoder method, not a `barcode`
  symbology) and always gets a real preview.
- `@bwip-js/browser` (MIT) was added for PDF417 preview rendering — PDF417
  needs compaction modes, a ~2800-entry codeword table and Reed-Solomon
  error correction over GF(929), not safely hand-portable here with no way
  to physically scan-test the result — and now also backs `code128.ts` and
  `itf.ts`'s preview rendering (swapped in afterwards: same dependency was
  already fully bundled, so reusing it for those two removed real
  hand-ported code for zero extra bundle cost, and Code128 preview support
  actually got *more* correct doing so — bwip-js auto-selects Subsets
  A/B/C per spec, the hand-rolled version only ever did Subset B). A small,
  newer, unproven npm package (matrix output, same pattern as
  `qrcode-generator`) was passed over for PDF417 in favor of this actively
  maintained, years-in-production library — at a real, measured cost: it
  bundles its full 100+-symbology engine (only `code128`/`interleaved2of5`/
  `pdf417` are used), which took the standalone UMD bundle from ~120KB to
  **~1.06MB**. That cost is now justified across three symbologies, not
  one. Preview correctness for all three depends entirely on this
  dependency; print-side correctness does not (see gotcha #4).
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
- Bluetooth and QZ Tray (unsigned/demo mode only) are implemented.
  `src/interfaces/PrinterTransport.ts` is deliberately transport-agnostic —
  exactly why adding `QzTransport.ts` required no change to that interface's
  shape. A raw WebUSB transport
  ([WebUSBReceiptPrinter](https://github.com/NielsLeenheer/WebUSBReceiptPrinter))
  was considered instead but dropped after a hands-on attempt didn't pan
  out — QZ Tray (`src/interfaces/qz/`) supersedes that idea: it talks to an
  already-installed, already-printer-paired desktop app over a local
  websocket instead of implementing raw USB device/protocol handling
  directly. No WebUSB transport is planned. QZ's certificate/signature
  plumbing (`qz.security.setCertificatePromise`/`setSignaturePromise`,
  needed for *silent*/pre-signed printing instead of QZ Tray's own
  permission-dialog prompt) is explicitly out of scope — that requires a
  private-key signing operation only a consumer's own backend can safely
  do, and is left for a future addition.
- Upstream WebBluetoothReceiptPrinter's "Cat printer" profile
  (`language: 'meow'`, a different, non-ESC/POS/StarPRNT protocol) was not
  ported into `profiles.ts` — `ReceiptPrinterEncoder` doesn't speak that
  protocol, so there'd be nothing valid to print with it. Its `status`
  characteristic + `listen()`/notification support wasn't ported either —
  nothing in this project subscribes to printer status notifications today
  (`PrinterWrapper`'s `onStatusChange` is this wrapper's own connect/print
  lifecycle events, unrelated to a physical notify characteristic).

## Docker demo

`docker compose up --build -d` → `http://localhost:3000/` (redirects to
`/demo/`). Rebuild after **any** change under `src/`, `index.ts`,
`config.ts`, `demo/`, or the Dockerfile itself — the image bakes a full
`npm run build` in its `build` stage (see `Dockerfile`), it does not mount
source live. Web Bluetooth works fine over `http://localhost:3000` — Chrome
treats `localhost` as a secure context regardless of port. QZ Tray runs on
the *browser's* host machine (`localhost:8181`/`8282` etc.) regardless of
where the demo page itself is served from, so it works the same whether the
demo HTML comes from Docker or anywhere else — but neither transport's real
hardware path (a paired Bluetooth printer, or a running QZ Tray app with a
paired printer) can be exercised inside this repo's own sandboxed
environment; both require the user's own manual testing.
