# bluetooth-print-pos

A communication wrapper for thermal receipt printers over **Web Bluetooth**.
Builds receipts (text, images, barcodes, QR codes) from a JSON-serializable
object and sends them to the printer — the caller never needs to know
anything about ESC/POS encoding.

It wraps two libraries from the [@point-of-sale](https://point-of-sale.dev)
ecosystem:
[`receipt-printer-encoder`](https://github.com/NielsLeenheer/ReceiptPrinterEncoder)
(builds the commands) and
[`webbluetooth-receipt-printer`](https://github.com/NielsLeenheer/WebBluetoothReceiptPrinter)
(talks to the printer over Web Bluetooth).

Runs **entirely in the browser, with no Node at runtime** — Node is only
used at build time to produce the artifacts.

There are two ways to use it, covered in detail below:

- **[Standalone](#standalone-usage-no-dependencies)** — a single self-contained `<script>` file, zero install, zero dependencies for the consumer.
- **[As an npm package](#npm-package-usage)** — installed into a bundler-based project (Vite, webpack, Vue, etc.), with full TypeScript types.

## Standalone usage (no dependencies)

This is for a plain HTML page or a webview: no bundler, no `npm install`,
no build step at all on the consuming side. The published package already
ships a prebuilt, self-contained UMD bundle at
`build/printer-wrapper.js` — it bundles `@point-of-sale/receipt-printer-encoder`
and `@point-of-sale/webbluetooth-receipt-printer` internally, so **you don't
need to install or reference those two libraries yourself**.

Grab that one file — either from
`node_modules/bluetooth-print-pos/build/printer-wrapper.js` after
`npm install bluetooth-print-pos` (just to extract the file, no `import`
needed), from a CDN pointed at the npm package (e.g.
`https://unpkg.com/bluetooth-print-pos/build/printer-wrapper.js`), or built
from source with `npm run build:standalone` — and drop it into a
`<script>` tag:

```html
<script src="printer-wrapper.js"></script>
<script>
  const printer = new PrinterWrapper()

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

See [demo/index.html](demo/index.html) for a complete working example
(connect, print text, print an image, test print), and
[docker-compose.yml](docker-compose.yml) to run that demo locally behind
nginx on port 3000:

```sh
docker compose up
# open http://localhost:3000/
```

## npm package usage

```sh
npm install bluetooth-print-pos
```

```ts
import PrinterWrapper from 'bluetooth-print-pos'

const printer = new PrinterWrapper()

async function onConnectClick() {
  const info = await printer.connect() // must be called from a click handler
  console.log(`Connected to ${info.name}`)
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

The published ESM build treats `@point-of-sale/receipt-printer-encoder` and
`@point-of-sale/webbluetooth-receipt-printer` as externals rather than
bundling them, so they come along as regular npm `dependencies` and your
own bundler (Vite/webpack) resolves and dedupes them normally. Full
TypeScript declarations (`PrintJob`, `PrintJobElement`, `PrinterStatusEvent`,
etc.) ship in `build/types` — the `import` above already gives you
autocomplete.

### `require()` usage — same self-contained bundle as standalone

If your project uses `require()` instead of `import` — a Vue 2 app, an
older webpack config, or plain Node-based tooling — `bluetooth-print-pos`
resolves to the **same self-contained bundle as the
[standalone](#standalone-usage-no-dependencies) `<script>` version**, not
the ESM one. `@point-of-sale/receipt-printer-encoder` and
`@point-of-sale/webbluetooth-receipt-printer` are already bundled in, so you
don't need them as separate dependencies on this path either.

```js
const PrinterWrapper = require('bluetooth-print-pos')

const printer = new PrinterWrapper()
```

Everything else — `connect()`, `printReceipt()`, image handling, etc. —
works exactly like the example above.

This works because the package's `exports` map routes the `require`
condition to `build/printer-wrapper.js` (UMD, self-contained) while
`import` routes to `build/printer-wrapper.esm.js` (externals) — same
library, two different bundles depending on how you pull it in.

## API

```ts
class PrinterWrapper {
  static isSupported(): boolean

  constructor(config?: PrinterWrapperConfigInput)

  onStatusChange(cb: (event: PrinterStatusEvent) => void): () => void

  connect(options?: { compat?: boolean }): Promise<PrinterInfo>     // must be called from a user click
  disconnect(): Promise<void>
  isConnected(): boolean
  getPrinterInfo(): PrinterInfo | null

  printReceipt(job: PrintJob): Promise<void>
  printRaw(bytes: Uint8Array | number[]): Promise<void>
}
```

`PrintJob.content` is an ordered list of elements: `text`, `image`,
`barcode`, `qrcode`, `newline`, `rule`. See [src/types.ts](src/types.ts)
for the full shape of each one.

Errors arrive as a rejected Promise with a `.code`:
`unsupported | user-gesture-required | connect-cancelled | connect-failed | not-connected | busy | print-failed`.

### Printer type and paper size

Paper width, protocol and codepage can all be injected — either once at
construction time, or per print job (a per-job value always overrides the
constructor's):

```ts
const printer = new PrinterWrapper({
  paperWidth: '80mm',       // '58mm' | '80mm' | '112mm' — shorthand for `columns`, ignored if `columns` is also set
  language: 'star-prnt',    // 'esc-pos' | 'star-prnt' | 'star-line', default 'esc-pos'
  codepageMapping: 'xprinter', // for non-standard clone printers; forwarded as-is to ReceiptPrinterEncoder
  printerModel: 'epson-tm-t88vi', // lets ReceiptPrinterEncoder auto-configure known-model defaults
})

// or per job:
await printer.printReceipt({ paperWidth: '58mm', content: [...] })
```

Note this is independent from `connect()`/`connect({ compat: true })`: the
`language`/`codepageMapping` a Bluetooth profile reports on `PrinterInfo`
after connecting is informational only — it isn't applied to
`printReceipt()` automatically, so set it explicitly if you need it.

### Compatibility mode

`connect()` normally restricts the Bluetooth device picker to a small set
of recognized printer profiles, so unrecognized models sometimes never show
up as an option at all. Pass `{ compat: true }` to widen it: the picker
lists every nearby Bluetooth device, and the printer profile is matched
*after* connecting instead.

```ts
await printer.connect({ compat: true })
```

Try this when a printer doesn't show up, or doesn't connect, with the plain
`connect()`. It reaches more hardware (including generic FF00-profile and
PrinterBT/innoPrint-based printers) at the cost of a noisier device picker.

## Building from source

```sh
npm install
npm run build              # builds everything: UMD + ESM + .d.ts (what gets published to npm)
npm run build:standalone   # builds only build/printer-wrapper.js (the standalone UMD bundle)
npm run build:dev          # same as `build`, in watch mode
```

## License

MIT
