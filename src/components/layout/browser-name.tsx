'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { usePiAuth } from '@/components/pi-auth-provider'

function detectByUA(ua: string): string {
  if (/PiBrowser/.test(ua)) return 'Pi Browser'
  if (/Edg\//.test(ua)) return 'Edge'
  if (/OPR\//.test(ua)) return 'Opera'
  if (/Chrome\//.test(ua)) return 'Chrome'
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/Safari\//.test(ua)) return 'Safari'
  return 'Browser'
}

export function BrowserName() {
  const { isInPiBrowser, isLoading } = usePiAuth()
  const [uaName, setUaName] = useState('...')

  useEffect(() => {
    setUaName(detectByUA(navigator.userAgent))
  }, [])

  // Pi 인증 완료 후 실제 Pi Browser로 확정된 경우에만 로고 이미지 표시
  if (!isLoading && isInPiBrowser) {
    return (
      <Image
        src='/pi-logo.png'
        alt='Pi Network Login Test'
        width={40}
        height={40}
        className='rounded-full'
        priority
      />
    )
  }
  return <span>{uaName}</span>
}
