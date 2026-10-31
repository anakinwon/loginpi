'use client'

// 상단 헤더 — 홈·관리자 메뉴(관리자만 — 제작 현황·방 관리·사용자 관리)·요금제·계정 연동(미연동만)·개인정보 처리방침·언어 전환·로그인 상태(Pi 세션 OR Google 연동 세션, useAppUser 통합)
import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { Link, usePathname } from '@/i18n/navigation'
import { readApi } from '@/lib/client-api'
import { AuthStatus } from './auth-status'
import { useAppUser } from './google-auth'

// Google 연동 완료 여부 — Google 세션 사용자는 연동돼야만 user 가 되므로 항상 true, Pi 세션은 /api/auth/me linked 로 확인
function useLinked(userId: string | null, google: boolean) {
  const [linked, setLinked] = useState<string | null>(null) // 연동 확인된 userId
  useEffect(() => {
    if (google || !userId) return
    let live = true
    void readApi<{ user: { linked?: boolean } | null }>(
      piFetch('/api/auth/me', { cache: 'no-store' }),
    ).then((r) => {
      if (live && r.ok && r.data.user?.linked) setLinked(userId)
    })
    return () => {
      live = false
    }
  }, [userId, google])
  return google || (!!userId && linked === userId)
}

// 관리자 메뉴 — 네이티브 펼침(details, 키보드·화면 낭독 기본 지원). 항목 이동·바깥 탭·포커스 이탈·Esc = 닫기(Esc 는 여는 버튼으로 포커스 복귀)
function AdminMenu({ items }: { items: [string, string][] }) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const ref = useRef<HTMLDetailsElement>(null)
  const close = () => {
    if (ref.current) ref.current.open = false
  }
  useEffect(close, [pathname])
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) close()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !ref.current?.open) return
      close()
      ref.current.querySelector('summary')?.focus()
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('keydown', key)
    }
  }, [])
  const here = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  return (
    <details
      ref={ref}
      className="relative"
      onBlur={(e) => {
        // Tab 으로 포커스가 메뉴 밖 요소로 갔을 때만 닫는다 — 대상 없음(null)은 무시(iOS 는 링크 탭에 포커스를 안 줘 클릭 전에 닫혀 버림, 바깥 탭은 pointerdown 이 맡음)
        const to = e.relatedTarget as Node | null
        if (to && !e.currentTarget.contains(to)) close()
      }}
    >
      <summary
        className={`inline-flex min-h-6 cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden ${items.some(([h]) => here(h)) ? 'font-semibold' : ''}`}
      >
        {t('admin')}
        <span aria-hidden className="text-xs">
          ▾
        </span>
      </summary>
      <ul className="bg-surface absolute top-full left-0 z-40 mt-2 min-w-40 rounded-xl p-1 shadow-xl">
        {items.map(([href, label]) => (
          <li key={href}>
            <Link
              href={href}
              onClick={close}
              aria-current={here(href) ? 'page' : undefined}
              className="hover:bg-surface-raised aria-[current=page]:bg-surface-raised block rounded-lg px-3 py-2"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  )
}

export function SiteHeader() {
  const t = useTranslations('nav')
  const tl = useTranslations('list')
  const locale = useLocale()
  const pathname = usePathname()
  const { user, source } = useAppUser()
  // 표시 게이팅만 — 제작 현황 화면은 정적 안내(조회·쓰기 없음), 방 관리·사용자 관리는 API 가 ADMIN 을 다시 확인
  const admin = user?.role === 'ADMIN' || user?.role === 'MASTER'
  const linked = useLinked(user?.userId ?? null, source === 'google')

  return (
    <header className="border-b border-white/10">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 lg:max-w-none lg:px-8">
        <Link href="/" className="text-lg font-bold">
          seminar.pi
        </Link>
        {/* 글자 링크도 터치 대상 높이 24px 이상(WCAG 2.5.8, 360px 폭에서 줄바꿈돼 위아래로 붙을 때) */}
        <nav className="flex flex-wrap items-center gap-3 text-sm [&>a]:inline-flex [&>a]:min-h-6 [&>a]:items-center">
          {admin && (
            <AdminMenu
              items={[
                ['/progress', tl('progress')],
                ['/admin/rooms', t('rooms')],
                ['/admin/users', t('users')],
              ]}
            />
          )}
          <Link href="/plan">{t('plan')}</Link>
          {!linked && <Link href="/link">{t('link')}</Link>}
          <Link href="/privacy">{t('privacy')}</Link>
          <Link href={pathname} locale={locale === 'ko' ? 'en' : 'ko'}>
            {t('switchLocale')}
          </Link>
        </nav>
        <div className="ml-auto">
          <AuthStatus />
        </div>
      </div>
    </header>
  )
}
