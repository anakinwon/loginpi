'use client'

import { useEffect, useState } from 'react'

// 요금제 모드 표시 단위 — PI 모드는 실제 Pi 결제/전송이므로 UI도 Pi(π)로 표기.
//   값 환산·단위는 이 훅 + 헬퍼로 일원화(카페/이벤트방 생성료·입장료·선물 등 공통).

export type FeeMode = 'BEAN' | 'PI'

// 1 Pi = 100 Bean (client-safe 순수 함수 — fee-resolver는 server-only라 별도 정의)
export function beanToPi(beanAmt: number): number {
  return Math.round(beanAmt) / 100
}

// 모드별 "값 + 단위" 문자열. PI=π(÷100) / BEAN=Bean(정수). 아이콘 없이 텍스트 단위.
export function formatFeeAmount(beanAmt: number, mode: FeeMode): string {
  return mode === 'PI' ? `${beanToPi(beanAmt)} π` : `${beanAmt} Bean`
}

// 현재 요금제 모드 1회 조회. 기본 BEAN(조회 전·실패 시 기존 동작 유지).
export function useFeeMode(): FeeMode {
  const [mode, setMode] = useState<FeeMode>('BEAN')
  useEffect(() => {
    let alive = true
    fetch('/api/fee-mode')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { mode?: string } | null) => {
        if (alive && (d?.mode === 'PI' || d?.mode === 'BEAN')) setMode(d.mode)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return mode
}
