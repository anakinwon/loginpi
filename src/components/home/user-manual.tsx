'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

// 홈 "쉬운 사용 설명서" — 2단 접기(바깥 카드 기본 접힘 → 주제별 아코디언, 여러 개 동시 열기).
// 콘텐츠는 i18n(adminStats.manual.topics) 배열. validate-locales가 배열을 leaf로 보아 키 정합 통과.
interface Topic {
  icon: string
  title: string
  steps: string[]
}

// 임시 숨김 주제 — i18n 데이터(adminStats.manual.topics)는 보존하고 렌더만 제외한다(삭제 아님).
//   나중에 되살리려면 이 집합에서 해당 icon을 빼면 됨 (2026-07-01 마스터 요청).
//   🎁 이벤트 · 🪙 테스트넷 보상. icon은 모든 locale 공통이라 다국어 안전.
//   (🎫는 'Pi 구독(PiRC2)'로 개편해 유지 — 숨김 대상 아님)
const HIDDEN_TOPIC_ICONS = new Set(['🎁', '🪙'])

export function UserManual() {
  const t = useTranslations('adminStats.manual')
  // 배열 가드 — 번역 병합 이상 등으로 배열이 아니면 빈 배열로(크래시 방지)
  const rawTopics = t.raw('topics')
  const allTopics: Topic[] = Array.isArray(rawTopics)
    ? (rawTopics as Topic[])
    : []
  // 숨김 주제 제외(데이터는 보존) — icon 기준이라 모든 locale에서 동일하게 숨겨진다
  const topics = allTopics.filter((tp) => !HIDDEN_TOPIC_ICONS.has(tp.icon))
  // 전 환경 기본 접힘 — 홈 히어로가 시각 앵커가 되도록 (2026-07-17 마스터, 구 정책: 운영 기본 펼침)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  function toggleTopic(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <section className="dark:bg-card overflow-hidden rounded-2xl border bg-white shadow-sm">
      {/* 바깥 토글 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="hover:bg-muted/30 flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
            {t('badge')}
          </span>
          <span className="text-sm font-bold sm:text-base">{t('title')}</span>
        </span>
        <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
          <span className="hidden sm:inline">
            {open ? t('collapse') : t('expand')}
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m6 9 6 6 6-6"
            />
          </svg>
        </span>
      </button>

      {/* 본문 (펼침 시) — 주제별 아코디언 */}
      {open && (
        <div className="space-y-3 border-t px-5 py-4">
          <p className="text-muted-foreground text-sm leading-relaxed">
            {t('intro')}
          </p>
          <ul className="space-y-2">
            {topics.map((topic, i) => {
              const isOpen = expanded.has(i)
              return (
                <li key={i} className="overflow-hidden rounded-xl border">
                  <button
                    type="button"
                    onClick={() => toggleTopic(i)}
                    aria-expanded={isOpen}
                    className="hover:bg-muted/30 flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span aria-hidden="true">{topic.icon}</span>
                      {topic.title}
                    </span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className={`text-muted-foreground h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m6 9 6 6 6-6"
                      />
                    </svg>
                  </button>
                  {isOpen && (
                    <ul className="bg-muted/20 space-y-1.5 border-t px-3 py-2.5">
                      {topic.steps.map((s, j) => (
                        <li
                          key={j}
                          className="text-muted-foreground flex gap-2 text-xs leading-relaxed"
                        >
                          <span className="text-primary mt-0.5 shrink-0">
                            •
                          </span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
