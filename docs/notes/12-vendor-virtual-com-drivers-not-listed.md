# Gotcha #12: a vendor's own "virtual COM port" driver doesn't show up in Web Serial's picker

**A vendor-specific virtual-COM-port tool can bind a printer to a Windows
COM port that Windows itself (and legacy apps) can use fine, while Chrome's
Web Serial `requestPort()` picker never offers it at all — not a filter in
this library, confirmed by reading the code.** Reproduced on a real Epson
TM-T20X-II: Epson's own **"TM Virtual Port Assignment Tool"** was used to
bind the printer's USB connection to `COM7` ("EPSON COM Emulation USB
Port"), matched by USB serial number in the tool's own UI. Windows shows
and can use `COM7` normally — but it never appears in this project's demo
when clicking Connect on the Serial tab. Meanwhile, the same picker *does*
list Bluetooth SPP virtual ports (`COM3`/`COM4`, "Serial Padrão por link
Bluetooth", `BthModem0`/`BthModem1`) on the same machine.

**Confirmed not a code-side filter**: `SerialTransport.connect()`
(`src/interfaces/serial/SerialTransport.ts`) calls
`navigator.serial.requestPort()` with zero arguments — by design, no
`filters` at all (Web Serial has no vendor/product-id filtering concept
the way Bluetooth/WebUSB profiles do — see AGENTS.md's "Serial vs. USB
profile asymmetry" section). This library isn't excluding `COM7`; Chrome
itself never offers it as a candidate.

**Best-available explanation** — converging evidence, *not* confirmed
against Chromium's own source (same "take it loosely, not verified"
caveat as gotcha #8's driver-mode naming): MDN's own description of the
Web Serial API scopes the *virtual* serial ports it recognizes to two
specific mechanisms — USB **CDC-ACM** and **Bluetooth SPP**. The ports
that *did* show up here are exactly Bluetooth SPP. Epson's "TM Virtual
Port Driver" is neither of those: it's a proprietary vendor driver that
layers a Windows COM port UI on top of a USB interface that's still, at
the descriptor level, **USB Printer Class (0x07)** — the same class
already implicated in gotcha #11's WebUSB `claimInterface()` denial. A
non-CDC-ACM vendor virtual-COM-port shim over a Printer-Class interface
appears to fall outside what Chrome's Web Serial enumerates, so it's
invisible to `requestPort()`'s picker even with zero filters, while
Windows' Device Manager and legacy Win32 apps see it fine through the
vendor driver.

**No code-level fix**: nothing in `SerialPortRequestOptions` lets a page
ask for "vendor VCP ports too," and there's no way for a web page to
detect or work around this. **Use QZ Tray instead** for printers whose
only "serial" option is a vendor virtual-COM-port driver like this — QZ
talks to the OS-registered printer object directly through its own
backend, sidestepping Web Serial's CDC-ACM/Bluetooth-SPP-only enumeration
entirely (see the README's "QZ Tray (fallback, any OS-registered
printer)" section). A genuine Bluetooth pairing, if the printer supports
one, also works over Web Serial, since that surfaces as a real Bluetooth
SPP port rather than a vendor VCP shim.

---
Referenced from [AGENTS.md](../../AGENTS.md)'s "Critical gotchas" section (gotcha #12).
