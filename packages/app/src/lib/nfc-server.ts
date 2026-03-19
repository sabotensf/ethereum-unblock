import { NFC } from 'nfc-pcsc'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// Persist across Next.js hot reloads in development
const g = global as any

export function initNFC(): InstanceType<typeof NFC> {
  if (g.__nfc) return g.__nfc

  if (!g.__nfcReaders)     g.__nfcReaders     = new Map<string, any>()
  if (!g.__nfcEndCbs)      g.__nfcEndCbs      = new Set<(name: string) => void>()
  if (!g.__nfcConnectCbs)  g.__nfcConnectCbs  = new Set<(reader: any) => void>()

  const nfc = new NFC()
  g.__nfc = nfc

  nfc.on('reader', (reader: any) => {
    reader.autoProcessing = false
    g.__nfcReaders.set(reader.name, reader)
    reader.on('error', (err: any) => console.error('[nfc] reader error:', reader.name, err))
    reader.on('end', () => {
      g.__nfcReaders.delete(reader.name)
      ;(g.__nfcEndCbs as Set<(n: string) => void>).forEach(cb => cb(reader.name))
    })
    ;(g.__nfcConnectCbs as Set<(r: any) => void>).forEach(cb => cb(reader))
  })
  nfc.on('error', (err: any) => console.error('[nfc] error:', err))

  return nfc
}

export function getNFC(): InstanceType<typeof NFC> | null {
  return g.__nfc ?? null
}

export function getActiveReaders(): Map<string, any> {
  return g.__nfcReaders ?? new Map()
}

export function getEndCallbacks(): Set<(name: string) => void> {
  return g.__nfcEndCbs ?? new Set()
}

export function getConnectCallbacks(): Set<(reader: any) => void> {
  return g.__nfcConnectCbs ?? new Set()
}

// ── NDEF helpers ───────────────────────────────────────────────────────────

const MIRROR_PLACEHOLDER = '%%MIRROR%%'
const CTR_PLACEHOLDER    = '%%CTR%%'
const UID_HEX_LEN = 14  // 7-byte UID = 14 hex chars
const CTR_HEX_LEN = 6   // 3-byte read counter = 6 hex chars

/** Build a raw NDEF URI record (no TLV wrapper).
 *  %%MIRROR%% is replaced with 14 zero chars as a UID placeholder.
 *  %%CTR%%    is replaced with  6 zero chars as a read-counter placeholder.
 *  Returns the record bytes and the byte offsets of those zeros within the record. */
function buildNdefRecord(url: string): { rec: Buffer; mirrorOffset: number; ctrOffset: number } {
  const mirrorIdx = url.indexOf(MIRROR_PLACEHOLDER)
  const ctrIdx    = url.indexOf(CTR_PLACEHOLDER)

  let filledUrl = url
  if (mirrorIdx >= 0) filledUrl = filledUrl.replace(MIRROR_PLACEHOLDER, '0'.repeat(UID_HEX_LEN))
  if (ctrIdx    >= 0) filledUrl = filledUrl.replace(CTR_PLACEHOLDER,    '0'.repeat(CTR_HEX_LEN))

  let code = 0x00, body = filledUrl
  if (filledUrl.startsWith('https://')) { code = 0x03; body = filledUrl.slice(8) }
  else if (filledUrl.startsWith('http://'))  { code = 0x02; body = filledUrl.slice(7) }

  const payload = Buffer.concat([Buffer.from([code]), Buffer.from(body, 'ascii')])
  if (payload.length > 255) throw new Error('URL too long (> 255 byte payload)')

  // Short NDEF record: flags(D1) typeLen(01) payloadLen type(55) payload
  const rec = Buffer.concat([Buffer.from([0xD1, 0x01, payload.length, 0x55]), payload])

  const prefixLen = code === 0x03 ? 8 : code === 0x02 ? 7 : 0
  const hdr = 5  // 4-byte NDEF header + 1 uri code byte

  let mirrorOffset = -1
  if (mirrorIdx >= 0) {
    mirrorOffset = hdr + (mirrorIdx - prefixLen)
  }

  let ctrOffset = -1
  if (ctrIdx >= 0) {
    // %%MIRROR%% (10 chars) expands to 14 chars (+4 shift) when it precedes %%CTR%%
    const shift = (mirrorIdx >= 0 && mirrorIdx < ctrIdx) ? (UID_HEX_LEN - MIRROR_PLACEHOLDER.length) : 0
    ctrOffset = hdr + (ctrIdx + shift - prefixLen)
  }

  return { rec, mirrorOffset, ctrOffset }
}

