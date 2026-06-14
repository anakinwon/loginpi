'use client'

import { useEffect, useState } from 'react'
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
  }
  reason: string | null
  reg_dtm: string
}

export default function AdminEventExcludePage() {
  const [loading, setLoading] = useState(true)
  const [excluded, setExcluded] = useState<ExcludedUser[]>([])
  const [userId, setUserId] = useState('')
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchExcluded = async () => {
      try {
        const res = await piFetch('/api/admin/event/exclude')
        if (!res.ok) {
          setError('제외 대상자 목록 로드 실패')
          return
        }
        const data = await res.json()
        setExcluded(data.excluded ?? [])
      } catch (err) {
        console.error('Fetch error:', err)
        setError('네트워크 오류')
      } finally {
        setLoading(false)
      }
    }

    fetchExcluded()
  }, [])

  const handleAddExclude = async () => {
    if (!userId.trim()) {
      alert('사용자 ID를 입력하세요')
      return
    }

    setAdding(true)
    try {
      const res = await piFetch('/api/admin/event/exclude', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId.trim(),
          reason: reason.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || '제외 추가 실패')
        setAdding(false)
        return
      }

      const data = await res.json()
      setExcluded((prev) => [data.excluded, ...prev])
      setUserId('')
      setReason('')
    } catch (err) {
      console.error('Add error:', err)
      alert('오류 발생')
    } finally {
      setAdding(false)
    }
  }

  const handleRemoveExclude = async (userId: string) => {
    if (!window.confirm('이 사용자를 제외 목록에서 제거하시겠습니까?')) {
      return
    }

    setDeleting((prev) => ({ ...prev, [userId]: true }))
    try {
      const res = await piFetch(
        `/api/admin/event/exclude?user_id=${encodeURIComponent(userId)}`,
        { method: 'DELETE' },
      )

      if (!res.ok) {
        alert('제외 해제 실패')
        setDeleting((prev) => ({ ...prev, [userId]: false }))
        return
      }

      setExcluded((prev) => prev.filter((e) => e.user_id !== userId))
    } catch (err) {
      console.error('Delete error:', err)
      alert('오류 발생')
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
    return <div className="text-center py-10 text-red-600">{error}</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">🚫 이벤트 제외 대상자 관리</h1>
        <p className="text-muted-foreground mt-2">
          제외된 사용자는 이벤트 랭킹과 선물 대상에서 제외됩니다
        </p>
      </div>

      {/* 제외 추가 */}
      <div className="border rounded-lg p-6 bg-card space-y-4">
        <h2 className="text-lg font-semibold">제외 대상자 추가</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">사용자 ID</label>
            <Input
              placeholder="사용자의 UUID를 입력하세요"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              disabled={adding}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">사유 (선택)</label>
            <Input
              placeholder="제외 사유를 입력하세요"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={adding}
            />
          </div>
          <Button onClick={handleAddExclude} disabled={adding}>
            {adding ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                추가 중…
              </>
            ) : (
              '추가'
            )}
          </Button>
        </div>
      </div>

      {/* 제외 목록 */}
      <div>
        <h2 className="text-lg font-semibold mb-4">
          제외된 사용자 ({excluded.length}명)
        </h2>
        {excluded.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground border rounded-lg">
            제외된 사용자가 없습니다
          </div>
        ) : (
          <div className="space-y-2">
            {excluded.map((e) => (
              <div
                key={e.user_id}
                className="flex items-center justify-between p-4 border rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex-1">
                  <p className="font-medium">
                    {e.sys_user.nick_nm || e.sys_user.display_name || '(이름 없음)'}
                  </p>
                  <p className="text-xs font-mono text-muted-foreground">
                    {e.user_id}
                  </p>
                  {e.reason && (
                    <p className="text-sm text-muted-foreground mt-1">
                      사유: {e.reason}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(e.reg_dtm).toLocaleDateString('ko-KR')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
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
