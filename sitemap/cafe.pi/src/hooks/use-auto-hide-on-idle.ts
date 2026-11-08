'use client'

import { useEffect, useRef, useState } from 'react'

// 사용자 활동(스크롤·휠·터치·포인터·키)이 있으면 표시하고,
// idleMs 동안 아무 이벤트도 없으면 자동으로 숨긴다.
//   - enabled=false: 항상 표시(true)로 고정하고 리스너도 부착하지 않는다.
//   - 진입(또는 enabled 전환) 시 한 번 보여준 뒤 idle이면 숨김 → 발견성 확보.
// "멈추면 숨고, 움직이면 나타나는" 플로팅 UI(예: Pi Browser 하단 네비)에 사용.
const ACTIVITY_EVENTS = [
  'scroll',
  'wheel',
  'touchstart',
  'touchmove',
  'pointerdown',
  'keydown',
] as const

export function useAutoHideOnIdle(enabled: boolean, idleMs = 1000): boolean {
  const [visible, setVisible] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // 비활성: 리스너 미부착 (일반 브라우저 성능 비용 0). 표시 여부는 반환식에서 파생.
    if (!enabled) return

    const scheduleHide = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setVisible(false), idleMs)
    }
    // 활동 감지 → 즉시 표시 + 숨김 타이머 재시작
    const onActivity = () => {
      setVisible(true)
      scheduleHide()
    }

    // passive: preventDefault를 하지 않으므로 스크롤 성능에 영향 없음
    const opts: AddEventListenerOptions = { passive: true }
    for (const ev of ACTIVITY_EVENTS)
      window.addEventListener(ev, onActivity, opts)

    // 마운트 직후 잠시 노출했다가, 멈춰 있으면 idleMs 뒤 숨김
    scheduleHide()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      for (const ev of ACTIVITY_EVENTS)
        window.removeEventListener(ev, onActivity, opts)
    }
  }, [enabled, idleMs])

  // 비활성 시 항상 표시 (enabled=true일 때만 자동 숨김 상태를 노출)
  return enabled ? visible : true
}
