'use client'

import React from 'react'
import { ReleaseMetadata } from '@/utils/recordpool'

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
  yellow: '#ebcb8b',
}

interface Props {
  value: ReleaseMetadata
  onChange: (m: ReleaseMetadata) => void
  onNext: () => void
}

const ALL_FIELDS: { key: keyof ReleaseMetadata; label: string; placeholder: string; optional?: boolean }[] = [
  { key: 'isrc',          label: 'ISRC',         placeholder: 'US-DE4-40-00234' },
  { key: 'iswc',          label: 'ISWC',         placeholder: 'T-000.234.780-4',  optional: true },
  { key: 'displayArtist', label: 'Artist',       placeholder: 'Teddy Powell and His Orchestra' },
  { key: 'displayTitle',  label: 'Title',        placeholder: 'Teddy Bear Boogie' },
  { key: 'pLine',         label: 'P-Line',       placeholder: '℗ 1940 Decca Records' },
  { key: 'cLine',         label: 'C-Line',       placeholder: '© 1940 Teddy Powell', optional: true },
  { key: 'upc',           label: 'UPC / EAN',    placeholder: '012345678901' },
  { key: 'labelName',     label: 'Label',        placeholder: 'Decca Records' },
  { key: 'genre',         label: 'Genre',        placeholder: 'Jazz' },
  { key: 'releaseDate',   label: 'Release Date', placeholder: '1940-01-15' },
  { key: 'explicit',      label: 'Explicit',     placeholder: 'NotExplicit' },
  { key: 'territory',     label: 'Territory',    placeholder: 'Worldwide' },
  { key: 'language',      label: 'Language',     placeholder: 'en' },
]

function Field({ fieldKey, label, placeholder, value, onChange, optional }: {
  fieldKey: keyof ReleaseMetadata
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  optional?: boolean
}) {
  return (
    <div className='flex flex-col gap-1'>
      <div className='flex items-center gap-2'>
        <label style={{color: N.fg3}} className='text-[10px] font-bold tracking-widest font-mono'>{label}</label>
        {optional && <span style={{color: N.bg3}} className='text-[9px] font-mono'>optional</span>}
      </div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ backgroundColor: N.bg2, borderColor: N.bg3, color: N.fg3, outline: 'none' }}
        onFocus={e => (e.target.style.borderColor = N.frost)}
        onBlur={e => (e.target.style.borderColor = N.bg3)}
        className='w-full px-3 py-2 text-sm font-mono border'
      />
    </div>
  )
}

export function ReleaseForm({ value, onChange, onNext }: Props) {
  const isComplete = ALL_FIELDS.filter(f => !f.optional).every(f => value[f.key].trim() !== '')

  return (
    <div className='flex flex-col gap-6 w-full max-w-sm'>
      <div>
        <p style={{color: N.frost}} className='text-[10px] font-bold tracking-widest mb-1'>STEP 1 OF 4</p>
        <h2 style={{color: N.fg3}} className='text-lg font-bold tracking-wide'>Release Metadata</h2>
        <p style={{color: N.fg3}} className='text-xs mt-1'>Enter DDEX-compliant fields. Applied to all chips in this batch.</p>
      </div>

      {/* Cover art preview */}
      <div className='flex justify-center'>
        <img
          src={value.coverArtUrl || '/recordpool-vinyl.svg'}
          alt={value.coverArtUrl ? 'Cover art' : 'RecordPool'}
          className='w-40 h-40 object-cover rounded-full'
          style={{border: `2px solid ${N.bg3}`}}
        />
      </div>

      <div className='flex flex-col gap-3'>
        {ALL_FIELDS.map(f => (
          <Field key={f.key} fieldKey={f.key} label={f.label} placeholder={f.placeholder}
            optional={f.optional} value={value[f.key]} onChange={v => onChange({ ...value, [f.key]: v })} />
        ))}
        <Field fieldKey='coverArtUrl' label='Cover Art URL' placeholder='/teddy-bear-boogie.jpg'
          optional value={value.coverArtUrl ?? ''} onChange={v => onChange({ ...value, coverArtUrl: v })} />
      </div>

      <button
        onClick={onNext}
        disabled={!isComplete}
        style={{
          backgroundColor: isComplete ? N.frost : N.bg3,
          color: isComplete ? N.bg : N.fg3,
        }}
        className='w-full py-3 font-bold tracking-widest uppercase text-sm transition-all duration-300'
      >
        NEXT: SCAN CHIPS →
      </button>
    </div>
  )
}
