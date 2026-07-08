'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, X } from 'lucide-react'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ExcludedUser {
  exclude_id: string
  user_id: string
  sys_user: {
    id: string
    nick_nm: string | null
    display_name: string | null
    pi_username: string | null
  }
  reason: string | null
  reg_dtm: string
}

// 요원명 표시 — pi_username 우선(@표기), 없으면 별명/이름 폴백
function agentLabel(u: ExcludedUser['sys_user'], noName: string): string {
  if (u.pi_username) return `@${u.pi_username}`
  return u.nick_nm || u.display_name || noName
}

export default function AdminEventExcludePage() {
  const t = useTranslations('adminMgmt.eventExclude')
  const tc = useTranslations('common')
  const [loading, setLoading] = useState(true)
  const [excluded, setExcluded] = useState<ExcludedUser[]>([])
  const [piUsername, setPiUsername] = useState('')
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const fetchExcluded = async () => {
    try {
      const res = await piFetch('/api/admin/event/exclude')
      if (!res.ok) {
        setError(t('loadFail'))
        return
      }
      const data = await res.json()
      setExcluded(data.excluded ?? [])
    } catch (err) {
      console.error('Fetch error:', err)
      setError(t('networkError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchExcluded()
  }, [])

  const handleAddExclude = async () => {
    if (!piUsername.trim()) {
      alert(t('enterPiUsername'))
      return
    }

    setAdding(true)
    try {
      const res = await piFetch('/api/admin/event/exclude', {
        method: 'POST',
        body: JSON.stringify({
          pi_username: piUsername.trim(),
          reason: reason.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        alert(data.error || t('addFail'))
        setAdding(false)
        return
      }

      // 새 응답 형식: { added, already, notFound } (콤마 다중 입력 지원)
      const msgs: string[] = []
      if (data.added?.length)
        msgs.push(t('addedCount', { count: data.added.length }))
      if (data.already?.length)
        msgs.push(t('alreadyExcluded', { list: data.already.join(', ') }))
      if (data.notFound?.length)
        msgs.push(t('notFound', { list: data.notFound.join(', ') }))
      if (msgs.length) alert(msgs.join('\n'))

      await fetchExcluded()
      setPiUsername('')
      setReason('')
    } catch (err) {
      console.error('Add error:', err)
      alert(tc('error'))
    } finally {
      setAdding(false)
    }
  }

  // 제외 해제(다시 포함) — 논리삭제 해제
  const handleRemoveExclude = async (userId: string) => {
    if (!window.confirm(t('removeConfirm'))) {
      return
    }

    setDeleting((prev) => ({ ...prev, [userId]: true }))
    try {
      const res = await piFetch(
        `/api/admin/event/exclude?user_id=${encodeURIComponent(userId)}`,
        { method: 'DELETE' },
      )

      if (!res.ok) {
        alert(t('removeFail'))
        setDeleting((prev) => ({ ...prev, [userId]: false }))
        return
      }

      setExcluded((prev) => prev.filter((e) => e.user_id !== userId))
    } catch (err) {
      console.error('Delete error:', err)
      alert(tc('error'))
    } finally {
      setDeleting((prev) => ({ ...prev, [userId]: false }))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  if (error) {
    return <div className="py-10 text-center text-red-600">{error}</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-2">{t('subtitle')}</p>
      </div>

      {/* 제외 추가 (Pi 사용자명 입력) */}
      <div className="bg-card space-y-4 rounded-lg border p-6">
        <h2 className="text-lg font-semibold">{t('addSectionTitle')}</h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">
              {t('piUsernameLabel')}
            </label>
            <Input
              placeholder={t('piUsernamePlaceholder')}
              value={piUsername}
              onChange={(e) => setPiUsername(e.target.value)}
              disabled={adding}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddExclude()
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              {t('reasonLabel')}
            </label>
            <Input
              placeholder={t('reasonPlaceholder')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={adding}
            />
          </div>
          <Button onClick={handleAddExclude} disabled={adding}>
            {adding ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t('adding')}
              </>
            ) : (
              t('addBtn')
            )}
          </Button>
        </div>
      </div>

      {/* 제외 목록 */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">
          {t('excludedTitle', { count: excluded.length })}
        </h2>
        {excluded.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border py-10 text-center">
            {t('empty')}
          </div>
        ) : (
          <div className="space-y-2">
            {excluded.map((e) => (
              <div
                key={e.user_id}
                className="bg-muted/50 hover:bg-muted flex items-center justify-between rounded-lg border p-4 transition-colors"
              >
                <div className="flex-1">
                  <p className="font-medium">
                    {agentLabel(e.sys_user, t('noName'))}
                  </p>
                  {(e.sys_user.nick_nm || e.sys_user.display_name) && (
                    <p className="text-muted-foreground text-xs">
                      {e.sys_user.nick_nm || e.sys_user.display_name}
                    </p>
                  )}
                  {e.reason && (
                    <p className="text-muted-foreground mt-1 text-sm">
                      {t('reasonPrefix', { reason: e.reason })}
                    </p>
                  )}
                  <p className="text-muted-foreground mt-1 text-xs">
                    {new Date(e.reg_dtm).toLocaleDateString('ko-KR')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  title={t('removeTitle')}
                  onClick={() => handleRemoveExclude(e.user_id)}
                  disabled={deleting[e.user_id] ?? false}
                >
                  {deleting[e.user_id] ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <X className="size-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
