# AGENTS.md

Technical reference for anyone (human or AI) maintaining this repo. Read this
before touching code.

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
- **ESM** (`build/printer-wrapper.esm.js`) — for bundler consumers.
  `@point-of-sale/*` and `qz-tray` are `externals`, coming in as the
  consumer's own npm `dependencies` instead of duplicated.
- `package.json#exports` routes `require` → UMD, `import` → ESM.

`npm run build:standalone` builds only the UMD config — refreshes
`build/printer-wrapper.js` for the demo without the full `build` (which
also runs `tsc -p tsconfig.build.json` for `build/types/`).

## Directory map

```
index.ts                        # webpack entry — re-exports PrinterWrapper + all public types
config.ts                       # DEFAULT_CONFIG, PAPER_WIDTH_SPECS, resolveConfig/resolveColumns/resolveImageMaxWidth

src/interfaces/
  PrinterTransport.ts           # transport-agnostic interface (getInfo/connect/disconnect/isConnected/print)
  printerErrors.ts              # shared PrinterError normalization

  bluetooth/
    profiles.ts                 # BLUETOOTH_PROFILES table + findProfile()
    writeChunked.ts             # chunked BLE characteristic writes
    DefaultBluetoothTransport.ts   # default transport — requestDevice({ filters }) restricted to known profiles
    CompatBluetoothTransport.ts    # fallback transport — acceptAllDevices + post-connect profile matching

  qz/
    QzTransport.ts               # QZ Tray transport — hands it the same ESC/POS bytes Bluetooth uses

src/Printer/
  PrinterWrapper.ts             # public API class — connect/disconnect/printReceipt/printRaw/renderPreview
  ReceiptBuilder.ts             # PrintJob -> ESC/POS bytes via @point-of-sale/receipt-printer-encoder

src/Text/                       # sample.ts (orchestrator), wrap.ts, justify.ts, sendLine.ts
src/Images/image.ts             # loadImageFromSource/prepareImageForEncoder/applyImageElement (real print path)

src/Preview/
  PreviewRenderer.ts            # PrintJob -> <canvas>, mirrors ReceiptBuilder.ts's element switch
  imageDither.ts                # reuses Images/image.ts sizing + canvas-dither for pixel-identical preview images
  core/                         # barcodeDrawing.ts (shared interface), qrcode.ts
  content/                      # code128.ts, itf.ts, pdf417.ts — @bwip-js/browser wrappers

demo/index.html                 # manual test page — Tailwind CDN, loads ../build/printer-wrapper.js + app.js
demo/app.js                     # demo page's own logic — no build step
Dockerfile / docker-compose.yml / nginx/default.conf   # serves demo/ + build/ on :3000
```

## Critical gotchas (read before editing ReceiptBuilder.ts / Text / Preview)

Kept here only where a real hardware/library test caused real debugging
time. Full report linked where one exists under `docs/notes/`.

1. **`.barcode()`/`.qrcode()`/`.pdf417()`/`.image()` emit ESC/POS bytes
   only — the printer firmware draws the symbol.** Preview rendering
   (`Preview/`) is therefore independent of the real encoder, with one
   exception: `ReceiptBuilder.ts`'s `pdf417` case imports
   `resolvePdf417Columns()` from `Preview/content/pdf417.ts` to pick a
   `columns` value both sides agree on — without it, firmware and bwip-js
   pick different (both scannable) grid shapes for the same data
   (confirmed on real hardware). See gotchas #5/#6 below for why that
   function has to do a capacity check first.

2. **`paperWidth` must scale both `columns` and `imageMaxWidth`** — the
   latter also caps image resizing, preview canvas width, and the barcode
   "too wide" check.
   → [docs/notes/02-paperwidth-scales-columns-and-imagemaxwidth.md](docs/notes/02-paperwidth-scales-columns-and-imagemaxwidth.md)

3. **Not every BLE characteristic supports `writeValueWithResponse()`** —
   confirmed on real hardware (MTP-II clone print-only characteristic).
   → [docs/notes/03-not-every-characteristic-supports-write-with-response.md](docs/notes/03-not-every-characteristic-supports-write-with-response.md)

