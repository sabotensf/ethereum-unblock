'use client'

import React, { useState, useEffect, useRef } from 'react'
import { ChipEntry } from '@/utils/recordpool'
import { ethers } from 'ethers'

const N = {
  bg:     '#2e3440',
  bg1:    '#3b4252',
  bg2:    '#434c5e',
  bg3:    '#4c566a',
  fg:     '#eceff4',
  fg3:    '#d8dee9',
  frost:  '#88c0d0',
  green:  '#a3be8c',
  red:    '#bf616a',
  yellow: '#ebcb8b',
  teal:   '#8fbcbb',
}

function getScanMethod(): 'web-nfc' | 'usb' {
  if (typeof window !== 'undefined' && 'NDEFReader' in window) return 'web-nfc'
  return 'usb'
}

interface Props {
  chips: ChipEntry[]
  onAdd: (chip: ChipEntry) => void
  onRemove: (id: string) => void
  onNext: () => void
  onBack: () => void
}

export function ChipScanner({ chips, onAdd, onRemove, onNext, onBack }: Props) {
  const [scanning, setScanning] = useState(false)
  const [method, setMethod] = useState<'web-nfc' | 'usb'>('usb')
  const [error, setError] = useState('')
  const [readerName, setReaderName] = useState('')
  const sseRef = useRef<EventSource | null>(null)

  useEffect(() => {
    setMethod(getScanMethod())
  }, [])

  // Start USB SSE listener — stays open, adds each tap automatically
  useEffect(() => {
    if (method !== 'usb') return

    const es = new EventSource('/api/nfc')
    sseRef.current = es
    setScanning(true)

    es.onmessage = (e) => {
      const serialNumber = e.data.trim()
      if (!serialNumber) return
      const etherAddress = ethers.id(serialNumber)
      if (chips.some(c => c.etherAddress === etherAddress)) {
        setError(`${serialNumber} already registered`)
        return
      }
      setError('')
      onAdd({
        id: crypto.randomUUID(),
        etherAddress,
        serialNumber,
        status: 'pending',
      })
    }

    const onReaderConnect = (e: Event) => {
      setScanning(true)
      setError('')
      setReaderName(((e as MessageEvent).data ?? '').split(' ').slice(0, 2).join(' '))
    }
    const onReaderEnd = () => {
      setScanning(false)
      setReaderName('')
      setError('USB reader disconnected')
    }

    es.addEventListener('reader_connect', onReaderConnect)
    es.addEventListener('reader_end', onReaderEnd)

    es.onerror = () => {
      setError('USB reader disconnected or unavailable')
      setScanning(false)
    }

    return () => {
      es.removeEventListener('reader_connect', onReaderConnect)
      es.removeEventListener('reader_end', onReaderEnd)
      es.close()
      setScanning(false)
    }
  }, [method])

  const handleManualScan = async () => {
    setScanning(true)
    setError('')
    try {
      if (method === 'web-nfc') {
        await new Promise<void>((resolve, reject) => {
          const ndef = new (window as any).NDEFReader()
          ndef.scan()
            .then(() => {
              ndef.addEventListener('reading', ({ serialNumber }: { serialNumber: string }) => {
                const etherAddress = ethers.id(serialNumber)
                if (chips.some(c => c.etherAddress === etherAddress)) {
                  setError('Chip already registered')
                } else {
                  onAdd({ id: crypto.randomUUID(), etherAddress, serialNumber, status: 'pending' })
                }
                resolve()
              })
            })
            .catch(reject)
        })
      }
    } catch (e: any) {
      setError(e?.message ?? 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className='flex flex-col gap-6 w-full max-w-sm'>
      <div>
        <p style={{color: N.frost}} className='text-[10px] font-bold tracking-widest mb-1'>STEP 2 OF 4</p>
        <h2 style={{color: N.fg3}} className='text-lg font-bold tracking-wide'>Register Chips</h2>
        {method !== 'usb' && (
          <p style={{color: N.fg3}} className='text-xs mt-1'>
            <span style={{color: N.teal}} className='font-mono'>Tap each chip to register it</span>
          </p>
        )}
      </div>

      {/* USB: always-on indicator */}
      {method === 'usb' ? (
        <div
          style={{
            borderColor: scanning ? N.frost : N.red,
            backgroundColor: scanning ? `${N.frost}11` : `${N.red}11`,
          }}
          className='w-full py-3 px-4 border-2 border-dashed flex flex-col items-center gap-1'
        >
          <p style={{color: scanning ? N.frost : N.red}} className='text-xs font-bold tracking-widest uppercase animate-pulse'>
            {scanning ? '📡 READY — TAP CHIP TO REGISTER' : '✕ READER OFFLINE'}
          </p>
          {readerName && (
            <p style={{color: N.fg3}} className='text-xs font-mono'>{readerName}</p>
          )}
        </div>
      ) : (
        /* HaLo / Web NFC: manual trigger */
        <button
          onClick={handleManualScan}
          disabled={scanning}
          style={{
            borderColor: scanning ? N.frost : N.bg3,
            color: scanning ? N.frost : N.fg3,
            backgroundColor: N.bg1,
          }}
          className='w-full py-10 border-2 border-dashed text-sm font-bold tracking-widest uppercase transition-all duration-300'
        >
          {scanning ? '📡 SCANNING...' : '+ TAP CHIP TO REGISTER'}
        </button>
      )}

      {error && <p style={{color: N.red}} className='text-xs font-mono'>{error}</p>}

      {/* Queue */}
      {chips.length > 0 && (
        <div style={{borderColor: N.bg3}} className='border'>
          <div style={{backgroundColor: N.bg2, borderColor: N.bg3}} className='flex justify-between items-center px-3 py-2 border-b'>
            <span style={{color: N.fg3}} className='text-xs font-bold tracking-widest font-mono'>REGISTERED CHIPS</span>
            <span style={{color: N.green}} className='text-xs font-mono'>{chips.length} queued</span>
          </div>
          <div className='max-h-52 overflow-y-auto'>
            {chips.map((chip, i) => (
              <div
                key={chip.id}
                style={{borderColor: N.bg3}}
                className='flex items-center justify-between px-3 py-2.5 border-b last:border-b-0'
              >
                <div className='flex items-center gap-3'>
                  <span style={{color: N.bg3}} className='text-xs font-mono w-5 shrink-0'>{i + 1}</span>
                  <div className='flex items-center gap-2'>
                    {chip.serialNumber && (
                      <span style={{color: N.fg3}} className='text-xs font-mono'>{chip.serialNumber}</span>
                    )}
                    <span style={{color: N.fg3}} className='text-xs font-mono'>
                      {chip.etherAddress.slice(0, 10)}…{chip.etherAddress.slice(-8)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onRemove(chip.id)}
                  style={{color: N.red}}
                  className='text-sm hover:opacity-70 pl-2'
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className='flex gap-3'>
        <button
          onClick={onBack}
          style={{borderColor: N.bg3, color: N.fg3}}
          className='flex-1 py-3 border text-sm font-bold tracking-widest uppercase'
        >
          ← BACK
        </button>
        <button
          onClick={onNext}
          disabled={chips.length === 0}
          style={{
            backgroundColor: chips.length > 0 ? N.frost : N.bg3,
            color: chips.length > 0 ? N.bg : N.fg3,
          }}
          className='flex-grow py-3 text-sm font-bold tracking-widest uppercase transition-all duration-300'
        >
          REVIEW {chips.length > 0 ? `(${chips.length})` : ''} →
        </button>
      </div>
    </div>
  )
}
