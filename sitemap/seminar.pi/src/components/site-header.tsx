'use client'

// 상단 헤더 — 홈·제작 현황·방 관리(관리자만)·요금제·계정 연동(미연동만)·개인정보 처리방침·언어 전환·로그인 상태(Pi 세션 OR Google 연동 세션, useAppUser 통합)
import { useEffect, useState } from 'react'
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

export function SiteHeader() {
  const t = useTranslations('nav')
  const tl = useTranslations('list')
  const locale = useLocale()
  const pathname = usePathname()
  const { user, source } = useAppUser()
  // 표시 게이팅만 — 제작 현황 화면은 정적 안내(조회·쓰기 없음), 방 관리는 API 가 ADMIN 을 다시 확인
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
          {admin && <Link href="/progress">{tl('progress')}</Link>}
          {admin && <Link href="/admin/rooms">{t('rooms')}</Link>}
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
