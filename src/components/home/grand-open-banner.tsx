'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  useOpenPromoActive,
  useOpenPromoEndDtm,
} from '@/components/feature-flag-provider'

// 홈 상단 그랜드 오픈 이벤트 환영 배너 — 오픈 프로모(전액 무료, PRD_26) 활성 시에만 노출.
//   "플랫폼 요금 전액 무료"는 프로모 ON일 때만 사실이므로, OFF면 자동으로 사라진다
//   ("~ 고객이 만족할 때까지" = 프로모 기간). 서버 applyPromoGate와 단일 소스(isOpenPromoActive) 연동.
//
// 종료시각(openPromoEndDtm) 도달 시 재로드 없이 즉시 사라지도록 client 타이머를 건다.
//   SSR active는 페이지 로드 시점 스냅샷이라, 페이지를 열어둔 채 종료시각을 넘기면
//   타이머가 그 순간 배너를 내린다(예: 종료시각 2026-06-30 10:11:00 도달 → 자동 해제).
export function GrandOpenBanner() {
  const active = useOpenPromoActive()
  const endDtm = useOpenPromoEndDtm()
  const t = useTranslations('openPromo')
  // 초기 가시성 = SSR 판정(active). 하이드레이션 일치 위해 동일 초기값 사용.
  const [visible, setVisible] = useState(active)

  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }
    if (!endDtm) {
      setVisible(true) // 무제한 프로모
      return
    }
    const remain = new Date(endDtm).getTime() - Date.now()
    if (remain <= 0) {
      setVisible(false) // 이미 종료시각 경과
      return
    }
    setVisible(true)
    // setTimeout 32비트 한계(~24.8일) 초과분은 다음 재로드의 SSR 판정에 위임
    if (remain < 2_147_483_647) {
      const timer = setTimeout(() => setVisible(false), remain)
      return () => clearTimeout(timer)
    }
  }, [active, endDtm])

  if (!visible) return null

  const items = [
    { label: t('periodLabel'), value: t('periodValue') },
    { label: t('targetLabel'), value: t('targetValue') },
    { label: t('benefitLabel'), value: t('benefitValue') },
  ]

  return (
    <section className="relative overflow-hidden rounded-2xl border border-amber-300/60 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-6 shadow-sm dark:border-amber-500/30 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-rose-950/30">
      {/* 배경 glow 장식 */}
      <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-amber-400/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-rose-400/20 blur-3xl" />

      <div className="relative space-y-4">
        {/* 이벤트 배지 */}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1 text-xs font-bold text-white shadow-sm">
          {t('title')}
        </span>

        {/* 메인 카피 */}
        <div className="space-y-1">
          <h2 className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent sm:text-3xl">
            {t('subtitle')}
          </h2>
          <p className="text-muted-foreground text-sm">{t('desc')}</p>
        </div>

        {/* 상세 정보 */}
        <dl className="grid gap-2 sm:grid-cols-3">
          {items.map((it) => (
            <div
              key={it.label}
              className="rounded-xl border border-amber-200/60 bg-white/60 px-3 py-2 backdrop-blur-sm dark:border-amber-500/20 dark:bg-white/5"
            >
              <dt className="text-[11px] font-semibold tracking-wide text-amber-700 dark:text-amber-400">
                {it.label}
              </dt>
              <dd className="mt-0.5 text-sm font-medium">{it.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
