/**
 * Public types of the wrapper. This file has no direct dependency on either
 * of the two printer libs — anyone talking to it from external HTML/JS only
 * needs to know what's declared here.
 */

export type PrinterLanguage = 'esc-pos' | 'star-prnt' | 'star-line'

export type Alignment = 'left' | 'center' | 'right'

export interface PrinterWrapperConfig {
  /** Number of text columns the printer has (used for line wrapping and the test receipt). */
  columns: number
  /** Protocol used to build the commands. The printer reports the real one on the connection event. */
  language: PrinterLanguage
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
}

export interface PrinterInfo {
  type: 'bluetooth'
  name: string
  id: string
  language: 'esc-pos' | 'star-prnt'
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
      align?: Alignment
      bold?: boolean
      underline?: boolean
      /** width, or [width, height] (1-8), same as the encoder's size(). */
      size?: number | [number, number]
    }
  | { type: 'newline'; lines?: number }
  | { type: 'rule' }
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
  | { type: 'qrcode'; value: string; align?: Alignment; size?: number }

export interface PrintJob {
  columns?: number
  language?: PrinterLanguage
  /** Paper cut at the end. `false` to skip cutting. Default: 'full'. */
  cut?: 'full' | 'partial' | false
  stripAccents?: boolean
  content: PrintJobElement[]
}