/** Build TLV-wrapped NDEF (for NTAG 213/215/216 raw memory). */
export function buildNdefUrl(url: string): { data: Buffer; mirrorOffset: number } {
  const { rec, mirrorOffset: recMirrorOffset } = buildNdefRecord(url)  // ctrOffset unused for T2T

  const tlv = rec.length <= 254
    ? Buffer.concat([Buffer.from([0x03, rec.length]), rec, Buffer.from([0xFE])])
    : Buffer.concat([Buffer.from([0x03, 0xFF, (rec.length >> 8) & 0xFF, rec.length & 0xFF]), rec, Buffer.from([0xFE])])

  const tlvHdrLen = rec.length <= 254 ? 2 : 4
  const mirrorOffset = recMirrorOffset >= 0 ? tlvHdrLen + recMirrorOffset : -1

  return { data: tlv, mirrorOffset }
}

// ── Chip-type detection ────────────────────────────────────────────────────

/** Returns true if the chip responds to the ISO 7816-4 NDEF Application Select
 *  (i.e. it is a T4T tag like NTAG 424 DNA). */
async function isT4T(reader: any): Promise<boolean> {
  try {
    // SELECT NDEF Application (AID D2760000850101)
    const resp = await reader.transmit(
      Buffer.from('00A4040007D276000085010100', 'hex'), 256
    ) as Buffer
    const sw = resp.slice(-2)
    return sw[0] === 0x90 && sw[1] === 0x00
  } catch {
    return false
  }
}

// ── AES / CMAC helpers ─────────────────────────────────────────────────────

function aesECBEncrypt(key: Buffer, data: Buffer): Buffer {
  const c = createCipheriv('aes-128-ecb', key, null)
  c.setAutoPadding(false)
  return Buffer.concat([c.update(data), c.final()])
}

function aesECBDecrypt(key: Buffer, data: Buffer): Buffer {
  const d = createDecipheriv('aes-128-ecb', key, null)
  d.setAutoPadding(false)
  return Buffer.concat([d.update(data), d.final()])
}

function aesCBCEncrypt(key: Buffer, iv: Buffer, data: Buffer): Buffer {
  const c = createCipheriv('aes-128-cbc', key, iv)
  c.setAutoPadding(false)
  return Buffer.concat([c.update(data), c.final()])
}

function aesCBCDecrypt(key: Buffer, iv: Buffer, data: Buffer): Buffer {
  const d = createDecipheriv('aes-128-cbc', key, iv)
  d.setAutoPadding(false)
  return Buffer.concat([d.update(data), d.final()])
}

/** AES-CMAC (RFC 4493). */
function aesCMAC(key: Buffer, msg: Buffer): Buffer {
  const zero = Buffer.alloc(16, 0)
  const l  = aesECBEncrypt(key, zero)
  const k1 = cmacSubkey(l)
  const k2 = cmacSubkey(k1)

  const n       = Math.max(1, Math.ceil(msg.length / 16))
  const full    = msg.length > 0 && msg.length % 16 === 0
  const last    = Buffer.alloc(16, 0)

  if (full) {
    msg.copy(last, 0, (n - 1) * 16, n * 16)
    for (let i = 0; i < 16; i++) last[i] ^= k1[i]
  } else {
    msg.copy(last, 0, (n - 1) * 16, msg.length)
    last[msg.length - (n - 1) * 16] = 0x80
    for (let i = 0; i < 16; i++) last[i] ^= k2[i]
  }

  let x = Buffer.alloc(16, 0)
  for (let i = 0; i < n - 1; i++) {
    const blk = msg.slice(i * 16, (i + 1) * 16)
    for (let j = 0; j < 16; j++) x[j] ^= blk[j]
    x = aesECBEncrypt(key, x)
  }
  for (let i = 0; i < 16; i++) x[i] ^= last[i]
  return aesECBEncrypt(key, x)
}

