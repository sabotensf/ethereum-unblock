'use client'

import React, { useState } from 'react'
import { ethers } from 'ethers'
import { useAppKitProvider, useAppKitAccount } from '@reown/appkit/react'
import { ChipEntry, ReleaseMetadata, batchAttest, EAS_ATTESTATION_URL } from '@/utils/recordpool'

const N = {
  bg:     '#2e3440',
  bg1:    '#3b4252',
  bg2:    '#434c5e',
  bg3:    '#4c566a',
  fg:     '#eceff4',
  fg3:    '#d8dee9',
  frost:  '#88c0d0',
  blue:   '#81a1c1',
  dblue:  '#5e81ac',
  green:  '#a3be8c',
  red:    '#bf616a',
  yellow: '#ebcb8b',
  purple: '#b48ead',
}

const STATUS_COLOR: Record<ChipEntry['status'], string> = {
  pending:   N.fg3,
  attesting: N.yellow,
  attested:  N.green,
  error:     N.red,
}

const STATUS_LABEL: Record<ChipEntry['status'], string> = {
  pending:   '○ PENDING',
  attesting: '⏳ ATTESTING',
  attested:  '✓ ATTESTED',
  error:     '✕ ERROR',
}

interface Props {
  metadata: ReleaseMetadata
  chips: ChipEntry[]
  onUpdateChip: (id: string, status: ChipEntry['status'], uid?: string) => void
  onBack: () => void
  onReset: () => void
}

