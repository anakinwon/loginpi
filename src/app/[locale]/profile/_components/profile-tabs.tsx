'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { ProfileForm } from './profile-form'
import { PaymentHistory } from './payment-history'
import { SubscriptionStatus } from './subscription-status'
import { StoreItemList } from '@/components/store/store-item-list'
import { SalesNotiBadge } from '@/components/store/sales-noti-badge'
import { LbsSettings } from './lbs-settings'
import { TelegramConnect } from './telegram-connect'
import { BeanWalletPanel } from './bean-wallet-panel'
import { BeanIcon } from '@/components/ui/bean-icon'
import { AccountIntegrationSection } from '@/components/account-integration-section'
import type { UserRow } from '@/lib/users'
import type { LocaleOption } from '@/lib/locale-options'

// 라벨은 컴포넌트에서 t('tabs.<id>')로 해석한다(모듈 상수는 useTranslations 불가).
const TAB_IDS = ['info', 'bean', 'payment', 'subscr', 'store', 'lbs'] as const

type TabId = (typeof TAB_IDS)[number]

interface Props {
  initialUser: UserRow
  localeOptions: LocaleOption[]
}

export function ProfileTabs({ initialUser, localeOptions }: Props) {
  const t = useTranslations('profile')
  const [activeTab, setActiveTab] = useState<TabId>('info')
  const [user, setUser] = useState(initialUser)

  // URL ?tab=<id> 로 초기 탭 지정 (예: 캠페인 M3 텔레그램 연동 → /profile?tab=store)
  // useSearchParams는 Suspense 경계가 필요해 window.location으로 마운트 후 1회 적용
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab && (TAB_IDS as readonly string[]).includes(tab))
      setActiveTab(tab as TabId)
  }, [])

  return (
    <div>
      <div className="mb-6 flex gap-1 border-b">
        {TAB_IDS.map((id) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors',
              activeTab === id
                ? 'border-primary text-primary border-b-2'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {id === 'bean' ? (
              <span className="inline-flex items-center gap-1">
                <BeanIcon className="h-5 w-5" />
                {t(`tabs.${id}`)}
              </span>
            ) : (
              t(`tabs.${id}`)
            )}
          </button>
        ))}
      </div>

      {activeTab === 'info' && (
        <div className="space-y-8">
          <AccountIntegrationSection />
          <ProfileForm
            initialUser={user}
            localeOptions={localeOptions}
            onSaved={setUser}
          />
        </div>
      )}
      {activeTab === 'bean' && <BeanWalletPanel />}
      {activeTab === 'payment' && <PaymentHistory />}
      {activeTab === 'subscr' && <SubscriptionStatus />}
      {activeTab === 'store' && <StoreTab />}
      {activeTab === 'lbs' && <LbsSettings />}
    </div>
  )
}

// /store 페이지(SCR-01)와 동일 구성을 프로필 탭에 임베드 — 서브타이틀·내 상품/판매/구매 내비 + 상품 목록
function StoreTab() {
  const t = useTranslations('store')
  const tp = useTranslations('profile')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        <nav className="flex gap-3 text-sm">
          <Link href="/store/my/items" className="text-primary hover:underline">
            {t('navMyItems')}
          </Link>
          <Link href="/store/my/shops" className="text-primary hover:underline">
            🏪 {t('navMyShops')}
          </Link>
          <Link href="/store/my/sales" className="text-primary hover:underline">
            {t('navSales')}
            <SalesNotiBadge />
          </Link>
          <Link
            href="/store/my/orders"
            className="text-primary hover:underline"
          >
            {t('navOrders')}
          </Link>
          <Link
            href="/store"
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            {tp('tabsExtra.fullView')}
          </Link>
        </nav>
      </div>
      <TelegramConnect />
      <StoreItemList mine />
    </div>
  )
}
