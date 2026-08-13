# Gotcha #11: WebUSB is blocked by a driver claim on Windows *and* Linux, not just Windows

**`device.open()`/`device.claimInterface()` fails with a `SecurityError`
("Access denied") the instant another driver already has the USB
interface — this happens on Linux as much as it does on Windows, not just
Windows as originally assumed.** Reproduced on a real Epson TM-T20X-II:
`connect({ transport: 'usb' })` finds the printer fine (it shows up in the
browser's own device picker — confirms `usb/profiles.ts`'s vendor/product
match is correct), but `open()` throws `Failed to execute 'open' on
'USBDevice': Access denied.` consistently on **both Windows and Linux**.
Web Serial (`connect({ transport: 'serial' })`), by contrast, connected
successfully on the same machine — including over the printer's
Bluetooth-paired virtual COM port (Windows exposes a paired Bluetooth SPP
device as a COM port too, and it accepts the same ESC/POS bytes fine).

**Root cause, per OS:**
- **Windows**: an installed printer driver has already claimed the USB
  device exclusively (same category of limitation as gotcha #8's QZ/raw
  driver routing).
- **Linux**: the kernel's own generic USB-printer-class driver, `usblp`,
  auto-binds to any USB device that advertises interface class `0x07`
  (Printer) the moment it's plugged in — before any browser process gets a
  chance to claim it. A missing udev permission rule (only root/a
  privileged group has access to the raw USB device node) produces the
  same browser-visible "Access denied" symptom too, and is the other
  common cause worth checking.

Either way, **there is no code-level fix** — WebUSB has no API to force a
kernel/OS driver to release its claim; this project already normalizes the
resulting `SecurityError` into a clear `connect-failed` PrinterError
(`printerErrors.ts#normalizeOpenError()`, see gotcha discussion in
AGENTS.md's "Serial vs. USB profile asymmetry" section) rather than the
generic/misleading message, but the underlying access is still genuinely
blocked at the OS level.

**Workarounds** (OS-level, outside this library's scope to automate):
- **Windows**: same remedies as gotcha #8 — install a generic/pass-through
  driver, or pick a different mode in the manufacturer driver's setup, so
  nothing exclusively claims the USB interface.
- **Linux**: confirmed working end-to-end by a user of this library on the
  same Epson TM-T20X-II (vendor `04b8` — the same id already in
  `usb/profiles.ts`'s Epson entry):
  ```sh
  # 1. Find the device's vendor:product id.
  lsusb
  # → e.g. "ID 04b8:0e27" (04b8 = vendor, 0e27 = product)

  # 2. Grant the browser udev permission to the device (no root needed after this).
  echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="04b8", ATTR{idProduct}=="0e27", MODE="0666", GROUP="plugdev"' \
    | sudo tee /etc/udev/rules.d/99-escpos.rules

  # 3. Apply the new rule.
  sudo udevadm control --reload && sudo udevadm trigger

  # 4. Detach the kernel's usblp driver, which auto-claimed the device.
  sudo modprobe -r usblp
  # ...and keep it from re-claiming the device on future plug-ins/reboots:
  echo "blacklist usblp" | sudo tee /etc/modprobe.d/blacklist-usblp.conf

  # 5. Verify: substitute the bus/device numbers lsusb reported.
  ls -l /dev/bus/usb/003/007
  # → should read crw-rw-rw- (world read+write — the browser can now open it)
  ```
  `printerErrors.ts#normalizeOpenError()` — shared by every transport, not
  duplicated per one — also `console.warn()`s a short pointer back to this
  file whenever it catches a `SecurityError` on a Linux `navigator.userAgent`:
  a devtools-only hint, kept out of the thrown `PrinterError.message` so
  end-user-facing error UI doesn't get a wall of shell commands.

**Recommendation**: use `transport: 'serial'` as the default across
desktop OSes for this kind of printer — confirmed reliable where WebUSB
wasn't, with no OS-level setup required. Only reach for WebUSB when
there's a specific reason to (e.g. a device that genuinely isn't claimed
by anything), and expect to walk through one of the above unbind steps
first on a fresh machine.

---
Referenced from [AGENTS.md](../../AGENTS.md)'s "Critical gotchas" section (gotcha #11).
