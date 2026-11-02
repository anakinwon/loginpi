'use client'

// 요금제 공통 안내 — readApi 가 403 PLAN_REQUIRED(기능 잠김)·PLAN_LIMIT(횟수 초과)·PLAN_EXPIRED(schema.pi 요금제 만료)를 받으면 하단 메뉴 위에 띄운다.
//  클라이언트 게이트(redirect 금지) — 요금제 화면 링크(지금 연결 유지)만 준다. 만료는 schema.pi 쪽 결제라 안내 문구만
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { PLAN_EVENT, type PlanEvent } from '@/lib/client-api'

export function PlanNotice() {
  const t = useTranslations('plan')
  const path = usePathname()
  const [ev, setEv] = useState<PlanEvent | null>(null)
  const [link, setLink] = useState<string | null>(null)

  useEffect(() => {
    const on = (e: Event) => {
      setEv((e as CustomEvent<PlanEvent>).detail)
      setLink(new URLSearchParams(window.location.search).get('link'))
    }
    window.addEventListener(PLAN_EVENT, on)
    return () => window.removeEventListener(PLAN_EVENT, on)
  }, [])
  // 다른 화면으로 가면 닫는다
  useEffect(() => setEv(null), [path])

  if (!ev || path === '/plan') return null
  const plan = ev.need ? t(`names.${ev.need}`) : ''
  const text =
    ev.code === 'PLAN_EXPIRED'
      ? t('notice.expired')
      : ev.code === 'PLAN_LIMIT'
        ? ev.need
          ? t('notice.limit', { plan })
          : t('notice.limitTop')
        : t('notice.required', { plan })
  return (
    <div
      role="alert"
      className="bg-surface-raised fixed inset-x-3 z-50 mx-auto flex max-w-xl items-start gap-3 rounded-xl border border-amber-400/40 p-3 text-sm shadow-lg"
      style={{ bottom: 'calc(var(--dbms-nav-h, 6rem) + 0.75rem)' }}
    >
      <p className="min-w-0 flex-1 break-keep">
        {text}{' '}
        {ev.code !== 'PLAN_EXPIRED' && (
          <Link href={link ? `/plan?link=${encodeURIComponent(link)}` : '/plan'} className="text-accent font-semibold underline">
            {t('notice.go')}
          </Link>
        )}
      </p>
      <button type="button" onClick={() => setEv(null)} aria-label={t('notice.close')} className="text-muted-foreground px-1">
        ×
      </button>
    </div>
  )
}