function cmacSubkey(b: Buffer): Buffer {
  const msb = (b[0] & 0x80) !== 0
  const s   = Buffer.alloc(16)
  for (let i = 0; i < 15; i++) s[i] = ((b[i] << 1) | (b[i + 1] >> 7)) & 0xFF
  s[15] = (b[15] << 1) & 0xFF
  if (msb) s[15] ^= 0x87
  return s
}

function iso7816Pad(data: Buffer): Buffer {
  const rem    = data.length % 16
  const padLen = rem === 0 ? 16 : 16 - rem
  const out    = Buffer.alloc(data.length + padLen, 0)
  data.copy(out)
  out[data.length] = 0x80
  return out
}

function rotLeft(buf: Buffer, n: number): Buffer {
  return Buffer.concat([buf.slice(n), buf.slice(0, n)])
}

function xorBuf(a: Buffer, b: Buffer): Buffer {
  const r = Buffer.alloc(a.length)
  for (let i = 0; i < a.length; i++) r[i] = a[i] ^ b[i]
  return r
}

// ── NTAG 424 DNA EV2 Authentication ───────────────────────────────────────

interface EV2Session {
  ti:         Buffer   // 4-byte Transaction Identifier
  sesAuthEnc: Buffer   // 16-byte KSesAuthEnc
  sesAuthMAC: Buffer   // 16-byte KSesAuthMAC
  cmdCtr:     number   // command counter (starts at 0 after auth)
}

/** Verify CMAC against RFC 4493 test vectors — throws if wrong. */
function verifyCMAC(): void {
  // RFC 4493 Test Vector #2: 16-byte message
  const key = Buffer.from('2b7e151628aed2a6abf7158809cf4f3c', 'hex')
  const msg = Buffer.from('6bc1bee22e409f96e93d7e117393172a', 'hex')
  const expected = '070a16b46b4d4144f79bdd9dd04a287c'
  const got = aesCMAC(key, msg).toString('hex')
  if (got !== expected) {
    console.error('[cmac-test] FAIL: expected', expected, 'got', got)
    throw new Error('CMAC self-test failed — crypto implementation bug')
  }
  // Test Vector #1: empty message
  const expected0 = 'bb1d6929e95937287fa37d129b756746'
  const got0 = aesCMAC(key, Buffer.alloc(0)).toString('hex')
  if (got0 !== expected0) {
    console.error('[cmac-test] FAIL (empty):', expected0, got0)
    throw new Error('CMAC self-test (empty) failed')
  }
  // Test Vector #3: 40-byte message
  const msg3 = Buffer.from('6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411', 'hex')
  const expected3 = 'dfa66747de9ae63030ca32611497c827'
  const got3 = aesCMAC(key, msg3).toString('hex')
  if (got3 !== expected3) {
    console.error('[cmac-test] FAIL (40b):', expected3, got3)
    throw new Error('CMAC self-test (40-byte) failed')
  }
  // Verify SV derivation against AN12196 §6.10 test vector
  // Key=zeros, RndB=91517975..., RndA=B98F4C50...
  const tvKey  = Buffer.alloc(16, 0)
  const tvRndB = Buffer.from('91517975190DCEA6104948EFA3085C1B', 'hex')
  const tvRndA = Buffer.from('B98F4C50CF1C2E084FD150E33992B048', 'hex')
  const tvXor  = Buffer.alloc(6)
  for (let i = 0; i < 6; i++) tvXor[i] = tvRndA[2 + i] ^ tvRndB[i]
  const tvBody = Buffer.concat([tvRndA.slice(0, 2), tvXor, tvRndB.slice(6), tvRndA.slice(8)])
  const tvSV2  = Buffer.concat([Buffer.from([0x5A, 0xA5, 0x00, 0x01, 0x00, 0x80]), tvBody])
  const tvMAC  = aesCMAC(tvKey, tvSV2).toString('hex')
  const tvExpected = 'fc4af159b62e549b5812394cab1918cc'
  if (tvMAC !== tvExpected) {
    console.error('[sv-test] FAIL: expected', tvExpected, 'got', tvMAC)
    throw new Error('SV derivation self-test failed')
  }
  // self-tests passed
}

