import { ethers } from 'ethers'
import { EAS, SchemaEncoder } from '@ethereum-attestation-service/eas-sdk'
import { execHaloCmdWeb } from '@arx-research/libhalo/api/web'

// Chip configuration
export const CHIP_TYPE = (process.env.NEXT_PUBLIC_CHIP_TYPE ?? 'NTAG') as 'NTAG' | 'HALO'
export const HALO_CHIP_ADDRESS = (process.env.NEXT_PUBLIC_HALO_CHIP_ADDRESS ?? '').toLowerCase()

// Fixed challenge message — deterministic so the recovered address is always consistent
const HALO_CHALLENGE = ethers.id('RecordPool.v1').slice(2) // 32-byte hex, no 0x prefix

export async function scanHalo(): Promise<{ matched: boolean; chipAddress: string }> {
  const result = await execHaloCmdWeb({
    name: 'sign',
    keyNo: 1,
    message: HALO_CHALLENGE,
  }) as { etherAddress: string }

  const chipAddress = result.etherAddress.toLowerCase()
  return {
    matched: chipAddress === HALO_CHIP_ADDRESS,
    chipAddress,
  }
}

const EAS_CONTRACT_ADDRESS = '0xC2679fBD37d54388Ce493F1DB75320D236e1815e' // Sepolia

const EAS_CHAIN_NAMES: Record<string, string> = {
  '0xC2679fBD37d54388Ce493F1DB75320D236e1815e': 'Ethereum Sepolia',
  '0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587': 'Ethereum Mainnet',
  '0x4200000000000000000000000000000000000021': 'Optimism',
  '0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458': 'Base',
}

const EAS_SAFE_PREFIXES: Record<string, string> = {
  '0xC2679fBD37d54388Ce493F1DB75320D236e1815e': 'sep',
  '0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587': 'eth',
  '0x4200000000000000000000000000000000000021': 'oeth',
  '0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458': 'base',
}

export const EAS_CHAIN_NAME = EAS_CHAIN_NAMES[EAS_CONTRACT_ADDRESS] ?? 'Unknown Network'
export const SAFE_URL = (address: string) =>
  `https://app.safe.global/home?safe=${EAS_SAFE_PREFIXES[EAS_CONTRACT_ADDRESS] ?? 'eth'}:${address}`

const EAS_SCAN_BASES: Record<string, string> = {
  '0xC2679fBD37d54388Ce493F1DB75320D236e1815e': 'https://sepolia.easscan.org',
  '0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587': 'https://easscan.org',
  '0x4200000000000000000000000000000000000021': 'https://optimism.easscan.org',
  '0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458': 'https://base.easscan.org',
}
const EAS_SCAN_BASE = EAS_SCAN_BASES[EAS_CONTRACT_ADDRESS] ?? 'https://sepolia.easscan.org'
export const EAS_ATTESTATION_URL = (uid: string) => `${EAS_SCAN_BASE}/attestation/view/${uid}`
export const EAS_SCHEMA_URL = () =>
  `${EAS_SCAN_BASE}/schema/view/${process.env.NEXT_PUBLIC_EAS_SCHEMA_UID ?? ''}`

const EAS_GRAPHQL_ENDPOINTS: Record<string, string> = {
  '0xC2679fBD37d54388Ce493F1DB75320D236e1815e': 'https://sepolia.easscan.org/graphql',
  '0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587': 'https://easscan.org/graphql',
  '0x4200000000000000000000000000000000000021': 'https://optimism.easscan.org/graphql',
  '0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458': 'https://base.easscan.org/graphql',
}
const EAS_GRAPHQL = EAS_GRAPHQL_ENDPOINTS[EAS_CONTRACT_ADDRESS] ?? 'https://sepolia.easscan.org/graphql'

export interface AttestationResult {
  uid: string
  metadata: Partial<ReleaseMetadata>
}

