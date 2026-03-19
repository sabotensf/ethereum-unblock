import React from 'react'
import { Connect } from './Connect'
import { NetworkStatus } from './NetworkStatus'

export function Header() {
  return (
    <header className='flex justify-between items-center px-4 py-1'>
      <div />

      <div className='flex items-center gap-3'>
        <NetworkStatus />
        <Connect />
      </div>
    </header>
  )
}
