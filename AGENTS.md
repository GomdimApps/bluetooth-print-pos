# AGENTS.md

Technical reference for anyone (human or AI) maintaining this repo. Read this
before touching code — several bugs here were caused by not knowing the
quirks below.

## What this is

`bluetooth-print-pos` wraps ESC/POS receipt printing, **entirely in the
browser, no Node at runtime**. Two transports share one `PrinterTransport`
interface: Web Bluetooth (direct) and QZ Tray (talks to the
[QZ Tray](https://qz.io) desktop app's local websocket, which talks to an
OS-registered printer — USB or otherwise). Ships in two forms from one
source via `webpack.config.js` (array of two configs):

- **Standalone UMD** (`build/printer-wrapper.js`) — fully self-contained,
  bundles `@point-of-sale/*`, `canvas-dither`, `qrcode-generator`, `qz-tray`
  inside. Drop into a `<script>` tag, no bundler, no `npm install` needed.
  `output.library.type: 'umd'`, `export: 'default'` so `window.PrinterWrapper`
  is the class directly, not `{default: ...}`.
- **ESM** (`build/printer-wrapper.esm.js`) — for bundler consumers
  (Vite/webpack). `@point-of-sale/*` and `qz-tray` are `externals`
  (`pointOfSaleExternals`/`qzTrayExternals` in webpack.config.js), coming in
  as the consumer's own npm `dependencies` instead of duplicated —
  `canvas-dither`/`qrcode-generator` stay bundled (too small to bother).
  Unlike `@point-of-sale/*`, `qz-tray` has no `package.json#exports`/ESM
  entry (just a legacy `main` UMD script), so this emits a bare
  `import ... from 'qz-tray'` relying on the *consumer's own bundler*
  resolving a CJS/UMD package via CJS interop — confirmed working with
  webpack 5's default externals handling in this repo's own build, see
  gotcha #13.
- `package.json#exports` routes `require` → UMD, `import` → ESM, so
  `require('bluetooth-print-pos')` in a Vue2/CJS project gets the same
  self-contained bundle as the `<script>` tag, not the ESM one.

`npm run build:standalone` builds only the UMD config — refreshes
`build/printer-wrapper.js` for the demo without the full `build` (which
also runs `tsc -p tsconfig.build.json` for `build/types/`).

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
  PrinterTransport.ts           # transport-agnostic interface (getInfo/connect/disconnect/isConnected/print) — implemented by both Bluetooth transports and QzTransport
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
  core/
    barcodeDrawing.ts           # shared BarcodeDrawing interface (content/code128.ts + itf.ts + pdf417.ts)
    qrcode.ts                   # wraps qrcode-generator for a real, scannable QR
  content/
    code128.ts                  # wraps @bwip-js/browser for a real, scannable Code128
    itf.ts                      # wraps @bwip-js/browser for a real, scannable ITF (Interleaved 2 of 5)
    pdf417.ts                   # wraps @bwip-js/browser for a real, scannable PDF417 (also picks the shared columns/errorlevel defaults — see gotchas #4/#20/#21)

demo/index.html                 # manual test page — Tailwind CDN for styling, loads ../build/printer-wrapper.js + app.js
demo/app.js                     # demo page's own logic (DOM wiring, form → PrintJob) — no build step, loaded as a plain <script src>
Dockerfile / docker-compose.yml / nginx/default.conf   # serves demo/ + build/ on :3000
```

## Critical gotchas (read before editing ReceiptBuilder.ts / Text / Preview)

These cost real debugging time. Don't reintroduce them.

1. **`new ReceiptPrinterEncoder(options)` merges via `Object.assign(defaults,
   ..., options)`** — an explicit `key: undefined` *overwrites* the default
   (unlike `??`, `Object.assign` doesn't skip own-props valued `undefined`).
   E.g. `codepageMapping: undefined` wipes the default codepage →
   `Cannot convert undefined or null to object` in `Object.keys(this.#m)`.
   **Fix**: only spread a key when defined —
   `...(value !== undefined ? { key: value } : {})`. Same hazard hits
   `printerModel`, `qrcode()`'s `{ size }`, and `pdf417()`'s `{ columns, rows,
   width, height, errorlevel, truncated }` (defaults
   `{width:3,height:3,columns:0,rows:0,errorlevel:1,truncated:false}`,
   confirmed by reading its source). See `ReceiptBuilder.ts`.

2. **`encoder.text()` trims leading/trailing whitespace**, even on a single
   non-wrapped line — silently erasing manual space-padding for alignment.
   **Fix**: build the padded/justified line yourself and send via
   `encoder.raw(byteArray)`, which skips the trimming but still applies
   bold/underline/size (verified by diffing both paths' byte output). Only
   safe for printable-ASCII (32-126) — `raw()` skips codepage-aware
   encoding, so non-ASCII falls back to unpadded `encoder.text()`
   (`sendLine.ts`).

3. **`encoder.align()` only reliably affects barcode/qrcode/image** (the
   library wraps those with align-before/reset-after); for plain text it
   just sets a queued flag — whether the physical printer honors the
   resulting `ESC a n` is a firmware matter, and cheap clones often don't.
   That's why text alignment uses manual space-padding
   (`sendLine.ts`/`justify.ts`) instead. `encoder.align()` is still called
   (harmless, needed for barcode/qrcode).

4. **`.barcode()`/`.qrcode()`/`.pdf417()`/`.image()` emit ESC/POS bytes
   only — the printer firmware draws the symbol**, so there's nothing to
   reuse from the encoder for preview rendering. `Preview/content/code128.ts`/
   `itf.ts`/`pdf417.ts` are thin `@bwip-js/browser` wrappers (`bcid:
   'code128'`/`'interleaved2of5'`/`'pdf417'`); `Preview/core/qrcode.ts` is
   independent, via `qrcode-generator`. Print-side correctness never
   depends on any of them, and vice versa — `ReceiptBuilder.ts` only calls
   the real encoder.

   **One deliberate exception**: `ReceiptBuilder.ts`'s `pdf417` case
   imports `resolvePdf417Columns()` from `Preview/content/pdf417.ts` — only to pick
   the `columns` value, not to draw anything. Without explicit `columns`,
   firmware and bwip-js each choose their own grid shape independently,
   producing visibly different (both scannable) symbols — confirmed on
   real hardware (Epson TM-T20X-II via QZ Tray). `resolvePdf417Columns()`
   makes both sides agree on the same paper-width-preferred `columns`
   (`preferredColumns()`, `17*columns+69` modules — confirmed against real
   bwip-js measurements), falling back to fully-automatic `columns` when
   the preferred count doesn't fit. Print-*byte* generation still never
   depends on Preview succeeding — only this numeric choice does, and its
   fallback is always safe. See gotcha #20.

5. **QR `size` is dots-per-module directly** (encoder default `6`), not a
   multiplier. `PreviewRenderer.ts`'s `QRCODE_DEFAULT_CELL_PX` must equal
   `6` — a mismatch here once made the preview QR render visibly smaller
   than the real print.

6. **`paperWidth` must scale both `columns` and `imageMaxWidth`**
   (`config.ts#PAPER_WIDTH_SPECS`) — `imageMaxWidth` also caps image
   resizing, the preview canvas width, and the barcode "too wide" check.
   Scaling only `columns` (an earlier bug) left `paperWidth: '80mm'` doing
   nothing for images/barcodes.

7. **`requestDevice({ filters })` restricts the device picker to matching
   devices** — an unlisted printer never appears, even if it'd work if
   selected. Hence two transports in `src/interfaces/bluetooth/`:
   `DefaultBluetoothTransport.ts` (filtered,
   `requestDevice({ filters: ALL_FILTERS })`) and
   `CompatBluetoothTransport.ts` (`acceptAllDevices: true`, matches *after*
   connecting). Both share `openConnection()` (GATT-connect,
   `findProfile()`, grab write characteristic) — only `requestDevice()`
   itself differs. `connect({ compat: true })` selects the latter. Ported
   in-house from
   [WebBluetoothReceiptPrinter](https://github.com/NielsLeenheer/WebBluetoothReceiptPrinter)
   (read in full from `main`, not guessed) — no longer an npm dependency.
   Its "Cat printer" profile (`language: 'meow'`, non-ESC/POS/StarPRNT) and
   status-characteristic notifications were deliberately not ported — see
   Scope limits.

8. **`connect()` must be called from a real user gesture** (both
   transports) — a browser requirement, not ours. `SecurityError` from
   `requestDevice()` means it wasn't.

9. **`@point-of-sale/receipt-printer-encoder` ships no TypeScript types.**
   `src/types/point-of-sale.d.ts` was hand-written by reading the installed
   `dist/*.esm.js` bundle (minified but readable) — only what this project
   calls, not a full typing. Read the installed bundle before adding a
   method; don't guess signatures. (Bluetooth used to be a second untyped
   `@point-of-sale/*` package — it's now this project's own TypeScript in
   `src/interfaces/bluetooth/`, needing no ambient types.)

10. **The UMD webpack config needs `resolve.conditionNames` to include
    `'browser'`** — `@point-of-sale/receipt-printer-encoder`'s
    `package.json#exports` only declares a `"browser"` condition (no
    `import`/`require` fallback); without it, resolution fails.

11. **Not every characteristic supports `writeValueWithResponse()`.**
    Confirmed on real hardware (MTP-II clone): its print characteristic
    only advertises `writeWithoutResponse`, so `writeValueWithResponse()`
    throws `NotSupportedError` (legacy DOMException `.code === 9`) on the
    first chunk. `writeChunked.ts`'s `pickWriter()` checks
    `characteristic.properties` and picks whichever method is actually
    supported (`write` preferred, `writeWithoutResponse` fallback) instead
    of assuming.

12. **A native `DOMException` structurally matches `PrinterError`**
    (`.code`+`.message`), just with a legacy *numeric* `.code` (e.g. `9`)
    instead of our string codes. This is how gotcha #11 was first spotted:
    a raw DOMException slipped past `isPrinterError()`'s old
    `'code' in error && 'message' in error` check, letting
    `normalizePrintError()` leak a numeric code to callers.
    `isPrinterError()` (`printerErrors.ts`) now also checks `code` is an
    actual `PrinterErrorCode` string.

13. **`qz-tray`'s `package.json` has no `exports`/ESM entry** — just legacy
    `"main": "qz-tray.js"` (UMD) + `"browser": {"path": false}`.
    Externalizing it in the ESM build (`externalsType: 'module'`, like
    `pointOfSaleExternals`) still works — webpack 5 emits a clean
    `import{...}from"qz-tray"` resolved via the *consumer's* bundler's CJS
    interop — but unlike `@point-of-sale/*`'s own `"browser"` condition
    (gotcha #10), that's the consumer's tooling behavior, not guaranteed by
    the package itself.

14. **`qz-tray.js` has one `require('path')` call**, in a dead Node-only
    branch. Bundling it into the UMD build (`target: 'web'`) needs no extra
    config — webpack 5's default `resolve.aliasFields: ['browser']`
    already honors qz-tray's own `package.json#browser: {"path": false}`
    and neutralizes it (confirmed: `npm run build`'s UMD stats show
    `path (ignored)`, not a resolve error). If this regresses, fix is
    `resolve.fallback: { path: false }` in `umdConfig()`.

15. **`qz.printers.find(query)` returns a bare `string`, not `string[]`,
    when `query` matches** — only an array with no query
    (`Promise<string[] | string>`, confirmed live). `QzTransport.listPrinters()`
    normalizes via `Array.isArray(result) ? result : [result]`.

16. **`qz.websocket.connect()` rejects if a connection is already
    open/connecting** (`"An open connection with QZ Tray already exists"` /
    `"...has not returned yet"`, from qz-tray.js's source) — every call
    site must guard with `qz.websocket.isActive()` first. `QzTransport.ts`'s
    `ensureSocketOpen()` is the shared guard for `connect()`/`listPrinters()`.

17. **`qz.print()` accepts a raw `Uint8Array` directly** with
    `flavor: 'base64'` — qz-tray's own `compatible.data()` base64-encodes
    it internally via a hand-rolled, binary-safe byte-loop
    `uint8ArrayToBase64()` (not `btoa`/spread, so no call-stack risk on
    large receipts). Don't hand-roll a base64 helper — `QzTransport.print()`
    passes bytes straight through.

18. **QZ Tray has no protocol to auto-detect and no native device picker.**
    Unlike Bluetooth (detects `language`/`codepageMapping` from a matched
    BLE profile; picker is `requestDevice()`), `QzTransport`'s reported
    `PrinterInfo.language`/`codepageMapping` just mirror the constructed
    `PrinterWrapperConfig` (confirmed: `buildReceiptBytes` always encodes
    via `job.language ?? defaults.language`, never `PrinterInfo.language` —
    purely informational). Printer selection is a consumer-built UI via
    `listQzPrinters()` (`qz.printers.find()`) instead.

19. **`cut()` defaults `feedBeforeCut` to `0`** unless a recognized
    `printerModel` supplies its own `cutter.feed` (confirmed:
    `feedBeforeCut = printerModel?.cutter?.feed || options.feedBeforeCut` —
    model's value always wins). With zero feed, the physical cutter fires
    before the last content clears it, slicing through it — confirmed on
    real hardware: an Epson TM-T20X-II via QZ Tray cut text/barcodes/PDF417
    too close or clean through, worse for taller elements. `epson-tm-t20x`
    isn't in the encoder's known-models table (`Unknown printer model`), so
    no auto-fallback — its closest relatives (`epson-tm-t20iii`/`iv`) use
    `cutter: { feed: 4 }`, also the single most common value across the
    whole table (21/30 models). `DEFAULT_CONFIG.feedBeforeCut = 4` for this
    reason — `ReceiptBuilder.ts` always passes it explicitly;
    `PreviewRenderer.ts` mirrors the same gap before its "✂ cut" mark (see
    the preview/print parity rule below).

20. **bwip-js validates PDF417 capacity and throws when it doesn't fit; the
    real encoder does not validate at all.** Confirmed: encoding 2000 chars
    with `columns: 3` makes bwip-js reject with `pdf417insufficientCapacity`,
    while the real encoder happily emits ESC/POS bytes requesting that same
    impossible layout, leaving firmware behavior unverified. This is *why*
    `resolvePdf417Columns()` (`Preview/content/pdf417.ts`, gotcha #4) exists: the
    shared capacity check both `ReceiptBuilder.ts` and `PreviewRenderer.ts`
    run before committing to a non-auto `columns`, falling back to
    fully-automatic (the pre-existing, safe behavior) when it doesn't fit.
    Never pass a fixed `columns` to the real encoder without this check.

21. **bwip-js's default PDF417 `eclevel` differs from the real encoder's
    default `errorlevel`.** Confirmed by decoding actual ESC/POS bytes: the
    real encoder, with `errorlevel` omitted, encodes level `1` (ASCII
    `"01"`); bwip-js, with `eclevel` omitted, renders exactly like its own
    `eclevel: 2`. Higher error-correction needs more codewords (more rows)
    for identical data/columns — a second, subtler cause of preview-vs-print
    shape mismatch that survived even after `columns` was aligned (gotcha
    #20). `Preview/content/pdf417.ts`'s `toBwipOptions()` now applies
    `DEFAULT_ERRORLEVEL` (`= 1`) uniformly whenever the job doesn't set
    `errorlevel`, so both `buildPdf417()` and `resolvePdf417Columns()`
    render/validate against the same level the real print already assumes.

22. **`@bwip-js/browser`'s generic `toCanvas()`/`toSVG()`/`render()` API
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

## Coding conventions in this repo

- **Extract data/error-handling into their own files** once a file mixes
  "static data" with "logic using it" — e.g. `bluetooth/profiles.ts` (data)
  vs the two transports (logic), `printerErrors.ts` (shared). Keep
  orchestrators (`applyTextElement`, `renderPreviewCanvas`,
  `buildReceiptBytes`) thin — "call step 1, 2, 3", not inline
  implementations.
- **Preview and real print must stay behaviorally identical.** Changing
  one → check the other. `wrapText`, `justifyLine`, image sizing/dithering
  (`imageDither.ts` reuses `Images/image.ts`) are already shared for this
  reason; new alignment/layout logic should be shared the same way.
- **No test framework.** Verification: `npm run build` + `npx tsc --noEmit`
  + throwaway Node scripts that `import('@point-of-sale/receipt-printer-encoder')`
  and inspect real encoded bytes (how every encoder bug above was actually
  confirmed) + the Docker demo for real hardware. Reproduce encoder bugs
  against the *real* installed library before trusting a fix.
- **Comments explain "why", not "what"** — especially the gotchas above;
  the reasoning has already been lost/rediscovered once.
- **Don't hand-type `\uXXXX` escapes directly** — this environment has
  corrupted literal `\u0300-\u036f` (in `stripAccents()`) into raw
  combining Unicode when typed directly. Write a placeholder, patch it via
  a small Python script building `"\\u0300-\\u036f"` as a Python string
  literal, and confirm with `cat -A` the bytes are plain ASCII (`\`, `u`,
  `0`, `3`, `0`, `0`), not `M-`-prefixed garbage.

## Scope limits (intentional, not bugs)

- Real barcode rendering covers `code128` and `itf`/`interleaved-2-of-5`
  only — other symbologies render as a placeholder box in preview (print
  still sends them as-is; works if the encoder/printer supports it).
  `pdf417` is a separate `PrintJobElement` (own encoder method, not a
  `barcode` symbology) and always gets a real preview.
- `@bwip-js/browser` (MIT) was added for PDF417 preview — compaction modes,
  a ~2800-entry codeword table, Reed-Solomon over GF(929) aren't safely
  hand-portable with no way to scan-test here. Later swapped in for
  `code128.ts`/`itf.ts` too, and Code128 got *more* correct doing so:
  bwip-js auto-selects Subsets A/B/C, the hand-rolled version only did
  Subset B. Chosen over a smaller, newer, unproven matrix-output package
  (same pattern as `qrcode-generator`) for its production track record —
  it ships a full 100+-symbology engine, but only `code128`/
  `interleaved2of5`/`pdf417` are used; per gotcha #22, importing the
  per-symbology named exports (not the generic `bcid`-string API) means
  only those three are actually bundled — **~168KB combined**, not the
  full engine. Preview correctness for all three depends on this
  dependency; print-side correctness doesn't (gotcha #4).
- `PaperWidth` is `'58mm' | '80mm' | '112mm'` — `80mm` cross-checked
  against real hardware (576 dots); `112mm` is an estimate, not
  hardware-verified.
- The "too wide" preview warning is advisory only — `printReceipt()` never
  blocks on it (the width estimate is a heuristic, not a guarantee; false
  positives shouldn't block printing).
- Justify/alignment padding is computed for any content, but only
  pure-ASCII (32-126) lines reach the printer via the padding-preserving
  `raw()` path; non-ASCII lines (only reachable with `stripAccents: false`)
  fall back to unpadded `encoder.text()` and the printer's native align
  command.
- Bluetooth and QZ Tray (unsigned/demo mode) are implemented.
  `PrinterTransport.ts` is deliberately transport-agnostic — why adding
  `QzTransport.ts` needed no interface change. A raw WebUSB transport
  ([WebUSBReceiptPrinter](https://github.com/NielsLeenheer/WebUSBReceiptPrinter))
  was tried and dropped after a hands-on attempt didn't pan out; QZ Tray
  (`src/interfaces/qz/`) supersedes it — talks to an already-installed,
  already-paired desktop app over a local websocket instead of
  implementing raw USB device/protocol handling. No WebUSB transport is
  planned. QZ's certificate/signature plumbing (`setCertificatePromise`/
  `setSignaturePromise`, needed for silent/pre-signed printing instead of
  QZ Tray's own permission dialog) is out of scope — it needs a
  private-key signing operation only a consumer's own backend can do; left
  for a future addition.
- Upstream's "Cat printer" profile (`language: 'meow'`, non-ESC/POS/
  StarPRNT) wasn't ported — `ReceiptPrinterEncoder` doesn't speak that
  protocol. Its `status` characteristic + `listen()`/notifications weren't
  ported either — nothing here subscribes to printer status notifications
  (`PrinterWrapper`'s `onStatusChange` is this wrapper's own connect/print
  lifecycle events, unrelated to a physical notify characteristic).

## Docker demo

`docker compose up --build -d` → `http://localhost:3000/` (redirects to
`/demo/`). Rebuild after **any** change under `src/`, `index.ts`,
`config.ts`, `demo/`, or the Dockerfile — the image bakes a full
`npm run build` (see `Dockerfile`), no live source mount. Web Bluetooth
works over `http://localhost:3000` (Chrome treats `localhost` as secure
regardless of port). QZ Tray runs on the *browser's* host
(`localhost:8181`/`8282`) regardless of where the demo page is served from
— same either way. Neither transport's real hardware path (paired
Bluetooth printer, or a running QZ Tray app with a paired printer) can be
exercised in this sandboxed environment — both need the user's own manual
testing. The demo page styles itself via the Tailwind CDN
(`cdn.tailwindcss.com`) — unlike the rest of the demo, this needs the
*browser* to reach the public internet even when everything else is served
locally/via Docker; it's a dev-only convenience (Tailwind's own docs say
not to use the CDN build in production), not something `build/` or the
published package depends on.