/** AuthenticateEV2First with AES-128.
 *  Default factory key for key 0 is 16 zero bytes. */
async function authenticateEV2First(
  reader: any,
  keyNo: number,
  key:   Buffer,
): Promise<EV2Session> {
  const zeros = Buffer.alloc(16, 0)

  verifyCMAC()  // fail fast if crypto primitives are wrong

  // ── Step 1: send key number ──────────────────────────────────────────────
  // APDU: 90 71 00 00 02 <keyNo> 00 00
  const apdu1  = Buffer.from([0x90, 0x71, 0x00, 0x00, 0x02, keyNo, 0x00, 0x00])
  let resp1    = await reader.transmit(apdu1, 64) as Buffer
  let sw1      = resp1.slice(-2)

  // 91CA = COMMAND_ABORTED: card had a pending multi-frame exchange but sending
  // any non-continuation command (our step 1) causes it to abort and return to
  // idle. Retry step 1 immediately — no dummy frame needed.
  if (sw1[0] === 0x91 && sw1[1] === 0xCA) {
    resp1 = await reader.transmit(apdu1, 64) as Buffer
    sw1   = resp1.slice(-2)
  }

  if (sw1[0] !== 0x91 || sw1[1] !== 0xAF) {
    throw new Error(`AuthEV2First step1: SW=${sw1.toString('hex').toUpperCase()}`)
  }

  const ekRndB = resp1.slice(0, 16)
  const rndB   = aesCBCDecrypt(key, zeros, ekRndB)

  // ── Step 2: send token = ENC(RndA || rotLeft(RndB, 1)) ─────────────────
  const rndA  = randomBytes(16)
  const token = aesCBCEncrypt(key, zeros, Buffer.concat([rndA, rotLeft(rndB, 1)]))

  const apdu2 = Buffer.concat([
    Buffer.from([0x90, 0xAF, 0x00, 0x00, 0x20]),
    token,
    Buffer.from([0x00]),
  ])
  const resp2 = await reader.transmit(apdu2, 64) as Buffer
  const sw2   = resp2.slice(-2)
  if (sw2[0] !== 0x91 || sw2[1] !== 0x00) {
    throw new Error(`AuthEV2First step2: SW=${sw2.toString('hex').toUpperCase()}`)
  }

  // Card response: AES_CBC(masterKey, IV=zeros, TI(4) || rotLeft(RndA,1)(16) || PDcap2(6) || PCDcap2(6))
  // The entire response body is encrypted — TI is NOT in plaintext.
  const respData  = resp2.slice(0, resp2.length - 2)
  const decResp   = aesCBCDecrypt(key, zeros, respData)
  const ti        = decResp.slice(0, 4)
  const rndA_rot  = decResp.slice(4, 20)

  if (!rndA_rot.equals(rotLeft(rndA, 1))) {
    throw new Error('AuthEV2First: RndA mismatch — wrong key or counterfeit card')
  }

  // ── Derive session keys per AN12196 §6.6 (NTAG 424 DNA) ──────────────────
  // SV = A55A000100 80 (6B) || RndA[0:2] || XOR(RndA[2:8], RndB[0:6]) || RndB[6:16] || RndA[8:16]
  // Note: DESFire EV2/EV3 uses a different 12-byte constant — do NOT use that here.
  const svXor = Buffer.alloc(6)
  for (let i = 0; i < 6; i++) svXor[i] = rndA[2 + i] ^ rndB[i]
  const svBody = Buffer.concat([rndA.slice(0, 2), svXor, rndB.slice(6), rndA.slice(8)])
  const sv1 = Buffer.concat([Buffer.from([0xA5, 0x5A, 0x00, 0x01, 0x00, 0x80]), svBody])
  const sv2 = Buffer.concat([Buffer.from([0x5A, 0xA5, 0x00, 0x01, 0x00, 0x80]), svBody])

  return { ti, sesAuthEnc: aesCMAC(key, sv1), sesAuthMAC: aesCMAC(key, sv2), cmdCtr: 0 }
}