export function AttestQueue({ metadata, chips, onUpdateChip, onBack, onReset }: Props) {
  const [attesting, setAttesting] = useState(false)
  const [error, setError] = useState('')
  const { walletProvider } = useAppKitProvider('eip155')
  const { address, isConnected } = useAppKitAccount()

  const attested = chips.filter(c => c.status === 'attested').length
  const hasErrors = chips.some(c => c.status === 'error')
  const allDone = attested === chips.length

  const handleAttest = async () => {
    if (!isConnected || !walletProvider) { setError('Connect your wallet first'); return }
    if (!process.env.NEXT_PUBLIC_EAS_SCHEMA_UID) { setError('EAS_SCHEMA_UID not set in .env.local'); return }

    setAttesting(true)
    setError('')
    try {
      const provider = new ethers.BrowserProvider(walletProvider as ethers.Eip1193Provider)
      const network = await provider.getNetwork()
      if (network.chainId !== BigInt(11155111)) {
        setError(`Wrong network — switch wallet to Sepolia (currently on chainId ${network.chainId})`)
        setAttesting(false)
        return
      }
      const signer = await provider.getSigner()
      await batchAttest(signer, metadata, chips, onUpdateChip)
    } catch (e: any) {
      const dig = (err: any): string =>
        err?.reason ?? err?.shortMessage ??
        (err?.cause ? dig(err.cause) : null) ??
        (err?.error ? dig(err.error) : null) ??
        err?.message ?? 'Unknown error'
      setError(dig(e))
      console.error('Attest error:', e)
    } finally {
      setAttesting(false)
    }
  }

  const exportCSV = () => {
    const rows = [
      ['#', 'Serial Number', 'Address / Hash', 'Attestation UID', 'Status',
       'ISRC', 'ISWC', 'Artist', 'Title', 'P-Line', 'C-Line',
       'UPC', 'Label', 'Genre', 'Release Date', 'Explicit', 'Territory', 'Language'],
      ...chips.map((c, i) => [
        i + 1, c.serialNumber ?? '', c.etherAddress, c.attestationUid ?? '', c.status,
        metadata.isrc, metadata.iswc, metadata.displayArtist, metadata.displayTitle,
        metadata.pLine, metadata.cLine,
        metadata.upc, metadata.labelName, metadata.genre, metadata.releaseDate,
        metadata.explicit, metadata.territory, metadata.language,
      ]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${metadata.isrc}-chips.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className='flex flex-col gap-6 w-fit min-w-80'>
      <div>
        <p style={{color: N.frost}} className='text-[10px] font-bold tracking-widest mb-1'>STEP 3 OF 3</p>
        <h2 style={{color: N.fg}} className='text-lg font-bold tracking-wide'>Review & Attest</h2>
      </div>

      {/* Release summary */}
      <div style={{backgroundColor: N.bg1, borderColor: N.bg3}} className='border p-4 font-mono text-[10px] space-y-1'>
        {metadata.coverArtUrl && (
          <div className='flex justify-center mb-3'>
            <img src={metadata.coverArtUrl} alt='Cover art' className='w-24 h-24 object-cover rounded-full'
              style={{border: `2px solid ${N.bg3}`}} />
          </div>
        )}
        <p style={{color: N.frost}} className='font-bold tracking-widest mb-2'>RELEASE</p>
        <p style={{color: N.fg3}}>ISRC: {metadata.isrc}</p>
        {metadata.iswc      && <p style={{color: N.fg3}}>ISWC: {metadata.iswc}</p>}
        <p style={{color: N.fg3}}>ARTIST: {metadata.displayArtist}</p>
        <p style={{color: N.fg3}}>TITLE: {metadata.displayTitle}</p>
        <p style={{color: N.fg3}}>P-LINE: {metadata.pLine}</p>
        {metadata.cLine     && <p style={{color: N.fg3}}>C-LINE: {metadata.cLine}</p>}
        <p style={{color: N.fg3}}>UPC: {metadata.upc}</p>
        <p style={{color: N.fg3}}>LABEL: {metadata.labelName}</p>
        <p style={{color: N.fg3}}>GENRE: {metadata.genre}</p>
        <p style={{color: N.fg3}}>RELEASE DATE: {metadata.releaseDate}</p>
        <p style={{color: N.fg3}}>EXPLICIT: {metadata.explicit}</p>
        <p style={{color: N.fg3}}>TERRITORY: {metadata.territory}</p>
        <p style={{color: N.fg3}}>LANGUAGE: {metadata.language}</p>
      </div>

      {/* Progress bar */}
      <div>
        <div className='flex justify-between mb-1'>
          <span style={{color: N.fg3}} className='text-[10px] font-mono'>CHIPS</span>
          <span style={{color: allDone ? N.green : N.fg3}} className='text-[10px] font-mono font-bold'>
            {attested} / {chips.length} attested
          </span>
        </div>
        <div style={{backgroundColor: N.bg2}} className='w-full h-2 rounded overflow-hidden'>
          <div
            style={{
              width: `${chips.length ? (attested / chips.length) * 100 : 0}%`,
              backgroundColor: allDone ? N.green : N.frost,
              transition: 'width 0.4s ease',
            }}
            className='h-full'
          />
        </div>
      </div>

      {/* Chip list */}
      <div style={{borderColor: N.bg3}} className='border max-h-52 overflow-y-auto w-full'>
        {chips.map((chip, i) => (
          <div
            key={chip.id}
            style={{borderColor: N.bg3}}
            className='flex items-center gap-4 px-3 py-2 border-b last:border-b-0'
          >
            <span style={{color: N.bg3}} className='text-[10px] font-mono w-5 shrink-0'>{i + 1}</span>
            {chip.serialNumber && (
              <span style={{color: N.frost}} className='text-xs font-mono whitespace-nowrap'>{chip.serialNumber}</span>
            )}
            <span style={{color: N.frost}} className='text-xs font-mono whitespace-nowrap'>
              {chip.etherAddress.slice(0, 8)}…{chip.etherAddress.slice(-6)}
            </span>
            {chip.attestationUid && (
              <a
                href={EAS_ATTESTATION_URL(chip.attestationUid!)}
                target='_blank'
                rel='noopener noreferrer'
                style={{color: N.blue}}
                className='text-[10px] underline whitespace-nowrap'
              >
                EAS ↗
              </a>
            )}
            {chip.status === 'attested' && (
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/tap?uid=${chip.etherAddress}`)}
                style={{color: N.green}}
                className='text-[10px] font-mono whitespace-nowrap hover:opacity-70'
                title={`${window.location.origin}/tap?uid=${chip.etherAddress}`}
              >
                COPY TAP URL
              </button>
            )}
            <span style={{color: STATUS_COLOR[chip.status]}} className='text-[10px] font-mono font-bold whitespace-nowrap'>
              {STATUS_LABEL[chip.status]}
            </span>
          </div>
        ))}
      </div>

      {error && <p style={{color: N.red}} className='text-xs font-mono'>{error}</p>}

      {/* Actions */}
      {!allDone ? (
        <div className='flex gap-3'>
          <button
            onClick={onBack}
            disabled={attesting}
            style={{borderColor: N.bg3, color: N.fg3}}
            className='flex-1 py-3 border text-sm font-bold tracking-widest uppercase disabled:opacity-40'
          >
            ← BACK
          </button>
          <button
            onClick={handleAttest}
            disabled={attesting || !isConnected}
            style={{backgroundColor: attesting ? N.bg3 : N.green, color: N.bg}}
            className='flex-grow py-3 text-sm font-bold tracking-widest uppercase transition-all duration-300 disabled:opacity-40'
          >
            {attesting ? '⏳ ATTESTING...' : `ATTEST ${chips.length} CHIPS`}
          </button>
        </div>
      ) : (
        <div className='flex gap-3'>
          <button
            onClick={exportCSV}
            style={{borderColor: N.green, color: N.green}}
            className='flex-1 py-3 border text-sm font-bold tracking-widest uppercase'
          >
            EXPORT CSV
          </button>
          <button
            onClick={onReset}
            style={{backgroundColor: N.frost, color: N.bg}}
            className='flex-1 py-3 text-sm font-bold tracking-widest uppercase'
          >
            NEW BATCH
          </button>
        </div>
      )}

      {!isConnected && (
        <p style={{color: N.yellow}} className='text-[10px] font-mono text-center'>
          ⚠ Connect wallet to attest
        </p>
      )}
    </div>
  )
}
