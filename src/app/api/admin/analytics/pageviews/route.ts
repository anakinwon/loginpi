import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/admin/analytics/pageviews?period=7|30|90|365 — 웹 트래픽 (Phase 22 §12 ④)
//   stat_pageview를 세션별 시퀀스로 묶어 체류·반송·이탈·랜딩·채널을 파생.
//   - 체류시간 = 세션 내 연속 PV 간격 합 (마지막 페이지 체류는 측정 불가 → 제외)
//   - 반송률 = PV 1개 세션 / 전체 세션, 랜딩/이탈 = 세션 첫/마지막 페이지
//   관리자 전용.

const VALID_PERIODS = [7, 30, 90, 365] as const
const DAY_MS = 86_400_000
const CHANNEL_LABEL: Record<string, string> = {
  DIRECT: '직접 유입',
  SEARCH: '검색',
  SOCIAL: '소셜',
  REFERRAL: '외부 링크',
  PI: 'Pi 생태계',
  INTERNAL: '내부',
}

interface PvRow {
  sess_id: string
  page_path: string
  chnl_cd: string
  view_dtm: string
}

export async function GET(req: NextRequest) {
  // Home 공개 분석 — 집계 지표(페이지 경로·세션·채널)만 반환, 게스트 포함 전체 공개.
  const raw = Number(req.nextUrl.searchParams.get('period') ?? '30')
  const period = VALID_PERIODS.includes(raw as (typeof VALID_PERIODS)[number])
    ? raw
    : 30
  const from = new Date(Date.now() - (period - 1) * DAY_MS)
    .toISOString()
    .slice(0, 10)

  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('stat_pageview')
    .select('sess_id, page_path, chnl_cd, view_dtm')
    .eq('del_yn', 'N')
    .gte('view_dtm', from)
    .order('view_dtm', { ascending: true })

  if (error)
    return NextResponse.json({ error: '웹 트래픽 조회 실패' }, { status: 500 })

  const rows = (data ?? []) as PvRow[]
  const totalPv = rows.length

  // 일별 PV 추세
  const pvByDay = new Map<string, number>()
  for (const r of rows) {
    const d = r.view_dtm.slice(0, 10)
    pvByDay.set(d, (pvByDay.get(d) ?? 0) + 1)
  }
  const pvTrend: { date: string; cnt: number }[] = []
  for (let i = period - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10)
    pvTrend.push({ date: d, cnt: pvByDay.get(d) ?? 0 })
  }

  // 세션별 시퀀스 (정렬된 상태로 push)
  const sessions = new Map<string, PvRow[]>()
  for (const r of rows) {
    const arr = sessions.get(r.sess_id) ?? []
    arr.push(r)
    sessions.set(r.sess_id, arr)
  }

  let bounced = 0
  let dwellSumMs = 0
  let dwellPv = 0
  const landing = new Map<string, number>()
  const exit = new Map<string, number>()
  const channels = new Map<string, number>()

  for (const seq of sessions.values()) {
    const n = seq.length
    if (n === 1) bounced++
    landing.set(seq[0].page_path, (landing.get(seq[0].page_path) ?? 0) + 1)
    exit.set(seq[n - 1].page_path, (exit.get(seq[n - 1].page_path) ?? 0) + 1)
    // 채널 = 세션 첫 PV
    channels.set(seq[0].chnl_cd, (channels.get(seq[0].chnl_cd) ?? 0) + 1)
    // 체류 = 연속 PV 간격 합 (마지막 페이지 제외)
    for (let i = 1; i < n; i++) {
      const gap = Date.parse(seq[i].view_dtm) - Date.parse(seq[i - 1].view_dtm)
      if (gap > 0 && gap < 30 * 60_000) {
        dwellSumMs += gap
        dwellPv++
      }
    }
  }

  const sessionCnt = sessions.size
  const bounceRate = sessionCnt > 0 ? (bounced / sessionCnt) * 100 : 0
  const avgDwellSec = dwellPv > 0 ? dwellSumMs / dwellPv / 1000 : 0
  const pvPerSession = sessionCnt > 0 ? totalPv / sessionCnt : 0

  const topN = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([k, cnt]) => ({ path: k, cnt }))
      .sort((a, b) => b.cnt - a.cnt)
      .slice(0, 8)

  return NextResponse.json(
    {
      period,
      summary: {
        totalPv,
        sessions: sessionCnt,
        pvPerSession,
        avgDwellSec,
        bounceRate,
      },
      pvTrend,
      channels: [...channels.entries()]
        .map(([cd, cnt]) => ({ cd, label: CHANNEL_LABEL[cd] ?? cd, cnt }))
        .sort((a, b) => b.cnt - a.cnt),
      topLanding: topN(landing),
      topExit: topN(exit),
    },
    {
      headers: {
        // Vercel edge 캐싱 60분 (모든 visitor 공유)
        'Cache-Control': 's-maxage=3600, max-age=0, stale-while-revalidate=3600',
        'CDN-Cache-Control': 'max-age=3600, stale-while-revalidate=3600',
      },
    },
  )
}
