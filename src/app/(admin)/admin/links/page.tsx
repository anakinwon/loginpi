'use client'

import { useEffect, useState } from 'react'
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

const STATUS_LABEL: Record<LinkStatus, string> = {
  linked:      '연동 완료',
  pi_only:     'Pi 전용',
  google_only: 'Google 전용',
}

export default function LinksPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<LinkStatus | 'all'>('all')

  useEffect(() => {
    fetch('/api/admin/links')
      .then((r) => r.json())
      .then((d: { users: UserRow[] }) => setUsers(d.users ?? []))
      .finally(() => setLoading(false))
  }, [])

  const counts = {
    linked:      users.filter((u) => getLinkStatus(u) === 'linked').length,
    pi_only:     users.filter((u) => getLinkStatus(u) === 'pi_only').length,
    google_only: users.filter((u) => getLinkStatus(u) === 'google_only').length,
  }

  const filtered = filter === 'all' ? users : users.filter((u) => getLinkStatus(u) === filter)

  const STAT_CARDS = [
    { label: '연동 완료', value: counts.linked, desc: 'Pi + Google 연결됨', key: 'linked' as LinkStatus },
    { label: 'Pi 전용', value: counts.pi_only, desc: 'Google 미연동', key: 'pi_only' as LinkStatus },
    { label: 'Google 전용', value: counts.google_only, desc: 'Pi 미연동', key: 'google_only' as LinkStatus },
  ]

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-2xl font-bold'>계정 연동 현황</h1>
        <p className='text-muted-foreground text-sm mt-1'>전체 {users.length}명</p>
      </div>

      {/* 통계 카드 — 클릭 시 해당 필터로 이동 */}
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

      {/* 상태 필터 탭 */}
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
            {s === 'all' ? `전체 (${users.length})` : `${STATUS_LABEL[s]} (${counts[s]})`}
          </button>
        ))}
      </div>

      {/* 사용자 테이블 */}
      {loading ? (
        <p className='text-muted-foreground text-sm'>로딩 중…</p>
      ) : filtered.length === 0 ? (
        <p className='text-muted-foreground text-sm'>해당 사용자가 없습니다.</p>
      ) : (
        <div className='rounded-lg border overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 border-b'>
              <tr>
                <th className='text-left px-4 py-2 font-medium'>사용자</th>
                <th className='text-left px-4 py-2 font-medium'>Pi 계정</th>
                <th className='text-left px-4 py-2 font-medium'>Google 계정</th>
                <th className='text-left px-4 py-2 font-medium'>연동 상태</th>
                <th className='text-left px-4 py-2 font-medium'>역할</th>
                <th className='text-left px-4 py-2 font-medium'>가입일</th>
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
