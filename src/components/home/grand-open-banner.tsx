'use client'

import { useOpenPromoActive } from '@/components/feature-flag-provider'

// 홈 상단 그랜드 오픈 이벤트 환영 배너 — 오픈 프로모(전액 무료, PRD_26) 활성 시에만 노출.
//   "플랫폼 요금 전액 무료"는 프로모 ON일 때만 사실이므로, OFF면 자동으로 사라진다
//   ("~ 고객이 만족할 때까지" = 프로모 기간). 서버 applyPromoGate와 단일 소스(isOpenPromoActive) 연동.
export function GrandOpenBanner() {
  const active = useOpenPromoActive()
  if (!active) return null

  const items = [
    { label: '기간', value: '~ 고객이 만족할 때까지' },
    { label: '대상', value: '파이오니어' },
    { label: '혜택', value: '카페 무료 생성 · 무료 참여 · 무료 자동번역' },
  ]

  return (
    <section className="relative overflow-hidden rounded-2xl border border-amber-300/60 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-6 shadow-sm dark:border-amber-500/30 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-rose-950/30">
      {/* 배경 glow 장식 */}
      <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-amber-400/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-rose-400/20 blur-3xl" />

      <div className="relative space-y-4">
        {/* 이벤트 배지 */}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1 text-xs font-bold text-white shadow-sm">
          <span className="animate-pulse">🎉</span> 그랜드 오픈 이벤트
        </span>

        {/* 메인 카피 */}
        <div className="space-y-1">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            플랫폼 요금{' '}
            <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 bg-clip-text text-transparent">
              전액 무료
            </span>
          </h2>
          <p className="text-muted-foreground text-sm">
            파이 생태계의 카페, 지금 마음껏 누리세요. ☕
          </p>
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
