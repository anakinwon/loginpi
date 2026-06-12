'use client'

import { useEffect, useState } from 'react'
import { piFetch } from '@/lib/pi-fetch'
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
  const [data, setData] = useState<TranslateStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await piFetch(`/api/admin/stats/translate?period=${period}`)
        if (!res.ok) throw new Error('번역 통계 조회 실패')
        const body = (await res.json()) as TranslateStatsResponse
        if (!cancelled) setData(body)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '오류 발생')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [period])

  if (error) {
    return <p className="text-destructive text-sm">{error}</p>
  }

  const t = data?.totals
  const fb = data?.feedback

  return (
    <div className="space-y-4">
      {/* KPI 카드 — 신규 번역 / 캐시 히트율 / 예상 비용 / 피드백 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatsCard
          label={`신규 번역 (${period}일)`}
          value={t?.trans_cnt ?? 0}
          unit="건"
          loading={loading}
        />
        <StatsCard
          label="캐시 히트율"
          value={t ? (t.hit_rate * 100).toFixed(1) : '0.0'}
          unit="%"
          loading={loading}
        />
        <StatsCard
          label="예상 비용 (Gemini 토큰 추정)"
          value={t ? `$${t.est_cost_usd.toFixed(4)}` : '$0'}
          unit=""
          loading={loading}
        />
        <StatsCard
          label="번역 피드백 👍 / 👎"
          value={fb ? `${fb.up_cnt} / ${fb.down_cnt}` : '0 / 0'}
          unit=""
          loading={loading}
        />
      </div>

      {/* 일별 번역 테이블 */}
      <div className="rounded-lg border p-4">
        <p className="mb-2 text-sm font-medium">일별 번역 현황</p>
        {loading ? (
          <div className="bg-muted h-40 animate-pulse rounded-lg" />
        ) : !data || data.series.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            기간 내 번역 데이터가 없습니다
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3 font-medium">날짜</th>
                  <th className="py-2 pr-3 font-medium">신규 번역</th>
                  <th className="py-2 pr-3 font-medium">캐시 히트</th>
                  <th className="py-2 font-medium">번역 문자수</th>
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
          <p className="mb-2 text-sm font-medium">번역 모델 분포</p>
          <ul className="space-y-1 text-sm">
            {data.models.map((m) => (
              <li key={m.model_ver} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{m.model_ver}</span>
                <span className="text-muted-foreground shrink-0">
                  {m.cnt}건
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        예상 비용은 번역문 문자수 기반 추정치입니다 (1 token ≈ 4 chars, 입력
        토큰 ≈ 출력×2 가정) — 실제 청구액은 Google AI Studio 콘솔을
        확인하세요.
      </p>
    </div>
  )
}
