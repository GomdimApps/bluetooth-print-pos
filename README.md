# bluetooth-print-pos

A communication wrapper for thermal receipt printers, over **Web
Bluetooth** or via the **[QZ Tray](https://qz.io)** desktop app (for
USB/OS-registered printers). Builds receipts (text, images, barcodes, QR
codes, PDF417) from a JSON-serializable object and sends them to the
printer — no ESC/POS knowledge needed.

Wraps [`receipt-printer-encoder`](https://github.com/NielsLeenheer/ReceiptPrinterEncoder)
(the [@point-of-sale](https://point-of-sale.dev) ecosystem) to build ESC/POS
commands. Web Bluetooth connectivity — device discovery, profile matching,
chunked writes — is this project's own code (ported from
[`WebBluetoothReceiptPrinter`](https://github.com/NielsLeenheer/WebBluetoothReceiptPrinter),
see [src/interfaces/bluetooth/](src/interfaces/bluetooth/)), not an external
dependency. QZ Tray connectivity uses the official
[`qz-tray`](https://www.npmjs.com/package/qz-tray) client library (see
[src/interfaces/qz/](src/interfaces/qz/)) to talk to the QZ Tray desktop
app, which the user installs and pairs with their printer(s) separately —
this project just hands it the same ESC/POS bytes it builds for Bluetooth.

Runs **entirely in the browser, no Node at runtime** (Node is only used to
build the artifacts). Includes a [print preview](#print-preview) that
renders exactly what would be printed — text, images, barcodes, QR codes,
PDF417 — as an image, with no printer needed.

![Real thermal print next to the matching browser preview and connection log](docs/images/test-mobile-printer.png)

*Left: real receipt off a Bluetooth thermal printer. Right: the same job
rendered by [`renderPreview()`](#print-preview) in the browser, with the
connection/print log underneath — no editing, actual side-by-side test
output.*

Two ways to use it:

- **[Standalone](#standalone-usage-no-dependencies)** — a single self-contained `<script>` file, zero install, zero dependencies.
- **[As an npm package](#npm-package-usage)** — bundler-based project (Vite, webpack, Vue, etc.), with full TypeScript types.

## Standalone usage (no dependencies)

For a plain HTML page or webview: no bundler, no `npm install`, no build
step. The published package ships a prebuilt, self-contained UMD bundle at
`build/printer-wrapper.js` (~325KB, ~108KB gzipped) — bundles
`@point-of-sale/receipt-printer-encoder`, `qz-tray`, and this project's own
Bluetooth code internally, so **you don't need to install or reference
anything else**.

Grab that one file — from
`node_modules/bluetooth-print-pos/build/printer-wrapper.js` after
`npm install bluetooth-print-pos` (just to extract it, no `import` needed),
from a CDN (e.g. `https://unpkg.com/bluetooth-print-pos/build/printer-wrapper.js`),
or built with `npm run build:standalone` — and drop it into a `<script>`
tag:

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
(connect, print text/image, test print), and
[docker-compose.yml](docker-compose.yml) to run it locally behind nginx on
port 3000:

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
`qz-tray` as externals rather than bundling them, coming in as regular npm
`dependencies` your own bundler resolves/dedupes normally — `npm install`
pulls `qz-tray` in as a transitive dependency either way. Bluetooth
connectivity is this project's own source, always bundled. Full TypeScript
declarations (`PrintJob`, `PrintJobElement`, `PrinterStatusEvent`, etc.)
ship in `build/types` — the `import` above already gives autocomplete.

### `require()` usage — same self-contained bundle as standalone

If your project uses `require()` instead of `import` — Vue 2, an older
webpack config, plain Node tooling — `bluetooth-print-pos` resolves to the
**same self-contained bundle as [standalone](#standalone-usage-no-dependencies)**,
not the ESM one. `@point-of-sale/receipt-printer-encoder` is already
bundled in, so no separate dependency needed here either.

```js
const PrinterWrapper = require('bluetooth-print-pos')

const printer = new PrinterWrapper()
```

Everything else works exactly like the example above.

This works because `package.json#exports` routes `require` to
`build/printer-wrapper.js` (UMD, self-contained) and `import` to
`build/printer-wrapper.esm.js` (externals) — same library, two bundles
depending on how you pull it in.

## API

```ts
class PrinterWrapper {
  static isSupported(): boolean     // Web Bluetooth support
  static isQzSupported(): boolean   // WebSocket support (not whether QZ Tray itself is running — only connect() can tell you that)

  constructor(config?: PrinterWrapperConfigInput)

  onStatusChange(cb: (event: PrinterStatusEvent) => void): () => void

  connect(options?: { transport?: 'bluetooth'; compat?: boolean } | { transport: 'qz'; printerName?: string }): Promise<PrinterInfo>
  // Bluetooth (default) must be called from a user click. QZ Tray has no native device
  // picker — use listQzPrinters() first to get a printerName.
  listQzPrinters(query?: string): Promise<string[]>   // QZ Tray only — opens the QZ session if needed
  disconnect(): Promise<void>
  isConnected(): boolean
  getPrinterInfo(): PrinterInfo | null

  printReceipt(job: PrintJob): Promise<void>
  printRaw(bytes: Uint8Array | number[]): Promise<void>

  renderPreview(job: PrintJob): Promise<PrintPreview>                              // no printer/connection needed
  static renderPreview(job: PrintJob, config?: PrinterWrapperConfigInput): Promise<PrintPreview>
}
```

`PrintJob.content` is an ordered list of elements: `text`, `image`,
`barcode`, `qrcode`, `pdf417`, `newline`, `rule`. See
[src/types.ts](src/types.ts) for the full shape of each one.

Errors arrive as a rejected Promise with a `.code`:
`unsupported | user-gesture-required | connect-cancelled | connect-failed | not-connected | busy | print-failed`.

### Text alignment, including justify

A `text` element's `align` accepts `'left' | 'center' | 'right' | 'justify'`
(the other elements — `image`/`barcode`/`qrcode`/`pdf417` — only take the
first three, alignment doesn't apply to `'justify'` there):

```ts
{ type: 'text', value: 'Lorem ipsum dolor sit amet...', align: 'justify' }
```

`'justify'` stretches every line to the full paper width by distributing
extra spaces between words — except a paragraph's last line, left ragged
(standard word-processor convention). A word too long for its own line is
hyphenated (`-`) at the break instead of being cut silently.

Alignment doesn't rely on the printer's own ESC/POS align command — cheap
clones often don't honor it for plain text. Instead every line is
padded/justified into an exact-width string and sent as raw bytes, so it's
correct on any hardware.

### Printer type and paper size

Paper width, protocol and codepage can all be injected — either once at
construction time, or per print job (a per-job value always overrides the
constructor's):

```ts
const printer = new PrinterWrapper({
  paperWidth: '80mm',       // '58mm' | '80mm' | '112mm' — shorthand for `columns` AND the image/barcode width ceiling
  language: 'star-prnt',    // 'esc-pos' | 'star-prnt' | 'star-line', default 'esc-pos'
  codepageMapping: 'xprinter', // for non-standard clone printers; forwarded as-is to ReceiptPrinterEncoder
  printerModel: 'epson-tm-t88vi', // lets ReceiptPrinterEncoder auto-configure known-model defaults
  feedBeforeCut: 4,          // blank lines fed before the physical cut, default 4 — see below
})

// or per job:
await printer.printReceipt({ paperWidth: '58mm', content: [...] })
```

Independent from `connect()`/`connect({ compat: true })`: the
`language`/`codepageMapping` a Bluetooth profile reports on `PrinterInfo`
is informational only — not applied to `printReceipt()` automatically, so
set it explicitly if needed.

**`feedBeforeCut`**: the physical cutter sits below the print head, so a
few blank lines must feed through before cutting — otherwise the blade
fires too close and slices through the last content (worse for tall
elements like PDF417 than a text line). Default `4` matches the most
common value across known printer models; raise it (e.g.
`feedBeforeCut: 6`) if content still gets clipped on your hardware. A
recognized `printerModel` overrides this automatically.

### Compatibility mode

`connect()` normally restricts the Bluetooth device picker to recognized
printer profiles, so unrecognized models sometimes never show up. Pass
`{ compat: true }` to widen it: the picker lists every nearby device, and
the profile is matched *after* connecting.

```ts
await printer.connect({ compat: true })
```

Try this when a printer doesn't show up or connect with plain `connect()`.
Reaches more hardware (generic FF00-profile, PrinterBT/innoPrint-based
printers) at the cost of a noisier picker.

### QZ Tray transport (USB and other OS-registered printers)

If Web Bluetooth isn't an option — USB-only printer, or no Bluetooth
support — connect through [QZ Tray](https://qz.io) instead. Install the
desktop app once, pair your printer(s) directly; this library hands it the
same ESC/POS bytes over its local websocket API.

QZ has no native OS device picker like Web Bluetooth — list printers
yourself and pick one:

```ts
const printerNames = await printer.listQzPrinters() // opens the QZ Tray session if needed
const info = await printer.connect({ transport: 'qz', printerName: printerNames[0] })
console.log(`Connected (QZ) to ${info.name}`)

await printer.printReceipt({ content: [{ type: 'text', value: 'Hello from QZ Tray' }] })
```

Omit `printerName` to fall back to QZ Tray's own default printer:

```ts
await printer.connect({ transport: 'qz' })
```

**Unsigned/demo mode only**: this library doesn't configure QZ Tray's
certificate/signature plumbing (`setCertificatePromise`/
`setSignaturePromise`) — that needs a private-key signing operation only
your own backend can do. Without it, QZ Tray shows its own permission
popup on each connect/print instead of printing silently — see
[QZ Tray's docs](https://qz.io/wiki/2.0-signing-messages) for
signed/silent printing.

## Print preview

`renderPreview(job)` renders a `PrintJob` to a canvas that simulates
*exactly* what would print — same text wrapping, same image
resize+dithering (byte-identical, via the same `canvas-dither` the encoder
uses), real scannable Code128/ITF barcodes, QR codes and PDF417 — no
printer, no connection, no Web Bluetooth support even needed. Use it to
catch layout/content mistakes (cut-off text, distorted images, wrong paper
width, bad barcode data) before touching hardware.

```ts
const preview = await printer.renderPreview(job)
// preview: { canvas: HTMLCanvasElement, dataUrl: string, width: number, height: number }
```

Also available as a static method, so it works with zero setup — no
instance, no connection:

```ts
const preview = await PrinterWrapper.renderPreview(job, { paperWidth: '80mm' })
```

`preview.dataUrl` is a `data:image/png` string — drop it straight into an
`<img>`, in plain HTML, React or Vue:

```html
<!-- plain HTML -->
<img id="previewImg" />
<script>
  const preview = await printer.renderPreview(job)
  document.getElementById('previewImg').src = preview.dataUrl
</script>
```

```jsx
// React
const [preview, setPreview] = useState(null)
useEffect(() => { printer.renderPreview(job).then(setPreview) }, [job])
return preview && <img src={preview.dataUrl} alt="Receipt preview" />
```

```vue
<!-- Vue -->
<img v-if="preview" :src="preview.dataUrl" />
```
```ts
const preview = ref(null)
onMounted(async () => { preview.value = await printer.renderPreview(job) })
```

**Scope note**: real barcode rendering covers `symbology: 'code128'`
(default) and `'itf'`/`'interleaved-2-of-5'` (boleto-style numeric codes) —
other symbologies render as a labeled placeholder box, since every ESC/POS
symbology was out of scope for this pass. `pdf417` (a separate element
type, not a `barcode` symbology) always renders a real, scannable 2D
symbol via `@bwip-js/browser`:

```ts
{ type: 'pdf417', value: 'anything, not just numbers', truncated: false }
```

`truncated: true` produces the truncated variant — fewer bars per row, no
right-side row-indicator columns or stop pattern, useful when paper width
is tight. `columns`/`rows`/`errorlevel` tune shape and error-correction
level; see [src/types.ts](src/types.ts) for the full list.

**Preview vs. real print shape**: when `columns` isn't set, the real
print's PDF417 layout is chosen by the printer's firmware, the preview's
by `@bwip-js/browser` — two independent implementations that can pick
different (but equally valid, scannable) grid shapes for the same data. To
keep them matching, this library picks a paper-width-appropriate default
`columns` (`3`/`7`/`12` for `58mm`/`80mm`/`112mm`) identically on both
sides, falling back to fully automatic sizing for values too large to fit.
An explicit `columns` always overrides this. The preview also matches the
real encoder's default `errorlevel` (`1`) — bwip-js's own unset default is
a different, higher level that otherwise renders a taller symbol for
identical data/`columns`.

**"Too wide" warning**: some codes — a 44-digit boleto barcode is the
classic case — are physically wider than the paper, and a real printer
just prints `wide error!` instead. The preview shows this ahead of time:
draws the barcode at real size (clipped by the canvas edge, as it'd be cut
off in reality) with a red outline and a message to reduce `width` or
widen `paperWidth`. Advisory only — `printReceipt()` always attempts the
print regardless, since the real limit depends on the specific hardware,
not just configured paper width.

## Building from source

```sh
npm install
npm run build              # builds everything: UMD + ESM + .d.ts (what gets published to npm)
npm run build:standalone   # builds only build/printer-wrapper.js (the standalone UMD bundle)
npm run build:dev          # same as `build`, in watch mode
```

## License

MIT

Note: the standalone UMD bundle (`build/printer-wrapper.js`) statically
includes [`qz-tray`](https://www.npmjs.com/package/qz-tray), licensed
**LGPL-2.1** (every other bundled dependency is MIT). If you redistribute
that bundle, check LGPL-2.1's compliance requirements.
