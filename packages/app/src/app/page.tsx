'use client'

import React from 'react'
import Link from 'next/link'

const N = {
  bg:    '#2e3440',
  bg1:   '#3b4252',
  bg2:   '#434c5e',
  bg3:   '#4c566a',
  fg:    '#eceff4',
  fg3:   '#d8dee9',
  frost: '#88c0d0',
  green: '#a3be8c',
  blue:  '#81a1c1',
  dblue: '#5e81ac',
  teal:  '#8fbcbb',
}

const FEATURES = [
  {
    label: 'Physical + Digital',
    description: 'Every record ships with an embedded NFC chip. One tap authenticates ownership and unlocks the onchain layer.',
  },
  {
    label: 'Ethereum Attestation',
    description: 'DDEX-compliant metadata — ISRC, ISWC, P-Line, C-Line — attested onchain via EAS, permanently linking the physical to the digital.',
  },
  {
    label: 'Royalty Distribution',
    description: '0xSplits routes streaming revenue directly to artists and the pool on every play, settled onchain with no intermediary.',
  },
  {
    label: 'DSP Ready',
    description: 'Fully compliant release metadata ready for Apple Music, Spotify, and any major distributor, generated at the point of manufacture.',
  },
]

const STACK = ['EAS', '0xSplits', 'NFC', 'DDEX', 'Ethereum']

export default function Home() {
  return (
    <div style={{backgroundColor: N.bg, color: N.fg}} className='min-h-screen flex flex-col'>

      {/* Hero */}
      <section className='flex flex-col items-center justify-center text-center px-6 pt-20 pb-16 gap-6'>

        <h1 className='text-5xl sm:text-6xl font-bold tracking-tight leading-none'>
          <span style={{color: N.fg}}>Record</span>
          <span style={{color: N.frost}}>Pool</span>
        </h1>

        <p style={{color: N.fg3}} className='text-lg sm:text-xl font-light max-w-md leading-relaxed'>
          Phygital records. Onchain provenance.<br />Royalties that settle themselves.
        </p>

        <div className='flex flex-wrap gap-3 justify-center mt-2'>
          <Link
            href='/tap'
            style={{backgroundColor: N.frost, color: N.bg}}
            className='px-8 py-3 font-bold tracking-widest uppercase text-sm transition-opacity hover:opacity-80'
          >
            Tap a Record →
          </Link>
          <a
            href='https://recordpool.io'
            target='_blank'
            rel='noopener noreferrer'
            style={{borderColor: N.bg3, color: N.fg3}}
            className='px-8 py-3 border font-bold tracking-widest uppercase text-sm transition-opacity hover:opacity-80'
          >
            recordpool.io ↗
          </a>
        </div>

        {/* Stack pills */}
        <div className='flex flex-wrap gap-2 justify-center mt-4'>
          {STACK.map(s => (
            <span
              key={s}
              style={{backgroundColor: N.bg2, color: N.frost, borderColor: N.bg3}}
              className='text-[10px] font-mono tracking-widest px-3 py-1 border'
            >
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div style={{borderColor: N.bg2}} className='border-t mx-6' />

      {/* Features */}
      <section className='px-6 py-16 max-w-3xl mx-auto w-full'>
        <p style={{color: N.frost}} className='text-[10px] font-mono tracking-widest mb-8 text-center'>HOW IT WORKS</p>
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-6'>
          {FEATURES.map(f => (
            <div
              key={f.label}
              style={{backgroundColor: N.bg1, borderColor: N.bg2}}
              className='border p-5 flex flex-col gap-2'
            >
              <p style={{color: N.fg}} className='text-sm font-semibold tracking-wide'>{f.label}</p>
              <p style={{color: N.fg3}} className='text-xs font-light leading-relaxed'>{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div style={{borderColor: N.bg2}} className='border-t mx-6' />

      {/* Bottom CTA */}
      <section className='flex flex-col items-center text-center px-6 py-16 gap-4'>
        <p style={{color: N.teal}} className='text-[10px] font-mono tracking-widest'>BUILT ON ETHEREUM</p>
        <h2 style={{color: N.fg}} className='text-2xl font-bold tracking-tight'>The record is the token.</h2>
        <p style={{color: N.fg3}} className='text-sm font-light max-w-sm leading-relaxed'>
          Ownership proven by hardware. Metadata attested by consensus. Revenue split by code.
        </p>
        <Link
          href='/tap'
          style={{color: N.frost}}
          className='text-xs font-mono tracking-widest underline mt-2 hover:opacity-70'
        >
          TAP YOUR RECORD →
        </Link>
      </section>

    </div>
  )
}
