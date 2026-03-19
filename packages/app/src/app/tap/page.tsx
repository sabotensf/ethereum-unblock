'use client'

import { Suspense } from 'react'
import { RecordPoolPro } from '@/components/RecordPoolPro'

export default function TapPage() {
  return (
    <Suspense>
      <RecordPoolPro />
    </Suspense>
  )
}
