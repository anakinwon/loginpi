'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

// 홈 상단 기술 백서 — 접이식(기본 접힘). 내용은 i18n(adminStats.whitepaper) 기준.
// 핵심 구축 현황 2개(통합 로그인·Pi 결제) + 강점 6개 = 2열 그리드 4행(동일 카드)
const PILLARS = [
  'highlight1',
  'highlight2',
  'pillar1',
  'pillar2',
  'pillar3',
  'pillar4',
  'pillar5',
  'pillar6',
] as const

export function TechWhitepaper() {
  const t = useTranslations('adminStats.whitepaper')
  const [open, setOpen] = useState(false)

  return (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-card">
      {/* 헤더 (토글) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="hover:bg-muted/30 flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-semibold">
            {t('badge')}
          </span>
          <span className="text-sm font-bold sm:text-base">{t('title')}</span>
        </span>
        <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
          <span className="hidden sm:inline">{open ? t('collapse') : t('expand')}</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {/* 본문 (펼침 시) */}
      {open && (
        <div className="space-y-4 border-t px-5 py-4">
          <p className="text-muted-foreground text-sm leading-relaxed">{t('intro')}</p>

          <ul className="grid gap-3 sm:grid-cols-2">
            {PILLARS.map((p) => (
              <li key={p} className="bg-muted/30 rounded-xl border p-3">
                <p className="text-sm font-semibold">{t(`${p}Title`)}</p>
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                  {t(`${p}Desc`)}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground border-t pt-3 text-center text-xs">
            {t('footer')}
          </p>
        </div>
      )}
    </section>
  )
}
