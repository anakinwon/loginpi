'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type LinkStatus = 'linked' | 'pi_only' | 'google_only'

interface UserRow {
  id: string
  pi_uid: string | null
  pi_username: string | null
  google_id: string | null
  google_email: string | null
  google_name: string | null
  display_name: string
  role: string
  created_at: string
}

function getLinkStatus(u: UserRow): LinkStatus {
  if (u.pi_uid && u.google_id) return 'linked'
  if (u.pi_uid) return 'pi_only'
  return 'google_only'
}

const STATUS_STYLE: Record<LinkStatus, string> = {
  linked:      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pi_only:     'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  google_only: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
}

export default function LinksPage() {
  const t = useTranslations('admin.links')
  const tc = useTranslations('common')
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<LinkStatus | 'all'>('all')

  useEffect(() => {
    fetch('/api/admin/links')
      .then((r) => r.json())
      .then((d: { users: UserRow[] }) => setUsers(d.users ?? []))
      .finally(() => setLoading(false))
  }, [])

  const STATUS_LABEL: Record<LinkStatus, string> = {
    linked:      t('status.linked'),
    pi_only:     t('status.piOnly'),
    google_only: t('status.googleOnly'),
  }

  const counts = {
    linked:      users.filter((u) => getLinkStatus(u) === 'linked').length,
    pi_only:     users.filter((u) => getLinkStatus(u) === 'pi_only').length,
    google_only: users.filter((u) => getLinkStatus(u) === 'google_only').length,
  }

  const filtered = filter === 'all' ? users : users.filter((u) => getLinkStatus(u) === filter)

  const STAT_CARDS = [
    { label: t('status.linked'), value: counts.linked, desc: t('desc.linked'), key: 'linked' as LinkStatus },
    { label: t('status.piOnly'), value: counts.pi_only, desc: t('desc.piOnly'), key: 'pi_only' as LinkStatus },
    { label: t('status.googleOnly'), value: counts.google_only, desc: t('desc.googleOnly'), key: 'google_only' as LinkStatus },
  ]

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-2xl font-bold'>{t('title')}</h1>
        <p className='text-muted-foreground text-sm mt-1'>{t('totalCount', { count: users.length })}</p>
      </div>

      <div className='grid gap-4 sm:grid-cols-3'>
        {STAT_CARDS.map(({ label, value, desc, key }) => (
          <button key={key} onClick={() => setFilter(filter === key ? 'all' : key)} className='text-left'>
            <Card className={`transition-colors cursor-pointer ${filter === key ? 'ring-2 ring-primary' : 'hover:bg-muted/40'}`}>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm text-muted-foreground font-medium'>{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className='text-3xl font-bold'>{loading ? '…' : value}</p>
                <p className='text-muted-foreground text-xs mt-1'>{desc}</p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      <div className='flex gap-2 flex-wrap'>
        {(['all', 'linked', 'pi_only', 'google_only'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              filter === s
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {s === 'all' ? `${tc('all')} (${users.length})` : `${STATUS_LABEL[s]} (${counts[s]})`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className='text-muted-foreground text-sm'>{tc('loading')}</p>
      ) : filtered.length === 0 ? (
        <p className='text-muted-foreground text-sm'>{t('noUsers')}</p>
      ) : (
        <div className='rounded-lg border overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 border-b'>
              <tr>
                <th className='text-left px-4 py-2 font-medium'>{t('col.user')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.piAccount')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.googleAccount')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.linkStatus')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.role')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.joinDate')}</th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {filtered.map((u) => {
                const status = getLinkStatus(u)
                return (
                  <tr key={u.id} className='hover:bg-muted/30 transition-colors'>
                    <td className='px-4 py-3 font-medium'>{u.display_name}</td>
                    <td className='px-4 py-3 text-muted-foreground'>
                      {u.pi_username ? `@${u.pi_username}` : '—'}
                    </td>
                    <td className='px-4 py-3 text-muted-foreground'>
                      {u.google_email ?? '—'}
                    </td>
                    <td className='px-4 py-3'>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
                        {STATUS_LABEL[status]}
                      </span>
                    </td>
                    <td className='px-4 py-3 text-muted-foreground text-xs'>{u.role}</td>
                    <td className='px-4 py-3 text-muted-foreground text-xs whitespace-nowrap'>
                      {new Date(u.created_at).toLocaleDateString('ko-KR')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
