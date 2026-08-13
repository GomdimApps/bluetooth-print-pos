const banner = document.getElementById('banner')
const statusEl = document.getElementById('status')
const statusPill = document.getElementById('statusPill')
const logEl = document.getElementById('log')
const tabBluetooth = document.getElementById('tabBluetooth')
const tabQz = document.getElementById('tabQz')
const panelBluetooth = document.getElementById('panelBluetooth')
const panelQz = document.getElementById('panelQz')
const connectBtn = document.getElementById('connectBtn')
const connectCompatBtn = document.getElementById('connectCompatBtn')
const connectManualProfileBtn = document.getElementById('connectManualProfileBtn')
const profileServiceInput = document.getElementById('profileServiceInput')
const profileCharacteristicInput = document.getElementById('profileCharacteristicInput')
const profileNamePrefixInput = document.getElementById('profileNamePrefixInput')
const profileLanguageSelect = document.getElementById('profileLanguageSelect')
const profileCodepageInput = document.getElementById('profileCodepageInput')
const profileMessageSizeInput = document.getElementById('profileMessageSizeInput')
const profileSleepInput = document.getElementById('profileSleepInput')
const disconnectBtn = document.getElementById('disconnectBtn')
const qzListBtn = document.getElementById('qzListBtn')
const qzPrinterSelect = document.getElementById('qzPrinterSelect')
const qzConnectBtn = document.getElementById('qzConnectBtn')
const printBtn = document.getElementById('printBtn')
const testPrintBtn = document.getElementById('testPrintBtn')
const paperWidthSelect = document.getElementById('paperWidthSelect')
const textInput = document.getElementById('textInput')
const alignSelect = document.getElementById('alignSelect')
const feedBeforeCutInput = document.getElementById('feedBeforeCutInput')
const boldCheck = document.getElementById('boldCheck')
const imageInput = document.getElementById('imageInput')
const barcodeInput = document.getElementById('barcodeInput')
const barcodeSymbologySelect = document.getElementById('barcodeSymbologySelect')
const qrInput = document.getElementById('qrInput')
const qrSafeModeCheck = document.getElementById('qrSafeModeCheck')
const pdf417Input = document.getElementById('pdf417Input')
const pdf417TruncatedCheck = document.getElementById('pdf417TruncatedCheck')
const pdf417SafeModeCheck = document.getElementById('pdf417SafeModeCheck')
const ruleCheck = document.getElementById('ruleCheck')
const ruleSafeModeCheck = document.getElementById('ruleSafeModeCheck')
const previewBtn = document.getElementById('previewBtn')
const previewImg = document.getElementById('previewImg')
const previewPlaceholder = document.getElementById('previewPlaceholder')

function log(message) {
  const time = new Date().toLocaleTimeString()
  logEl.textContent += `[${time}] ${message}\n`
  logEl.scrollTop = logEl.scrollHeight
}

// Tailwind CDN generates classes from whatever's in the DOM, so state pills
// are just swapped as full class strings instead of toggling a bare
// modifier class against a stylesheet rule.
const PILL_BASE = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold'
const PILL_STATE = {
  ok: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  fail: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  busy: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  idle: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
}
function setPill(el, state) {
  el.className = `${PILL_BASE} ${PILL_STATE[state] || PILL_STATE.idle}`
}

function selectTab(tab) {
  const bluetooth = tab === 'bluetooth'
  tabBluetooth.setAttribute('aria-selected', String(bluetooth))
  tabQz.setAttribute('aria-selected', String(!bluetooth))
  panelBluetooth.hidden = !bluetooth
  panelQz.hidden = bluetooth
}
tabBluetooth.onclick = () => selectTab('bluetooth')
tabQz.onclick = () => selectTab('qz')

const supported = WebEscposPrinter.isSupported()
banner.textContent = supported ? 'Web Bluetooth supported' : 'Web Bluetooth not supported — use Chrome or Edge'
setPill(banner, supported ? 'ok' : 'fail')
connectBtn.disabled = !supported
connectCompatBtn.disabled = !supported
connectManualProfileBtn.disabled = !supported

const STATUS_PILL_STATE = { connected: 'ok', printing: 'busy', connecting: 'busy', error: 'fail' }

const printer = new WebEscposPrinter()

printer.onStatusChange((event) => {
  statusEl.textContent = event.status
  setPill(statusPill, STATUS_PILL_STATE[event.status] || 'idle')
  log(`status: ${event.status}${event.info ? ` (${event.info.name})` : ''}`)
  if (event.error) log(`error [${event.error.code}]: ${event.error.message}`)

  const connected = printer.isConnected()
  disconnectBtn.disabled = !connected
  printBtn.disabled = !connected
  testPrintBtn.disabled = !connected
  connectBtn.disabled = connected || !supported
  connectCompatBtn.disabled = connected || !supported
  connectManualProfileBtn.disabled = connected || !supported
  // QZ Tray works regardless of Web Bluetooth support, so it's not
  // gated by `supported` — only by having already connected/listed.
  qzListBtn.disabled = connected
  qzConnectBtn.disabled = connected || qzPrinterSelect.value === ''
})

connectBtn.onclick = async () => {
  try {
    const info = await printer.connect()
    log(`connected to ${info.name} (${info.language})`)
  } catch (error) {
    log(`failed to connect: ${error.message}`)
  }
}

connectCompatBtn.onclick = async () => {
  try {
    const info = await printer.connect({ compat: true })
    log(`connected (compatibility mode) to ${info.name} (${info.language})`)
  } catch (error) {
    log(`failed to connect: ${error.message}`)
  }
}

