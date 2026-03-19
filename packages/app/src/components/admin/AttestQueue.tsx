'use client'

import React, { useState, useEffect, useRef } from 'react'
import { ethers } from 'ethers'
import { useAppKitProvider, useAppKitAccount, useAppKit, useDisconnect } from '@reown/appkit/react'
import { useChainId, useSwitchChain, useAccount } from 'wagmi'
import { ChipEntry, ReleaseMetadata, batchAttest, EAS_ATTESTATION_URL, EAS_CHAIN_ID } from '@/utils/recordpool'

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
  attesting: 'ATTESTING',
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
  const [networkOpen, setNetworkOpen] = useState(false)
  const [switchingNetwork, setSwitchingNetwork] = useState(false)

  const NETWORKS = [
    { chainId: 11155111, name: 'Sepolia' },
    { chainId: 1,        name: 'Ethereum' },
    { chainId: 8453,     name: 'Base' },
    { chainId: 10,       name: 'Optimism' },
  ]
  const { walletProvider } = useAppKitProvider('eip155')
  const { address, isConnected } = useAppKitAccount()
  const { open } = useAppKit()
  const { disconnect } = useDisconnect()
  const { chainId: accountChainId } = useAccount()
  const fallbackChainId = useChainId()
  const chainId = accountChainId ?? fallbackChainId
  const { switchChain } = useSwitchChain()
  const wasConnected = useRef(false)

  useEffect(() => {
    if (isConnected && !wasConnected.current && chainId !== EAS_CHAIN_ID) {
      setSwitchingNetwork(true)
      switchChain({ chainId: EAS_CHAIN_ID }, {
        onSuccess: () => setSwitchingNetwork(false),
        onError: (e) => { setSwitchingNetwork(false); if (!/rejected|denied/i.test(e.message)) setError(`Network switch failed: ${e.message}`) },
      })
    }
    wasConnected.current = isConnected
  }, [isConnected])
  const CHAIN_NAMES: Record<number, string> = { 1: 'Ethereum', 11155111: 'Sepolia', 42161: 'Arbitrum', 8453: 'Base', 10: 'Optimism', 137: 'Polygon' }
  const effectiveChainId = isConnected ? chainId : EAS_CHAIN_ID
  const chainName = CHAIN_NAMES[effectiveChainId] ?? `Chain ${effectiveChainId}`
  const onCorrectChain = effectiveChainId === EAS_CHAIN_ID



  const attested = chips.filter(c => c.status === 'attested').length
  const hasErrors = chips.some(c => c.status === 'error')
  const allDone = attested === chips.length

  const handleAttest = async () => {
    if (!isConnected || !walletProvider) { open(); return }
    if (!process.env.NEXT_PUBLIC_EAS_SCHEMA_UID) { setError('EAS_SCHEMA_UID not set in .env.local'); return }

    setAttesting(true)
    setError('')
    try {
      const provider = new ethers.BrowserProvider(walletProvider as ethers.Eip1193Provider)
      const network = await provider.getNetwork()
      if (network.chainId !== BigInt(EAS_CHAIN_ID)) {
        setAttesting(false)
        setSwitchingNetwork(true)
        switchChain({ chainId: EAS_CHAIN_ID }, {
          onSuccess: () => setSwitchingNetwork(false),
          onError: (e) => { setSwitchingNetwork(false); if (!/rejected|denied/i.test(e.message)) setError(`Network switch failed: ${e.message}`) },
        })
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
      const msg = dig(e)
      const isRejected = /reject|denied|cancel|user (refused|declined)/i.test(msg)
      setError(isRejected ? 'Transaction rejected — chips were not attested.' : msg)
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
        <p style={{color: N.frost}} className='text-[10px] font-bold tracking-widest mb-1'>STEP 3 OF 4</p>
        <h2 style={{color: N.fg3}} className='text-lg font-bold tracking-wide'>Review & Attest</h2>
        <div className='flex items-center gap-2 mt-2'>
          {isConnected ? (
            <button onClick={() => disconnect()} style={{backgroundColor: `${N.green}22`, color: N.green, borderColor: `${N.green}44`}} className='text-[10px] font-mono font-bold px-2 py-0.5 border hover:opacity-70'>
              ● CONNECTED
            </button>
          ) : (
            <button onClick={() => open()} style={{backgroundColor: `${N.red}22`, color: N.red, borderColor: `${N.red}44`}} className='text-[10px] font-mono font-bold px-2 py-0.5 border hover:opacity-70'>
              ○ DISCONNECTED
            </button>
          )}
          {isConnected && (
            <div className='relative flex items-center'>
              <button
                onClick={() => !switchingNetwork && setNetworkOpen(o => !o)}
                style={{
                  backgroundColor: switchingNetwork ? `${N.purple}22` : onCorrectChain ? `${N.frost}22` : `${N.yellow}22`,
                  color: switchingNetwork ? N.purple : onCorrectChain ? N.frost : N.yellow,
                  borderColor: switchingNetwork ? `${N.purple}44` : onCorrectChain ? `${N.frost}44` : `${N.yellow}44`,
                }}
                className='text-[10px] font-mono px-2 py-0.5 border'
              >
                {switchingNetwork ? (
                  <span className='flex items-center gap-1.5'>
                    <span className='inline-block w-2.5 h-2.5 rounded-full border-2 animate-spin' style={{borderColor: `${N.purple}44`, borderTopColor: N.purple}} />
                    approve in wallet…
                  </span>
                ) : `${chainName} ▾`}
              </button>
              {networkOpen && (
                <div
                  style={{backgroundColor: N.bg2, borderColor: N.bg3}}
                  className='absolute right-0 top-full mt-1 border z-10 min-w-max'
                >
                  {NETWORKS.map(n => (
                    <button
                      key={n.chainId}
                      onClick={() => {
                        setNetworkOpen(false)
                        setSwitchingNetwork(true)
                        switchChain({ chainId: n.chainId }, {
                          onSuccess: () => setSwitchingNetwork(false),
                          onError: (e) => { setSwitchingNetwork(false); if (!/rejected|denied/i.test(e.message)) setError(`Network switch failed: ${e.message}`) },
                        })
                      }}
                      style={{
                        color: n.chainId === effectiveChainId ? N.frost : N.fg3,
                        backgroundColor: n.chainId === effectiveChainId ? `${N.frost}11` : 'transparent',
                      }}
                      className='block w-full text-left px-3 py-1.5 text-[10px] font-mono hover:opacity-70'
                    >
                      {n.chainId === effectiveChainId ? '● ' : '○ '}{n.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {isConnected && address && (
            <span style={{color: N.fg3}} className='text-[10px] font-mono'>
              {address.slice(0, 6)}…{address.slice(-4)}
            </span>
          )}
        </div>
      </div>

      {/* Release summary */}
      <div style={{backgroundColor: N.bg1, borderColor: N.bg3}} className='border p-4 font-mono text-xs space-y-1.5'>
        {metadata.coverArtUrl && (
          <div className='flex justify-center mb-3'>
            <img src={metadata.coverArtUrl} alt='Cover art' className='w-24 h-24 object-cover rounded-full'
              style={{border: `2px solid ${N.bg3}`}} />
          </div>
        )}
        <p style={{color: N.frost}} className='font-bold tracking-widest mb-2 text-[11px]'>RELEASE</p>
        <p style={{color: N.fg3}}><span style={{color: N.frost}}>ISRC</span> {metadata.isrc}</p>
        {metadata.iswc      && <p style={{color: N.fg3}}><span style={{color: N.frost}}>ISWC</span> {metadata.iswc}</p>}
        <p style={{color: N.fg3}}><span style={{color: N.frost}}>ARTIST</span> {metadata.displayArtist}</p>
        <p style={{color: N.fg3}}><span style={{color: N.frost}}>TITLE</span> {metadata.displayTitle}</p>
        <p style={{color: N.fg3}}><span style={{color: N.frost}}>P-LINE</span> {metadata.pLine}</p>
        {metadata.cLine     && <p style={{color: N.fg3}}><span style={{color: N.frost}}>C-LINE</span> {metadata.cLine}</p>}
        <p style={{color: N.fg3}}><span style={{color: N.frost}}>UPC</span> {metadata.upc}</p>
        <p style={{color: N.fg3}}><span style={{color: N.frost}}>LABEL</span> {metadata.labelName}</p>
        <p style={{color: N.fg3}}><span style={{color: N.frost}}>GENRE</span> {metadata.genre}</p>
        <p style={{color: N.fg3}}><span style={{color: N.frost}}>RELEASE DATE</span> {metadata.releaseDate}</p>
        <p style={{color: N.fg3}}><span style={{color: N.frost}}>EXPLICIT</span> {metadata.explicit}</p>
        <p style={{color: N.fg3}}><span style={{color: N.frost}}>TERRITORY</span> {metadata.territory}</p>
        <p style={{color: N.fg3}}><span style={{color: N.frost}}>LANGUAGE</span> {metadata.language}</p>
      </div>

      {/* Progress bar */}
      <div>
        <div className='flex justify-between mb-1'>
          <span style={{color: N.fg3}} className='text-xs font-mono'>CHIPS</span>
          <span style={{color: allDone ? N.green : N.fg3}} className='text-xs font-mono font-bold'>
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

      {/* Chip list + actions */}
      <div className='flex flex-col gap-3'>
      <div style={{borderColor: N.bg3}} className='border max-h-52 overflow-y-auto w-full'>
        {chips.map((chip, i) => (
          <div
            key={chip.id}
            style={{borderColor: N.bg3}}
            className='flex items-center gap-4 px-3 py-2 border-b last:border-b-0'
          >
            <span style={{color: N.fg3}} className='text-xs font-mono w-5 shrink-0'>{i + 1}</span>
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
                className='text-xs underline whitespace-nowrap'
              >
                EAS ↗
              </a>
            )}
            {chip.status === 'attested' && (
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/tap?uid=${chip.etherAddress}`)}
                style={{color: N.green}}
                className='text-xs font-mono whitespace-nowrap hover:opacity-70'
                title={`${window.location.origin}/tap?uid=${chip.etherAddress}`}
              >
                COPY TAP URL
              </button>
            )}
            <span style={{color: STATUS_COLOR[chip.status]}} className='text-xs font-mono font-bold whitespace-nowrap flex items-center gap-1.5'>
              {chip.status === 'attesting' && (
                <span className='inline-block w-2.5 h-2.5 rounded-full border-2 animate-spin' style={{borderColor: `${N.yellow}44`, borderTopColor: N.yellow}} />
              )}
              {STATUS_LABEL[chip.status]}
            </span>
          </div>
        ))}
      </div>

      {error && <p style={{color: N.red}} className='text-xs font-mono'>{error}</p>}
      {/* Actions */}
      {!allDone ? (
        <>
          {attesting && (
            <p style={{color: N.yellow}} className='text-xs font-mono text-center animate-pulse'>
              Approve the transaction in your wallet
            </p>
          )}
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
              disabled={attesting}
              style={{backgroundColor: attesting ? N.bg3 : N.green, color: N.bg}}
              className='flex-grow py-3 text-sm font-bold tracking-widest uppercase transition-all duration-300 disabled:opacity-40'
            >
              {attesting ? (
                <span className='flex items-center justify-center gap-2'>
                  <span className='inline-block w-3.5 h-3.5 rounded-full border-2 animate-spin' style={{borderColor: `${N.bg}44`, borderTopColor: N.bg}} />
                  ATTESTING…
                </span>
              ) : `ATTEST ${chips.length} CHIPS`}
            </button>
          </div>
        </>
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
            WRITE CHIPS
          </button>
        </div>
      )}
      </div>

    </div>
  )
}
