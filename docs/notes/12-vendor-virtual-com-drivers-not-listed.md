# Gotcha #12: a vendor's own "virtual COM port" driver isn't listed by Web Serial

A printer bound to a Windows COM port via a vendor's proprietary tool
(confirmed: Epson's "TM Virtual Port Assignment Tool", `COM7` "EPSON COM
Emulation USB Port") never appears in Chrome's Web Serial picker, even
though Windows itself uses it fine — and it's not a filter in this
library (`SerialTransport.connect()` passes zero filters to
`requestPort()`, confirmed by reading the code). Bluetooth SPP virtual
ports *do* show up in the same picker.

**Best-available explanation** (not source-verified): Web Serial only
recognizes USB CDC-ACM and Bluetooth SPP virtual ports — a vendor VCP
shim over a still-USB-Printer-Class (0x07) interface is neither.

**No code-level fix** — use QZ Tray instead for printers whose only
"serial" option is a vendor VCP driver like this.

---
[AGENTS.md](../../AGENTS.md) gotcha #12.
