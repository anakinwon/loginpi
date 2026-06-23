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

interface Completion {
  rank: number
  user_id: string
  pi_username: string | null
  nick_nm: string | null
  kakao_id: string | null
  last_complete_dtm: string
}

export default function AdminEventGiftsPage() {
  const [loading, setLoading] = useState(true)
  const [gifts, setGifts] = useState<GiftRecord[]>([])
  const [completions, setCompletions] = useState<Completion[]>([])
  const [updating, setUpdating] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [giftsRes, completionsRes] = await Promise.all([
          piFetch('/api/event/top-10-gifts'),
          piFetch('/api/admin/event/completions'),
        ])
        if (!giftsRes.ok || !completionsRes.ok) {
          setError('데이터 로드 실패')
          return
        }
        const giftsData = await giftsRes.json()
        const completionsData = await completionsRes.json()
        setGifts(giftsData.gifts ?? [])
        setCompletions(completionsData.completions ?? [])
      } catch (err) {
        console.error('Fetch error:', err)
        setError('네트워크 오류')
      } finally {
        setLoading(false)
      }
    }

    fetchAll()
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
    return <div className="py-10 text-center text-red-600">{error}</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">🎁 선착순 10명 선물 발송</h1>
        <p className="text-muted-foreground mt-2">
          미션 10/10 완료자 중 선착순 10명에게 카카오 선물을 발송합니다
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
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
              <tr key={g.user_id} className="hover:bg-muted/50 border-b">
                <td className="p-3 font-semibold">#{g.rank}</td>
                <td className="p-3">{g.nick_nm ?? '(이름 없음)'}</td>
                <td className="p-3 font-mono text-xs">
                  {g.kakao_id ?? '미입력'}
                </td>
                <td className="p-3">{g.gift_nm}</td>
                <td className="p-3 text-center">
                  <span
                    className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${
                      g.sent_yn === 'Y'
                        ? 'bg-green-200 text-green-900 dark:bg-green-700 dark:text-green-100'
                        : 'bg-yellow-200 text-yellow-900 dark:bg-yellow-700 dark:text-yellow-100'
                    }`}
                  >
                    {g.sent_yn === 'Y' ? '발송됨' : '미발송'}
                  </span>
                </td>
                <td className="text-muted-foreground p-3 text-center text-xs">
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
        <div className="text-muted-foreground py-10 text-center">
          아직 미션 10/10을 완료한 사용자가 없습니다
        </div>
      )}

      {/* 전체 미션 완료자 목록 */}
      <div>
        <div className="mb-3">
          <h2 className="text-xl font-bold">
            🏅 미션 10/10 전체 완료자{' '}
            <span className="text-muted-foreground text-base font-normal">
              ({completions.length}명)
            </span>
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            선착순 정렬 · 제외 대상자 제외 · Pi 계정명 / 최종성공일시 / 카카오톡
            ID
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted border-b">
              <tr>
                <th className="w-12 p-3 text-left font-semibold">순위</th>
                <th className="p-3 text-left font-semibold">Pi 계정명</th>
                <th className="p-3 text-left font-semibold">닉네임</th>
                <th className="p-3 text-left font-semibold">카카오톡 ID</th>
                <th className="p-3 text-left font-semibold whitespace-nowrap">
                  최종 성공 일시
                </th>
              </tr>
            </thead>
            <tbody>
              {completions.map((c) => (
                <tr
                  key={c.user_id}
                  className={`hover:bg-muted/50 border-b ${c.rank <= 10 ? 'bg-amber-50 dark:bg-amber-950/30' : ''}`}
                >
                  <td className="p-3 font-semibold">
                    {c.rank <= 10 ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        #{c.rank}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">#{c.rank}</span>
                    )}
                  </td>
                  <td className="p-3 font-mono text-xs">
                    {c.pi_username ?? '-'}
                  </td>
                  <td className="p-3">{c.nick_nm ?? '-'}</td>
                  <td className="p-3 font-mono text-xs">
                    {c.kakao_id ? (
                      <span className="text-green-700 dark:text-green-400">
                        {c.kakao_id}
                      </span>
                    ) : (
                      <span className="text-red-500">미입력</span>
                    )}
                  </td>
                  <td className="text-muted-foreground p-3 text-xs whitespace-nowrap">
                    {new Date(c.last_complete_dtm).toLocaleString('ko-KR', {
                      timeZone: 'Asia/Seoul',
                      year: '2-digit',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {completions.length === 0 && (
          <div className="text-muted-foreground py-10 text-center">
            아직 미션 10/10을 완료한 사용자가 없습니다
          </div>
        )}
      </div>
    </div>
  )
}
