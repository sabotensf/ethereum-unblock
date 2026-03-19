'use client'

import React, { PropsWithChildren } from 'react'
import { usePathname } from 'next/navigation'
import { Header } from './Header'

export function Layout(props: PropsWithChildren) {
  const pathname = usePathname()
  const showHeader = pathname?.startsWith('/admin')

  return (
    <div className='flex flex-col min-h-screen' style={{backgroundColor: '#3b4252'}}>
      {showHeader && <Header />}
      <main className='grow px-4 pt-8 pb-6'>{props.children}</main>
    </div>
  )
}
