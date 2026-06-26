import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/admin/stats/translate?period=7|30|90|365 — PyTranslate™ 번역 통계 (TASK-098)
// fn_translate_stats RPC: 일별 번역 건수·캐시 히트·문자수 + 모델별 분포 + 👍/👎 피드백 합계
// 비용은 문자수 기반 추정 — 1 token ≈ 4 chars, 프롬프트 오버헤드 포함 출력≈입력 가정

const VALID_PERIODS = [7, 30, 90, 365] as const

// Gemini 2.5 Flash 단가 (USD / 1M tokens, 2026-06 기준 추정치 — 변동 시 여기만 수정)
const GEMINI_INPUT_USD_PER_M = 0.3
const GEMINI_OUTPUT_USD_PER_M = 2.5

function calcFromDate(period: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - (period - 1))
  return d.toISOString().slice(0, 10)
}

interface TranslateStatsRpc {
  series: Array<{
    dt: string
    trans_cnt: number
    hit_cnt: number
    char_cnt: number
  }>
  models: Array<{ model_ver: string; cnt: number }>
  feedback: { up_cnt: number; down_cnt: number }
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const raw = Number(searchParams.get('period') ?? '30')
  const period = VALID_PERIODS.includes(raw as (typeof VALID_PERIODS)[number])
    ? raw
    : 30
  const fromDt = calcFromDate(period)
  const toDt = new Date().toISOString().slice(0, 10)

  const { data, error } = await getSupabaseAdmin().rpc('fn_translate_stats', {
    p_from: fromDt,
    p_to: toDt,
  })
  if (error) {
    return NextResponse.json({ error: '통계 조회 실패' }, { status: 500 })
  }

  const stats = (data ?? {
    series: [],
    models: [],
    feedback: { up_cnt: 0, down_cnt: 0 },
  }) as TranslateStatsRpc

  const totalTrans = stats.series.reduce((s, r) => s + Number(r.trans_cnt), 0)
  const totalHits = stats.series.reduce((s, r) => s + Number(r.hit_cnt), 0)
  const totalChars = stats.series.reduce((s, r) => s + Number(r.char_cnt), 0)
  const totalRequests = totalTrans + totalHits

  // 토큰 추정: 출력(번역문) ≈ char/4, 입력(원문+프롬프트 지시) ≈ 출력의 2배 가정
  const estOutputTokens = Math.round(totalChars / 4)
  const estInputTokens = estOutputTokens * 2
  const estCostUsd =
    (estInputTokens / 1_000_000) * GEMINI_INPUT_USD_PER_M +
    (estOutputTokens / 1_000_000) * GEMINI_OUTPUT_USD_PER_M

  return NextResponse.json({
    period,
    from_dt: fromDt,
    to_dt: toDt,
    series: stats.series,
    models: stats.models,
    feedback: stats.feedback,
    totals: {
      trans_cnt: totalTrans, // 신규 번역(API 호출) 건수
      hit_cnt: totalHits, // 캐시 히트 건수
      hit_rate: totalRequests > 0 ? totalHits / totalRequests : 0,
      char_cnt: totalChars,
      est_input_tokens: estInputTokens,
      est_output_tokens: estOutputTokens,
      est_cost_usd: Math.round(estCostUsd * 10_000) / 10_000,
    },
  })
}