// ── SDM Configuration ──────────────────────────────────────────────────────

/** Send ChangeFileSettings (0x5F) for File 02 to enable plain UID mirroring
 *  at the given byte offset within the NDEF file data.
 *  readCtrNdefOffset — NDEF file offset for the read-counter mirror; defaults to
 *  uidOffset + 14 (right after the UID, outside the URL) when not supplied. */
async function configureSDMUIDMirror(
  reader:              any,
  sess:                EV2Session,
  uidOffset:           number,
  ar0 = 0x00,
  ar1 = 0xE0,
  readCtrNdefOffset?: number,
): Promise<void> {
  const { ti, sesAuthEnc, sesAuthMAC } = sess
  const cmdCtr = sess.cmdCtr
  const fileNo = 0x02

  const readCtrOffset  = readCtrNdefOffset ?? uidOffset + 14
  const macInputOffset = 2
  const macOffset      = readCtrOffset + 6
  const plain = Buffer.concat([
    Buffer.from([0x40, ar0, ar1, 0xC1, 0xFF, 0xE0]),
    Buffer.from([
      uidOffset     & 0xFF, (uidOffset     >> 8) & 0xFF, (uidOffset     >> 16) & 0xFF,
      readCtrOffset & 0xFF, (readCtrOffset  >> 8) & 0xFF, (readCtrOffset  >> 16) & 0xFF,
      macInputOffset & 0xFF, (macInputOffset >> 8) & 0xFF, (macInputOffset >> 16) & 0xFF,
      macOffset     & 0xFF, (macOffset      >> 8) & 0xFF, (macOffset      >> 16) & 0xFF,
    ]),
  ])

  const ivBuf = Buffer.alloc(16, 0)
  ivBuf[0] = 0xA5; ivBuf[1] = 0x5A
  ti.copy(ivBuf, 2)
  ivBuf[6] = cmdCtr & 0xFF
  ivBuf[7] = (cmdCtr >> 8) & 0xFF
  const enc = aesCBCEncrypt(sesAuthEnc, aesECBEncrypt(sesAuthEnc, ivBuf), iso7816Pad(plain))

  const macIn = Buffer.concat([
    Buffer.from([0x5F, cmdCtr & 0xFF, (cmdCtr >> 8) & 0xFF]),
    ti, Buffer.from([fileNo]), enc,
  ])
  const cmac = aesCMAC(sesAuthMAC, macIn)
  const macT = Buffer.from([cmac[1],cmac[3],cmac[5],cmac[7],cmac[9],cmac[11],cmac[13],cmac[15]])

  const data = Buffer.concat([Buffer.from([fileNo]), enc, macT])
  const apdu = Buffer.concat([Buffer.from([0x90,0x5F,0x00,0x00,data.length]), data, Buffer.from([0x00])])
  const resp = await reader.transmit(apdu, 32) as Buffer
  const sw   = resp.slice(-2)
  if (sw[0] !== 0x91 || sw[1] !== 0x00) {
    throw new Error(`ChangeFileSettings failed: SW=${sw.toString('hex').toUpperCase()}`)
  }
}

// ── Write paths ────────────────────────────────────────────────────────────

