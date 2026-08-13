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
Bluetooth** or via the **[QZ Tray](https://qz.io)** desktop app (for
USB/OS-registered printers). Builds receipts (text, images, barcodes, QR
codes, PDF417) from a JSON-serializable object and sends them to the
printer — no ESC/POS knowledge needed. Runs **entirely in the browser, no
Node at runtime**.

![Real thermal print next to the matching browser preview and connection log](docs/images/test-mobile-printer.png)

*Left: real receipt off a Bluetooth thermal printer. Right: the same job
rendered by `renderPreview()` in the browser — no editing, actual
side-by-side test output.*

## Standalone usage (no dependencies)

For a plain HTML page or webview — no bundler, no `npm install`. The
published package ships a prebuilt, self-contained UMD bundle at
`build/web-escpos-printer.js` (~325KB, ~108KB gzipped):

```html
<script src="web-escpos-printer.js"></script>
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
  static isSupported(): boolean     // Web Bluetooth support
  static isQzSupported(): boolean   // WebSocket support (not whether QZ Tray itself is running)

  constructor(config?: WebEscposPrinterConfigInput)

  onStatusChange(cb: (event: PrinterStatusEvent) => void): () => void

  connect(options?: { transport?: 'bluetooth'; compat?: boolean } | { transport: 'qz'; printerName?: string }): Promise<PrinterInfo>
  listQzPrinters(query?: string): Promise<string[]>   // QZ Tray only — no native device picker, list then pick one
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

For USB or other OS-registered printers, connect through
[QZ Tray](https://qz.io) instead (install the desktop app, pair your
printer there first). QZ has no native device picker, so list printers
yourself and pick one:

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
```

## License

MIT

Note: the standalone UMD bundle (`build/web-escpos-printer.js`) statically
includes [`qz-tray`](https://www.npmjs.com/package/qz-tray), licensed
**LGPL-2.1** (every other bundled dependency is MIT). If you redistribute
that bundle, check LGPL-2.1's compliance requirements.
