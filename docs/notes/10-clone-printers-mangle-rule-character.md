# Gotcha #10: some clone printers mangle the native rule character

**`encoder.rule()` sends a cp437 box-drawing character — some clone
printers' font tables don't match it, printing garbage instead of a
line.** Confirmed by reading the bundled encoder
(`node_modules/@point-of-sale/receipt-printer-encoder/dist/*.esm.js`):

```js
rule(e){return e=Object.assign({style:"single",width:this.#c.columns||10},e||{}),
  this.#h.flush(),this.#h.text(("double"===e.style?"═":"─").repeat(e.width),"cp437"),
  this.#h.flush({forceNewline:!0}),this}
```

It repeats `─` (U+2500, or `═` for `style: 'double'`) to `columns` width,
encoded under the `cp437` codepage. On real hardware (the same clone
Bluetooth printer as gotcha #9's PDF417 case), this prints as
`^^^^^^^^^` instead of a line — the printer's actual font ROM doesn't map
that byte to the same glyph real cp437 does.

`rule` elements can set `safeMode: true` to work around it:
`ReceiptBuilder.ts` sends `'-'.repeat(columns)` via `Text/sendLine.ts`'s
`sendLine()` instead of `encoder.rule()`. Plain ASCII `-` (0x20-0x7E) is
identical across every codepage, so this is safe on any printer — no
raster image needed, unlike `pdf417`'s safeMode (gotcha #9), since there's
a valid plain-text substitute here. Off by default: the native rule
character works fine on printers that support it, and produces a slightly
different (solid vs. dashed) look.

---
Referenced from [AGENTS.md](../../AGENTS.md)'s "Critical gotchas" section (gotcha #10).
