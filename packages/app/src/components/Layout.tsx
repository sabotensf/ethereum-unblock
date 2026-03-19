'use client'

import React, { PropsWithChildren } from 'react'
export function Layout(props: PropsWithChildren) {
  return (
    <div className='flex flex-col min-h-screen' style={{backgroundColor: '#3b4252'}}>
      <main className='grow'>{props.children}</main>
    </div>
  )
}
