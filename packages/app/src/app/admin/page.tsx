'use client'

import React, { useState } from 'react'
import { ReleaseForm } from '@/components/admin/ReleaseForm'
import { ChipScanner } from '@/components/admin/ChipScanner'
import { AttestQueue } from '@/components/admin/AttestQueue'
import { ChipWriter } from '@/components/admin/ChipWriter'
import { ChipEntry, ReleaseMetadata, CHIP_TYPE } from '@/utils/recordpool'

const N = {
  bg:    '#2e3440',
  bg1:   '#3b4252',
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

// HaLo chips can't have custom URLs burned — skip step 4
const TOTAL_STEPS = CHIP_TYPE === 'HALO' ? 3 : 4
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

  // After attestation: go to write step (NTAG) or finish (HALO)
  const afterAttest = () => CHIP_TYPE === 'HALO' ? reset() : setStep(4)

  return (
    <div style={{backgroundColor: N.bg, minHeight: '100vh'}} className='flex flex-col items-center px-4 py-10 gap-8'>

      {/* Header */}
      <div className='w-full max-w-sm'>
        <p style={{color: N.frost}} className='text-[10px] font-mono tracking-widest'>RECORDPOOL</p>
        <h1 style={{color: N.fg}} className='text-2xl font-bold tracking-widest'>CHIP PROVISIONING</h1>
        <p style={{color: N.fg3}} className='text-xs mt-1'>
          Batch register and attest NFC chips with DDEX metadata
          {' '}<span style={{color: N.frost}} className='font-mono'>({CHIP_TYPE})</span>
        </p>
        {CHIP_TYPE !== 'HALO' && step !== 4 && (
          <button
            onClick={() => setStep(4)}
            style={{color: N.frost}}
            className='text-[10px] font-mono underline mt-2 hover:opacity-70'
          >
            → skip to write test
          </button>
        )}
      </div>

      {/* Step indicators */}
      <div className='flex gap-2 w-full max-w-sm'>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(s => (
          <div
            key={s}
            style={{
              backgroundColor: step === s ? N.frost : step > s ? N.bg3 : N.bg1,
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
