'use client'

import React, { useState } from 'react'
import { ReleaseForm } from '@/components/admin/ReleaseForm'
import { ChipScanner } from '@/components/admin/ChipScanner'
import { AttestQueue } from '@/components/admin/AttestQueue'
import { ChipWriter } from '@/components/admin/ChipWriter'
import { ChipEntry, ReleaseMetadata } from '@/utils/recordpool'

const N = {
  bg:    '#2e3440',
  bg1:   '#3b4252',
  bg2:   '#434c5e',
  bg3:   '#4c566a',
  fg:    '#eceff4',
  fg3:   '#d8dee9',
  frost: '#88c0d0',
}

const EMPTY_METADATA: ReleaseMetadata = {
  isrc:          'US-DE4-40-00234',
  iswc:          'T-000.234.780-4',
  displayArtist: 'Teddy Powell and His Orchestra',
  displayTitle:  'Teddy Bear Boogie',
  pLine:         '℗ 1940 Decca Records (Phonographic)',
  cLine:         '© 1940 Teddy Powell (Composition)',
  upc:           '012345678901',
  labelName:     'Decca Records',
  genre:         'Jazz',
  releaseDate:   '1940-01-15',
  explicit:      'NotExplicit',
  territory:     'Worldwide',
  language:      'en',
  coverArtUrl:   '/teddy-bear-boogie.jpg',
}

const TOTAL_STEPS = 4
type Step = 1 | 2 | 3 | 4

export default function AdminPage() {
  const [step, setStep] = useState<Step>(1)
  const [metadata, setMetadata] = useState<ReleaseMetadata>(EMPTY_METADATA)
  const [chips, setChips] = useState<ChipEntry[]>([])

  const addChip = (chip: ChipEntry) => setChips(prev => [...prev, chip])
  const removeChip = (id: string) => setChips(prev => prev.filter(c => c.id !== id))
  const updateChip = (id: string, status: ChipEntry['status'], uid?: string) =>
    setChips(prev => prev.map(c => c.id === id ? { ...c, status, attestationUid: uid ?? c.attestationUid } : c))

  const reset = () => {
    setStep(1)
    setMetadata(EMPTY_METADATA)
    setChips([])
  }

  const afterAttest = () => setStep(4)

  return (
    <div style={{backgroundColor: N.bg1, minHeight: '100vh'}} className='flex flex-col items-center px-4 pb-10'>

      {/* Header */}
      <div className='w-full max-w-sm py-4'>
        <a href='/admin' className='flex items-center gap-4 hover:opacity-80'>
          <img src='/recordpool-vinyl.svg' alt='RecordPool' className='w-12 h-12 rounded-full' />
          <p style={{color: N.frost}} className='text-3xl font-bold tracking-wide'>RecordPool</p>
        </a>
        {step !== 4 && (
          <button onClick={() => setStep(4)} style={{color: N.frost}} className='text-xs font-mono underline mt-2 py-1 hover:opacity-70'>
            → write test
          </button>
        )}
      </div>

      {/* Step indicators */}
      <div className='flex gap-2 w-full max-w-sm mb-3'>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(s => (
          <div
            key={s}
            style={{
              backgroundColor: step === s ? N.frost : step > s ? `${N.frost}55` : `${N.frost}22`,
              flex: 1,
              height: 3,
            }}
          />
        ))}
      </div>

      {step === 1 && (
        <ReleaseForm
          value={metadata}
          onChange={setMetadata}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <ChipScanner
          chips={chips}
          onAdd={addChip}
          onRemove={removeChip}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <AttestQueue
          metadata={metadata}
          chips={chips}
          onUpdateChip={updateChip}
          onBack={() => setStep(2)}
          onReset={afterAttest}
        />
      )}
      {step === 4 && (
        <ChipWriter
          chips={chips}
          onBack={() => setStep(3)}
          onReset={reset}
        />
      )}
    </div>
  )
}
