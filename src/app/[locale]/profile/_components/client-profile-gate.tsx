'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'
import { getLocaleOptions } from '@/lib/locale-options'
import { ProfileTabs } from './profile-tabs'
import type { UserRow } from '@/lib/users'

// useEffect 이후에만 렌더되므로 SSR 없음 → hydration 불일치 없음
const localeOptions = getLocaleOptions()

export function ClientProfileGate() {
  const t = useTranslations('profile')
  const tc = useTranslations('common')
  const [user, setUser] = useState<UserRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    piFetch('/api/profile')
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: { user: UserRow }) => setUser(data.user))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="text-muted-foreground p-8 text-center text-sm">
        {tc('loading')}
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-muted-foreground text-sm">{t('loginRequired')}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>
      <ProfileTabs initialUser={user} localeOptions={localeOptions} />
    </div>
  )
}