4. **`cut()` defaults `feedBeforeCut` to `0`** — confirmed on a real Epson
   TM-T20X-II, the physical cutter slices through content without it.
   → [docs/notes/04-feedbeforecut-defaults-to-zero.md](docs/notes/04-feedbeforecut-defaults-to-zero.md)

5. **bwip-js validates PDF417 capacity and throws when it doesn't fit;
   the real encoder does not validate at all.**
   → [docs/notes/05-bwip-js-validates-pdf417-capacity.md](docs/notes/05-bwip-js-validates-pdf417-capacity.md)

6. **bwip-js's default PDF417 `eclevel` differs from the real encoder's
   default `errorlevel`** — confirmed by decoding real ESC/POS bytes.
   → [docs/notes/06-bwip-js-default-eclevel-differs.md](docs/notes/06-bwip-js-default-eclevel-differs.md)

7. **`@bwip-js/browser`'s generic `toCanvas()`/`toSVG()`/`render()` API
   pulls in its entire ~100-symbology engine — always use the
   per-symbology named exports instead.** Confirmed with a real build:
   907 KiB → 168 KiB.
   → [docs/notes/07-bwip-js-generic-api-pulls-in-full-engine.md](docs/notes/07-bwip-js-generic-api-pulls-in-full-engine.md)

8. **On Windows, QZ Tray's `type: 'raw'` print jobs go through the OS
   printer driver — a driver can mangle `GS k` (barcode) while leaving
   `GS ( k` (qrcode/pdf417) untouched, and there's no code-level fix.**
   Reproduced on a real Epson TM-T20X-II.
   → [docs/notes/08-qz-windows-raw-driver-routing.md](docs/notes/08-qz-windows-raw-driver-routing.md)

## Coding conventions in this repo

- **Extract data/error-handling into their own files** once a file mixes
  "static data" with "logic using it" — e.g. `bluetooth/profiles.ts` (data)
  vs the two transports (logic), `printerErrors.ts` (shared). Keep
  orchestrators thin — "call step 1, 2, 3", not inline implementations.
- **Preview and real print must stay behaviorally identical.** Changing
  one → check the other. `wrapText`, `justifyLine`, image sizing/dithering
  are already shared for this reason; new alignment/layout logic should be
  shared the same way.
- **No test framework.** Verification: `npm run build` + `npx tsc --noEmit`
  + throwaway Node scripts that `import('@point-of-sale/receipt-printer-encoder')`
  and inspect real encoded bytes + the Docker demo for real hardware.
  Reproduce encoder bugs against the *real* installed library before
  trusting a fix.
- **Comments explain "why", not "what."**
- **Don't hand-type `\uXXXX` escapes directly** — this environment has
  corrupted literal `\u0300-\u036f` (in `stripAccents()`) into raw
  combining Unicode when typed directly. Write a placeholder, patch it via
  a small script, and confirm with `cat -A` the bytes are plain ASCII.

## Scope limits (intentional, not bugs)

- Real barcode rendering covers `code128` and `itf`/`interleaved-2-of-5`
  only — other symbologies render as a placeholder box in preview. `pdf417`
  always gets a real preview (see gotcha #7 for why `@bwip-js/browser`).
- QZ's certificate/signature plumbing (silent/pre-signed printing instead
  of QZ Tray's own permission dialog) isn't implemented — needs a
  private-key signing operation only a consumer's own backend can do.
- Justify/alignment padding only reaches the printer via the
  padding-preserving `raw()` path for pure-ASCII (32-126) lines; non-ASCII
  falls back to unpadded `encoder.text()`.

## Docker demo

`docker compose up --build -d` → `http://localhost:3000/`. Rebuild after
**any** change under `src/`, `index.ts`, `config.ts`, `demo/`, or the
Dockerfile — the image bakes a full `npm run build`, no live source mount.
The demo page's Tailwind CDN styling needs the browser to reach the public
internet even when everything else is served locally.
