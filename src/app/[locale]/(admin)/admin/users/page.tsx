'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

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
  created_at: string
}

const ROLE_COLOR: Record<Role, string> = {
  ADMIN: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  MASTER: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  MANAGER: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  USER: 'bg-muted text-muted-foreground',
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [changing, setChanging] = useState<string | null>(null)

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
        throw new Error(d.error ?? '변경 실패')
      }
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)))
      toast.success('역할이 변경됐습니다')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '오류 발생')
    } finally {
      setChanging(null)
    }
  }

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-2xl font-bold'>사용자 관리</h1>
        <p className='text-muted-foreground text-sm mt-1'>
          전체 {users.length}명
        </p>
      </div>

      {loading ? (
        <p className='text-muted-foreground text-sm'>로딩 중…</p>
      ) : users.length === 0 ? (
        <p className='text-muted-foreground text-sm'>사용자가 없습니다.</p>
      ) : (
        <div className='rounded-lg border overflow-hidden'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 border-b'>
              <tr>
                <th className='text-left px-4 py-2 font-medium'>사용자</th>
                <th className='text-left px-4 py-2 font-medium'>Pi 계정</th>
                <th className='text-left px-4 py-2 font-medium'>Google 계정</th>
                <th className='text-left px-4 py-2 font-medium'>역할</th>
                <th className='text-left px-4 py-2 font-medium'>가입일</th>
                <th className='text-left px-4 py-2 font-medium'>역할 변경</th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {users.map((user) => (
                <tr key={user.id} className='hover:bg-muted/30 transition-colors'>
                  <td className='px-4 py-3 font-medium'>{user.display_name}</td>
                  <td className='px-4 py-3 text-muted-foreground'>
                    {user.pi_username ? `@${user.pi_username}` : '—'}
                  </td>
                  <td className='px-4 py-3 text-muted-foreground'>
                    {user.google_email ?? '—'}
                  </td>
                  <td className='px-4 py-3'>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLOR[user.role]}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className='px-4 py-3 text-muted-foreground text-xs'>
                    {new Date(user.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className='px-4 py-3'>
                    <div className='flex gap-1 flex-wrap'>
                      {ROLES.filter((r) => r !== user.role).map((r) => (
                        <Button
                          key={r}
                          variant='outline'
                          size='sm'
                          disabled={changing === user.id}
                          onClick={() => changeRole(user.id, r)}
                          className='h-6 px-2 text-xs'
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
    </div>
  )
}
