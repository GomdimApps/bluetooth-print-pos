# web-escpos-printer

[github.com/GomdimApps/web-escpos-printer](https://github.com/GomdimApps/web-escpos-printer)

Born out of React Native/SPA/Laravel projects fighting printer-specific
setup for every 58mm/80mm thermal printer — idea by tech lead
[Sávio Godinho](https://github.com/saviogodinho2002).

A communication wrapper for thermal receipt printers, over **Web
Bluetooth**, **Web Serial** (USB cable, virtual COM port — reliable
cross-platform default), **WebUSB** (USB cable, direct — works only when
nothing else has claimed the device), or via the
**[QZ Tray](https://qz.io)** desktop app (any OS-registered printer).
Builds receipts (text, images, barcodes, QR codes, PDF417) from a
JSON-serializable object — no ESC/POS knowledge needed. **Entirely in the
browser, no Node at runtime.**

![Real thermal print next to the matching browser preview and connection log](docs/images/test-mobile-printer.png)

*Left: real receipt off a Bluetooth thermal printer. Right: the same job
rendered by `renderPreview()` in the browser.*

## Standalone usage (no dependencies)

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

Pin a version (`@x.y.z`) for production — an unpinned URL always resolves
to latest, which can break you without warning. See
[demo/index.html](demo/index.html) for a full example, and
`docker compose up` (see [docker-compose.yml](docker-compose.yml)) to run
it at `http://localhost:3000/`.

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

`require('web-escpos-printer')` resolves to the same self-contained UMD
bundle as standalone above; `import` gets the ESM build with
`@point-of-sale/receipt-printer-encoder`/`qz-tray` as externals instead.
TypeScript declarations ship in `build/types`.

## API

```ts
class WebEscposPrinter {
  static isSupported(): boolean         // Web Bluetooth support
  static isQzSupported(): boolean       // WebSocket support (not whether QZ Tray is running)
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
  listQzPrinters(query?: string): Promise<string[]>
  reconnectSerial(previous: SerialPortIdentity, options?: SerialConnectOptions): Promise<PrinterInfo | null>
  reconnectUsb(previous: UsbDeviceIdentity, profile?: UsbPrinterProfile): Promise<PrinterInfo | null>
  disconnect(): Promise<void>
  isConnected(): boolean
  getPrinterInfo(): PrinterInfo | null

  printReceipt(job: PrintJob): Promise<void>
  printRaw(bytes: Uint8Array | number[]): Promise<void>

  renderPreview(job: PrintJob): Promise<PrintPreview>   // no printer/connection needed
  static renderPreview(job: PrintJob, config?: WebEscposPrinterConfigInput): Promise<PrintPreview>
}
```

`PrintJob.content` elements: `text`, `image`, `barcode`, `qrcode`,
`pdf417`, `newline`, `rule` — see [src/types.ts](src/types.ts) for full
shapes. Errors reject with a `.code`: `unsupported | user-gesture-required
| connect-cancelled | connect-failed | not-connected | busy | print-failed`.

## Safe mode (compatibility fallback)

`safeMode: true` renders an element via a safer fallback instead of its
native ESC/POS command, for printers whose firmware mishandles the native
one:

```ts
{ type: 'pdf417', value: '...', safeMode: true }   // raster image
{ type: 'qrcode', value: '...', safeMode: true }   // raster image
{ type: 'rule', safeMode: true }                   // plain ASCII '-' line
```

Off by default. See
[docs/notes/09](docs/notes/09-clone-printers-lack-native-pdf417.md) /
[10](docs/notes/10-clone-printers-mangle-rule-character.md) for the
confirmed clone-printer cases behind this.

## Connecting

```ts
await printer.connect() // Bluetooth, restricted to known profiles — must be a real user click/tap
await printer.connect({ compat: true }) // printer not showing up? broader picker, matches after connecting
```

### Manual Bluetooth profile

Printer not in the built-in table (or matching the wrong one)? Pass your
own, no fork/rebuild needed:

```ts
import type { BluetoothPrinterProfile } from 'web-escpos-printer'

const myProfile: BluetoothPrinterProfile = {
  filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
  service: '000018f0-0000-1000-8000-00805f9b34fb',
  characteristic: '00002af1-0000-1000-8000-00805f9b34fb',
  language: 'esc-pos',       // 'esc-pos' | 'star-prnt' | 'star-line'
  codepageMapping: 'default', // forwarded as-is to ReceiptPrinterEncoder
  // messageSize/sleepAfterCommand: optional BLE write pacing for printers that drop data
}

await printer.connect({ profile: myProfile }) // combine with { compat: true } too
```

Find `service`/`characteristic` with a BLE scanner app (nRF Connect,
LightBlue) against the printer — most clones use a vendor-specific
service.

### Web Serial (USB cable, recommended default)

Reliable across Windows/Linux/macOS, no extra software. Chrome/Edge
desktop only.

```ts
const info = await printer.connect({ transport: 'serial' }) // shows the native port picker
await printer.connect({ transport: 'serial', options: { baudRate: 19200 } }) // default: 9600 8N1, no flow control

// skip the picker later — reconnect silently:
const info2 = await printer.reconnectSerial({ usbVendorId: 0x0483, usbProductId: 0x5740 })
if (!info2) await printer.connect({ transport: 'serial' })
```

A vendor's own "virtual COM port" tool (e.g. Epson's TM Virtual Port
Assignment Tool) may not appear in the picker at all — not a filter bug,
see [docs/notes/12](docs/notes/12-vendor-virtual-com-drivers-not-listed.md); use QZ Tray for those.

### WebUSB (USB cable, works only when nothing else has claimed the device)

Cleanest transport where it works, but not reliably available on any OS
without freeing the device from another driver first — see
[docs/notes/11](docs/notes/11-webusb-blocked-by-kernel-driver-claims.md).
**Prefer Web Serial by default.**

```ts
const info = await printer.connect({ transport: 'usb' }) // picker restricted to a known vendor/product-id table

// unlisted printer — same escape hatch as BluetoothPrinterProfile:
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

`reconnectUsb({ serialNumber, vendorId, productId }, profile?)` mirrors
`reconnectSerial()` for silent reconnect.

### QZ Tray (fallback, any OS-registered printer)

```ts
const printerNames = await printer.listQzPrinters() // opens the QZ Tray session if needed
const info = await printer.connect({ transport: 'qz', printerName: printerNames[0] })
```

Requires the QZ Tray desktop app installed and the printer paired there.
Shows its own permission popup per connect/print unless you configure its
certificate/signature plumbing yourself. Windows caveat:
[docs/notes/08](docs/notes/08-qz-windows-raw-driver-routing.md).

## Config

```ts
const printer = new WebEscposPrinter({
  paperWidth: '80mm',            // '58mm' | '80mm' | '112mm' — shorthand for columns + image/barcode width ceiling
  language: 'star-prnt',         // 'esc-pos' | 'star-prnt' | 'star-line', default 'esc-pos'
  codepageMapping: 'xprinter',   // for non-standard clone printers
  printerModel: 'epson-tm-t88vi',// lets ReceiptPrinterEncoder auto-configure known-model defaults
  feedBeforeCut: 4,              // blank lines fed before the cut, default 4
})

await printer.printReceipt({ paperWidth: '58mm', content: [...] }) // per-job overrides the constructor
```

See [docs/notes/02](docs/notes/02-paperwidth-scales-columns-and-imagemaxwidth.md)
/ [04](docs/notes/04-feedbeforecut-defaults-to-zero.md) for why
`paperWidth`/`feedBeforeCut` matter.

## Building from source

```sh
npm install
npm run build              # UMD + ESM + .d.ts (what gets published to npm)
npm run build:standalone   # only build/web-escpos-printer.js
npm run build:dev          # same as build, in watch mode
npm test                   # Vitest suite against the real encoder — see AGENTS.md's "Testing" section
```

## License

MIT. The standalone UMD bundle statically includes
[`qz-tray`](https://www.npmjs.com/package/qz-tray), licensed
**LGPL-2.1** (everything else bundled is MIT) — check LGPL-2.1's
compliance requirements if you redistribute that bundle.
