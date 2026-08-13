# Gotcha #11: WebUSB is blocked by a driver claim on Windows *and* Linux

`device.open()`/`claimInterface()` fails with `SecurityError` ("Access
denied") the instant another driver already holds the USB interface —
confirmed on a real Epson TM-T20X-II happening on **both** Windows and
Linux, not Windows-only. Windows: an installed printer driver claimed it
(same category as gotcha #8). Linux: the kernel's `usblp` module
auto-binds any USB Printer-Class (0x07) device on plug-in, or a missing
udev permission rule. No code-level fix either way — WebUSB has no API to
force a driver to release its claim; `printerErrors.ts#normalizeOpenError()`
at least surfaces it as a clear `connect-failed` instead of the
misleading `user-gesture-required` it used to.

**Confirmed Linux fix** (same hardware, vendor `04b8` = Epson):
```sh
lsusb   # find idVendor:idProduct
echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="04b8", ATTR{idProduct}=="0e27", MODE="0666", GROUP="plugdev"' \
  | sudo tee /etc/udev/rules.d/99-escpos.rules
sudo udevadm control --reload && sudo udevadm trigger
sudo modprobe -r usblp
echo "blacklist usblp" | sudo tee /etc/modprobe.d/blacklist-usblp.conf
ls -l /dev/bus/usb/003/007   # should read crw-rw-rw-
```
**Windows fix**: same as gotcha #8 — a generic/pass-through driver, or a
different mode in the manufacturer driver's own setup.

`printerErrors.ts` also `console.warn()`s a short pointer to this file on
a Linux `SecurityError`. **Recommendation**: default to `transport:
'serial'` — confirmed reliable where WebUSB wasn't.

---
[AGENTS.md](../../AGENTS.md) gotcha #11.
