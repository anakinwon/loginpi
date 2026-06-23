'use client'

import { useState } from 'react'
import { ClientEventGate } from '@/components/event/client-event-gate'
import { ClientCampaign } from '../campaign/client-campaign'
import { CampaignShopBoard } from '../campaign/campaign-shop-board'

const TABS = [
  { id: 1, label: 'Event #1', sub: '미션 이벤트' },
  { id: 2, label: 'Event #2', sub: '매장 선착순 온보딩 이벤트' },
] as const

type TabId = (typeof TABS)[number]['id']

export function ClientEventTabs() {
  const [active, setActive] = useState<TabId>(1)

  return (
    <div className="space-y-6">
      {/* 탭 헤더 */}
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={[
              'flex flex-col items-start px-5 py-3 text-sm transition-colors',
              active === tab.id
                ? 'border-primary text-primary border-b-2 font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <span className="font-bold">{tab.label}</span>
            <span className="text-xs">{tab.sub}</span>
          </button>
        ))}
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
