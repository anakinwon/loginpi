'use client'

import { useTranslations } from 'next-intl'
import { Coffee, House, MapPin, ShieldCheck, Store, Zap } from 'lucide-react'
import { Link, usePathname } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { cn } from '@/lib/utils'

// 하단 고정 네비게이션 (Home · Event · Cafe · Shop · Map · 나의정보/관리자)
// 관리자 여부는 서버 판정(쿠키·Google 세션) OR Pi Browser 클라이언트 세션(role)으로 보완한다.
// Pi Browser는 Set-Cookie를 저장하지 않아 서버 판정만으로는 관리자 탭이 안 보이기 때문.
export function BottomNavClient({ serverIsAdmin }: { serverIsAdmin: boolean }) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const { user: piUser } = usePiAuth()

  // 채팅방 내부는 전체 화면 고정 프레임(fixed top-14 bottom-0)이므로 네비를 숨긴다
  if (/^\/chat\/.+/.test(pathname)) return null

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
    <nav className="bg-background/95 fixed inset-x-0 bottom-0 z-50 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
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
