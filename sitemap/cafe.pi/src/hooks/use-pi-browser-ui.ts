'use client'

import { useEffect, useState } from 'react'
import { usePiAuth } from '@/components/pi-auth-provider'

// UI 게이팅 전용 Pi Browser 판정 — 인증 성공(isInPiBrowser) OR UA 즉시 감지.
//   Pi Browser에서 인증 완료를 기다리지 않고 UA로 즉시 인식해, 로그인 전에도
//   Pi 전용 UI(Pi 로고·Pi 로그인 버튼)만 보이고 Google 로그인 버튼은 숨긴다.
//   (메뉴 플로팅과 동일한 isInPiBrowser||UA 신호 — 일관성 확보)
// ⚠️ Pi 결제 등 보안 결정에는 사용 금지. 그건 인증 확정(usePiAuth().isInPiBrowser)만 쓴다.
//    (UA는 스푸핑 가능하므로 표시 게이팅에만 사용)
export function usePiBrowserUI(): boolean {
  const { isInPiBrowser } = usePiAuth()
  const [uaPi, setUaPi] = useState(false)
  useEffect(() => {
    setUaPi(/PiBrowser/i.test(navigator.userAgent))
  }, [])
  return isInPiBrowser || uaPi
}
