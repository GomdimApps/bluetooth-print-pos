# AGENTS.md

Technical reference for anyone (human or AI) maintaining this repo. Read this
before touching code.

## What this is

`web-escpos-printer` wraps ESC/POS receipt printing, **entirely in the
browser, no Node at runtime**. Four transports share one `PrinterTransport`
interface: Web Bluetooth (direct), QZ Tray (talks to the
[QZ Tray](https://qz.io) desktop app's local websocket, which talks to an
OS-registered printer), Web Serial (a USB cable's virtual COM port — the
reliable cross-platform default) and WebUSB (a USB device's bulk endpoint
directly — blocked the moment another driver has already claimed the
device, see gotcha #11). Ships in two forms from one source via
`webpack.config.js` (array of two configs):

- **Standalone UMD** (`build/web-escpos-printer.js`) — self-contained,
  bundles `@point-of-sale/*`, `canvas-dither`, `qrcode-generator`, `qz-tray`.
  Drop into a `<script>` tag, no bundler needed.
- **ESM** (`build/web-escpos-printer.esm.js`) — for bundler consumers.
  `@point-of-sale/*` and `qz-tray` are `externals` instead of duplicated.
- `package.json#exports` routes `require` → UMD, `import` → ESM.

`npm run build:standalone` builds only the UMD config — refreshes
`build/web-escpos-printer.js` for the demo without the full `build`.

## Directory map

```
index.ts                        # webpack entry — re-exports WebEscposPrinter + all public types
config.ts                       # DEFAULT_CONFIG, PAPER_WIDTH_SPECS, resolveConfig/resolveColumns/resolveImageMaxWidth

src/interfaces/
  PrinterTransport.ts           # transport-agnostic interface (getInfo/connect/disconnect/isConnected/print)
  printerErrors.ts              # shared PrinterError normalization
  logger.ts                     # console.* wrapper — not pino/etc, see the file's own docblock for why

  bluetooth/
    profiles.ts                 # BLUETOOTH_PROFILES table + findProfile() — connect({ profile }) bypasses both
    writeChunked.ts             # chunked BLE characteristic writes
    DefaultBluetoothTransport.ts   # default transport — requestDevice({ filters }) restricted to known profiles
    CompatBluetoothTransport.ts    # fallback transport — acceptAllDevices + post-connect profile matching

  qz/
    QzTransport.ts               # QZ Tray transport — hands it the same ESC/POS bytes Bluetooth uses

  serial/
    SerialTransport.ts           # Web Serial transport — virtual COM port over the printer's USB cable

  usb/
    profiles.ts                  # USB_PROFILES table + findUsbProfile() — vendor/product-id based, same pattern as bluetooth/profiles.ts
    UsbTransport.ts               # WebUSB transport — talks to the device's bulk OUT endpoint directly

src/Printer/
  WebEscposPrinter.ts           # public API class — connect/disconnect/printReceipt/printRaw/renderPreview
  ReceiptBuilder.ts             # PrintJob -> ESC/POS bytes via @point-of-sale/receipt-printer-encoder
  Utils/safemode.ts             # safeMode() — shared raster-image fallback for pdf417/etc. safeMode elements

src/Text/                       # sample.ts (orchestrator), wrap.ts, justify.ts, sendLine.ts
src/Images/image.ts             # loadImageFromSource/prepareImageForEncoder/applyImageElement (real print path)

src/Preview/
  PreviewRenderer.ts            # PrintJob -> <canvas>, mirrors ReceiptBuilder.ts's element switch
  imageDither.ts                # reuses Images/image.ts sizing + canvas-dither for pixel-identical preview images
  core/                         # barcodeDrawing.ts (shared interface), qrcode.ts
  content/                      # code128.ts, itf.ts, pdf417.ts — @bwip-js/browser wrappers

demo/index.html                 # manual test page — Tailwind CDN, loads ../build/web-escpos-printer.js + app.js
demo/app.js                     # demo page's own logic — no build step
Dockerfile / docker-compose.yml / scripts/nginx/default.conf   # serves demo/ + build/ on :3000

test/                            # Vitest suite — see "## Testing" below
  helpers/                       # buildEncoder/buildBytes/withDom/pixelFixture/assertBytes
  config.test.ts, Text/, Images/, Preview/, Printer/   # mirrors the src/ tree above

vitest.config.ts                 # test.include: test/**/*.test.ts
.github/workflows/test.yml       # runs `npm test` on push/PR
```

## Critical gotchas (read before editing ReceiptBuilder.ts / Text / Preview)

Kept here only where a real hardware/library test caused real debugging
time — one line each, full report in `docs/notes/`.

1. **Preview never touches the real encoder**, except: `resolvePdf417Columns()`
   picks a `columns` both sides agree on, and `safeMode: true` renders
   pdf417/qrcode as a raster image via the same preview renderer instead
   of the native command (gotcha #9).
2. **`paperWidth` scales both `columns` and `imageMaxWidth`.**
   → [docs/notes/02](docs/notes/02-paperwidth-scales-columns-and-imagemaxwidth.md)
3. **Not every BLE characteristic supports `writeValueWithResponse()`.**
   → [docs/notes/03](docs/notes/03-not-every-characteristic-supports-write-with-response.md)
4. **`cut()` defaults `feedBeforeCut` to `0`** — slices through content
   without it.
   → [docs/notes/04](docs/notes/04-feedbeforecut-defaults-to-zero.md)
5. **bwip-js validates PDF417 capacity; the real encoder doesn't.**
   → [docs/notes/05](docs/notes/05-bwip-js-validates-pdf417-capacity.md)
6. **bwip-js's default PDF417 `eclevel` differs from the real encoder's
   default `errorlevel`.**
   → [docs/notes/06](docs/notes/06-bwip-js-default-eclevel-differs.md)
7. **`@bwip-js/browser`'s generic API pulls in the full ~100-symbology
   engine** — always use per-symbology named exports.
   → [docs/notes/07](docs/notes/07-bwip-js-generic-api-pulls-in-full-engine.md)
8. **On Windows, QZ Tray raw jobs go through the OS printer driver**,
   which can mangle `GS k` while leaving `GS ( k` untouched.
   → [docs/notes/08](docs/notes/08-qz-windows-raw-driver-routing.md)
9. **`safeMode: true` prints a fallback raster image instead of a native
   command**, for printers whose firmware doesn't support it.
   → [docs/notes/09](docs/notes/09-clone-printers-lack-native-pdf417.md)
10. **`encoder.rule()` sends a cp437 box character some clone printers
    mangle** — `safeMode: true` prints a plain ASCII `-` line instead.
    → [docs/notes/10](docs/notes/10-clone-printers-mangle-rule-character.md)
11. **WebUSB `open()`/`claimInterface()` fails with `SecurityError`
    whenever another driver already holds the device** — confirmed on
    both Windows and Linux, no code-level fix.
    → [docs/notes/11](docs/notes/11-webusb-blocked-by-kernel-driver-claims.md)
12. **A vendor's own "virtual COM port" driver (e.g. Epson's TM Virtual
    Port tool) isn't listed by Web Serial's picker** — not a filter bug.
    → [docs/notes/12](docs/notes/12-vendor-virtual-com-drivers-not-listed.md)

## Coding conventions

- **Extract data/error-handling into their own files** once a file mixes
  "static data" with "logic using it" (e.g. `bluetooth/profiles.ts` vs.
  the transports). Keep orchestrators thin.
- **Preview and real print must stay behaviorally identical** — changing
  one means checking the other (`wrapText`, `justifyLine`, image sizing/
  dithering are already shared for this).
- **Reproduce bugs against the real installed encoder before trusting a
  fix** — no mocked encoder anywhere, in the library or the test suite.
- **Comments explain "why", not "what."**
- **Don't hand-type `\uXXXX` escapes** — this environment corrupts them
  when typed directly. Patch via a script, verify with `cat -A`.

## Scope limits (intentional, not bugs)

- Real barcode preview covers `code128`/`itf` only; `pdf417` always gets a
  real preview (gotcha #7). Others render as a placeholder box.
- QZ's certificate/signature plumbing isn't implemented — needs a
  consumer-side backend to sign.
- Justify/alignment padding only survives on pure-ASCII lines (via
  `raw()`); non-ASCII falls back to unpadded `encoder.text()`.

## Bluetooth profile matching

`openConnection()` (`DefaultBluetoothTransport.ts`, shared by both
Bluetooth transports) resolves a profile via `findProfile()` matching the
device's name/services against `profiles.ts`, unless the caller passes
`connect({ profile })` — an explicit `BluetoothPrinterProfile` that skips
the table entirely (the escape hatch for unlisted printers). See the
README's "Manual Bluetooth profile" section.

## Serial vs. USB

`usb/profiles.ts` keys a vendor/product-id table the same way
`bluetooth/profiles.ts` does; `serial/SerialTransport.ts` deliberately has
none — a `SerialPort`'s reported vendor/product id is the USB-to-serial
*bridge chip*, not the printer, so there's nothing meaningful to key on.
Its `language`/`codepageMapping` always come from the constructor config
instead, same as `QzTransport`.

Both transports were ported independently from reading
[NielsLeenheer/WebSerialReceiptPrinter](https://github.com/NielsLeenheer/WebSerialReceiptPrinter)
and
[NielsLeenheer/WebUSBReceiptPrinter](https://github.com/NielsLeenheer/WebUSBReceiptPrinter)
(no dependency on either package). Confirmed wire defaults: Serial opens
at 9600/8/1/none/none with no picker filter; USB opens configuration 1 /
interface 0 and calls `device.reset()` after claiming. Neither chunks
writes.

**Prefer `transport: 'serial'` by default** — confirmed reliable cross-
platform; WebUSB only works when nothing else has claimed the device
(gotcha #11), and a vendor's own virtual-COM-port driver may not even
show up for Serial either (gotcha #12) — QZ Tray is the fallback for
those printers.

## Testing

```sh
npm test                          # vitest run, a few hundred ms
npx tsc --noEmit                  # src/
npx tsc --noEmit -p test/tsconfig.json   # type-checks test/ (own tsconfig: adds "node" types, noEmit)
npm run build
```

Vitest (not `node:test`) because its Vite-based resolver handles this
repo's extension-less imports and import-only-`exports` deps (e.g.
`@bwip-js/browser`) natively — `tsx` hard-failed on exactly that. Don't
add `"type": "module"` to `package.json` to "fix" this a different way:
it'd make the UMD bundle unrequireable.

Default environment is Node, not `jsdom` — DOM-dependent tests use
`test/helpers/dom.ts#withDom()` (manual jsdom+`canvas` setup) scoped per
test instead.

**Scope**: everything DOM-free, plus (via `withDom()`) `Images/image.ts`'s
real source loading and the `Preview/` raster builders' actual pixel
output. Not covered: real Bluetooth/QZ/Serial/USB transport connections,
`findProfile()` (would need mocked browser APIs), pixel-perfect
golden-image diffing (asserts structure, not exact pixels). Most
`docs/notes/*.md` gotchas have a pinned regression test — see each note's
own "Pinned by" line; add a new `test/**/*.test.ts` file the same way for
new gotchas.

## Docker demo

`docker compose up --build -d` → `http://localhost:3000/`. Rebuild after
**any** change under `src/`, `index.ts`, `config.ts`, `demo/`, or the
Dockerfile — the image bakes a full `npm run build`, no live source mount.
