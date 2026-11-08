'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { usePiAuth } from '@/components/pi-auth-provider'
import { usePiBrowserUI } from '@/hooks/use-pi-browser-ui'

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
  const { isLoading } = usePiAuth()
  // UA 폴백 포함 — 인증 완료 전에도 Pi Browser면 즉시 Pi 로고 표시
  const inPiBrowser = usePiBrowserUI()
  const [uaName, setUaName] = useState('...')

  useEffect(() => {
    setUaName(detectByUA(navigator.userAgent))
  }, [])

  // Pi Browser(인증 확정 OR UA)면 Pi 로고 이미지 표시
  if (!isLoading && inPiBrowser) {
    return (
      <Image
        src="/pi-logo.png"
        alt="CafePi"
        width={40}
        height={40}
        className="rounded-full"
        priority
      />
    )
  }
  return <span>{uaName}</span>
}
