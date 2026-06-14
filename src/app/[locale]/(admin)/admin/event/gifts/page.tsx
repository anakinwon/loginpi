'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'

interface GiftRecord {
  rank: number
  user_id: string
  nick_nm: string | null
  kakao_id: string | null
  sent_yn: string
  sent_dtm: string | null
  gift_nm: string
}

export default function AdminEventGiftsPage() {
  const [loading, setLoading] = useState(true)
  const [gifts, setGifts] = useState<GiftRecord[]>([])
  const [updating, setUpdating] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchGifts = async () => {
      try {
        const res = await piFetch('/api/event/top-10-gifts')
        if (!res.ok) {
          setError('선물 목록 로드 실패')
          return
        }
        const data = await res.json()
        setGifts(data.gifts ?? [])
      } catch (err) {
        console.error('Gift fetch error:', err)
        setError('네트워크 오류')
      } finally {
        setLoading(false)
      }
    }

    fetchGifts()
  }, [])

  const handleToggleSent = async (userId: string, currentSent: string) => {
    const newSent = currentSent === 'Y' ? 'N' : 'Y'
    setUpdating((prev) => ({ ...prev, [userId]: true }))

    try {
      const res = await piFetch('/api/event/gifts', {
        method: 'PATCH',
        body: JSON.stringify({
          user_id: userId,
          sent_yn: newSent,
        }),
      })

      if (!res.ok) {
        alert('업데이트 실패')
        setUpdating((prev) => ({ ...prev, [userId]: false }))
        return
      }

      // UI 업데이트
      setGifts((prev) =>
        prev.map((g) =>
          g.user_id === userId
            ? { ...g, sent_yn: newSent, sent_dtm: new Date().toISOString() }
            : g,
        ),
      )
    } catch (err) {
      console.error('Update error:', err)
      alert('오류 발생')
    } finally {
      setUpdating((prev) => ({ ...prev, [userId]: false }))
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
        <h1 className="text-3xl font-bold">🎁 선착순 10명 선물 발송</h1>
        <p className="text-muted-foreground mt-2">
          미션 10/10 완료자 중 선착순 10명에게 카카오 선물을 발송합니다
        </p>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b">
            <tr>
              <th className="p-3 text-left font-semibold">순위</th>
              <th className="p-3 text-left font-semibold">요원명</th>
              <th className="p-3 text-left font-semibold">카카오톡 ID</th>
              <th className="p-3 text-left font-semibold">선물</th>
              <th className="p-3 text-center font-semibold">발송 상태</th>
              <th className="p-3 text-center font-semibold">발송 시간</th>
              <th className="p-3 text-center font-semibold">작업</th>
            </tr>
          </thead>
          <tbody>
            {gifts.map((g) => (
              <tr key={g.user_id} className="border-b hover:bg-muted/50">
                <td className="p-3 font-semibold">#{g.rank}</td>
                <td className="p-3">{g.nick_nm ?? '(이름 없음)'}</td>
                <td className="p-3 font-mono text-xs">
                  {g.kakao_id ?? '미입력'}
                </td>
                <td className="p-3">{g.gift_nm}</td>
                <td className="p-3 text-center">
                  <span
                    className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                      g.sent_yn === 'Y'
                        ? 'bg-green-200 dark:bg-green-700 text-green-900 dark:text-green-100'
                        : 'bg-yellow-200 dark:bg-yellow-700 text-yellow-900 dark:text-yellow-100'
                    }`}
                  >
                    {g.sent_yn === 'Y' ? '발송됨' : '미발송'}
                  </span>
                </td>
                <td className="p-3 text-center text-xs text-muted-foreground">
                  {g.sent_dtm
                    ? new Date(g.sent_dtm).toLocaleDateString('ko-KR')
                    : '-'}
                </td>
                <td className="p-3 text-center">
                  <Button
                    size="sm"
                    variant={g.sent_yn === 'Y' ? 'destructive' : 'default'}
                    onClick={() => handleToggleSent(g.user_id, g.sent_yn)}
                    disabled={updating[g.user_id] ?? false}
                    className="text-xs"
                  >
                    {updating[g.user_id] ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : g.sent_yn === 'Y' ? (
                      '미발송으로 변경'
                    ) : (
                      '발송 완료'
                    )}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {gifts.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          아직 미션 10/10을 완료한 사용자가 없습니다
        </div>
      )}
    </div>
  )
}
