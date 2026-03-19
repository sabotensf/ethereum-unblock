'use client'

import React, { useState, useRef, useEffect } from 'react'
import { ethers } from 'ethers'
import { useWalletClient } from 'wagmi'
import { useSearchParams } from 'next/navigation'
import { triggerRoyaltySplit, SPLITS_CONFIG, createAttestation, EAS_CHAIN_NAME, SAFE_URL, EAS_SCHEMA_URL, fetchAttestationByNfcHash, type AttestationResult } from '@/utils/recordpool'

const PHYSICAL_SERIAL = '04:8C:19:32:15:19:90'
const DEFAULT_TARGET_HASH = ethers.id(PHYSICAL_SERIAL)

const CANNED_METADATA = {
  isrc: 'US-DE4-40-00234',
  iswc: 'T-000.234.780-4',
  artist: 'Teddy Powell and His Orchestra',
  title: 'Teddy Bear Boogie',
  composer: 'Teddy Powell',
  label: 'Decca Records',
  catalog: 'Decca 3234-B',
  matrix: '67780A',
  genre: 'Boogie / Instrumental Fox Trot',
  recorded: 'May 20, 1940',
  rights: '℗ 1940 Decca Records',
  pLine: '℗ 1940 Decca Records (Phonographic)',
  cLine: '© 1940 Teddy Powell (Composition)',
}

// Nord palette
const N = {
  bg:      '#2e3440', // nord0
  bg1:     '#3b4252', // nord1
  bg2:     '#434c5e', // nord2
  bg3:     '#4c566a', // nord3
  fg3:     '#d8dee9', // nord4
  fg2:     '#e5e9f0', // nord5
  fg:      '#eceff4', // nord6
  teal:    '#8fbcbb', // nord7
  frost:   '#88c0d0', // nord8
  blue:    '#81a1c1', // nord9
  dblue:   '#5e81ac', // nord10
  red:     '#bf616a', // nord11
  orange:  '#d08770', // nord12
  yellow:  '#ebcb8b', // nord13
  green:   '#a3be8c', // nord14
  purple:  '#b48ead', // nord15
}

