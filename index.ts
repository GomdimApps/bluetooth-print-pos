/**
 * Webpack entry point. This becomes the single global exposed in the UMD
 * build (`window.PrinterWrapper` when loaded via <script>), ready to be
 * used directly from plain HTML/JS, with no Node and no bundler on the
 * consumer's side:
 *
 *   <script src="build/printer-wrapper.js"></script>
 *   <script>
 *     const printer = new PrinterWrapper()
 *     connectButton.onclick = () => printer.connect()
 *   </script>
 */
export { PrinterWrapper as default } from './src/Printer/PrinterWrapper'
export type { ConnectOptions } from './src/Printer/PrinterWrapper'
export type {
  PrinterWrapperConfig,
  PrinterWrapperConfigInput,
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
} from './src/types'
