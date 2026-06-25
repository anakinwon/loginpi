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
          ? // Pi Browser: 양옆·아래로 띄운 둥근 플로팅 바 (배경 solid → element opacity로 90% 제어)
            'bg-background inset-x-3 overflow-hidden rounded-2xl border shadow-lg'
          : // 일반 브라우저: 기존 도킹 바 (하단 풀폭, safe-area 패딩)
            'bg-background/95 inset-x-0 bottom-0 border-t pb-[env(safe-area-inset-bottom)]',
        // 가시: 90% 불투명 / 숨김: 투명+터치차단. 나타날 땐 빠르게(200ms), 사라질 땐 천천히(700ms) fade.
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
                'flex flex-col items-center justify-center gap-1 text-xs transition-colors',
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