/** ChangeFileSettings for File 02 in CommMode.Plain (no auth, no encryption).
 *  Works on factory-fresh chips where Change access = 0xE (free).
 *  Returns the 2-byte SW. */
async function changeFileSettingsPlain(reader: any, uidOffset: number, ar0 = 0x00, ar1 = 0xE0, readCtrNdefOffset?: number): Promise<Buffer> {
  const fileNo = 0x02
  const readCtrOffset  = readCtrNdefOffset ?? uidOffset + 14
  const macInputOffset = 2
  const macOffset      = readCtrOffset + 6
  const plain = Buffer.concat([
    Buffer.from([
      0x40, ar0, ar1,
      0xC1,        // SDMOptions: UIDMirror + ReadCtrMirror + ASCII
      0xFF, 0xE0,  // SDMAccessRights: matches known-working example
    ]),
    Buffer.from([
      uidOffset     & 0xFF, (uidOffset     >> 8) & 0xFF, (uidOffset     >> 16) & 0xFF,
      readCtrOffset & 0xFF, (readCtrOffset >> 8) & 0xFF, (readCtrOffset >> 16) & 0xFF,
      macInputOffset & 0xFF, (macInputOffset >> 8) & 0xFF, (macInputOffset >> 16) & 0xFF,
      macOffset     & 0xFF, (macOffset     >> 8) & 0xFF, (macOffset     >> 16) & 0xFF,
    ]),
  ])
  const data = Buffer.concat([Buffer.from([fileNo]), plain])
  const apdu = Buffer.concat([
    Buffer.from([0x90, 0x5F, 0x00, 0x00, data.length]),
    data,
    Buffer.from([0x00]),
  ])
  const resp = await reader.transmit(apdu, 32) as Buffer
  return resp.slice(-2)
}

/** NTAG 424 DNA (T4T / ISO 7816-4):
 *  1. Writes NDEF record into File 2 via UPDATE BINARY.
 *  2. If URL contains %%MIRROR%%, runs EV2 auth + ChangeFileSettings to
 *     enable plain UID mirroring at the placeholder byte offset. */
async function writeNdefT4T(reader: any, url: string): Promise<void> {
  const { rec, mirrorOffset, ctrOffset } = buildNdefRecord(url)

  // The chip is already in NDEF Application context from the isT4T probe.
  // SELECT NDEF FILE (File ID E104)
  checkSW(
    await reader.transmit(Buffer.from('00A4000C02E10400', 'hex'), 256) as Buffer,
    'SELECT NDEF FILE',
  )

  // Write NLEN = 0 (signals "write in progress")
  checkSW(
    await reader.transmit(Buffer.from([0x00, 0xD6, 0x00, 0x00, 0x02, 0x00, 0x00]), 256) as Buffer,
    'NLEN=0',
  )

  // Write NDEF record at offset 2 (after 2-byte NLEN field) in ≤230-byte chunks
  const CHUNK = 230
  for (let i = 0; i < rec.length; i += CHUNK) {
    const chunk  = rec.slice(i, i + CHUNK)
    const offset = 2 + i
    checkSW(
      await reader.transmit(Buffer.concat([
        Buffer.from([0x00, 0xD6, (offset >> 8) & 0xFF, offset & 0xFF, chunk.length]),
        chunk,
      ]), 256) as Buffer,
      `UPDATE BINARY offset=${offset}`,
    )
  }

  // Write actual NLEN
  const nlen = rec.length
  checkSW(
    await reader.transmit(Buffer.from([0x00, 0xD6, 0x00, 0x00, 0x02, (nlen >> 8) & 0xFF, nlen & 0xFF]), 256) as Buffer,
    'NLEN=actual',
  )

  // ── SDM UID mirror configuration ─────────────────────────────────────────
  if (mirrorOffset >= 0) {
    // Re-select NDEF Application to get a clean session
    checkSW(
      await reader.transmit(Buffer.from('00A4040007D276000085010100', 'hex'), 256) as Buffer,
      'SELECT NDEF APP (SDM)',
    )

    const uidOffset = 2 + mirrorOffset
    // If %%CTR%% is in the URL, place the read-counter mirror at that position;
    // otherwise default to right after the UID (outside the URL end).
    const readCtrNdefOffset = ctrOffset >= 0 ? 2 + ctrOffset : undefined

    // Read current file settings BEFORE auth to get actual AccessRights.
    // Response: FileType(1) FileOption(1) AR0(1) AR1(1) FileSize(3) SW(2)
    const gfsResp = await reader.transmit(
      Buffer.from([0x90, 0xF5, 0x00, 0x00, 0x01, 0x02, 0x00]), 64
    ) as Buffer

    const gfsSW = gfsResp.slice(-2)
    if (gfsSW[0] !== 0x91 || gfsSW[1] !== 0x00) {
      throw new Error(`GetFileSettings failed: SW=${gfsSW.toString('hex').toUpperCase()}`)
    }
    // Use the CURRENT AccessRights so we don't accidentally change them
    const currentAR0 = gfsResp[2]
    const currentAR1 = gfsResp[3]


    // Try CommMode.Plain first — if Change is free this succeeds without auth.
    // If Change requires Key 0 the card returns 91AE and we fall back to Full mode.
    const sw = await changeFileSettingsPlain(reader, uidOffset, currentAR0, currentAR1, readCtrNdefOffset)
    if (sw[0] === 0x91 && sw[1] === 0x00) return  // success

    if (sw[0] === 0x91 && (sw[1] === 0x9D || sw[1] === 0x40 || sw[1] === 0xAE)) {
      // Change requires Key 0 — authenticate then use CommMode.Full
      const sess = await authenticateEV2First(reader, 0, Buffer.alloc(16, 0))
      await configureSDMUIDMirror(reader, sess, uidOffset, currentAR0, currentAR1, readCtrNdefOffset)
      return
    }

    throw new Error(`ChangeFileSettings failed: SW=${sw.toString('hex').toUpperCase()}`)
  }
}

