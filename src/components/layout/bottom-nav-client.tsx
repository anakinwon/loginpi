'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Coffee, House, MapPin, ShieldCheck, Store, Zap } from 'lucide-react'
import { Link, usePathname } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { useAutoHideOnIdle } from '@/hooks/use-auto-hide-on-idle'
import { cn } from '@/lib/utils'

// 하단 고정 네비게이션 (Home · Event · Cafe · Shop · Map · 나의정보/관리자)
// 관리자 여부는 서버 판정(쿠키·Google 세션) OR Pi Browser 클라이언트 세션(role)으로 보완한다.
// Pi Browser는 Set-Cookie를 저장하지 않아 서버 판정만으로는 관리자 탭이 안 보이기 때문.
export function BottomNavClient({ serverIsAdmin }: { serverIsAdmin: boolean }) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const { user: piUser, isInPiBrowser } = usePiAuth()

  // Pi Browser 판정: 인증 완료 신호(isInPiBrowser) OR UA 즉시 감지.
  // UA 감지는 navigator 접근이라 마운트 후 effect에서 (SSR=초기 클라 렌더는 false로 일치).
  const [uaPiBrowser, setUaPiBrowser] = useState(false)
  useEffect(() => {
    setUaPiBrowser(/PiBrowser/i.test(navigator.userAgent))
  }, [])
  const floating = isInPiBrowser || uaPiBrowser

  // 채팅방 내부는 전체 화면 고정 프레임이라 네비를 숨긴다 → 그땐 자동숨김 리스너도 불필요
  const inChatRoom = /^\/chat\/.+/.test(pathname)
  // Pi Browser에서만: 멈추면 숨고, 스크롤·터치하면 나타났다가 3초 후 다시 숨김
  const visible = useAutoHideOnIdle(floating && !inChatRoom, 3000)

  if (inChatRoom) return null

  const isAdminUser =
    serverIsAdmin || piUser?.role === 'ADMIN' || piUser?.role === 'MASTER'

  const baseTabs = [
    { href: '/', label: t('home'), icon: House, active: pathname === '/' },
    {
      href: '/event',
      label: t('event'),
      icon: Zap,
      active: pathname.startsWith('/event'),
    },
    {
      href: '/chat',
      label: t('cafe'),
      icon: Coffee,
      active: pathname.startsWith('/chat'),
    },
    {
      href: '/store',
      label: t('shop'),
      icon: Store,
      active: pathname.startsWith('/store'),
    },
    {
      href: '/map',
      label: t('map'),
      icon: MapPin,
      active: pathname.startsWith('/map'),
    },
  ]

  // 관리자만 Admin 탭 추가 — 비관리자는 헤더 사용자명 클릭으로 My Info 이동
  const tabs = isAdminUser
    ? [
        ...baseTabs,
        {
          href: '/admin',
          label: t('admin'),
          icon: ShieldCheck,
          active: pathname.startsWith('/admin'),
        },
      ]
    : baseTabs

  return (
    <nav
      aria-hidden={floating && !visible}
      className={cn(
        'fixed z-50 backdrop-blur-sm transition-opacity ease-in-out',
        floating
          ? // Pi Browser: 양옆·아래로 띄운 둥근 플로팅 바.
            // 그라데이션 muted→border(한 단계 더 진한 톤) + bg-muted 폴백 베이스.
            // 3D 볼륨: 강한 드롭 섀도(부유) + 상단 하이라이트(윗면 빛) + 하단 inset 다크(아래 그늘).
            // 배경 불투명 → opacity-90(90%) 규칙 유지.
            'inset-x-3 overflow-hidden rounded-2xl border bg-muted bg-gradient-to-b from-muted to-[var(--color-border)] shadow-[0_14px_34px_-8px_rgba(0,0,0,0.42),inset_0_1px_0_0_rgba(255,255,255,0.25),inset_0_-2px_3px_-1px_rgba(0,0,0,0.16)]'
          : // 일반 브라우저: 기존 도킹 바 (하단 풀폭, safe-area 패딩)
            'bg-background/95 inset-x-0 bottom-0 border-t pb-[env(safe-area-inset-bottom)]',
        // 가시: 90% 불투명 / 숨김: 투명(opacity-0) 완전 fade-out + 터치 차단.
        // 선명해질 땐 빠르게(200ms), 흐려질 땐 천천히(700ms) fade.
        floating &&
          (visible
            ? 'opacity-90 duration-200'
            : 'pointer-events-none opacity-0 duration-700'),
      )}
      style={
        floating
          ? { bottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }
          : undefined
      }
    >
      <div
        className={`mx-auto grid h-16 max-w-5xl ${isAdminUser ? 'grid-cols-6' : 'grid-cols-5'}`}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                // transition-[color,transform] + active:scale-90 → 누르는 즉시 시각 피드백(체감 지연 제거)
                // touch-manipulation: 전역 설정 보강(이 인터랙티브 요소에서도 더블탭 줌 지연 차단)
                'flex touch-manipulation flex-col items-center justify-center gap-1 text-xs transition-[color,transform] duration-100 select-none active:scale-90',
                tab.active
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-5" strokeWidth={tab.active ? 2.5 : 2} />
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
