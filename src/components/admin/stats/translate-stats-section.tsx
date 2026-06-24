'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'
import { usePiAuth } from '@/components/pi-auth-provider'
import { readCache, writeCache } from '@/lib/client-cache'
import { StatsCard } from './stats-card'

// PiTranslate™ 번역 통계 섹션 (TASK-098)
// LazySection 안에서 마운트 — 보일 때 최초 fetch, 기간 변경 시 재조회
// 일별 번역 건수 · 캐시 히트율 · 예상 비용 (Gemini 토큰 추정) · 👍/👎 피드백

interface TranslateStatsResponse {
  period: number
  series: Array<{
    dt: string
    trans_cnt: number
    hit_cnt: number
    char_cnt: number
  }>
  models: Array<{ model_ver: string; cnt: number }>
  feedback: { up_cnt: number; down_cnt: number }
  totals: {
    trans_cnt: number
    hit_cnt: number
    hit_rate: number
    char_cnt: number
    est_input_tokens: number
    est_output_tokens: number
    est_cost_usd: number
  }
}

export function TranslateStatsSection({ period }: { period: number }) {
  const tr = useTranslations('adminStats.translate')
  const ta = useTranslations('adminStats')
  const tc = useTranslations('common')
  const { isLoading: authLoading, signIn } = usePiAuth()
  const [data, setData] = useState<TranslateStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Pi Browser 레이스 컨디션 대응: 401 수신 후 signIn 완료 시 1회 자동 재시도
  const retried = useRef(false)

  useEffect(() => {
    // signIn 진행 중이면 완료를 기다렸다가 fetch (레이스 컨디션 방지)
    if (authLoading) return
    retried.current = false
    let cancelled = false
    const cacheKey = `stats_translate_${period}`
    void (async () => {
      setError(null)
      // 캐시 즉시 표시 (SWR) → 네트워크 응답으로 교체
      const cached = readCache<TranslateStatsResponse>(cacheKey, 5 * 60_000)
      if (cached) {
        setData(cached)
        setLoading(false)
      } else {
        setLoading(true)
      }
      try {
        const res = await piFetch(`/api/admin/stats/translate?period=${period}`)
        if (res.status === 401) {
          // signIn 완료 전 마운트로 인한 레이스 컨디션 → 1회 재시도
          if (!retried.current) {
            retried.current = true
            await signIn({ silent: true })
            if (cancelled) return
            const retry = await piFetch(`/api/admin/stats/translate?period=${period}`)
            if (retry.status === 401) throw new Error('세션 만료 — 다시 로그인하세요 (HTTP 401)')
            if (!retry.ok) throw new Error(`번역 통계 조회 실패 (HTTP ${retry.status})`)
            const retryBody = (await retry.json()) as TranslateStatsResponse
            if (!cancelled) { setData(retryBody); writeCache(cacheKey, retryBody) }
            return
          }
          throw new Error('세션 만료 — 다시 로그인하세요 (HTTP 401)')
        }
        if (!res.ok) throw new Error(`번역 통계 조회 실패 (HTTP ${res.status})`)
        const body = (await res.json()) as TranslateStatsResponse
        if (cancelled) return
        setData(body)
        writeCache(cacheKey, body)
      } catch (e) {
        if (!cancelled && !cached)
          setError(e instanceof Error ? e.message : '오류 발생')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, authLoading])

  if (error) {
    return <p className="text-destructive text-sm">{error}</p>
  }

  const t = data?.totals
  const fb = data?.feedback

  return (
    <div className="space-y-4">
      {/* KPI 카드 — 신규 번역 / 캐시 히트율 / 예상 비용 / 피드백 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* 메시지 1건이 N개 언어로 번역되면 N건 — API 호출(비용) 단위 집계 */}
        <StatsCard
          label={tr('newTrans', { period })}
          value={t?.trans_cnt ?? 0}
          unit={ta('unitCase')}
          loading={loading}
        />
        <StatsCard
          label={tr('hitRate')}
          value={t ? (t.hit_rate * 100).toFixed(1) : '0.0'}
          unit="%"
          loading={loading}
        />
        <StatsCard
          label={tr('estCost')}
          value={t ? `$${t.est_cost_usd.toFixed(4)}` : '$0'}
          unit=""
          loading={loading}
        />
        <StatsCard
          label={tr('feedback')}
          value={fb ? `${fb.up_cnt} / ${fb.down_cnt}` : '0 / 0'}
          unit=""
          loading={loading}
        />
      </div>

      {/* 일별 번역 테이블 */}
      <div className="rounded-lg border p-4">
        <p className="mb-2 text-sm font-medium">{tr('dailyTitle')}</p>
        {loading ? (
          <div className="bg-muted h-40 animate-pulse rounded-lg" />
        ) : !data || data.series.length === 0 ? (
          <p className="text-muted-foreground text-sm">{tr('noData')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3 font-medium">{tr('colDate')}</th>
                  <th className="py-2 pr-3 font-medium">{tr('colNew')}</th>
                  <th className="py-2 pr-3 font-medium">{tr('colHit')}</th>
                  <th className="py-2 font-medium">{tr('colChars')}</th>
                </tr>
              </thead>
              <tbody>
                {data.series.map((row) => (
                  <tr key={row.dt} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{row.dt}</td>
                    <td className="py-1.5 pr-3">{row.trans_cnt}</td>
                    <td className="py-1.5 pr-3">{row.hit_cnt}</td>
                    <td className="py-1.5">
                      {Number(row.char_cnt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 모델별 분포 — Gemini 주력 / Claude fallback 비율 확인 */}
      {data && data.models.length > 0 && (
        <div className="rounded-lg border p-4">
          <p className="mb-2 text-sm font-medium">{tr('modelDist')}</p>
          <ul className="space-y-1 text-sm">
            {data.models.map((m) => (
              <li key={m.model_ver} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{m.model_ver}</span>
                <span className="text-muted-foreground shrink-0">
                  {tc('count', { count: m.cnt })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-muted-foreground text-xs">{tr('costNote')}</p>
    </div>
  )
}
