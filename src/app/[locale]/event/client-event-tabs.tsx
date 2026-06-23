'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ClientEventGate } from '@/components/event/client-event-gate'
import { ClientCampaign } from '../campaign/client-campaign'
import { CampaignShopBoard } from '../campaign/campaign-shop-board'

const TABS = [
  {
    id: 1,
    label: 'Event #1',
    subKey: 'tabMissionSub',
    icon: '🎯',
    activeCls:
      'border-violet-300 bg-gradient-to-b from-violet-50 to-violet-100 text-violet-800 shadow-[0_10px_24px_-10px_rgba(139,92,246,0.4)] dark:border-violet-700 dark:from-violet-950/70 dark:to-violet-900/40 dark:text-violet-200',
    barCls: 'bg-violet-300',
  },
  {
    id: 2,
    label: 'Event #2',
    subKey: 'tabShopSub',
    icon: '🏪',
    activeCls:
      'border-emerald-300 bg-gradient-to-b from-emerald-50 to-emerald-100 text-emerald-800 shadow-[0_10px_24px_-10px_rgba(16,185,129,0.4)] dark:border-emerald-700 dark:from-emerald-950/70 dark:to-emerald-900/40 dark:text-emerald-200',
    barCls: 'bg-emerald-300',
  },
] as const

type TabId = (typeof TABS)[number]['id']

export function ClientEventTabs() {
  const t = useTranslations('event')
  const [active, setActive] = useState<TabId>(1)

  return (
    <div className="space-y-6">
      {/* 탭 헤더 — 입체(3D) 카드형: 활성 탭이 떠오르고 색으로 구분 */}
      <div className="flex items-end gap-3 px-1 pt-2">
        {TABS.map((tab) => {
          const on = active === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              aria-pressed={on}
              className={[
                'relative flex flex-1 flex-col items-center gap-1 rounded-2xl border-2 px-4 py-4 transition-all duration-200 ease-out',
                on
                  ? `${tab.activeCls} z-10 -translate-y-1 scale-[1.02] font-bold`
                  : 'border-border/50 bg-muted/40 text-muted-foreground translate-y-0 opacity-75 shadow-[inset_0_2px_5px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 hover:opacity-95',
              ].join(' ')}
            >
              <span className="text-3xl leading-none drop-shadow-sm">
                {tab.icon}
              </span>
              <span className="text-sm font-extrabold tracking-tight">
                {tab.label}
              </span>
              <span className="text-[11px] leading-tight font-medium opacity-90">
                {t(tab.subKey)}
              </span>
              {/* 활성 표시 막대 (떠오른 탭 하단) */}
              {on && (
                <span
                  className={`absolute -bottom-[7px] left-1/2 h-1.5 w-12 -translate-x-1/2 rounded-full ${tab.barCls} shadow-sm`}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* 탭 콘텐츠 */}
      {active === 1 && <ClientEventGate />}
      {active === 2 && (
        <div className="space-y-8">
          <h1 className="text-center text-3xl font-bold">
            🏪 매장 선착순 온보딩 이벤트
          </h1>
          {/* 본인 신청 카드 */}
          <div className="mx-auto max-w-lg">
            <ClientCampaign />
          </div>
          {/* 전체 매장 조건 현황 보드 */}
          <CampaignShopBoard />
        </div>
      )}
    </div>
  )
}
