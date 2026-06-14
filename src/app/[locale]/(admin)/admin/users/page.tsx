'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useDynamicLimit } from '@/hooks/use-dynamic-limit'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { AdminDashboardStats } from '@/components/admin/admin-dashboard-stats'

// p-6(48) + 제목+설명(56) + gap(16) + 통계카드(110) + gap(16) + 테이블헤더(33)
// + gap(16) + 페이지네이션(36)
const CHROME_PX = 331

const ROLES = ['ADMIN', 'MASTER', 'MANAGER', 'USER'] as const
type Role = (typeof ROLES)[number]

interface UserRow {
  id: string
  pi_uid: string | null
  pi_username: string | null
  google_email: string | null
  google_name: string | null
  display_name: string
  role: Role
  reg_dtm: string
  last_login_dtm: string | null
}

const ROLE_COLOR: Record<Role, string> = {
  ADMIN: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  MASTER:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  MANAGER: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  USER: 'bg-muted text-muted-foreground',
}

export default function UsersPage() {
  const t = useTranslations('admin.users')
  const tc = useTranslations('common')
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [changing, setChanging] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const limit = useDynamicLimit(CHROME_PX)

  // limit 변경 시 첫 페이지로 리셋
  useEffect(() => {
    setPage(1)
  }, [limit])

  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((d: { users: UserRow[] }) => setUsers(d.users ?? []))
      .finally(() => setLoading(false))
  }, [])

  async function changeRole(id: string, role: Role) {
    setChanging(id)
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? t('changeFail'))
      }
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)))
      toast.success(t('roleChanged'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tc('error'))
    } finally {
      setChanging(null)
    }
  }

  const totalPages = Math.ceil(users.length / limit)
  const displayedUsers = users.slice((page - 1) * limit, page * limit)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('totalCount', { count: users.length })}
        </p>
      </div>

      {/* 사용자 연동 통계 (전체·Pi전용·Google전용·계정연동) — 구 대시보드에서 이동 */}
      <AdminDashboardStats />

      {loading ? (
        <p className="text-muted-foreground text-sm">{tc('loading')}</p>
      ) : users.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noUsers')}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
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
                  {t('col.role')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.joinDate')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.lastLogin')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.changeRole')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayedUsers.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">{user.display_name}</td>
                  <td className="text-muted-foreground px-4 py-3">
                    {user.pi_username ? `@${user.pi_username}` : '—'}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {user.google_email ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLOR[user.role]}`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-xs">
                    {new Date(user.reg_dtm).toLocaleString('ko-KR', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-xs">
                    {user.last_login_dtm
                      ? new Date(user.last_login_dtm).toLocaleString('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {ROLES.filter((r) => r !== user.role).map((r) => (
                        <Button
                          key={r}
                          variant="outline"
                          size="sm"
                          disabled={changing === user.id}
                          onClick={() => changeRole(user.id, r)}
                          className="h-6 px-2 text-xs"
                        >
                          {r}
                        </Button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  )
}
