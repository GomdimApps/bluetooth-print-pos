/**
 * Webpack entry point. This becomes the single global exposed in the UMD
 * build (`window.WebEscposPrinter` when loaded via <script>), ready to be
 * used directly from plain HTML/JS, with no Node and no bundler on the
 * consumer's side:
 *
 *   <script src="build/web-escpos-printer.js"></script>
 *   <script>
 *     const printer = new WebEscposPrinter()
 *     connectButton.onclick = () => printer.connect()
 *   </script>
 */
export { WebEscposPrinter as default } from './src/Printer/WebEscposPrinter'
export type { ConnectOptions } from './src/Printer/WebEscposPrinter'
export type {
  WebEscposPrinterConfig,
  WebEscposPrinterConfigInput,
  PrinterInfo,
  PrinterStatusEvent,
  PrinterStatusName,
  PrinterError,
  PrinterErrorCode,
  PrintJob,
  PrintJobElement,
  ImageSource,
  Alignment,
  PrinterLanguage,
  PaperWidth,
  PrintPreview,
} from './src/types'
