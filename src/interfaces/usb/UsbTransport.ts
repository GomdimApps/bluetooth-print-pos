import type { PrinterInfo } from '../../types'
import type { PrinterTransport } from '../PrinterTransport'
import { normalizeConnectError, normalizeOpenError, normalizePrintError, toPrinterError } from '../printerErrors'
import { ALL_FILTERS, evaluate, findUsbProfile, type UsbPrinterProfile } from './profiles'

/** true if this browser exposes the WebUSB API. Never throws. */
export function isUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator
}

/** Identifies a previously granted device for reconnect() — see USBDevice. */
export interface UsbDeviceIdentity {
  serialNumber?: string | null
  vendorId: number
  productId: number
}

/**
 * Talks directly to a printer's USB bulk endpoint (WebUSB), instead of Web
 * Bluetooth, QZ Tray, or Web Serial. The cleanest transport where it works
 * — no protocol translation, no virtual port — but **not reliably
 * available on any OS without extra setup**: the moment another driver has
 * already claimed the device, `claimInterface()` throws outright with no
 * code-level fix — confirmed on real hardware happening on both Windows
 * (an OS printer driver) and Linux (the kernel's own `usblp` module,
 * which auto-binds any USB Printer-Class device on plug-in, or a missing
 * udev permission rule). Use ../serial/SerialTransport.ts instead by
 * default — confirmed reliable across OSes with no such setup needed. See
 * AGENTS.md gotcha #11.
 *
 * Ported independently from reading
 * github.com/NielsLeenheer/WebUSBReceiptPrinter's `main.js` (read in full
 * from its `master` branch) — same open sequence (`open()` ->
 * `selectConfiguration()` -> `claimInterface()` -> find the active alternate
 * setting's `direction: 'out'` endpoint -> `device.reset()`) and the same
 * choice of **no write chunking** (a single `transferOut()` per `print()`
 * call) — this project no longer depends on that npm package, this file
 * replaces it, with its own vendor/product-id profile table (./profiles.ts)
 * instead of that package's. Unlike that reference, there's no background
 * IN-endpoint read loop/`data` event here: nothing in this project parses
 * printer status responses today (same scope limit as the Bluetooth
 * transports).
 */
export class UsbTransport implements PrinterTransport {
  private device: USBDevice | null = null
  private endpoint: number | null = null
  private info: PrinterInfo | null = null

  getInfo(): PrinterInfo | null {
    return this.info
  }

  /**
   * Shows the native device picker (must be called from a user gesture),
   * restricted to `profiles.ts`'s known vendor/product ids unless
   * `manualProfile` is given — see UsbPrinterProfile (./profiles.ts) for
   * the full field shape, same escape-hatch pattern as Bluetooth's manual
   * profile (README's "Manual Bluetooth profile" section, works
   * identically here).
   */
  async connect(manualProfile?: UsbPrinterProfile): Promise<PrinterInfo> {
    if (!isUsbSupported()) {
      throw toPrinterError('unsupported', 'This browser does not support WebUSB.')
    }

    try {
      const device = await navigator.usb.requestDevice({
        filters: manualProfile ? manualProfile.filters : ALL_FILTERS,
      })
      return await this.open(device, manualProfile)
    } catch (error) {
      this.reset()
      throw normalizeConnectError(error)
    }
  }

  /**
   * Re-opens a device the user already granted access to in a previous
   * session, with no picker prompt — matched first by `serialNumber` (most
   * reliable, when the device reports one), falling back to vendor/product
   * id. Resolves to `null`, not an error, when nothing matches; the caller
   * should fall back to a normal `connect()` in that case.
   */
  async reconnect(previous: UsbDeviceIdentity, manualProfile?: UsbPrinterProfile): Promise<PrinterInfo | null> {
    if (!isUsbSupported()) return null

    const devices = await navigator.usb.getDevices()
    const match =
      (previous.serialNumber ? devices.find((device) => device.serialNumber === previous.serialNumber) : undefined) ??
      devices.find((device) => device.vendorId === previous.vendorId && device.productId === previous.productId)
    if (!match) return null

    try {
      return await this.open(match, manualProfile)
    } catch (error) {
      this.reset()
      throw normalizeConnectError(error)
    }
  }

  private async open(device: USBDevice, manualProfile?: UsbPrinterProfile): Promise<PrinterInfo> {
    const profile = manualProfile ?? findUsbProfile(device)
    if (!profile) {
      throw toPrinterError(
        'connect-failed',
        `Printer "${device.productName ?? 'Unknown'}" (${device.vendorId.toString(16)}:${device.productId.toString(16)}) has no known USB printer profile.`,
      )
    }

    try {
      await device.open()
      await device.selectConfiguration(profile.configuration)
      await device.claimInterface(profile.interface)

      const iface = device.configuration?.interfaces.find((i) => i.interfaceNumber === profile.interface)
      const outEndpoint = iface?.alternate.endpoints.find((endpoint) => endpoint.direction === 'out')
      if (!outEndpoint) {
        throw toPrinterError('connect-failed', `Printer "${device.productName ?? 'Unknown'}" has no USB OUT endpoint on interface ${profile.interface}.`)
      }

      // Matches the reference implementation — issued right after claiming,
      // before the device is reported connected.
      await device.reset()

      const id = device.serialNumber || `${device.vendorId.toString(16).padStart(4, '0')}:${device.productId.toString(16).padStart(4, '0')}`
      const info: PrinterInfo = {
        type: 'usb',
        name: device.productName ?? 'USB printer',
        id,
        language: evaluate(profile.language, device),
        codepageMapping: evaluate(profile.codepageMapping, device),
      }
      this.device = device
      this.endpoint = outEndpoint.endpointNumber
      this.info = info
      return info
    } catch (error) {
      // A device already picked in the browser's own dialog can still fail
      // here with e.g. SecurityError — confirmed on real hardware (both
      // Windows and Linux) to mean "another driver already claimed this
      // device", NOT "missing user gesture" (that's only true for
      // requestDevice() itself, above). Linux-specific console.warn() with
      // exact fix steps lives in normalizeOpenError() (printerErrors.ts) —
      // shared, not duplicated per transport.
      throw normalizeOpenError(
        error,
        'likely claimed by another driver (an OS printer driver on Windows, or the kernel\'s usblp module on Linux) — WebUSB can\'t override that; try connect({ transport: "serial" }) instead',
      )
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.device?.close()
    } catch {
      // Already closing/closed — nothing actionable, mirrors the other
      // transports' fire-and-forget disconnect().
    }
    this.reset()
  }

  isConnected(): boolean {
    return this.info !== null
  }

  async print(bytes: Uint8Array): Promise<void> {
    if (!this.device || this.endpoint === null || !this.info) {
      throw toPrinterError('not-connected', 'Call connect() before printing.')
    }

    try {
      // `new Uint8Array(bytes)` (not `bytes` directly) — a generic
      // Uint8Array's `.buffer` is typed ArrayBufferLike (could be a
      // SharedArrayBuffer), which WebUSB's stricter ArrayBuffer-only
      // BufferSource typing rejects; the copy constructor always allocates
      // a real ArrayBuffer regardless of the source's backing.
      await this.device.transferOut(this.endpoint, new Uint8Array(bytes))
    } catch (error) {
      throw normalizePrintError(error)
    }
  }

  private reset(): void {
    this.device = null
    this.endpoint = null
    this.info = null
  }
}
