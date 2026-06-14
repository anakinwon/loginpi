'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { piFetch } from '@/lib/pi-fetch'

interface EventProgress {
  user_id: string
  mission_count: number
  grade: 'Recruit' | 'Trainee' | 'Agent' | 'Veteran' | 'Master'
  missions: Array<{
    mission_cd: string
    mission_nm: string
    is_completed: boolean
    completed_at: string | null
  }>
}

interface Ranking {
  rank: number
  user_id: string
  nick_nm: string | null
  mission_count: number
  first_complete_dtm: string
}

export function ClientEventGate() {
  const t = useTranslations('event')
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState<EventProgress | null>(null)
  const [ranking, setRanking] = useState<Ranking[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [progressRes, rankingRes] = await Promise.all([
          piFetch('/api/event/my-progress'),
          piFetch('/api/event/ranking?limit=100'),
        ])

        if (!progressRes.ok || !rankingRes.ok) {
          setError('데이터 로드 실패')
          return
        }

        const progressData = await progressRes.json()
        const rankingData = await rankingRes.json()

        setProgress(progressData.progress)
        setRanking(rankingData.ranking)
      } catch (err) {
        console.error('[event-gate] fetch error:', err)
        setError('네트워크 오류')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  // 미션 진행도 UI
  const missionGrid =
    progress?.missions.map((m) => (
      <div
        key={m.mission_cd}
        className="rounded-lg border p-4 bg-card text-center"
      >
        <div className="text-sm font-medium text-muted-foreground mb-2">
          {m.mission_cd}
        </div>
        <div className="font-semibold mb-3">{m.mission_nm}</div>
        <div
          className={`text-lg font-bold ${m.is_completed ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}
        >
          {m.is_completed ? '✓ 완료' : '미완료'}
        </div>
      </div>
    )) ?? []

  // 요원 등급 배지
  const gradeStyles = {
    Recruit: 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100',
    Trainee: 'bg-blue-200 dark:bg-blue-700 text-blue-900 dark:text-blue-100',
    Agent: 'bg-purple-200 dark:bg-purple-700 text-purple-900 dark:text-purple-100',
    Veteran: 'bg-orange-200 dark:bg-orange-700 text-orange-900 dark:text-orange-100',
    Master: 'bg-red-200 dark:bg-red-700 text-red-900 dark:text-red-100',
  }

  const gradeKo = {
    Recruit: '요원',
    Trainee: '수습요원',
    Agent: '정요원',
    Veteran: '선임요원',
    Master: '마스터',
  }

  return (
    <div className="space-y-8 pb-24">
      {/* 헤더: 요원 등급 + 미션 카운트 */}
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold">🎖️ 미션 이벤트</h1>
        {progress && (
          <>
            <div
              className={`inline-block px-4 py-2 rounded-full font-semibold ${gradeStyles[progress.grade]}`}
            >
              {gradeKo[progress.grade]}
            </div>
            <p className="text-lg font-semibold">
              미션 {progress.mission_count}/10 완료
            </p>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${(progress.mission_count / 10) * 100}%`,
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* 미션 목록 */}
      <div>
        <h2 className="text-xl font-bold mb-4">📋 미션 목록</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{missionGrid}</div>
      </div>

      {/* 랭킹 보드 */}
      <div>
        <h2 className="text-xl font-bold mb-4">🏆 미션 랭킹 (상위 50명)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted">
                <th className="p-2 text-left font-semibold">순위</th>
                <th className="p-2 text-left font-semibold">요원명</th>
                <th className="p-2 text-center font-semibold">미션 완료</th>
              </tr>
            </thead>
            <tbody>
              {ranking.slice(0, 50).map((r) => (
                <tr
                  key={r.user_id}
                  className="border-b hover:bg-muted/50 transition-colors"
                >
                  <td className="p-2 font-semibold">#{r.rank}</td>
                  <td className="p-2">{r.nick_nm ?? '(이름 없음)'}</td>
                  <td className="p-2 text-center font-bold">{r.mission_count}/10</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
