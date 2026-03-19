'use client'

import React, { useState, useEffect } from 'react'
import { ChipEntry } from '@/utils/recordpool'

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

type WriteStatus = 'idle' | 'waiting' | 'writing' | 'done' | 'error'

interface ChipWriteEntry extends ChipEntry {
  writeStatus: WriteStatus
  writeError?: string
}

interface Props {
  chips: ChipEntry[]
  onBack: () => void
  onReset: () => void
}

const NFC_BASE = process.env.NEXT_PUBLIC_NFC_BASE_URL
const DEFAULT_URL = NFC_BASE
  ? `${NFC_BASE}/api/uid?raw=%%MIRROR%%&ctr=%%CTR%%`
  : typeof window !== 'undefined'
    ? `${window.location.origin}/api/uid?raw=%%MIRROR%%&ctr=%%CTR%%`
    : 'https://recordpool.io/api/uid?raw=%%MIRROR%%&ctr=%%CTR%%'

/** Open an SSE connection to /api/nfc/write and return a promise that resolves
 *  with the UID on success or rejects on error. */
function writeViaACR(url: string): { promise: Promise<string>; cancel: () => void } {
  let es: EventSource | null = null
  let resolve: (uid: string) => void
  let reject: (e: Error) => void

  const promise = new Promise<string>((res, rej) => {
    resolve = res
    reject = rej
  })

  const encoded = encodeURIComponent(url)
  es = new EventSource(`/api/nfc/write?url=${encoded}`)

  es.addEventListener('done', (e: MessageEvent) => {
    es!.close()
    resolve(e.data)
  })

  es.addEventListener('write_error', (e: MessageEvent) => {
    es!.close()
    reject(new Error(e.data || 'Write failed'))
  })

  es.onerror = () => {
    es!.close()
    reject(new Error('Reader connection lost'))
  }

  const cancel = () => {
    es?.close()
    reject(new Error('Cancelled'))
  }

  return { promise, cancel }
}