export async function fetchAttestationByNfcHash(nfcUidHash: string): Promise<AttestationResult | null> {
  const cacheKey = `eas:${nfcUidHash}`
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) return JSON.parse(cached)
  } catch { /* localStorage unavailable */ }

  const schemaUid = process.env.NEXT_PUBLIC_EAS_SCHEMA_UID ?? ''
  const searchStr = nfcUidHash.toLowerCase().replace('0x', '')
  const query = `{
    attestations(
      where: {
        schemaId: { equals: "${schemaUid}" }
        decodedDataJson: { contains: "${searchStr}" }
        revoked: { equals: false }
      }
      orderBy: { time: desc }
      take: 1
    ) {
      id
      decodedDataJson
    }
  }`

  console.log('[eas] schemaUid:', schemaUid || '(empty — check NEXT_PUBLIC_EAS_SCHEMA_UID)')
  console.log('[eas] searching for:', searchStr)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    const res = await fetch(EAS_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const json = await res.json()
    console.log('[eas] response:', JSON.stringify(json))
    const attestation = json.data?.attestations?.[0]
    if (!attestation) return null

    const fields: { name: string; value: { value: string } }[] = JSON.parse(attestation.decodedDataJson)
    const get = (name: string): string => {
      const field = fields.find(f => f.name === name)
      const val = field?.value?.value
      return typeof val === 'string' ? val : ''
    }

    const result: AttestationResult = {
      uid: attestation.id,
      metadata: {
        isrc:          get('isrc'),
        iswc:          get('iswc'),
        displayArtist: get('displayArtist'),
        displayTitle:  get('displayTitle'),
        pLine:         get('pLine'),
        cLine:         get('cLine'),
        upc:           get('upc'),
        labelName:     get('labelName'),
        genre:         get('genre'),
        releaseDate:   get('releaseDate'),
        explicit:      get('explicit'),
        territory:     get('territory'),
        language:      get('language'),
      },
    }
    try { localStorage.setItem(cacheKey, JSON.stringify(result)) } catch { /* ignore */ }
    return result
  } catch {
    return null
  }
}
const EAS_SCHEMA_UID = process.env.NEXT_PUBLIC_EAS_SCHEMA_UID ?? ''
const DDEX_SCHEMA = 'string isrc, string iswc, string displayArtist, string displayTitle, string pLine, string cLine, bytes32 nfcUidHash, string upc, string labelName, string genre, string releaseDate, string explicit, string territory, string language'

export async function createAttestation(
  signer: ethers.Signer,
  metadata: ReleaseMetadata & { nfcUidHash: string }
): Promise<string> {
  const eas = new EAS(EAS_CONTRACT_ADDRESS)
  eas.connect(signer)

  const encoder = new SchemaEncoder(DDEX_SCHEMA)
  const encoded = encoder.encodeData([
    { name: 'isrc',          value: metadata.isrc,          type: 'string' },
    { name: 'iswc',          value: metadata.iswc,          type: 'string' },
    { name: 'displayArtist', value: metadata.displayArtist, type: 'string' },
    { name: 'displayTitle',  value: metadata.displayTitle,  type: 'string' },
    { name: 'pLine',         value: metadata.pLine,         type: 'string' },
    { name: 'cLine',         value: metadata.cLine,         type: 'string' },
    { name: 'nfcUidHash',    value: metadata.nfcUidHash,    type: 'bytes32' },
    { name: 'upc',           value: metadata.upc,           type: 'string' },
    { name: 'labelName',     value: metadata.labelName,     type: 'string' },
    { name: 'genre',         value: metadata.genre,         type: 'string' },
    { name: 'releaseDate',   value: metadata.releaseDate,   type: 'string' },
    { name: 'explicit',      value: metadata.explicit,      type: 'string' },
    { name: 'territory',     value: metadata.territory,     type: 'string' },
    { name: 'language',      value: metadata.language,      type: 'string' },
  ])

  const tx = await eas.attest({
    schema: EAS_SCHEMA_UID,
    data: {
      recipient: await signer.getAddress(),
      expirationTime: BigInt(0),
      revocable: true,
      data: encoded,
    },
  })

  const uid = await tx.wait()
  return uid
}

export interface ReleaseMetadata {
  // DDEX core — encoded in EAS attestation
  isrc: string
  iswc: string
  displayArtist: string
  displayTitle: string
  pLine: string
  cLine: string
  // DSP distribution — captured for delivery, not on-chain
  upc: string
  genre: string
  releaseDate: string   // YYYY-MM-DD
  labelName: string
  explicit: string      // "NotExplicit" | "Explicit"
  territory: string     // "Worldwide" or ISO 3166-1 alpha-2 list
  language: string      // ISO 639-2 e.g. "en"
  // Display — not on-chain
  coverArtUrl?: string
}

export interface ChipEntry {
  id: string
  etherAddress: string   // HaLo: Ethereum address | NTAG: ethers.id(serialNumber)
  serialNumber?: string  // NTAG raw UID e.g. "04:71:67:32:15:19:90"
  status: 'pending' | 'attesting' | 'attested' | 'error'
  attestationUid?: string
}

