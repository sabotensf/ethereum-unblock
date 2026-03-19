import { ethers } from 'ethers'
import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { writeFileSync, readFileSync, mkdirSync } from 'fs'
import path from 'path'

const g = global as any
if (!g.__tapSess) g.__tapSess = new Map<string, { uid: string; ctr: number | null; expiresAt: number }>()

const DATA_DIR  = path.join(process.cwd(), 'data')
const TAPS_FILE = path.join(DATA_DIR, 'taps.json')

function logTap(entry: { uid: string; ctr: number | null; ts: number }) {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    let taps: unknown[] = []
    try { taps = JSON.parse(readFileSync(TAPS_FILE, 'utf-8')) } catch {}
    taps.push(entry)
    writeFileSync(TAPS_FILE, JSON.stringify(taps, null, 2))
  } catch (err) { console.error('[uid] logTap error:', err) }
}

// Receives raw UID + read counter from NTAG SDM mirroring.
// The chip's hardware counter is the play count — passed through as-is.
export function GET(req: NextRequest) {
  const raw    = req.nextUrl.searchParams.get('raw') ?? ''
  const ctrHex = req.nextUrl.searchParams.get('ctr') ?? ''

  if (!raw) return new Response('Missing raw UID', { status: 400 })

  const hexOnly = raw.toLowerCase().replace(/[^0-9a-f]/g, '')
  const serial  = (hexOnly.match(/.{2}/g) ?? []).join(':')
  const uid     = ethers.id(serial)
  const ctr     = ctrHex ? parseInt(ctrHex, 16) : null

  console.log('[uid] serial:', serial, '→ uid:', uid, '→ ctr:', ctr)
  logTap({ uid, ctr, ts: Date.now() })

  if (req.nextUrl.searchParams.get('debug') === '1') {
    return Response.json({ raw, serial, uid, ctr })
  }

  const forwardedHost  = req.headers.get('x-forwarded-host')
  const forwardedProto = req.headers.get('x-forwarded-proto') ?? 'https'
  const base = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : req.nextUrl.origin

  const tapId   = randomBytes(16).toString('hex')
  const tapSess = g.__tapSess as Map<string, { uid: string; ctr: number | null; expiresAt: number }>
  tapSess.set(tapId, { uid, ctr, expiresAt: Date.now() + 60_000 })
  for (const [id, s] of tapSess) { if (s.expiresAt < Date.now()) tapSess.delete(id) }

  const params = new URLSearchParams({ uid, tapId })
  if (ctr !== null) params.set('ctr', ctr.toString())
  const tapUrl = `${base}/tap?${params.toString()}`
  return new Response(
    `<!doctype html><html><head><script>location.replace(${JSON.stringify(tapUrl)})</script></head></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}