export function ChipWriter({ chips, onBack, onReset }: Props) {
  const [url, setUrl] = useState(DEFAULT_URL)
  const [queue, setQueue] = useState<ChipWriteEntry[]>(
    chips.map(c => ({ ...c, writeStatus: 'idle' }))
  )
  const [currentIndex, setCurrentIndex] = useState<number | null>(null)

  // ── Free-write test mode (no chips in queue) ────────────────────────────
  const [testStatus, setTestStatus] = useState<WriteStatus>('idle')
  const [testError, setTestError]   = useState('')
  const [testResult, setTestResult] = useState('')
  const testMode = chips.length === 0

  const runTest = () => {
    setTestStatus('waiting')
    setTestError('')
    setTestResult('')
    const { promise } = writeViaACR(url)
    promise
      .then(uid => { setTestStatus('done'); setTestResult(uid) })
      .catch(e  => { setTestStatus('error'); setTestError(e?.message ?? 'Write failed') })
  }
  // ────────────────────────────────────────────────────────────────────────

  const updateEntry = (id: string, patch: Partial<ChipWriteEntry>) =>
    setQueue(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))

  const written = queue.filter(c => c.writeStatus === 'done').length
  const allDone = written === queue.length

  const writeNext = async (index: number) => {
    const entry = queue[index]
    if (!entry) return

    setCurrentIndex(index)
    const { promise } = writeViaACR(url)

    try {
      await promise
      updateEntry(entry.id, { writeStatus: 'done' })

      if (index + 1 < queue.length) {
        await writeNext(index + 1)
      } else {
        setCurrentIndex(null)
      }
    } catch (e: any) {
      updateEntry(entry.id, { writeStatus: 'error', writeError: e?.message ?? 'Write failed' })
      setCurrentIndex(null)
    }
  }

  useEffect(() => {
    if (!testMode) writeNext(0)
  }, [])

  const retryErrors = () => {
    const firstError = queue.findIndex(c => c.writeStatus === 'error')
    if (firstError === -1) return
    queue
      .filter(c => c.writeStatus === 'error')
      .forEach(c => updateEntry(c.id, { writeStatus: 'idle', writeError: undefined }))
    writeNext(firstError)
  }

  const STATUS_COLOR: Record<WriteStatus, string> = {
    idle:    N.fg3,
    waiting: N.yellow,
    writing: N.frost,
    done:    N.green,
    error:   N.red,
  }

  const STATUS_LABEL: Record<WriteStatus, string> = {
    idle:    '○ BLANK',
    waiting: '⏳ WAITING',
    writing: '✍ WRITING',
    done:    '✓ WRITTEN',
    error:   '✕ ERROR',
  }

  return (
    <div className='flex flex-col gap-6 w-full max-w-sm'>
      <div>
        <p style={{color: N.frost}} className='text-[10px] font-bold tracking-widest mb-1'>STEP 4 OF 4</p>
        <h2 style={{color: N.fg3}} className='text-lg font-bold tracking-wide'>Write URLs</h2>
        <p style={{color: N.fg3}} className='text-xs mt-1'>
          Burns the RecordPool URL to each NTAG chip via ACR1552. Tap each chip when prompted.
        </p>
      </div>

      {/* URL input */}
      <div className='flex flex-col gap-1'>
        <label style={{color: N.fg3}} className='text-xs font-bold tracking-widest font-mono'>TARGET URL</label>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          disabled={!testMode}
          style={{
            backgroundColor: N.bg2,
            borderColor: N.bg3,
            color: N.fg3,
            opacity: !testMode ? 0.6 : 1,
          }}
          className='w-full px-3 py-2 text-sm font-mono border'
        />
      </div>

      {/* ── Test mode UI ── */}
      {testMode && (
        <div className='flex flex-col gap-4'>
          {testStatus === 'idle' && (
            <button
              onClick={runTest}
              style={{backgroundColor: N.green, color: N.bg}}
              className='w-full py-3 text-sm font-bold tracking-widest uppercase'
            >
              TAP &amp; WRITE
            </button>
          )}
          {(testStatus === 'waiting' || testStatus === 'writing') && (
            <div style={{borderColor: N.frost, backgroundColor: `${N.frost}11`}} className='border p-4 text-center'>
              <p style={{color: N.frost}} className='text-xs font-bold tracking-widest animate-pulse'>
                {testStatus === 'waiting' ? 'TAP CHIP NOW' : 'WRITING…'}
              </p>
            </div>
          )}
          {testStatus === 'done' && (
            <div className='flex flex-col gap-2'>
              <p style={{color: N.green}} className='text-xs font-mono font-bold text-center'>✓ WRITTEN{testResult && <span style={{color: N.fg3}} className='font-normal'>&nbsp;&nbsp;{testResult}</span>}</p>
              <button
                onClick={runTest}
                style={{backgroundColor: N.frost, color: N.bg}}
                className='w-full py-2 text-xs font-bold tracking-widest uppercase'
              >
                WRITE ANOTHER
              </button>
            </div>
          )}
          {testStatus === 'error' && (
            <div className='flex flex-col gap-2'>
              <p style={{color: N.red}} className='text-xs font-mono'>{testError}</p>
              <button
                onClick={runTest}
                style={{borderColor: N.frost, color: N.frost}}
                className='w-full py-2 border text-xs font-bold tracking-widest uppercase'
              >
                RETRY
              </button>
            </div>
          )}
        </div>
      )}

      {/* Prompt box */}
      {!testMode && currentIndex !== null && (
        <div style={{borderColor: N.frost, backgroundColor: `${N.frost}11`}} className='border p-4 text-center'>
          <p style={{color: N.frost}} className='text-xs font-bold tracking-widest animate-pulse'>
            TAP CHIP #{currentIndex + 1} NOW
          </p>
          <p style={{color: N.fg3}} className='text-xs font-mono mt-1'>
            {queue[currentIndex]?.etherAddress.slice(0, 8)}…{queue[currentIndex]?.etherAddress.slice(-6)}
          </p>
        </div>
      )}

      {/* Progress bar */}
      {!testMode && (
        <div>
          <div className='flex justify-between mb-1'>
            <span style={{color: N.fg3}} className='text-xs font-mono'>PROGRESS</span>
            <span style={{color: allDone ? N.green : N.fg3}} className='text-xs font-mono font-bold'>
              {written} / {queue.length} written
            </span>
          </div>
          <div style={{backgroundColor: N.bg2}} className='w-full h-2 rounded overflow-hidden'>
            <div
              style={{
                width: `${(written / queue.length) * 100}%`,
                backgroundColor: allDone ? N.green : N.frost,
                transition: 'width 0.4s ease',
              }}
              className='h-full'
            />
          </div>
        </div>
      )}

      {/* Chip list */}
      {!testMode && <div style={{borderColor: N.bg3}} className='border'>
        {queue.map((chip, i) => (
          <div
            key={chip.id}
            style={{
              borderColor: N.bg3,
              backgroundColor: i === currentIndex ? `${N.frost}11` : 'transparent',
            }}
            className='flex items-center justify-between px-3 py-2 border-b last:border-b-0'
          >
            <div className='flex items-center gap-2'>
              <span style={{color: N.fg3}} className='text-xs font-mono w-5'>{i + 1}</span>
              {chip.serialNumber && (
                <span style={{color: N.frost}} className='text-xs font-mono whitespace-nowrap'>{chip.serialNumber}</span>
              )}
              <span style={{color: N.fg3}} className='text-xs font-mono'>
                {chip.etherAddress.slice(0, 8)}…{chip.etherAddress.slice(-6)}
              </span>
            </div>
            <div className='flex flex-col items-end gap-0.5'>
              <span
                style={{color: STATUS_COLOR[chip.writeStatus]}}
                className='text-xs font-mono font-bold'
              >
                {STATUS_LABEL[chip.writeStatus]}
              </span>
              {chip.writeError && (
                <span style={{color: N.red}} className='text-xs font-mono'>
                  {chip.writeError}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>}

      {/* Errors */}
      {!testMode && queue.some(c => c.writeStatus === 'error') && (
        <p style={{color: N.red}} className='text-xs font-mono'>
          {queue.filter(c => c.writeStatus === 'error').length} chip(s) failed.{' '}
          <button onClick={retryErrors} style={{color: N.frost}} className='underline'>Retry errors</button>
        </p>
      )}

      {/* Actions */}
      {!testMode && allDone && (
        <button
          onClick={onReset}
          style={{backgroundColor: N.frost, color: N.bg}}
          className='w-full py-3 text-sm font-bold tracking-widest uppercase'
        >
          ✓ ALL DONE — NEW BATCH
        </button>
      )}
      {!testMode && !allDone && queue.some(c => c.writeStatus === 'error') && currentIndex === null && (
        <button
          onClick={onBack}
          style={{borderColor: N.bg3, color: N.fg3}}
          className='w-full py-3 border text-sm font-bold tracking-widest uppercase'
        >
          ← BACK
        </button>
      )}
    </div>
  )
}
