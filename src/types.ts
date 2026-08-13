/**
 * Public types of the wrapper. This file has no direct dependency on either
 * of the two printer libs — anyone talking to it from external HTML/JS only
 * needs to know what's declared here.
 */

export type PrinterLanguage = 'esc-pos' | 'star-prnt' | 'star-line'

/** Friendly paper-size shorthand, translated into `columns`/`imageMaxWidth`. See config.ts's PAPER_WIDTH_SPECS. */
export type PaperWidth = '58mm' | '80mm' | '112mm'

export type Alignment = 'left' | 'center' | 'right'

/** Text-only: stretches each line (except a paragraph's last) to fill the full column width. */
export type TextAlignment = Alignment | 'justify'

export interface WebEscposPrinterConfig {
  /** Number of text columns the printer has (used for line wrapping and the test receipt). */
  columns: number
  /** Protocol used to build the commands. The printer reports the real one on the connection event. */
  language: PrinterLanguage
  /** Codepage table of the target printer/clone (e.g. 'epson', 'star', 'zjiang', 'xprinter'). Passed straight through to ReceiptPrinterEncoder. */
  codepageMapping?: unknown
  /** Known printer model (e.g. 'epson-tm-t88vi') so ReceiptPrinterEncoder can auto-configure sensible defaults for it. */
  printerModel?: string
  /** Default threshold (0-255) for image dithering. */
  imageThreshold: number
  /** Maximum width, in pixels, to resize images to before printing. */
  imageMaxWidth: number
  /** Minimum width, in pixels. */
  imageMinWidth: number
  /** Minimum height, in pixels. */
  imageMinHeight: number
  /** Strips accents from text before printing (thermal printers usually only have reliable ASCII). */
  stripAccents: boolean
  /** Blank lines fed before the physical cut command, so the cutter doesn't slice through the last printed content. See config.ts's DEFAULT_CONFIG. */
  feedBeforeCut: number
}

/**
 * Constructor input for WebEscposPrinter: same as WebEscposPrinterConfig, plus
 * `paperWidth` as a convenience alternative to `columns`. `paperWidth` is
 * never stored on the resolved config — it's translated into `columns`
 * immediately by config.ts's resolveConfig()/resolveColumns().
 */
export type WebEscposPrinterConfigInput = Partial<WebEscposPrinterConfig> & { paperWidth?: PaperWidth }

export interface PrinterInfo {
  type: 'bluetooth' | 'qz'
  name: string
  /** For type: 'qz', this is just the QZ printer name — QZ has no separate device id the way Bluetooth's device.id does. */
  id: string
  language: 'esc-pos' | 'star-prnt' | 'star-line'
  codepageMapping?: unknown
}

export type PrinterStatusName =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'printing'
  | 'disconnected'
  | 'error'

export type PrinterErrorCode =
  | 'unsupported'
  | 'user-gesture-required'
  | 'connect-cancelled'
  | 'connect-failed'
  | 'not-connected'
  | 'busy'
  | 'print-failed'

export interface PrinterError {
  code: PrinterErrorCode
  message: string
}

export interface PrinterStatusEvent {
  status: PrinterStatusName
  info?: PrinterInfo | null
  error?: PrinterError | null
}

/**
 * Source of an image to be printed. Accepted formats, in the recommended
 * order for plain HTML/JS usage:
 *  - base64 dataURL (e.g. "data:image/png;base64,...") — never hits CORS
 *  - File/Blob (e.g. from <input type="file">) — more efficient than base64
 *  - remote http(s) URL — the server needs to allow CORS
 *  - HTMLImageElement already present on the page
 */
export type ImageSource = string | HTMLImageElement | File | Blob

export type PrintJobElement =
  | {
      type: 'text'
      value: string
      align?: TextAlignment
      bold?: boolean
      underline?: boolean
      /** width, or [width, height] (1-8), same as the encoder's size(). */
      size?: number | [number, number]
    }
  | { type: 'newline'; lines?: number }
  | {
      type: 'rule'
      /**
       * Prints a plain ASCII `-` line instead of the encoder's native rule
       * character (a cp437 box-drawing glyph some clone printers' font
       * tables don't match, printing garbage instead). Default false.
       */
      safeMode?: boolean
    }
  | {
      type: 'image'
      source: ImageSource
      align?: Alignment
      maxWidth?: number
      minWidth?: number
      minHeight?: number
      threshold?: number
    }
  | {
      type: 'barcode'
      value: string
      /** Default: 'code128'. */
      symbology?: string
      height?: number
      width?: number
      align?: Alignment
    }
  | {
      type: 'qrcode'
      value: string
      align?: Alignment
      size?: number
      /**
       * Prints this element as a raster image instead of its native ESC/POS
       * command — see `safeMode` on the `pdf417` variant above for the
       * general explanation. Default false.
       */
      safeMode?: boolean
    }
  | {
      type: 'pdf417'
      value: string
      align?: Alignment
      /** 0 (auto) or 1-30. */
      columns?: number
      /** 0 (auto) or 3-90. */
      rows?: number
      /** Module width ratio, 2-8. */
      width?: number
      /** Module height ratio, 2-8. */
      height?: number
      /** Error correction level, 0-8. */
      errorlevel?: number
      /** Truncated PDF417 (fewer bars per row, no right row-indicator/stop pattern) instead of standard. Default false. */
      truncated?: boolean
      /**
       * Prints this element as a raster image (the same renderer
       * renderPreview() uses) instead of its native ESC/POS command — a
       * general compatibility fallback for printers that don't support
       * that command. Default false. `pdf417` has it today (some
       * cheap/clone printers don't implement the PDF417 command at all);
       * other element types (e.g. `text`, for printers with unreliable
       * font/codepage support) may gain the same flag later.
       */
      safeMode?: boolean
    }

export interface PrintJob {
  columns?: number
  /** Convenience alternative to `columns` — see PaperWidth. `columns` wins if both are given. */
  paperWidth?: PaperWidth
  language?: PrinterLanguage
  codepageMapping?: unknown
  printerModel?: string
  /** Paper cut at the end. `false` to skip cutting. Default: 'full'. */
  cut?: 'full' | 'partial' | false
  /** Blank lines fed before the cut. See WebEscposPrinterConfig.feedBeforeCut. */
  feedBeforeCut?: number
  stripAccents?: boolean
  content: PrintJobElement[]
}

/**
 * Result of renderPreview(): a canvas simulating exactly what a PrintJob
 * would look like on paper — same column wrapping, same image resize +
 * dithering, real scannable barcode/QR — built without ever touching a
 * printer. `dataUrl` drops straight into an <img src>, in plain HTML,
 * React (`<img src={preview.dataUrl} />`) or Vue (`:src="preview.dataUrl"`).
 */
export interface PrintPreview {
  canvas: HTMLCanvasElement
  dataUrl: string
  width: number
  height: number
}
