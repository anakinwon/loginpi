'use client'

import { useEffect, useState } from 'react'
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

  // Pi 인증 완료 후 실제 Pi Browser로 확정된 경우에만 교체
  if (!isLoading && isInPiBrowser) return <span>Pi Browser</span>
  return <span>{uaName}</span>
}
