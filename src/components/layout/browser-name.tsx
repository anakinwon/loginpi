'use client'

import { useEffect, useState } from 'react'

function detectBrowser(ua: string): string {
  // window.Pi 주입 여부가 Pi Browser의 가장 확실한 식별자
  if (typeof window !== 'undefined' && window.Pi) return 'Pi Browser'
  if (/PiBrowser/.test(ua)) return 'Pi Browser'
  if (/Edg\//.test(ua)) return 'Edge'
  if (/OPR\//.test(ua)) return 'Opera'
  if (/Chrome\//.test(ua)) return 'Chrome'
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/Safari\//.test(ua)) return 'Safari'
  return 'Browser'
}

export function BrowserName() {
  const [name, setName] = useState('...')

  useEffect(() => {
    setName(detectBrowser(navigator.userAgent))
  }, [])

  return <span>{name}</span>
}
