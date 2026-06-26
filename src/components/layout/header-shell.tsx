'use client'

import { useEffect, useState } from 'react'
import { usePathname } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { useAutoHideOnIdle } from '@/hooks/use-auto-hide-on-idle'
import { cn } from '@/lib/utils'

// 상단 헤더 셸 — 푸터(BottomNav)와 동일한 Pi Browser 전용 플로팅/자동숨김을 헤더에 적용한다.
//   · Pi Browser(isInPiBrowser ∥ UA): 양옆·위로 띄운 둥근 플로팅 바 + 3초 idle 후 천천히 fade out
//   · 일반 브라우저: 기존 도킹 sticky 헤더 그대로
//   · 채팅방(/chat/.+)은 fixed top-14 전용 프레임이라 충돌 방지 위해 플로팅 제외(도킹 유지)
export function HeaderShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { isInPiBrowser } = usePiAuth()

  // UA 즉시 감지 (navigator는 마운트 후 → SSR=초기 클라 렌더는 false로 일치)
  const [uaPiBrowser, setUaPiBrowser] = useState(false)
  useEffect(() => {
    setUaPiBrowser(/PiBrowser/i.test(navigator.userAgent))
  }, [])

  // 채팅방은 도킹 유지(플로팅 제외)로 top-14 프레임 보존
  const inChatRoom = /^\/chat\/.+/.test(pathname)
  const floating = (isInPiBrowser || uaPiBrowser) && !inChatRoom

  // Pi Browser에서만: 멈추면 숨고, 스크롤·터치하면 나타났다가 3초 후 다시 숨김
  const visible = useAutoHideOnIdle(floating, 3000)

  return (
    <>
      <header
        aria-hidden={floating && !visible}
        className={cn(
          'z-50 backdrop-blur-sm transition-opacity ease-in-out',
          floating
            ? // Pi Browser: 둥근 플로팅 바 (푸터와 동일 스타일: muted→border 그라데이션 + 3D 볼륨 섀도)
              // ⚠️ overflow-hidden 금지: 헤더의 backdrop-blur가 fixed 자식의 컨테이닝 블록이 되어,
              //    overflow-hidden을 켜면 LanguageSwitcher 드롭다운(fixed, 헤더 밑으로 열림)이
              //    헤더 박스로 클립돼 사라진다. 둥근 모서리는 헤더 배경이 border-radius로 이미 클립됨.
              'fixed inset-x-3 rounded-2xl border bg-muted bg-gradient-to-b from-muted to-[var(--color-border)] shadow-[0_14px_34px_-8px_rgba(0,0,0,0.42),inset_0_1px_0_0_rgba(255,255,255,0.25),inset_0_-2px_3px_-1px_rgba(0,0,0,0.16)]'
            : // 일반 브라우저·채팅방: 기존 도킹 sticky 헤더
              'bg-background/80 sticky top-0 border-b',
          // 가시: 90% 불투명 / 숨김: 투명+터치차단. 등장 200ms / 사라짐 700ms fade.
          floating &&
            (visible
              ? 'opacity-90 duration-200'
              : 'pointer-events-none opacity-0 duration-700'),
        )}
        style={
          floating
            ? { top: 'calc(env(safe-area-inset-top) + 0.5rem)' }
            : undefined
        }
      >
        {children}
      </header>
      {/* 플로팅 모드: header가 flow를 벗어나므로 상단 공간을 spacer로 보존
          (숨겨도 공간 유지 → 콘텐츠 겹침 방지. 푸터의 main pb-16과 동일 취지) */}
      {floating && (
        <div
          aria-hidden
          style={{ height: 'calc(env(safe-area-inset-top) + 4.5rem)' }}
        />
      )}
    </>
  )
}
