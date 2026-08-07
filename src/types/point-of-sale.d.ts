/**
 * Ambient declarations for the two @point-of-sale libs used by the wrapper.
 * Neither one ships types (nor a @types package), so this file only covers
 * what this project actually uses — confirmed by reading the bundle
 * installed at node_modules/@point-of-sale/*\/dist and each lib's README.
 * It is not a complete typing of their APIs.
 */

declare module '@point-of-sale/receipt-printer-encoder' {
  export interface ReceiptPrinterEncoderOptions {
    printerModel?: string
    language?: 'esc-pos' | 'star-prnt' | 'star-line'
    columns?: number
    feedBeforeCut?: number
    newline?: string
    imageMode?: 'column' | 'raster'
    codepageMapping?: unknown
  }

  export interface RuleOptions {
    style?: 'single' | 'double'
    width?: number
  }

  export interface BarcodeOptions {
    height?: number
    width?: number
    text?: boolean
  }

  export interface QrcodeOptions {
    model?: number
    size?: number
    errorlevel?: 'l' | 'm' | 'q' | 'h'
  }

  export default class ReceiptPrinterEncoder {
    constructor(options?: ReceiptPrinterEncoderOptions)

    initialize(): this
    codepage(page: string | 'auto'): this

    text(content: string): this
    line(content: string): this
    newline(count?: number): this

    bold(state?: boolean): this
    underline(state?: boolean): this
    italic(state?: boolean): this
    invert(state?: boolean): this
    align(position: 'left' | 'center' | 'right'): this
    font(name: string): this
    size(width: number, height?: number): this

    rule(options?: RuleOptions): this
    barcode(value: string, symbology: string, options?: BarcodeOptions): this
    qrcode(data: string, options?: QrcodeOptions): this
    /** width/height must be multiples of 8. `source` accepts HTMLImageElement, canvas or ImageData. */
    image(
      source: CanvasImageSource | ImageData,
      width: number,
      height: number,
      dithering?: 'threshold' | 'bayer' | 'floydsteinberg' | 'atkinson',
      threshold?: number,
    ): this

    pulse(device?: number, duration?: number, delay?: number): this
    cut(type?: 'partial' | 'full'): this
    raw(bytes: number[] | Uint8Array): this

    encode(): Uint8Array
  }
}

declare module '@point-of-sale/webbluetooth-receipt-printer' {
  export interface BluetoothPrinterInfo {
    type: 'bluetooth'
    name: string
    id: string
    language: 'esc-pos' | 'star-prnt'
    codepageMapping?: unknown
  }

  export default class WebBluetoothReceiptPrinter extends EventTarget {
    /** Must be called from a user gesture (e.g. onclick). */
    connect(): Promise<void>
    reconnect(device: { id: string }): Promise<void>
    print(data: Uint8Array | number[]): Promise<void>
    disconnect(): Promise<void>
    addEventListener(
      type: 'connected',
      listener: (event: CustomEvent<BluetoothPrinterInfo> & BluetoothPrinterInfo) => void,
    ): void
    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void
  }
}