/** NTAG 213/215/216 (T2T / raw memory):
 *  Writes TLV-wrapped NDEF starting at page 4, then configures UID mirror. */
async function writeNdefT2T(reader: any, url: string): Promise<void> {
  const { data, mirrorOffset } = buildNdefUrl(url)

  const padLen = Math.ceil(data.length / 4) * 4
  const padded = Buffer.alloc(padLen, 0x00)
  data.copy(padded)
  await reader.write(4, padded, 4)

  if (mirrorOffset < 0) return

  // Identify config page from Capability Container (page 3, byte 2)
  const cc      = await reader.read(3, 4, 4) as Buffer
  const ccByte2 = cc[2]
  let cfgPage   = 41  // default NTAG213
  if      (ccByte2 === 0x3E) cfgPage = 131  // NTAG215
  else if (ccByte2 === 0x6D) cfgPage = 227  // NTAG216

  const absOffset  = 16 + mirrorOffset  // user memory starts at page 4 = byte 16
  const mirrorPage = Math.floor(absOffset / 4)
  const mirrorByte = absOffset % 4

  // CFG0 MIRROR byte: bits 6:5 = MIRROR_CONF=01 (UID only), bits 3:2 = MIRROR_BYTE
  const mirrorReg = ((0b01 << 5) | (mirrorByte << 2)) & 0xFF
  await reader.write(cfgPage, Buffer.from([mirrorReg, 0x00, mirrorPage & 0xFF, 0xFF]), 4)
}

/** Detect chip type and write NDEF URL accordingly. */
export async function writeNdefToNtag(reader: any, url: string): Promise<void> {
  if (await isT4T(reader)) {
    await writeNdefT4T(reader, url)
  } else {
    await writeNdefT2T(reader, url)
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function checkSW(resp: Buffer, label: string): void {
  const sw = resp.slice(-2)
  if (sw[0] !== 0x90 || sw[1] !== 0x00) {
    throw new Error(`${label} failed: SW=${sw.toString('hex').toUpperCase()}`)
  }
}