function buildManualProfile() {
  const service = profileServiceInput.value.trim()
  const characteristic = profileCharacteristicInput.value.trim()
  if (!service || !characteristic) return null

  const namePrefix = profileNamePrefixInput.value.trim()
  const messageSize = profileMessageSizeInput.value.trim()
  const sleepAfterCommand = profileSleepInput.value.trim()

  return {
    filters: [namePrefix ? { namePrefix, services: [service] } : { services: [service] }],
    service,
    characteristic,
    language: profileLanguageSelect.value,
    codepageMapping: profileCodepageInput.value.trim() || 'default',
    ...(messageSize !== '' ? { messageSize: Number(messageSize) } : {}),
    ...(sleepAfterCommand !== '' ? { sleepAfterCommand: Number(sleepAfterCommand) } : {}),
  }
}

connectManualProfileBtn.onclick = async () => {
  const profile = buildManualProfile()
  if (!profile) {
    log('fill in at least Service UUID and Characteristic UUID')
    return
  }

  try {
    const info = await printer.connect({ profile })
    log(`connected (manual profile) to ${info.name} (${info.language})`)
  } catch (error) {
    log(`failed to connect: ${error.message}`)
  }
}

qzListBtn.onclick = async () => {
  try {
    const names = await printer.listQzPrinters()
    qzPrinterSelect.innerHTML = names.length
      ? names.map((n) => `<option value="${n}">${n}</option>`).join('')
      : '<option value="">(no printers found)</option>'
    qzPrinterSelect.disabled = names.length === 0
    qzConnectBtn.disabled = names.length === 0
    log(`found ${names.length} QZ printer(s)`)
  } catch (error) {
    log(`failed to list QZ printers: ${error.message}`)
  }
}

qzPrinterSelect.onchange = () => {
  qzConnectBtn.disabled = qzPrinterSelect.value === ''
}

qzConnectBtn.onclick = async () => {
  try {
    const info = await printer.connect({ transport: 'qz', printerName: qzPrinterSelect.value })
    log(`connected (QZ) to ${info.name}`)
  } catch (error) {
    log(`failed to connect (QZ): ${error.message}`)
  }
}

disconnectBtn.onclick = async () => {
  await printer.disconnect()
  log('disconnected')
}

function buildAsciiRuler() {
  return '1234567890 ABCDEFGHIJKLMNOPQRSTUVWXYZ'
}

// Checking "Safe mode" alone should be enough to include a rule — keep the
// "Rule" checkbox visually in sync instead of requiring both to be ticked.
ruleSafeModeCheck.onchange = () => {
  if (ruleSafeModeCheck.checked) ruleCheck.checked = true
}

function selectedPaperWidth() {
  return paperWidthSelect.value || undefined
}

function selectedFeedBeforeCut() {
  const value = feedBeforeCutInput.value.trim()
  return value === '' ? undefined : Number(value)
}

testPrintBtn.onclick = async () => {
  try {
    await printer.printReceipt({
      paperWidth: selectedPaperWidth(),
      content: [
        { type: 'text', value: 'TEST PRINT', align: 'center', bold: true },
        { type: 'rule' },
        { type: 'text', value: `Date/Time: ${new Date().toLocaleString()}` },
        { type: 'text', value: buildAsciiRuler() },
        { type: 'rule' },
        { type: 'text', value: 'END OF TEST', align: 'center' },
        { type: 'newline', lines: 2 },
      ],
      cut: 'full',
    })
    log('test print sent')
  } catch (error) {
    log(`test print failed: ${error.message}`)
  }
}

function buildJobFromForm() {
  const lines = textInput.value.split('\n').map((l) => l.trim()).filter(Boolean)
  const align = alignSelect.value
  const bold = boldCheck.checked
  const file = imageInput.files[0]
  const barcodeValue = barcodeInput.value.trim()
  const qrValue = qrInput.value.trim()
  const pdf417Value = pdf417Input.value.trim()

  const content = []
  if (file) content.push({ type: 'image', source: file, align: 'center' })
  for (const line of lines) content.push({ type: 'text', value: line, align, bold })
  if (barcodeValue) content.push({ type: 'barcode', value: barcodeValue, symbology: barcodeSymbologySelect.value })
  if (qrValue) content.push({ type: 'qrcode', value: qrValue, safeMode: qrSafeModeCheck.checked })
  if (pdf417Value) content.push({ type: 'pdf417', value: pdf417Value, truncated: pdf417TruncatedCheck.checked, safeMode: pdf417SafeModeCheck.checked })
  if (ruleCheck.checked || ruleSafeModeCheck.checked) content.push({ type: 'rule', safeMode: ruleSafeModeCheck.checked })
  content.push({ type: 'newline', lines: 2 })

  return content.length > 0 ? { paperWidth: selectedPaperWidth(), feedBeforeCut: selectedFeedBeforeCut(), content, cut: 'full' } : null
}

printBtn.onclick = async () => {
  const job = buildJobFromForm()
  if (!job) {
    log('nothing to print — fill in the text, image, barcode or QR field')
    return
  }

  try {
    await printer.printReceipt(job)
    log('receipt sent')
  } catch (error) {
    log(`failed to print: ${error.message}`)
  }
}

previewBtn.onclick = async () => {
  const job = buildJobFromForm()
  if (!job) {
    log('nothing to preview — fill in the text, image, barcode or QR field')
    return
  }

  try {
    const preview = await printer.renderPreview(job)
    previewImg.src = preview.dataUrl
    previewImg.classList.remove('hidden')
    previewPlaceholder.classList.add('hidden')
    log(`preview rendered (${preview.width}x${preview.height})`)
  } catch (error) {
    log(`failed to render preview: ${error.message}`)
  }
}
