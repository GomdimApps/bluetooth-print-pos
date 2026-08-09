# Gotcha #8: on Windows, QZ Tray's raw print jobs go through the OS printer driver

**On Windows, QZ Tray's `type: 'raw'` print jobs go through the OS
printer driver, not byte-for-byte to the port — a driver can mangle
`GS k` (barcode) while leaving `GS ( k` (qrcode/pdf417) untouched, and
there's no code-level fix for it.** Reproduced on a real Epson
TM-T20X-II (USB, Windows driver): Code128/ITF printed garbled while
PDF417/QR were fine, on the same printer/transport — but all four
printed fine on a Bluetooth printer with the exact same bytes. Traced
to the byte level, not guessed: `buildReceiptBytes()` (AGENTS.md gotcha #1) is
transport-agnostic, so both transports get identical bytes;
`QzTransport.ts`'s `qz.print()` call hands its `Uint8Array` to
qz-tray's `compatible.data()` (`node_modules/qz-tray/qz-tray.js:889`),
which base64-encodes it via a binary-safe byte loop — no corruption in
this repo's code. The real encoder's `barcode()` emits `GS k`
(`0x1D 0x6B`) — ITF always NUL-terminated (legacy form), Code128
length-prefixed but still `GS k` — while `qrcode()`/`pdf417()` emit
`GS ( k` (`0x1D 0x28 0x6B`) with an explicit 2-byte length prefix.
That split lines up exactly with which elements failed. qz-tray's own
JSDoc documents `options.forceRaw` (skips the driver, writes raw to the
port) as **"Not yet supported on Windows"** (defaults to `false`) — so
there is no way to bypass the driver for `type: 'raw'` jobs on Windows
through this API. **Fix**: not in this library — reconfigure the
printer in Windows. Two remedies confirmed on real hardware (this same
Epson TM-T20X-II):
- **Generic pass-through driver**: install a second Windows printer
  object pointed at the same USB port, using the built-in "Generic /
  Text Only" driver instead of the manufacturer/GDI one — untested end
  to end on this hardware (port got reassigned/errored out mid-attempt)
  but is the standard OS-level raw-passthrough fix and should work in
  general.
- **Confirmed working**: reinstalling with Epson's own official driver
  but picking a different printer *mode* offered during setup — the
  user reported it listed as "**Dp 180**" (as seen in their installer;
  exact official Epson terminology unverified from source, so take the
  label loosely, not literally) — fixed Code128 **and** ITF, with
  PDF417/QR still working, confirmed on both 58mm and 80mm paper. If
  the manufacturer driver's setup offers multiple printer-model/mode
  variants, trying a different one before resorting to Generic/Text
  Only is worth it — costs nothing and keeps the OEM driver's other
  features.

---
Referenced from [AGENTS.md](../../AGENTS.md)'s "Critical gotchas" section (gotcha #8).
