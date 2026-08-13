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
export type { BluetoothPrinterProfile } from './src/interfaces/bluetooth/profiles'
export type { UsbPrinterProfile } from './src/interfaces/usb/profiles'
export type { SerialConnectOptions, SerialPortIdentity } from './src/interfaces/serial/SerialTransport'
export type { UsbDeviceIdentity } from './src/interfaces/usb/UsbTransport'
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
