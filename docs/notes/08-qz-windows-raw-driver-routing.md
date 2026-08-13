# Gotcha #8: on Windows, QZ Tray's raw print jobs go through the OS printer driver

`type: 'raw'` QZ jobs are routed through the OS driver on Windows, not
byte-for-byte to the port — a driver can mangle `GS k` (barcode) while
leaving `GS ( k` (qrcode/pdf417) untouched, no code-level fix. Reproduced
on a real Epson TM-T20X-II: Code128/ITF garbled, PDF417/QR fine, same
bytes fine over Bluetooth. Traced to the byte level, not guessed —
`QzTransport.ts` hands qz-tray identical, uncorrupted bytes regardless of
transport; the split lines up exactly with `GS k` vs `GS ( k`. qz-tray's
own `forceRaw` option is documented "Not yet supported on Windows".

**Fix**: OS-level, not this library. Confirmed remedies on the same
hardware: install a generic/"Text Only" pass-through driver, or (worked
end-to-end) pick a different mode in the manufacturer driver's own setup
— fixed Code128 *and* ITF with PDF417/QR still fine.

---
[AGENTS.md](../../AGENTS.md) gotcha #8.
