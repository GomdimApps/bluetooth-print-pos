# AGENTS.md

Technical reference for anyone (human or AI) maintaining this repo. Read this
before touching code.

## What this is

`web-escpos-printer` wraps ESC/POS receipt printing, **entirely in the
browser, no Node at runtime**. Four transports share one `PrinterTransport`
interface: Web Bluetooth (direct), QZ Tray (talks to the
[QZ Tray](https://qz.io) desktop app's local websocket, which talks to an
OS-registered printer — USB or otherwise), Web Serial (a USB cable's
virtual COM port — direct, no extra software, the reliable cross-platform
default) and WebUSB (a USB device's bulk endpoint directly — direct, no
extra software, but blocked the moment another driver has already claimed
the device — an OS printer driver on Windows, the kernel's own `usblp` on
Linux). Ships in two forms from one source via `webpack.config.js` (array
of two configs):

- **Standalone UMD** (`build/web-escpos-printer.js`) — fully self-contained,
  bundles `@point-of-sale/*`, `canvas-dither`, `qrcode-generator`, `qz-tray`
  inside. Drop into a `<script>` tag, no bundler, no `npm install` needed.
- **ESM** (`build/web-escpos-printer.esm.js`) — for bundler consumers.
  `@point-of-sale/*` and `qz-tray` are `externals`, coming in as the
  consumer's own npm `dependencies` instead of duplicated.
- `package.json#exports` routes `require` → UMD, `import` → ESM.

`npm run build:standalone` builds only the UMD config — refreshes
`build/web-escpos-printer.js` for the demo without the full `build` (which
also runs `tsc -p tsconfig.build.json` for `build/types/`).

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
    UsbTransport.ts               # WebUSB transport — talks to the device's bulk OUT endpoint directly, blocked on Windows behind an OS driver claim

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
time. Full report linked where one exists under `docs/notes/`.

1. **`.barcode()`/`.qrcode()`/`.pdf417()`/`.image()` emit ESC/POS bytes
   only — the printer firmware draws the symbol.** Preview rendering
   (`Preview/`) is therefore independent of the real encoder, with three
   exceptions, all in `ReceiptBuilder.ts`: `resolvePdf417Columns()`
   (`pdf417` case, from `Preview/content/pdf417.ts`) always picks a
   `columns` value both sides agree on — without it, firmware and bwip-js
   pick different (both scannable) grid shapes for the same data
   (confirmed on real hardware); and, only when `element.safeMode` is
   true, `buildPdf417RasterImage()` (`pdf417` case) / `buildQrCodeRasterImage()`
   (`qrcode` case, from `Preview/core/qrcode.ts`) render the symbol with
   the same bwip-js/qrcode-generator code the preview uses and send it via
   `encoder.image()` instead of `encoder.pdf417()`/`encoder.qrcode()`
   (gotcha #9). See gotchas #5/#6 below for why `resolvePdf417Columns()`
   needs a capacity check first.

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

9. **`safeMode: true` prints an element using a fallback rendering instead
   of its native ESC/POS command/character, for printers that mishandle
   the native one — the fallback depends on the element type.** Confirmed
   case: cheap/clone Bluetooth printers that don't implement the native
   PDF417 command (`GS ( k`) at all, silently dropping it, while an Epson
   TM-T20X-II prints the same bytes fine — `pdf417`'s `safeMode: true`
   renders it as a raster image instead. `qrcode`'s `safeMode: true` uses
   the same raster mechanism (no confirmed hardware case yet — added
   proactively to match the pattern, unlike pdf417/rule which came from
   real bug reports).
   → [docs/notes/09-clone-printers-lack-native-pdf417.md](docs/notes/09-clone-printers-lack-native-pdf417.md)

10. **`encoder.rule()` sends a cp437 box-drawing character (`─`/`═`) —
    some clone printers' font tables don't match it, printing garbage
    (confirmed: `^^^^^^^^^`) instead of a line.** `rule` elements can set
    `safeMode: true` to print a plain ASCII `-` line instead (same width,
    always safe — ASCII 0x20-0x7E is identical across every codepage).
    → [docs/notes/10-clone-printers-mangle-rule-character.md](docs/notes/10-clone-printers-mangle-rule-character.md)

11. **WebUSB's `open()`/`claimInterface()` fails with `SecurityError`
    ("Access denied") the instant another driver already has the USB
    interface — confirmed on both Windows *and Linux*, not Windows-only.**
    Windows: an OS printer driver claimed it (same category as gotcha #8).
    Linux: the kernel's own `usblp` driver auto-binds any USB
    Printer-Class device on plug-in, before a browser gets a chance — or
    a missing udev permission rule. No code-level fix either way (no
    browser API can force a kernel/OS driver to release its claim); `Web
    Serial` (`transport: 'serial'`) is the transport confirmed reliable
    instead, on the same hardware.
    → [docs/notes/11-webusb-blocked-by-kernel-driver-claims.md](docs/notes/11-webusb-blocked-by-kernel-driver-claims.md)

12. **A vendor's own "virtual COM port" driver/tool can bind a printer to
    a Windows COM port that Windows itself uses fine, while Chrome's Web
    Serial picker never lists it — not a filter in this library (confirmed:
    `SerialTransport.connect()` passes zero filters to `requestPort()`).**
    Reproduced with Epson's own "TM Virtual Port Assignment Tool" (real
    TM-T20X-II): Bluetooth SPP virtual ports show up fine in the same
    picker, the vendor VCP port never does. Best-available explanation
    (not source-verified): Web Serial only recognizes USB CDC-ACM and
    Bluetooth SPP virtual ports; a proprietary vendor VCP shim over a still
    USB-Printer-Class (0x07) interface is neither. No code-level fix — use
    QZ Tray instead for printers whose only "serial" option is a vendor VCP
    driver like this.
    → [docs/notes/12-vendor-virtual-com-drivers-not-listed.md](docs/notes/12-vendor-virtual-com-drivers-not-listed.md)

## Coding conventions in this repo

- **Extract data/error-handling into their own files** once a file mixes
  "static data" with "logic using it" — e.g. `bluetooth/profiles.ts` (data)
  vs the two transports (logic), `printerErrors.ts` (shared). Keep
  orchestrators thin — "call step 1, 2, 3", not inline implementations.
- **Preview and real print must stay behaviorally identical.** Changing
  one → check the other. `wrapText`, `justifyLine`, image sizing/dithering
  are already shared for this reason; new alignment/layout logic should be
  shared the same way.
- **Automated tests + the Docker demo.** `npm test` (see "## Testing" below)
  covers everything DOM-free-or-jsdom-reachable; the Docker demo is still
  the only way to confirm real hardware behavior. Reproduce encoder bugs
  against the *real* installed library before trusting a fix — same
  standard the test suite itself follows (no mocked encoder anywhere).
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

## Bluetooth profile matching

A connected device's profile (service/characteristic UUIDs, language,
codepageMapping, write pacing) is resolved one of two ways, both through
`openConnection()` (`DefaultBluetoothTransport.ts`, shared by both
transports): normally via `findProfile()` matching the device's
name/advertised services against `profiles.ts`'s `BLUETOOTH_PROFILES`
table; or, when the caller passes `connect({ profile })`
(`WebEscposPrinter.ts`'s `ConnectOptions.profile`), that exact
`BluetoothPrinterProfile` is used directly and the table lookup is
skipped entirely — the escape hatch for printers not in the table, no
fork/rebuild needed. Not a "gotcha" (no hardware bug behind it, this is
an intentional API) — see the README's "Manual Bluetooth profile"
section for consumer-facing docs.

## Serial vs. USB profile asymmetry

`bluetooth/profiles.ts` and `usb/profiles.ts` both key a profile table off
device identity (advertised services / vendor+product id) to resolve
`language`/`codepageMapping` automatically — `serial/SerialTransport.ts`
deliberately has no equivalent table. This isn't an oversight: a
`SerialPort`'s `getInfo()` only reports the vendor/product id of the
USB-to-serial bridge *chip* on the cable (often a generic CH340/CP2102/FTDI
part shared across many unrelated devices), not which printer is on the
other end of it — there's nothing meaningful to key a profile table on.
`SerialTransport.connect()`'s `language`/`codepageMapping` therefore always
come from whatever `WebEscposPrinterConfig` the `WebEscposPrinter` instance
was constructed with, same as `QzTransport`.

Both new transports were ported independently from reading
[NielsLeenheer/WebSerialReceiptPrinter](https://github.com/NielsLeenheer/WebSerialReceiptPrinter)
and
[NielsLeenheer/WebUSBReceiptPrinter](https://github.com/NielsLeenheer/WebUSBReceiptPrinter)
(same author as `@point-of-sale/receipt-printer-encoder`, and the same
approach already used for `bluetooth/profiles.ts`'s table) — this project
depends on neither package. Confirmed wire defaults: Serial opens at 9600
baud/8 data bits/1 stop bit/no parity/no flow control with no device-picker
filter (any COM port selectable); USB restricts the picker to a known
vendor/product-id table, opens configuration 1 / interface 0, and issues a
`device.reset()` right after claiming the interface. Neither reference
chunks writes — matched here too (no `writeChunked.ts`-equivalent for
either).

**Web Serial is the reliable cross-platform default; WebUSB works only
when nothing else has claimed the device** — this isn't split by OS the
way it first looked. `UsbTransport.ts`'s `device.claimInterface()` throws
outright the instant an OS/kernel driver has already claimed the device
exclusively — confirmed on real hardware happening on **both Windows and
Linux** (gotcha #11), not just Windows: Windows via an installed printer
driver, Linux via the kernel's own `usblp` module auto-binding USB
Printer-Class devices on plug-in (or a missing udev permission rule).
There's no code-level fix for either — see gotcha #11 for the OS-level
unbind steps. Prefer `transport: 'serial'` by default; only reach for
`transport: 'usb'` when there's a specific reason to, and expect to walk
through an unbind step on a fresh machine.

**Troubleshooting, confirmed on real hardware (Epson TM-T20X-II, MTP-II
clone)**:
- **WebUSB connect fails with `SecurityError` right after the device picker
  succeeds** (i.e. the printer *did* show up in the list) — this is the
  driver-claim limitation above (gotcha #11), not a missing user gesture.
  Chrome throws `SecurityError` from `open()`/`claimInterface()` for that
  too, which `printerErrors.ts#normalizeOpenError()` maps to
  `connect-failed` with a message naming the real cause (previously
  mis-surfaced as `user-gesture-required` by reusing
  `normalizeConnectError()`'s picker-only semantics for this later failure
  point too — fixed once, real bug). Try `transport: 'serial'` instead —
  confirmed working on the same hardware, including over a printer's
  Bluetooth-paired virtual COM port.
- **Web Serial connects successfully (status goes `connected`) but the
  printer never responds** — not necessarily a code bug: `SerialPortInfo`
  has no product-name field (a Web Serial API limitation), so the port
  picker can't be filtered or labeled by printer — it's easy to pick the
  wrong COM port (e.g. an unrelated Bluetooth SPP virtual port unless
  that's actually the one you want, see above) or hit a printer that needs
  a non-default baud rate. The demo's Serial panel exposes a baud rate
  field for exactly this; in code, pass `connect({ transport: 'serial',
  options: { baudRate } })`.
- **A printer bound to a Windows COM port through a vendor's own "virtual
  COM port" tool (e.g. Epson's TM Virtual Port Assignment Tool) never
  shows up in the picker at all** — not a filter bug, see gotcha #12.
  Bluetooth SPP virtual ports and standard USB CDC-ACM ports work fine;
  that specific vendor-driver shim doesn't. Use QZ Tray instead for those
  printers.

## Testing

```sh
npm test                          # vitest run, a few hundred ms
npx tsc --noEmit                  # src/, unaffected by test/ — unchanged from before
npx tsc --noEmit -p test/tsconfig.json   # type-checks test/ itself (own tsconfig: adds "node" types, noEmit)
npm run build
```

`npm test` runs `vitest run` (config: `vitest.config.ts`, just
`test.include: ['test/**/*.test.ts']`) — test files `import { describe, it,
expect } from 'vitest'`, not `node:test`/`node:assert`. Vitest was chosen
over `node:test` specifically because its resolver (Vite's, ESM-native,
resolves extensions automatically) has no trouble with this repo's
extension-less relative imports (`moduleResolution: "Bundler"`-style) or
with dependencies whose `package.json#exports` defines only an `"import"`
condition (e.g. `@bwip-js/browser`) — confirmed directly. `tsx` was tried
first for this and hard-failed (`ERR_PACKAGE_PATH_NOT_EXPORTED`) on exactly
that: without `"type": "module"` in *this* package's `package.json` (which
can't be added — see below), `tsx` resolves bare specifiers via a
CommonJS-style algorithm that can't see an import-only `exports` map — a
plain Node `node:test` setup needed its own custom loader hook to work
around the same issue; Vitest needs none of that. Don't add
`"type": "module"` to fix this a different way: it would make
`build/web-escpos-printer.js` (the UMD bundle) unrequireable, breaking the
documented `require('web-escpos-printer')` compatibility path.

Default test environment is Node, not Vitest's built-in `jsdom` — the
DOM-dependent tests below use this repo's own `test/helpers/dom.ts#withDom()`
(manual jsdom+`canvas` setup, scoped per test) instead, so DOM-free test
files never see a jsdom global leak into them.

**Scope**: everything DOM-free (the real encoder, `ReceiptBuilder.ts`'s
dispatch logic, `Text/`, `config.ts`, `SafeMode.ts`,
`resolvePdf417Columns()`) plus, via the `jsdom` + `canvas` devDependencies
(`test/helpers/dom.ts`'s `withDom()`), the DOM-dependent layer too —
`Images/image.ts`'s real source loading and the `Preview/` raster builders'
actual pixel output (`buildQrCodeRasterImage`/`buildPdf417RasterImage`/
`buildItf`). jsdom's own `HTMLCanvasElement`/`Image` pixel decoding is
wired to the `canvas` npm package specifically (not `@napi-rs/canvas` —
confirmed, jsdom doesn't know how to talk to it). Not covered: real
Bluetooth/QZ/Serial/USB transport connections and `bluetooth/profiles.ts`'s
`findProfile()` (would need mocked Web Bluetooth/Serial/USB APIs, not
requested) — `usb/profiles.ts`'s `findUsbProfile()`/`evaluate()` are the
one exception, covered directly since they're pure DOM-free logic (see
`test/interfaces/usb/profiles.test.ts`). And pixel-perfect
golden-image diffing (tests assert structural correctness — dimensions,
multiple-of-8 padding, non-white pixels present — not exact pixel match).

Most `docs/notes/*.md` gotchas now have a pinned regression test — see each
note's own "Pinned by" line where present. A few genuinely can't be: real
BLE characteristic behavior (#03) and Windows driver routing (#08) need
actual hardware/OS, and bundle size (#07) is a build-output assertion, not
a runtime one. Add a new `test/**/*.test.ts` file (mirroring the `src/`
path of what it tests) for any new gotcha the same way.

## Docker demo

`docker compose up --build -d` → `http://localhost:3000/`. Rebuild after
**any** change under `src/`, `index.ts`, `config.ts`, `demo/`, or the
Dockerfile — the image bakes a full `npm run build`, no live source mount.
The demo page's Tailwind CDN styling needs the browser to reach the public
internet even when everything else is served locally.
