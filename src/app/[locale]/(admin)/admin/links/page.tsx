'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useDynamicLimit } from '@/hooks/use-dynamic-limit'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { piFetch } from '@/lib/pi-fetch'

// p-6(48) + 제목+설명(56) + gap(16) + 통계카드(100) + gap(16) + 검색(36) + gap(16) + 필터칩(36) + gap(16) + 테이블헤더(33) + gap(16) + 페이지네이션(36)
const CHROME_PX = 425

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
  reg_dtm: string
  del_yn: string | null // 'Y' = 비활성(앞으로 절대 사용하지 않는 계정)
  del_dtm: string | null
}

function getLinkStatus(u: UserRow): LinkStatus {
  if (u.pi_uid && u.google_id) return 'linked'
  if (u.pi_uid) return 'pi_only'
  return 'google_only'
}

const STATUS_STYLE: Record<LinkStatus, string> = {
  linked:
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pi_only:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  google_only:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
}

export default function LinksPage() {
  const t = useTranslations('admin.links')
  const tc = useTranslations('common')

  // 서버 페이지네이션 — users: 현재 페이지 행 / total: 현재 조건 건수 / counts: 통계카드·필터칩용 전체 상태별 건수(검색 무관)
  const [users, setUsers] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Record<LinkStatus | 'all', number>>({
    all: 0,
    linked: 0,
    pi_only: 0,
    google_only: 0,
  })
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [filter, setFilter] = useState<LinkStatus | 'all'>('all')
  const [search, setSearch] = useState('') // pi_username 부분일치(trigram) 검색
  const [page, setPage] = useState(1)
  const [toggling, setToggling] = useState<string | null>(null)
  const limit = useDynamicLimit(CHROME_PX)

  // 계정 활성/비활성 토글 (del_yn). 'Y'=앞으로 절대 사용하지 않는 계정 → 모든 화면에서 차단.
  async function toggleActive(u: UserRow) {
    const next = u.del_yn === 'Y' ? 'N' : 'Y'
    if (
      next === 'Y' &&
      !window.confirm(t('confirmDisable', { name: u.display_name }))
    )
      return
    setToggling(u.id)
    try {
      const res = await piFetch('/api/admin/links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id, del_yn: next }),
      })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        window.alert(d.error ?? t('toggleFailed'))
        return
      }
      // optimistic 갱신 — 활성/비활성은 연동상태 건수와 무관해 목록만 반영
      setUsers((arr) =>
        arr.map((x) => (x.id === u.id ? { ...x, del_yn: next } : x)),
      )
    } finally {
      setToggling(null)
    }
  }

  // limit 또는 필터/검색 변경 시 첫 페이지로 리셋
  useEffect(() => {
    setPage(1)
  }, [limit, filter, search])

  // 페이지·크기·필터·검색 변경 시 서버 조회 (검색어 입력은 300ms debounce).
  // 2글자 미만 검색어는 보내지 않음(전체) — 서버가 pi_username을 pg_trgm GIN(.ilike '%q%')으로 부분일치 검색.
  useEffect(() => {
    const term = search.trim()
    const p = new URLSearchParams({ page: String(page), size: String(limit) })
    if (filter !== 'all') p.set('status', filter)
    if (term.length >= 2) p.set('q', term)
    let stale = false
    setSearching(true)
    const h = setTimeout(
      () => {
        piFetch(`/api/admin/links?${p}`)
          .then((r) => r.json())
          .then(
            (d: {
              users?: UserRow[]
              total?: number
              counts?: Record<LinkStatus | 'all', number>
            }) => {
              if (stale) return
              setUsers(d.users ?? [])
              setTotal(d.total ?? 0)
              if (d.counts) setCounts(d.counts)
            },
          )
          .finally(() => {
            if (stale) return
            setSearching(false)
            setLoading(false)
          })
      },
      term.length >= 2 ? 300 : 0,
    )
    return () => {
      stale = true
      clearTimeout(h)
    }
  }, [page, limit, filter, search])

  const STATUS_LABEL: Record<LinkStatus, string> = {
    linked: t('status.linked'),
    pi_only: t('status.piOnly'),
    google_only: t('status.googleOnly'),
  }

  // 필터·검색·페이지는 서버 처리 — 받은 행이 곧 현재 페이지
  const totalPages = Math.ceil(total / limit)

  const STAT_CARDS = [
    {
      label: t('status.linked'),
      value: counts.linked,
      desc: t('desc.linked'),
      key: 'linked' as LinkStatus,
    },
    {
      label: t('status.piOnly'),
      value: counts.pi_only,
      desc: t('desc.piOnly'),
      key: 'pi_only' as LinkStatus,
    },
    {
      label: t('status.googleOnly'),
      value: counts.google_only,
      desc: t('desc.googleOnly'),
      key: 'google_only' as LinkStatus,
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('totalCount', { count: counts.all })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {STAT_CARDS.map(({ label, value, desc, key }) => (
          <button
            key={key}
            onClick={() => setFilter(filter === key ? 'all' : key)}
            className="text-left"
          >
            <Card
              className={`cursor-pointer transition-colors ${filter === key ? 'ring-primary ring-2' : 'hover:bg-muted/40'}`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  {label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{loading ? '…' : value}</p>
                <p className="text-muted-foreground mt-1 text-xs">{desc}</p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {/* Pi 사용자명 검색 (부분일치 — 서버 pg_trgm GIN) */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPiUsername')}
          className="border-input bg-background h-9 w-full max-w-xs rounded-md border px-3 text-sm"
        />
        {searching && (
          <span className="text-muted-foreground animate-pulse text-xs">
            {tc('fetching')}
          </span>
        )}
        {search.trim().length >= 2 && !searching && (
          <span className="text-muted-foreground text-xs">
            {t('searchResultCount', { count: total })}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'linked', 'pi_only', 'google_only'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === s
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {s === 'all'
              ? `${tc('all')} (${counts.all})`
              : `${STATUS_LABEL[s]} (${counts[s]})`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">{tc('loading')}</p>
      ) : users.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noUsers')}</p>
      ) : (
        <div className="overflow-hidden overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.user')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.piAccount')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.googleAccount')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.linkStatus')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.role')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.joinDate')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.status')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => {
                const status = getLinkStatus(u)
                const inactive = u.del_yn === 'Y'
                return (
                  <tr
                    key={u.id}
                    className={`hover:bg-muted/30 transition-colors ${inactive ? 'opacity-45' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium">{u.display_name}</td>
                    <td className="text-muted-foreground px-4 py-3">
                      {u.pi_username ? `@${u.pi_username}` : '—'}
                    </td>
                    <td className="text-muted-foreground px-4 py-3">
                      {u.google_email ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
                      >
                        {STATUS_LABEL[status]}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs">
                      {u.role}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs whitespace-nowrap">
                      {u.reg_dtm
                        ? new Date(u.reg_dtm).toLocaleString('ko-KR', {
                            timeZone: 'Asia/Seoul',
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false,
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            inactive
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          }`}
                        >
                          {inactive ? t('inactive') : t('active')}
                        </span>
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={toggling === u.id}
                          className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                            inactive
                              ? 'border-green-300 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/20'
                              : 'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20'
                          }`}
                        >
                          {toggling === u.id
                            ? '…'
                            : inactive
                              ? t('enable')
                              : t('disable')}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  )
}