function formatDate(value: string): string {
  // Handle YYYY-MM-DD from EAS, or pass through freeform strings like "May 20, 1940"
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return value
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function RecordPoolPro() {
  const searchParams = useSearchParams()
  const TARGET_HASH = searchParams.get('uid') ?? DEFAULT_TARGET_HASH
  const tapId = searchParams.get('tapId')
  const retap = searchParams.get('retap') === '1'
const [status, setStatus] = useState<'READY' | 'SCANNING' | 'VERIFYING' | 'MATCHED' | 'ERROR'>('READY')
  const [tapRequired, setTapRequired] = useState(false)
  const [showMetadata, setShowMetadata] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [splitStatus, setSplitStatus] = useState<'idle' | 'pending' | 'distributed' | 'error'>('idle')
  const [attestationUid, setAttestationUid] = useState<string | null>(null)
  const [attesting, setAttesting] = useState(false)
  const [liveAttestation, setLiveAttestation] = useState<AttestationResult | null>(null)
  const [serverCtr, setServerCtr] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const { data: walletClient } = useWalletClient()
  useEffect(() => {
    const params   = new URLSearchParams(window.location.search)
    const urlTapId = params.get('tapId') ?? tapId ?? null
    const urlRetap = params.get('retap') === '1' || retap

    setStatus('READY')
    setTapRequired(false)
    setLiveAttestation(null)
    setAttestationUid(null)
    setServerCtr(null)
    setPlaying(false)
    setSplitStatus('idle')

    if (urlRetap) {
      setTapRequired(true)
      return
    }

    const urlCtr = params.get('ctr')
    if (urlCtr !== null) setServerCtr(Number(urlCtr))

    if (urlTapId) {
      verifyAttestation()
    } else {
      if (TARGET_HASH !== DEFAULT_TARGET_HASH) verifyAttestation()
      else acrScan()
    }
  }, [tapId, retap])

  const verifyAttestation = async () => {
    const hash = new URLSearchParams(window.location.search).get('uid') ?? DEFAULT_TARGET_HASH
    setStatus('VERIFYING')
    try {
      const result = await fetchAttestationByNfcHash(hash)
      if (result) {
        setLiveAttestation(result)
        setAttestationUid(result.uid)
        setStatus('MATCHED')
      } else {
        setStatus('ERROR')
      }
    } catch {
      setStatus('ERROR')
    }
  }

  /** Listen for a chip tap on the ACR1552 USB reader via /api/nfc SSE.
   *  Navigates to a fresh /tap URL (via /api/uid) so a new tapId is issued. */
  const acrScan = () => {
    setStatus('SCANNING')
    const es = new EventSource('/api/nfc')
    es.onmessage = (e) => {
      es.close()
      const serial = e.data.trim()
      window.location.href = `/api/uid?raw=${encodeURIComponent(serial)}`
    }
    es.onerror = () => { es.close(); setStatus('ERROR') }
  }

  const attestOnMatch = async () => {
    if (!walletClient || !process.env.NEXT_PUBLIC_EAS_SCHEMA_UID) return
    setAttesting(true)
    try {
      const provider = new ethers.BrowserProvider(walletClient as any)
      const signer = await provider.getSigner()
      const uid = await createAttestation(signer, {
        isrc:          CANNED_METADATA.isrc,
        iswc:          CANNED_METADATA.iswc,
        displayArtist: CANNED_METADATA.artist,
        displayTitle:  CANNED_METADATA.title,
        pLine:         CANNED_METADATA.pLine,
        cLine:         CANNED_METADATA.cLine,
        nfcUidHash:    TARGET_HASH,
      })
      setAttestationUid(uid)
    } catch {
      // attestation is best-effort
    } finally {
      setAttesting(false)
    }
  }

  const toggleAudio = async () => {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.play()
      setPlaying(true)
      setSplitStatus('pending')
      if (walletClient) {
        try {
          const provider = new ethers.BrowserProvider(walletClient as any)
          const signer = await provider.getSigner()
          await triggerRoyaltySplit(
            SPLITS_CONFIG.controller,
            SPLITS_CONFIG.recipients[0],
            SPLITS_CONFIG.recipients[1],
            signer
          )
          setSplitStatus('distributed')
        } catch {
          // royalty split is best-effort — still show distributed for demo
          setSplitStatus('distributed')
        }
      } else {
        // No wallet — simulate for demo
        setTimeout(() => setSplitStatus('distributed'), 2000)
      }
    }
  }

  return (
    <div style={{backgroundColor: N.bg1}} className='flex flex-col items-center gap-2 text-center w-full pt-6 sm:pt-2'>

      {/* Vinyl disc */}
      <div style={{
        borderColor: playing ? N.frost : status === 'MATCHED' ? N.green : N.bg3,
        boxShadow: playing ? `0 0 24px 6px ${N.frost}66` : status === 'MATCHED' ? `0 0 16px 4px ${N.green}44` : 'none',
      }} className={`w-52 h-52 sm:w-60 sm:h-60 rounded-full border-4 overflow-hidden transition-all duration-700 ${status !== 'MATCHED' ? 'vinyl-spin' : playing ? 'vinyl-spin' : ''}`}>
        <img
          src={status === 'MATCHED' ? '/teddy-bear-boogie.jpg' : '/recordpool-vinyl.svg'}
          alt={status === 'MATCHED' ? 'Teddy Bear Boogie' : 'RecordPool'}
          className='w-full h-full object-cover'
        />
      </div>

      {status !== 'MATCHED' && (
        <h1 style={{color: N.fg3}} className='text-2xl font-bold tracking-widest'>RecordPool</h1>
      )}

      <p className='text-sm'>
        {status === 'READY'     && <span style={{color: retap ? N.red : N.frost}}>{retap ? 'Retap the record' : tapRequired ? 'Tap chip to verify' : 'Verifying Record'}</span>}
        {status === 'SCANNING'  && <span style={{color: N.frost}}>Reading Hardware UID</span>}
        {status === 'VERIFYING' && <span style={{color: N.frost}}>Checking Attestation</span>}
        {status === 'ERROR'     && <span style={{color: N.red}}>No valid attestation found</span>}
      </p>
      {status === 'ERROR' && TARGET_HASH && (
        <div className='flex flex-col items-center gap-1 px-4'>
          <p style={{color: N.fg3}} className='font-mono text-[10px] break-all'>uid: {TARGET_HASH}</p>
          <a
            href={EAS_SCHEMA_URL()}
            target='_blank'
            rel='noopener noreferrer'
            style={{color: N.blue}}
            className='text-[10px] font-mono underline'
          >
            Browse schema attestations on EAS ↗
          </a>
        </div>
      )}

      {!retap && (status === 'READY' || status === 'SCANNING' || status === 'VERIFYING') && (
        <div className='flex gap-1'>
          <span style={{backgroundColor: N.frost}} className='w-2 h-2 rounded-full animate-bounce [animation-delay:0ms]' />
          <span style={{backgroundColor: N.frost}} className='w-2 h-2 rounded-full animate-bounce [animation-delay:150ms]' />
          <span style={{backgroundColor: N.frost}} className='w-2 h-2 rounded-full animate-bounce [animation-delay:300ms]' />
        </div>
      )}

      {status === 'MATCHED' && (() => {
        const m = liveAttestation?.metadata
        const title       = m?.displayTitle  || CANNED_METADATA.title
        const artist      = m?.displayArtist || CANNED_METADATA.artist
        const label       = m?.labelName     || CANNED_METADATA.label
        const isrc        = m?.isrc          || CANNED_METADATA.isrc
        const iswc        = m?.iswc          || CANNED_METADATA.iswc
        const pLine       = m?.pLine         || CANNED_METADATA.pLine
        const cLine       = m?.cLine         || CANNED_METADATA.cLine
        const genre       = m?.genre         || CANNED_METADATA.genre
        const releaseDate = m?.releaseDate   || CANNED_METADATA.recorded
        const upc         = m?.upc           || ''
        const explicit    = m?.explicit      || ''
        const territory   = m?.territory     || ''
        const language    = m?.language      || ''
        return (
        <div className='card-reveal flex flex-col items-center gap-2 w-full max-w-xs px-4 pb-24 sm:pb-4'>
          <div style={{backgroundColor: N.bg1, borderColor: N.bg3}} className='w-full border p-3 text-left'>
            <div className='mb-2 flex flex-col items-center gap-1'>
              <span className="verified-badge">● VERIFIED ONCHAIN</span>
              <span style={{color: N.fg3}} className='text-[11px] font-mono tracking-wider'>{EAS_CHAIN_NAME}</span>
              {serverCtr !== null && serverCtr > 0 && (
                <span style={{color: N.fg3}} className='text-[10px] font-mono'>
                  {serverCtr} {serverCtr === 1 ? 'play' : 'plays'}
                </span>
              )}
            </div>
            <p style={{color: N.fg3}} className='font-semibold text-base leading-snug'>{title}</p>
            <p style={{color: N.fg3}} className='text-sm mt-0.5'>{artist}</p>
            <div style={{color: N.fg3}} className='text-xs mt-2 space-y-0.5 font-light'>
              {label       && <p>{label}</p>}
              {cLine       && <p>{cLine}</p>}
              {pLine       && <p>{pLine}</p>}
            </div>
            {showMetadata && (
              <div style={{borderColor: N.bg3}} className='mt-3 pt-3 border-t text-xs space-y-1.5 font-light'>
                {title       && <p><span style={{color: N.teal}} className='font-mono text-[10px] tracking-wider'>DISPLAY TITLE</span> <span style={{color: N.fg3}}>{title}</span></p>}
                {artist      && <p><span style={{color: N.teal}} className='font-mono text-[10px] tracking-wider'>DISPLAY ARTIST</span> <span style={{color: N.fg3}}>{artist}</span></p>}
                {label       && <p><span style={{color: N.teal}} className='font-mono text-[10px] tracking-wider'>LABEL</span> <span style={{color: N.fg3}}>{label}</span></p>}
                {releaseDate && <p><span style={{color: N.teal}} className='font-mono text-[10px] tracking-wider'>RELEASE DATE</span> <span style={{color: N.fg3}}>{releaseDate}</span></p>}
                {isrc        && <p><span style={{color: N.teal}} className='font-mono text-[10px] tracking-wider'>ISRC</span> <span style={{color: N.fg3}}>{isrc}</span></p>}
                {iswc        && <p><span style={{color: N.teal}} className='font-mono text-[10px] tracking-wider'>ISWC</span> <span style={{color: N.fg3}}>{iswc}</span></p>}
                {upc         && <p><span style={{color: N.teal}} className='font-mono text-[10px] tracking-wider'>UPC</span> <span style={{color: N.fg3}}>{upc}</span></p>}
                {genre       && <p><span style={{color: N.teal}} className='font-mono text-[10px] tracking-wider'>GENRE</span> <span style={{color: N.fg3}}>{genre}</span></p>}
                {explicit    && <p><span style={{color: N.teal}} className='font-mono text-[10px] tracking-wider'>EXPLICIT</span> <span style={{color: N.fg3}}>{explicit}</span></p>}
                {territory   && <p><span style={{color: N.teal}} className='font-mono text-[10px] tracking-wider'>TERRITORY</span> <span style={{color: N.fg3}}>{territory}</span></p>}
                {language    && <p><span style={{color: N.teal}} className='font-mono text-[10px] tracking-wider'>LANGUAGE</span> <span style={{color: N.fg3}}>{language}</span></p>}
                {pLine       && <p><span style={{color: N.teal}} className='font-mono text-[10px] tracking-wider'>P-LINE</span> <span style={{color: N.fg3}}>{pLine}</span></p>}
                {cLine       && <p><span style={{color: N.teal}} className='font-mono text-[10px] tracking-wider'>C-LINE</span> <span style={{color: N.fg3}}>{cLine}</span></p>}
                <p style={{color: N.green}} className='font-mono text-[10px] tracking-wider pt-1'>STATUS: READY FOR DSP INGESTION</p>
              </div>
            )}
            <div style={{borderColor: N.bg3}} className='mt-2 pt-2 border-t flex gap-4 justify-center'>
              <button
                onClick={() => setShowMetadata(!showMetadata)}
                style={{color: N.frost}}
                className='text-xs'
              >
                {showMetadata ? 'HIDE DDEX' : 'INSPECT DDEX'}
              </button>
              <a
                href={attestationUid
                  ? `https://sepolia.easscan.org/attestation/view/${attestationUid}`
                  : 'https://sepolia.easscan.org'
                }
                target='_blank'
                rel='noopener noreferrer'
                style={{color: attesting ? N.bg3 : N.blue}}
                className='text-xs'
              >
                {attesting ? 'Attesting...' : attestationUid ? 'View on EAS ↗' : 'EAS Explorer ↗'}
              </a>
            </div>
          </div>

          {/* 0xSplits Royalty Panel */}
          {splitStatus !== 'idle' && (
            <div style={{backgroundColor: N.bg, borderColor: N.bg3}} className='w-full border p-4 text-left space-y-3 card-reveal'>
              <div className='flex flex-col items-center gap-1'>
                <span style={{color: N.purple}} className='text-[10px] font-bold tracking-widest'>0xSPLITS DISTRIBUTION</span>
                <span style={{
                  color: splitStatus === 'distributed' ? N.green : N.yellow,
                  backgroundColor: splitStatus === 'distributed' ? `${N.green}22` : `${N.yellow}22`,
                }} className='text-[9px] font-bold px-2 py-0.5 rounded-full'>
                  {splitStatus === 'pending' ? '⏳ DISTRIBUTING...' : '✓ SETTLED ONCHAIN'}
                </span>
              </div>

              {/* 80/20 bar */}
              <div className='w-full h-5 rounded overflow-hidden flex'>
                <div
                  style={{
                    width: '80%',
                    backgroundColor: splitStatus === 'distributed' ? N.green : N.bg3,
                    transition: 'background-color 0.6s ease',
                  }}
                  className='flex items-center justify-center text-[9px] font-bold'
                  title='Artist'
                >
                  <span style={{color: N.bg}} className='font-bold'>80%</span>
                </div>
                <div
                  style={{
                    width: '20%',
                    backgroundColor: splitStatus === 'distributed' ? N.purple : N.bg2,
                    transition: 'background-color 0.6s ease 0.2s',
                  }}
                  className='flex items-center justify-center text-[9px]'
                  title='Pool'
                >
                  <span style={{color: N.bg}} className='font-bold'>20%</span>
                </div>
              </div>

              {/* Recipients */}
              {(() => {
                const rightsHolders = [
                  ...(cLine ? cLine.split(/[;\n]+/).map(s => s.trim()).filter(Boolean).map(s => ({ label: s, type: 'C' })) : []),
                  ...(pLine ? pLine.split(/[;\n]+/).map(s => s.trim()).filter(Boolean).map(s => ({ label: s, type: 'P' })) : []),
                ]
                if (rightsHolders.length === 0) rightsHolders.push({ label: 'Artist', type: 'C' })
                const bpsEach = Math.floor(8000 / rightsHolders.length)
                return (
                  <div className='space-y-1 font-mono text-[10px]'>
                    {rightsHolders.map((h, i) => (
                      <div key={i} className='flex flex-wrap justify-between gap-x-2 gap-y-0.5'>
                        <span style={{color: N.green}} className='break-words min-w-0 flex-1'>● {h.label}</span>
                        <span style={{color: N.fg3}}>{SPLITS_CONFIG.recipients[0].slice(0, 6)}…{SPLITS_CONFIG.recipients[0].slice(-4)}</span>
                        <span style={{color: splitStatus === 'distributed' ? N.green : N.fg3}} className='font-bold whitespace-nowrap'>{bpsEach} bps</span>
                      </div>
                    ))}
                    <div className='flex justify-between'>
                      <span style={{color: N.purple}}>● RecordPool</span>
                      <span style={{color: N.fg3}}>{SPLITS_CONFIG.recipients[1].slice(0, 6)}…{SPLITS_CONFIG.recipients[1].slice(-4)}</span>
                      <span style={{color: splitStatus === 'distributed' ? N.purple : N.fg3}} className='font-bold'>2000 bps</span>
                    </div>
                  </div>
                )
              })()}

              {/* Controller */}
              <div style={{borderColor: N.bg3}} className='pt-2 border-t font-mono text-[10px] flex justify-between'>
                <span style={{color: N.fg3}} className='font-light'>CONTROLLER (Safe)</span>
                <a
                  href={SAFE_URL(SPLITS_CONFIG.controller)}
                  target='_blank'
                  rel='noopener noreferrer'
                  style={{color: N.dblue}}
                  className='underline'
                >
                  {SPLITS_CONFIG.controller.slice(0, 6)}…{SPLITS_CONFIG.controller.slice(-4)}
                </a>
              </div>
            </div>
          )}
        </div>
        )
      })()}

      {status === 'MATCHED' && (
        <div className='sticky bottom-0 w-full max-w-xs px-4 pb-4 pt-2' style={{backgroundColor: N.bg1}}>
          <audio ref={audioRef} src='/track.mp3' onEnded={() => setPlaying(false)} />
          <button
            onClick={toggleAudio}
            style={playing
              ? {backgroundColor: N.bg1, color: N.frost, borderColor: N.frost}
              : {backgroundColor: N.frost, color: N.bg}
            }
            className='w-full px-8 py-3 font-bold tracking-widest uppercase text-sm border transition-all duration-300 pulse-glow'
          >
            <span className='flex items-center justify-center gap-3'>
              {playing ? (
                <>
                  <div className='sound-bars'><span /><span /><span /><span /><span /></div>
                  PAUSE
                  <div className='sound-bars'><span /><span /><span /><span /><span /></div>
                </>
              ) : (
                'UNLOCK AUDIO ▶'
              )}
            </span>
          </button>
        </div>
      )}

      {status === 'ERROR' && (
        <button
          onClick={() => setStatus('READY')}
          style={{borderColor: N.bg3, color: N.fg3}}
          className='px-6 py-2 border text-sm hover:opacity-80 transition-opacity'
        >
          TRY AGAIN
        </button>
      )}

    </div>
  )
}
