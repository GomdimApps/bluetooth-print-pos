# web-escpos-printer

[github.com/GomdimApps/web-escpos-printer](https://github.com/GomdimApps/web-escpos-printer)

This project started from a recurring pain: getting 58mm/80mm thermal
printers to talk to an app, each one with its own fiddly, printer-specific
setup. It came out of React Native and SPA/Laravel projects where we hit
exactly that wall — our tech lead, [Sávio Godinho](https://github.com/saviogodinho2002),
proposed building a library that simplified the whole flow, from
connection to printing, shippable as a client-side module, with a preview
renderer built in so a print could be tested without a physical printer.

A communication wrapper for thermal receipt printers, over **Web
Bluetooth**, **Web Serial** (a USB cable's virtual COM port — the reliable
no-extra-software option across Windows/Linux/macOS), **WebUSB** (a USB
device's bulk endpoint directly — works only when nothing else has
claimed the device), or via the **[QZ Tray](https://qz.io)** desktop app
(any OS-registered printer).
Builds receipts (text, images, barcodes, QR codes, PDF417) from a
JSON-serializable object and sends them to the printer — no ESC/POS
knowledge needed. Runs **entirely in the browser, no Node at runtime**.

![Real thermal print next to the matching browser preview and connection log](docs/images/test-mobile-printer.png)

*Left: real receipt off a Bluetooth thermal printer. Right: the same job
rendered by `renderPreview()` in the browser — no editing, actual
side-by-side test output.*

## Standalone usage (no dependencies)

For a plain HTML page or webview — no bundler, no `npm install`. The
published package ships a prebuilt, self-contained UMD bundle at
`build/web-escpos-printer.js`, served straight
off a CDN like [jsDelivr](https://www.jsdelivr.com/):

```html
<script src="https://cdn.jsdelivr.net/npm/web-escpos-printer/build/web-escpos-printer.js"></script>
<script>
  const printer = new WebEscposPrinter()

  connectButton.onclick = () => printer.connect() // must be a real user click
  printButton.onclick = () =>
    printer.printReceipt({
      content: [
        { type: 'text', value: 'Hello world', align: 'center', bold: true },
        { type: 'qrcode', value: 'https://example.com' },
      ],
      cut: 'full',
    })
</script>
```

Pin a version for production (`@x.y.z` after the package name, e.g.
`web-escpos-printer@1.1.0`) instead of the unpinned URL above — it always
resolves to the latest release, which can break you without warning.

See [demo/index.html](demo/index.html) for a full working example, and
`docker compose up` (see [docker-compose.yml](docker-compose.yml)) to run
it locally at `http://localhost:3000/`.

## npm package usage

```sh
npm install web-escpos-printer
```

```ts
import WebEscposPrinter from 'web-escpos-printer'

const printer = new WebEscposPrinter()

async function onConnectClick() {
  const info = await printer.connect() // must be called from a click handler
}

async function onPrintClick() {
  await printer.printReceipt({
    content: [
      { type: 'image', source: logoDataUrl }, // base64, File, Blob, URL or HTMLImageElement
      { type: 'text', value: 'Test receipt' },
      { type: 'barcode', value: '123456789012', symbology: 'code128' },
    ],
  })
}
```

`require('web-escpos-printer')` (Vue 2, older webpack, plain Node
tooling) resolves to the same self-contained bundle as standalone above;
`import` gets the ESM build with `@point-of-sale/receipt-printer-encoder`
and `qz-tray` as externals instead. Full TypeScript declarations ship in
`build/types`.

## API

```ts
class WebEscposPrinter {
  static isSupported(): boolean         // Web Bluetooth support
  static isQzSupported(): boolean       // WebSocket support (not whether QZ Tray itself is running)
  static isSerialSupported(): boolean   // Web Serial support
  static isUsbSupported(): boolean      // WebUSB support

  constructor(config?: WebEscposPrinterConfigInput)

  onStatusChange(cb: (event: PrinterStatusEvent) => void): () => void

  connect(options?:
    | { transport?: 'bluetooth'; compat?: boolean; profile?: BluetoothPrinterProfile }
    | { transport: 'qz'; printerName?: string }
    | { transport: 'serial'; options?: SerialConnectOptions }
    | { transport: 'usb'; profile?: UsbPrinterProfile }
  ): Promise<PrinterInfo>
  listQzPrinters(query?: string): Promise<string[]>   // QZ Tray only — no native device picker, list then pick one
  reconnectSerial(previous: SerialPortIdentity, options?: SerialConnectOptions): Promise<PrinterInfo | null>   // no picker prompt
  reconnectUsb(previous: UsbDeviceIdentity, profile?: UsbPrinterProfile): Promise<PrinterInfo | null>          // no picker prompt
  disconnect(): Promise<void>
  isConnected(): boolean
  getPrinterInfo(): PrinterInfo | null

  printReceipt(job: PrintJob): Promise<void>
  printRaw(bytes: Uint8Array | number[]): Promise<void>

  renderPreview(job: PrintJob): Promise<PrintPreview>   // no printer/connection needed — real scannable barcodes/QR/PDF417
  static renderPreview(job: PrintJob, config?: WebEscposPrinterConfigInput): Promise<PrintPreview>
}
```

`PrintJob.content` is an ordered list of elements: `text`, `image`,
`barcode`, `qrcode`, `pdf417`, `newline`, `rule`. See
[src/types.ts](src/types.ts) for the full shape of each one. Errors arrive
as a rejected Promise with a `.code`:
`unsupported | user-gesture-required | connect-cancelled | connect-failed | not-connected | busy | print-failed`.

## Safe mode (compatibility fallback)

Some elements support `safeMode: true`: instead of sending the printer's
native ESC/POS command, the element is rendered using a safer fallback —
for printers whose firmware doesn't support the native one. A general
per-element pattern: `pdf417` (raster image), `qrcode` (raster image) and
`rule` (plain ASCII `-` line) have it today; other elements (e.g. `text`,
for printers with unreliable font/codepage support) may gain it later:

```ts
{ type: 'pdf417', value: '...', safeMode: true }
{ type: 'qrcode', value: '...', safeMode: true }
{ type: 'rule', safeMode: true }
```

Off by default — the native command/character is smaller (or, for `rule`,
just looks different — solid vs. dashed) and works fine on printers that
already support it. Confirmed cases: some clone Bluetooth printers
silently drop native PDF417
([docs/notes/09-clone-printers-lack-native-pdf417.md](docs/notes/09-clone-printers-lack-native-pdf417.md))
and mangle the native rule character into garbage
([docs/notes/10-clone-printers-mangle-rule-character.md](docs/notes/10-clone-printers-mangle-rule-character.md))
— both while an Epson prints the same bytes fine.

## Connecting

Default `connect()` restricts the Bluetooth device picker to recognized
printer profiles:

```ts
await printer.connect() // must be called from a real user click/tap
```

If your printer doesn't show up, use compatibility mode — the picker
lists every nearby device instead, matching the profile *after*
connecting (reaches more hardware, noisier picker):

```ts
await printer.connect({ compat: true })
```

### Manual Bluetooth profile

If your printer isn't in this library's built-in profile table at all
(or matches the wrong one), you don't need to fork/rebuild — pass your
own profile directly, skipping the built-in table entirely:

```ts
import type { BluetoothPrinterProfile } from 'web-escpos-printer'

const myProfile: BluetoothPrinterProfile = {
  filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
  service: '000018f0-0000-1000-8000-00805f9b34fb',
  characteristic: '00002af1-0000-1000-8000-00805f9b34fb',
  language: 'esc-pos',
  codepageMapping: 'default',
}

await printer.connect({ profile: myProfile })
// also works combined with compat mode:
await printer.connect({ profile: myProfile, compat: true })
```

Field meanings:

- `filters` — Web Bluetooth device-picker filters (same shape as
  `requestDevice({ filters })`), OR'd together. Restricts the picker in
  default mode; ignored (picker shows everything) in `compat: true` mode.
- `service` / `characteristic` — the GATT service and characteristic
  UUIDs to write ESC/POS bytes to. Find these with a BLE scanner app (e.g.
  nRF Connect, LightBlue) against the target printer. If in doubt about
  what you're looking at, cross-check against the
  [Bluetooth GATT services specification](https://www.bluetooth.com/specifications/gatt/services)
  — most clone printers use a vendor-specific (non-standard) service, but
  a scanner may also show standard GATT services you should ignore.
- `language` — `'esc-pos' | 'star-prnt' | 'star-line'`.
- `codepageMapping` — forwarded as-is to `ReceiptPrinterEncoder`; use
  `'default'` if unsure.
- `messageSize` / `sleepAfterCommand` — optional BLE write pacing (max
  bytes per chunk, delay between chunks) for printers that drop data
  under the default pacing. See
  [docs/notes/03-not-every-characteristic-supports-write-with-response.md](docs/notes/03-not-every-characteristic-supports-write-with-response.md)
  for background on why some printers need this at all.

### Web Serial (USB cable, recommended default)

For a printer plugged in by USB cable, `transport: 'serial'` talks to the
virtual COM port that cable exposes — the option confirmed to reliably
work across Windows, Linux and macOS with **no extra software installed**
(no QZ Tray, no driver juggling), including printers only paired over
Bluetooth (their SPP virtual COM port works the same way). Chromium-based
browsers only (Chrome/Edge desktop) — not Firefox or Safari.

```ts
const info = await printer.connect({ transport: 'serial' }) // must be a real user click/tap — shows the native port picker
```

The port picker shows every COM port (Web Serial has no vendor/product-id
filtering the way Bluetooth/WebUSB do — nothing to filter by upfront) —
except a port created by a vendor's own "virtual COM port" tool (e.g.
Epson's TM Virtual Port Assignment Tool), which doesn't appear in the
picker at all, even though Windows itself can use it fine
([docs/notes/12-vendor-virtual-com-drivers-not-listed.md](docs/notes/12-vendor-virtual-com-drivers-not-listed.md)) —
use QZ Tray below instead for those printers. Override the serial line
settings if your printer needs something other than the default 9600
baud / 8 data bits / 1 stop bit / no parity / no flow control:

```ts
await printer.connect({ transport: 'serial', options: { baudRate: 19200 } })
```

To skip the picker on a later visit (e.g. app reload), store `info.id`
(a `vendorId:productId` string) from the first `connect()` call, split it
back apart, and reconnect silently — no user gesture needed:

```ts
const info = await printer.reconnectSerial({ usbVendorId: 0x0483, usbProductId: 0x5740 })
if (!info) await printer.connect({ transport: 'serial' }) // nothing to silently reconnect to — show the picker
```

### WebUSB (USB cable, works only when nothing else has claimed the device)

`transport: 'usb'` talks directly to the printer's USB bulk endpoint — no
protocol translation, the cleanest transport where it works. Chromium-based
browsers only. **Not reliably available on any OS without extra setup**:
the moment another driver has already claimed the device (an OS printer
driver on Windows; the kernel's own `usblp` module, which auto-binds any
USB Printer-Class device on plug-in, on Linux), `claimInterface()` throws
outright with no code-level workaround — see
[docs/notes/11-webusb-blocked-by-kernel-driver-claims.md](docs/notes/11-webusb-blocked-by-kernel-driver-claims.md)
for the OS-level unbind steps. **Use Web Serial instead by default** —
confirmed reliable on the same hardware WebUSB was blocked on.

```ts
const info = await printer.connect({ transport: 'usb' }) // must be a real user click/tap
```

The device picker is restricted to a built-in table of known printer
vendor/product ids (`src/interfaces/usb/profiles.ts`). For a printer not in
that table, pass your own profile — same escape hatch as
`BluetoothPrinterProfile` above:

```ts
import type { UsbPrinterProfile } from 'web-escpos-printer'

const myProfile: UsbPrinterProfile = {
  filters: [{ vendorId: 0x0483, productId: 0x5743 }],
  configuration: 1,
  interface: 0,
  language: 'esc-pos',
  codepageMapping: 'default',
}

await printer.connect({ transport: 'usb', profile: myProfile })
```

`reconnectUsb()` mirrors `reconnectSerial()` — pass back `{ serialNumber,
vendorId, productId }` (whatever `getPrinterInfo()` reported) to silently
re-open a previously granted device with no picker prompt.

### QZ Tray (fallback, any OS-registered printer)

When neither direct transport above works for a printer (e.g. network
printers, or a Windows driver blocking both Serial and USB), connect
through [QZ Tray](https://qz.io) instead (install the desktop app, pair
your printer there first). QZ has no native device picker, so list
printers yourself and pick one:

```ts
const printerNames = await printer.listQzPrinters() // opens the QZ Tray session if needed
const info = await printer.connect({ transport: 'qz', printerName: printerNames[0] })
// omit printerName to fall back to QZ Tray's own default printer
```

QZ Tray shows its own permission popup per connect/print unless you
configure its certificate/signature plumbing yourself (not done by this
library — see [QZ Tray's docs](https://qz.io/wiki/2.0-signing-messages)).
Windows-only caveat:
[docs/notes/08-qz-windows-raw-driver-routing.md](docs/notes/08-qz-windows-raw-driver-routing.md).

## Config

Paper width, protocol and codepage can be set once at construction, or
per print job — a per-job value always overrides the constructor's:

```ts
const printer = new WebEscposPrinter({
  paperWidth: '80mm',       // '58mm' | '80mm' | '112mm' — shorthand for `columns` AND the image/barcode width ceiling
  language: 'star-prnt',    // 'esc-pos' | 'star-prnt' | 'star-line', default 'esc-pos'
  codepageMapping: 'xprinter', // for non-standard clone printers; forwarded as-is to ReceiptPrinterEncoder
  printerModel: 'epson-tm-t88vi', // lets ReceiptPrinterEncoder auto-configure known-model defaults
  feedBeforeCut: 4,          // blank lines fed before the physical cut, default 4
})

// or per job:
await printer.printReceipt({ paperWidth: '58mm', content: [...] })
```

`language`/`codepageMapping` a Bluetooth profile reports on `PrinterInfo`
is informational only — not applied to `printReceipt()` automatically. See
[docs/notes/02-paperwidth-scales-columns-and-imagemaxwidth.md](docs/notes/02-paperwidth-scales-columns-and-imagemaxwidth.md)
and
[docs/notes/04-feedbeforecut-defaults-to-zero.md](docs/notes/04-feedbeforecut-defaults-to-zero.md)
for why `paperWidth` and `feedBeforeCut` matter.

## Building from source

```sh
npm install
npm run build              # UMD + ESM + .d.ts (what gets published to npm)
npm run build:standalone   # only build/web-escpos-printer.js
npm run build:dev          # same as build, in watch mode
npm test                   # Vitest suite against the real encoder — see AGENTS.md's "Testing" section
```

## License

MIT

Note: the standalone UMD bundle (`build/web-escpos-printer.js`) statically
includes [`qz-tray`](https://www.npmjs.com/package/qz-tray), licensed
**LGPL-2.1** (every other bundled dependency is MIT). If you redistribute
that bundle, check LGPL-2.1's compliance requirements.
