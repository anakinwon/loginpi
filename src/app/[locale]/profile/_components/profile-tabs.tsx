'use client'

import { useState } from 'react'
import { ProfileForm } from './profile-form'
import { PaymentHistory } from './payment-history'
import { SubscriptionStatus } from './subscription-status'
import type { UserRow } from '@/lib/users'
import type { LocaleOption } from '@/lib/locale-options'

const TABS = [
  { id: 'info',    label: '개인정보' },
  { id: 'payment', label: '결제 내역' },
  { id: 'subscr',  label: '구독 현황' },
] as const

type TabId = (typeof TABS)[number]['id']

interface Props {
  initialUser: UserRow
  localeOptions: LocaleOption[]
}

export function ProfileTabs({ initialUser, localeOptions }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('info')
  const [user, setUser] = useState(initialUser)

  return (
    <div>
      <div className='mb-6 flex gap-1 border-b'>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'info'    && <ProfileForm initialUser={user} localeOptions={localeOptions} onSaved={setUser} />}
      {activeTab === 'payment' && <PaymentHistory />}
      {activeTab === 'subscr'  && <SubscriptionStatus />}
    </div>
  )
}
