// Quick standalone test for NTAG UID-mirror write via ACR1552
// Usage: node nfc-write-test.cjs [url]
// Default URL: http://localhost:3000/api/uid?raw=%%MIRROR%%

const { NFC } = require('nfc-pcsc')

const MIRROR_PLACEHOLDER = '%%MIRROR%%'
const UID_HEX_LEN = 14

function buildNdefUrl(url) {
  const hasMirror = url.includes(MIRROR_PLACEHOLDER)
  const mirrorIdx = url.indexOf(MIRROR_PLACEHOLDER)
  const filledUrl = url.replace(MIRROR_PLACEHOLDER, '0'.repeat(UID_HEX_LEN))

  let code = 0x00, body = filledUrl
  if (filledUrl.startsWith('https://')) { code = 0x03; body = filledUrl.slice(8) }
  else if (filledUrl.startsWith('http://'))  { code = 0x02; body = filledUrl.slice(7) }

  const payload = Buffer.concat([Buffer.from([code]), Buffer.from(body, 'ascii')])
  if (payload.length > 255) throw new Error('URL too long')

  const rec = Buffer.concat([Buffer.from([0xD1, 0x01, payload.length, 0x55]), payload])
  const tlv = rec.length <= 254
    ? Buffer.concat([Buffer.from([0x03, rec.length]), rec, Buffer.from([0xFE])])
    : Buffer.concat([Buffer.from([0x03, 0xFF, (rec.length >> 8) & 0xFF, rec.length & 0xFF]), rec, Buffer.from([0xFE])])

  let mirrorOffset = -1
  if (hasMirror) {
    const tlvHdrLen = rec.length <= 254 ? 2 : 4
    const prefixLen = code === 0x03 ? 8 : code === 0x02 ? 7 : 0
    mirrorOffset = tlvHdrLen + 4 + 1 + (mirrorIdx - prefixLen)
  }

  return { data: tlv, mirrorOffset }
}

async function writeNdefToNtag(reader, url) {
  const { data, mirrorOffset } = buildNdefUrl(url)

  const padLen = Math.ceil(data.length / 4) * 4
  const padded = Buffer.alloc(padLen, 0x00)
  data.copy(padded)

  console.log(`  NDEF bytes (${padded.length}):`, padded.toString('hex'))
  console.log(`  Writing NDEF to pages 4–${4 + padded.length / 4 - 1}...`)
  await reader.write(4, padded, 4)
  console.log('  NDEF written.')

  if (mirrorOffset >= 0) {
    const absOffset  = 16 + mirrorOffset
    const mirrorPage = Math.floor(absOffset / 4)
    const mirrorByte = absOffset % 4

    const cc = await reader.read(3, 4, 4)
    const ccByte2 = cc[2]
    let cfgPage = 41
    if      (ccByte2 === 0x12) { cfgPage = 41;  console.log('  Chip: NTAG213') }
    else if (ccByte2 === 0x3E) { cfgPage = 131; console.log('  Chip: NTAG215') }
    else if (ccByte2 === 0x6D) { cfgPage = 227; console.log('  Chip: NTAG216') }
    else                       {                console.log(`  Chip: unknown (CC byte2=0x${ccByte2.toString(16).padStart(2,'0')}), assuming NTAG213`) }

    const mirrorReg = ((0b01 << 5) | (mirrorByte << 2)) & 0xFF
    const cfgData   = Buffer.from([mirrorReg, 0x00, mirrorPage & 0xFF, 0xFF])

    console.log(`  Mirror: page=${mirrorPage} byte=${mirrorByte}`)
    console.log(`  Writing CFG0 page ${cfgPage}:`, cfgData.toString('hex'))
    await reader.write(cfgPage, cfgData, 4)
    console.log('  Mirror config written.')
  }
}

// ── main ──────────────────────────────────────────────────────────────────

const url = process.argv[2] ?? 'http://localhost:3000/api/uid?raw=%%MIRROR%%'
console.log('Target URL:', url)
console.log('Waiting for reader...\n')

const nfc = new NFC()

nfc.on('reader', (reader) => {
  console.log('Reader:', reader.name)
  reader.autoProcessing = false

  reader.on('card', async () => {
    try {
      const uidResp = await reader.transmit(Buffer.from([0xFF, 0xCA, 0x00, 0x00, 0x00]), 256)
      const uid = uidResp.slice(0, -2).toString('hex').toUpperCase().match(/.{2}/g).join(':')
      console.log('Card detected, UID:', uid)

      await writeNdefToNtag(reader, url)

      console.log('\nDone. Verify by tapping the chip with a phone.')
      console.log(`Expected redirect: /tap?uid=<keccak256 of "${uid.toLowerCase()}")`)
      setTimeout(() => process.exit(0), 500)
    } catch (e) {
      console.error('ERROR:', e.message)
      process.exit(1)
    }
  })

  reader.on('error', (err) => console.error('Reader error:', err))
  console.log('Tap a chip now...')
})

nfc.on('error', (err) => console.error('NFC error:', err))

setTimeout(() => {
  console.error('Timeout — no card detected in 30s')
  process.exit(1)
}, 30_000)
