'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { piFetch } from '@/lib/pi-fetch'

interface Mission {
  mission_cd: string
  mission_nm: string
  mission_guide_desc?: string
  complete_type_cd: string
  mission_ord?: number
}

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
  missions: Record<string, boolean>
}

export function ClientEventGate() {
  const t = useTranslations('event')
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState<EventProgress | null>(null)
  const [missions, setMissions] = useState<Mission[]>([])
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
        setMissions(progressData.missions ?? [])
        setRanking(rankingData.ranking ?? [])
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

  // 요원 등급 스타일
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

      {/* 미션 목록 (안내문 포함) */}
      <div>
        <h2 className="text-xl font-bold mb-4">📋 미션 목록</h2>
        <div className="space-y-3">
          {missions.map((m) => {
            const completed = progress?.missions.find(
              (pm) => pm.mission_cd === m.mission_cd
            )?.is_completed
            return (
              <div
                key={m.mission_cd}
                className={`rounded-lg border p-4 ${completed ? 'bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-700' : 'bg-card'}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-bold text-lg">{m.mission_cd}</span>
                      <span className="font-semibold">{m.mission_nm}</span>
                      {completed && (
                        <span className="text-green-600 dark:text-green-400 font-bold">
                          ✓
                        </span>
                      )}
                    </div>
                    {m.mission_guide_desc && (
                      <p className="text-sm text-muted-foreground">
                        {m.mission_guide_desc}
                      </p>
                    )}
                    {m.complete_type_cd === 'MULTI_OR' && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        💡 힌트: 여러 방법 중 1가지만 완료하면 됩니다
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 랭킹 보드 (체크리스트 매트릭스) */}
      <div>
        <h2 className="text-xl font-bold mb-4">🏆 미션 랭킹 (상위 50명)</h2>
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted">
                <th className="p-2 text-left font-semibold sticky left-0 bg-muted z-10">
                  순위
                </th>
                <th className="p-2 text-left font-semibold sticky left-12 bg-muted z-10">
                  요원명
                </th>
                <th className="p-2 text-center font-semibold">합계</th>
                <th className="p-2 text-center font-semibold">M1</th>
                <th className="p-2 text-center font-semibold">M2</th>
                <th className="p-2 text-center font-semibold">M3</th>
                <th className="p-2 text-center font-semibold">M4</th>
                <th className="p-2 text-center font-semibold">M5</th>
                <th className="p-2 text-center font-semibold">M6</th>
                <th className="p-2 text-center font-semibold">M7</th>
                <th className="p-2 text-center font-semibold">M8</th>
                <th className="p-2 text-center font-semibold">M9</th>
                <th className="p-2 text-center font-semibold">M10</th>
              </tr>
            </thead>
            <tbody>
              {ranking.slice(0, 50).map((r) => (
                <tr
                  key={r.user_id}
                  className="border-b hover:bg-muted/50 transition-colors"
                >
                  <td className="p-2 font-semibold sticky left-0 bg-white dark:bg-slate-950 z-10">
                    #{r.rank}
                  </td>
                  <td className="p-2 sticky left-12 bg-white dark:bg-slate-950 z-10">
                    {r.nick_nm ?? '(이름 없음)'}
                  </td>
                  <td className="p-2 text-center font-bold">{r.mission_count}/10</td>
                  {['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'].map(
                    (m) => (
                      <td key={m} className="p-2 text-center">
                        {r.missions[m] ? (
                          <span className="text-green-600 dark:text-green-400 font-bold">
                            ✓
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