export async function batchAttest(
  signer: ethers.Signer,
  metadata: ReleaseMetadata,
  chips: ChipEntry[],
  onProgress: (id: string, status: ChipEntry['status'], uid?: string) => void
): Promise<void> {
  const eas = new EAS(EAS_CONTRACT_ADDRESS)
  eas.connect(signer)

  const encoder = new SchemaEncoder(DDEX_SCHEMA)

  chips.forEach(c => onProgress(c.id, 'attesting'))

  try {
    const tx = await eas.multiAttest([{
      schema: EAS_SCHEMA_UID,
      data: chips.map(chip => {
        // Normalize to bytes32: HaLo gives a 20-byte address, NTAG gives a 32-byte hash
        const nfcUidHash = chip.etherAddress.length === 42
          ? ethers.zeroPadValue(chip.etherAddress, 32)
          : chip.etherAddress

        return {
          recipient: chip.etherAddress.length === 42 ? chip.etherAddress : ethers.ZeroAddress,
          expirationTime: BigInt(0),
          revocable: true,
          data: encoder.encodeData([
            { name: 'isrc',          value: metadata.isrc,          type: 'string' },
            { name: 'iswc',          value: metadata.iswc,          type: 'string' },
            { name: 'displayArtist', value: metadata.displayArtist, type: 'string' },
            { name: 'displayTitle',  value: metadata.displayTitle,  type: 'string' },
            { name: 'pLine',         value: metadata.pLine,         type: 'string' },
            { name: 'cLine',         value: metadata.cLine,         type: 'string' },
            { name: 'nfcUidHash',    value: nfcUidHash,             type: 'bytes32' },
            { name: 'upc',           value: metadata.upc,           type: 'string' },
            { name: 'labelName',     value: metadata.labelName,     type: 'string' },
            { name: 'genre',         value: metadata.genre,         type: 'string' },
            { name: 'releaseDate',   value: metadata.releaseDate,   type: 'string' },
            { name: 'explicit',      value: metadata.explicit,      type: 'string' },
            { name: 'territory',     value: metadata.territory,     type: 'string' },
            { name: 'language',      value: metadata.language,      type: 'string' },
          ]),
        }
      }),
    }])

    let uids: any = null
    try {
      // Race tx.wait() against a 30s timeout — WalletConnect sometimes hangs forever
      uids = await Promise.race([
        tx.wait(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('tx.wait timeout')), 30_000)
        ),
      ])
      console.log('[eas] tx.wait() returned:', uids)
    } catch (waitErr: any) {
      // tx was broadcast; receipt parsing failed or timed out — still mark attested
      console.warn('[eas] tx.wait() threw/timed out:', waitErr?.message)
      chips.forEach(c => onProgress(c.id, 'attested'))
      return
    }

    // Transaction confirmed — mark attested regardless of UID parsing
    chips.forEach(c => onProgress(c.id, 'attested'))

    // UID extraction — uids should be string[] of bytes32 hex from Attested event logs
    try {
      const uidList: string[] = Array.isArray(uids) ? uids : (uids ? [uids as string] : [])
      console.log('[eas] uidList:', uidList)
      chips.forEach((chip, i) => {
        const uid = uidList[i]
        if (uid && typeof uid === 'string' && uid.startsWith('0x') && uid.length === 66) {
          onProgress(chip.id, 'attested', uid)
        } else {
          console.warn('[eas] unexpected uid at index', i, ':', uid)
        }
      })
    } catch (e) {
      console.error('[eas] UID extraction failed:', e)
    }
  } catch (e: any) {
    chips.forEach(c => onProgress(c.id, 'error'))
    throw e
  }
}

// 1. Verifiability: EAS Schema (NFC Tap)
export const EAS_SCHEMA = {
  name: 'RecordPool.v1',
  schema: 'bytes32 isrcHash, address artistWallet, uint16 royaltyBps, string metadataURI',
  revocable: true,
}

// 2. Enforcement: Zodiac Roles Modifier
export const ZODIAC_ROLES_CONFIG = {
  roleKey: 'VERIFIED_LISTENER',
  targetAddress: '0xYOUR_RECORDPOOL_CONTRACT',
  functions: [
    {
      selector: '0xABCD1234',
      parameters: [
        {
          index: 0,
          type: 'Calldata',
          condition: 'Matches',
          children: [
            {
              index: 0,
              type: 'Static',
              condition: 'EqualTo',
              compValue: '0xYOUR_EAS_ATTESTATION_UID',
            },
          ],
        },
      ],
    },
  ],
}

// 3. Composability: 0xSplits V2
export const SPLITS_CONFIG = {
  recipients: ['0xArtistAddress', '0xRecordPoolProtocolAddress'].sort(),
  allocations: [8000, 2000],
  totalAllocation: 10000,
  distributorFee: 0,
  controller: '0xYourSafeAddress',
}

// 4. Automation: Royalty Distribution
const splitterAbi = [
  'function distribute(address token, address[] accounts, uint32[] percentAllocations, uint32 distributorFee, address distributorAddress) external',
]

export async function triggerRoyaltySplit(
  splitterAddress: string,
  artistAddr: string,
  poolAddr: string,
  signer: ethers.Signer
) {
  const splitter = new ethers.Contract(splitterAddress, splitterAbi, signer)
  const tx = await splitter.distribute(
    ethers.ZeroAddress,
    [artistAddr, poolAddr].sort(),
    [2000, 8000], // match sorted order
    0,
    await signer.getAddress()
  )
  await tx.wait()
  console.log('Royalties Distributed!')
}
