'use client'

import { useEffect, useState } from 'react'
import { Loader2, ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
  rank: number | null // 미션 0개는 null (순위 미부여)
  user_id: string
  nick_nm: string | null
  pi_username: string | null
  mission_count: number | null // 미션 0개는 null (합계 미표시)
  first_complete_dtm: string | null
  last_complete_dtm: string | null
  missions: Record<string, boolean>
}

interface ExcludedAgent {
  exclude_id: string
  user_id: string
  sys_user: {
    id: string
    nick_nm: string | null
    display_name: string | null
    pi_username: string | null
  } | null
  reason: string | null
  reg_dtm: string
}

// 요원명 표시: 관리자는 실명 그대로, 일반 회원은 앞 4글자만 노출하고 나머지 *** 처리
// (예: 일반 회원 → anak***, 관리자 → anakin2)
function maskAgentName(r: Ranking, isAdmin: boolean, noName: string): string {
  const name = r.pi_username ?? r.nick_nm
  if (!name) return noName
  return isAdmin ? name : name.slice(0, 4) + '***'
}

type MissionTranslation = { name?: string; desc?: string }

export function ClientEventGate() {
  const t = useTranslations('event')
  const missionsT = t.raw('missions') as Record<
    string,
    MissionTranslation | undefined
  >
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState<EventProgress | null>(null)
  const [missions, setMissions] = useState<Mission[]>([])
  const [ranking, setRanking] = useState<Ranking[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expandedMissions, setExpandedMissions] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [excludeInput, setExcludeInput] = useState('')
  const [excluding, setExcluding] = useState(false)
  const [excludeMsg, setExcludeMsg] = useState<string | null>(null)
  const [excludedList, setExcludedList] = useState<ExcludedAgent[]>([])
  const [reevaluating, setReevaluating] = useState(false)
  const [granting, setGranting] = useState(false)

  // 제외 목록 조회 (관리자 전용 API — 비관리자는 403이라 무시됨)
  const fetchExcluded = async () => {
    const res = await piFetch('/api/admin/event/exclude')
    if (!res.ok) return
    const data = await res.json()
    setExcludedList(data.excluded ?? [])
  }

  // 랭킹 재조회 (제외 처리 후 갱신용) — is_admin 플래그 + 제외 목록도 함께 반영
  const refetchRanking = async () => {
    const res = await piFetch('/api/event/ranking?limit=100')
    if (!res.ok) return
    const data = await res.json()
    setRanking(data.ranking ?? [])
    setIsAdmin(!!data.is_admin)
    if (data.is_admin) await fetchExcluded()
  }

  // 관리자 전용: 온디맨드 미션 재평가 → 완료 후 랭킹 재조회
  // cron(자정 1회) 사이 실시간 평가가 누락된 미션을 즉시 일괄 재평가한다.
  const handleReeval = async () => {
    if (reevaluating) return // 중복 클릭 → 중복 재평가 가드 (미션 평가는 신뢰 직결, 멱등 보장)
    setReevaluating(true)
    try {
      const res = await piFetch('/api/admin/event/reeval', { method: 'POST' })
      if (!res.ok) {
        // 조용한 실패 금지 — 관리자가 재평가 미반영 원인을 알 수 있게 피드백
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? '미션 재평가에 실패했습니다')
        return
      }
      await refetchRanking()
    } catch (err) {
      console.error('[reeval] 재평가 실패:', err)
      alert('네트워크 오류가 발생했습니다')
    } finally {
      setReevaluating(false)
    }
  }

  // 관리자 전용: 10개 미션 완료 미지급자에게 판매보증금 1π 지급
  // 중복 지급은 서버 RPC(fn_evt_grant_bond_reward)가 원자적으로 차단 — 이미 받은 사람은 건너뜀
  const handleBondReward = async () => {
    if (granting) return
    if (
      !window.confirm(
        '10개 미션을 완료한 미지급자에게 판매보증금 1π를 지급합니다.\n이미 지급된 사용자는 자동으로 제외됩니다. 진행할까요?',
      )
    )
      return
    setGranting(true)
    try {
      const res = await piFetch('/api/admin/event/bond-reward', {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? '보상 지급에 실패했습니다')
        return
      }
      alert(
        `보상 지급 완료\n` +
          `· 자격자: ${data.eligible}명\n` +
          `· 신규 지급: ${data.granted}명\n` +
          `· 이미 지급(건너뜀): ${data.already}명` +
          (data.failed ? `\n· 실패: ${data.failed}명` : ''),
      )
      await refetchRanking()
    } catch (err) {
      console.error('[bond-reward] 지급 실패:', err)
      alert('네트워크 오류가 발생했습니다')
    } finally {
      setGranting(false)
    }
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [progressRes, rankingRes] = await Promise.all([
          piFetch('/api/event/my-progress'),
          piFetch('/api/event/ranking?limit=100'),
        ])

        if (!progressRes.ok || !rankingRes.ok) {
          setError(t('loadError'))
          return
        }

        const progressData = await progressRes.json()
        const rankingData = await rankingRes.json()

        setProgress(progressData.progress)
        setMissions(progressData.missions ?? [])
        setRanking(rankingData.ranking ?? [])
        setIsAdmin(!!rankingData.is_admin)
        if (rankingData.is_admin) await fetchExcluded()
      } catch (err) {
        console.error('[event-gate] fetch error:', err)
        setError(t('networkError'))
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // 관리자 전용: 콤마로 구분된 요원명을 랭킹에서 제외
  const handleExclude = async () => {
    const raw = excludeInput.trim()
    if (!raw || excluding) return
    setExcluding(true)
    setExcludeMsg(null)
    try {
      const res = await piFetch('/api/admin/event/exclude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pi_username: raw }),
      })
      const data = await res.json()
      if (!res.ok) {
        setExcludeMsg(data.error ?? t('excludeFailed'))
        return
      }
      const parts: string[] = []
      if (data.added?.length)
        parts.push(t('excludedN', { count: data.added.length }))
      if (data.already?.length)
        parts.push(t('alreadyExcluded', { names: data.already.join(', ') }))
      if (data.notFound?.length)
        parts.push(t('notFoundAgents', { names: data.notFound.join(', ') }))
      setExcludeMsg(parts.join(' · ') || t('noChange'))
      setExcludeInput('')
      await refetchRanking()
    } catch (err) {
      console.error('[event-gate] exclude error:', err)
      setExcludeMsg('네트워크 오류')
    } finally {
      setExcluding(false)
    }
  }

  // 관리자 전용: 제외 해제 → 다시 랭킹에 포함
  const handleInclude = async (userId: string) => {
    try {
      const res = await piFetch(
        `/api/admin/event/exclude?user_id=${encodeURIComponent(userId)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setExcludeMsg(data.error ?? t('includeFailed'))
        return
      }
      setExcludeMsg(null)
      await refetchRanking()
    } catch (err) {
      console.error('[event-gate] include error:', err)
      setExcludeMsg(t('networkError'))
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
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
    Agent:
      'bg-purple-200 dark:bg-purple-700 text-purple-900 dark:text-purple-100',
    Veteran:
      'bg-orange-200 dark:bg-orange-700 text-orange-900 dark:text-orange-100',
    Master: 'bg-red-200 dark:bg-red-700 text-red-900 dark:text-red-100',
  }

  const gradeKo = {
    Recruit: t('gradeRecruit'),
    Trainee: t('gradeTrainee'),
    Agent: t('gradeAgent'),
    Veteran: t('gradeVeteran'),
    Master: t('gradeMaster'),
  }

  return (
    <div className="space-y-8 pb-24">
      {/* 헤더: 요원 등급 + 미션 카운트 */}
      <div className="space-y-3 text-center">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-lg font-semibold">{t('subtitle')}</p>
        {progress ? (
          <>
            <div
              className={`inline-block rounded-full px-4 py-2 font-semibold ${gradeStyles[progress.grade]}`}
            >
              {gradeKo[progress.grade]}
            </div>
            <div className="bg-muted h-2 w-full rounded-full">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${(progress.mission_count / 10) * 100}%`,
                }}
              />
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">{t('loginHint')}</p>
        )}
      </div>

      {/* 미션 목록 (섹션 전체 아코디언) */}
      <div>
        <button
          onClick={() => setExpandedMissions(!expandedMissions)}
          className="hover:bg-muted/50 flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-colors"
        >
          <h2 className="text-xl font-bold">{t('missionListTitle')}</h2>
          <ChevronDown
            className={`size-5 flex-shrink-0 transition-transform ${expandedMissions ? 'rotate-180' : ''}`}
          />
        </button>

        {expandedMissions && (
          <div className="mt-3 space-y-2">
            {missions.map((m) => {
              const cd = m.mission_cd.trim()
              const mT = missionsT[cd]
              const displayName = mT?.name ?? m.mission_nm
              const displayDesc = mT?.desc ?? m.mission_guide_desc
              const completed = progress?.missions.find(
                (pm) => pm.mission_cd === m.mission_cd,
              )?.is_completed
              return (
                <div
                  key={cd}
                  className={`rounded-lg border p-3 transition-colors ${completed ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950' : 'bg-card'}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-sm font-bold">{cd}</span>
                        <span className="text-sm font-medium">
                          {displayName}
                        </span>
                        {completed && (
                          <span className="ml-auto text-sm font-bold text-green-600 dark:text-green-400">
                            ✓
                          </span>
                        )}
                      </div>
                      {displayDesc && (
                        <p className="text-muted-foreground text-xs">
                          {displayDesc}
                        </p>
                      )}
                      {m.complete_type_cd === 'MULTI_OR' && (
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                          {t('multiOrHint')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 랭킹 보드 (체크리스트 매트릭스) */}
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">{t('rankingTitle')}</h2>
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={handleReeval}
                  disabled={reevaluating}
                  title="미션 재평가 후 랭킹 재조회 (관리자 전용)"
                  className="border-input bg-background hover:bg-muted rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {reevaluating ? t('processing') : '🔄 미션 재평가'}
                </button>
                <button
                  type="button"
                  onClick={handleBondReward}
                  disabled={granting}
                  title="10개 미션 완료 미지급자에게 판매보증금 1π 지급 (관리자 전용)"
                  className="rounded-md border border-amber-500 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
                >
                  {granting ? t('processing') : '💰 1Pi 판매보증금 지급'}
                </button>
              </>
            )}
          </div>
          {isAdmin && (
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={excludeInput}
                  onChange={(e) => setExcludeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleExclude()
                  }}
                  placeholder={t('excludePlaceholder')}
                  className="border-input bg-background w-56 rounded-md border px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  onClick={handleExclude}
                  disabled={excluding || !excludeInput.trim()}
                  className="rounded-md bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {excluding ? t('processing') : t('removeRank')}
                </button>
              </div>
              {excludeMsg && (
                <p className="text-muted-foreground text-xs">{excludeMsg}</p>
              )}
              {excludedList.length > 0 && (
                <div className="flex flex-wrap items-center justify-end gap-1">
                  <span className="text-muted-foreground text-xs">
                    {t('excludedAgents')}
                  </span>
                  {excludedList.map((e) => (
                    <span
                      key={e.user_id}
                      className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-900/40 dark:text-red-200"
                    >
                      {e.sys_user?.pi_username ??
                        e.sys_user?.nick_nm ??
                        t('noName')}
                      <button
                        type="button"
                        onClick={() => handleInclude(e.user_id)}
                        title={t('includeTitle')}
                        className="font-bold hover:text-red-600"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted border-b">
                <th className="bg-muted sticky left-0 z-10 w-9 py-2 pr-0 pl-2 text-left font-semibold">
                  {t('rankCol')}
                </th>
                <th className="bg-muted sticky left-9 z-10 py-2 pr-2 pl-1 text-left font-semibold">
                  {t('agentCol')}
                </th>
                <th className="p-2 text-center font-semibold">
                  {t('totalCol')}
                </th>
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
                <th className="p-2 text-center font-semibold whitespace-nowrap">
                  {t('lastPerformedCol')}
                </th>
                <th className="p-2 text-center font-semibold">
                  {t('rewardCol')}
                </th>
              </tr>
            </thead>
            <tbody>
              {ranking.slice(0, 50).map((r) => (
                <tr
                  key={r.user_id}
                  className="hover:bg-muted/50 h-12 border-b transition-colors"
                >
                  <td className="sticky left-0 z-10 w-9 bg-white pr-0 pl-2 font-semibold dark:bg-slate-950">
                    {r.rank ?? '-'}
                  </td>
                  <td className="sticky left-9 z-10 bg-white pr-2 pl-1 dark:bg-slate-950">
                    {maskAgentName(r, isAdmin, t('noName'))}
                  </td>
                  <td className="px-2 text-center font-bold">
                    {r.mission_count !== null ? `${r.mission_count}/10` : ''}
                  </td>
                  {[
                    'M1',
                    'M2',
                    'M3',
                    'M4',
                    'M5',
                    'M6',
                    'M7',
                    'M8',
                    'M9',
                    'M10',
                  ].map((m) => (
                    <td key={m} className="px-2 text-center">
                      {r.missions[m] ? (
                        <span className="font-bold text-green-600 dark:text-green-400">
                          ✓
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  ))}
                  <td className="text-muted-foreground px-2 text-center text-xs whitespace-nowrap">
                    {r.last_complete_dtm
                      ? new Date(r.last_complete_dtm).toLocaleString('ko-KR', {
                          timeZone: 'Asia/Seoul',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '-'}
                  </td>
                  <td className="px-2 text-center">
                    {r.mission_count === null ? null : r.mission_count ===
                      10 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src="https://img1.kakaocdn.net/thumb/C375x375@2x.fwebp.q82/?fname=https%3A%2F%2Fst.kakaocdn.net%2Fproduct%2Fgift%2Fproduct%2F20250203140848_135c92640a004b0682f214bd5b5a94f3.png"
                        alt={t('giftAlt')}
                        title={t('completionTitle')}
                        loading="lazy"
                        className="mx-auto h-12 w-20 rounded-md object-cover object-center"
                      />
                    ) : (
                      <span className="text-lg" title={t('keepGoingTitle')}>
                        🥺
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
