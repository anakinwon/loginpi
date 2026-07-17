'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

// 배포 직후 구버전 클라이언트의 청크 로드 실패 시그니처 — 새로고침 한 번으로 자가 회복 가능
const STALE_CHUNK_RE =
  /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed/i
const RELOAD_GUARD_KEY = 'le_auto_reload_ts'
const RELOAD_GUARD_MS = 60_000

// 로케일 세그먼트 내 런타임 오류 경계 — 레이아웃(헤더/프로바이더/i18n) 살아있는 정상 UI.
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errorPage')

  useEffect(() => {
    console.error('[locale error]', error)
    // stale chunk(배포 전환기)만 자동 새로고침 — 일반 컴포넌트 버그는 수동 UI 유지(루프 방지)
    if (!STALE_CHUNK_RE.test(`${error?.name ?? ''} ${error?.message ?? ''}`))
      return
    try {
      const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0)
      if (Date.now() - last > RELOAD_GUARD_MS) {
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
        window.location.reload()
      }
    } catch {}
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-4xl">⚠️</p>
      <h1 className="text-xl font-bold">{t('errTitle')}</h1>
      <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
        {t('errDesc')}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => reset()}
          className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          {t('retry')}
        </button>
        <Link
          href="/"
          className="hover:bg-muted rounded-lg border px-4 py-2 text-sm"
        >
          {t('home')}
        </Link>
      </div>
    </div>
  )
}
