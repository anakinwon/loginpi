import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { publicCacheHeaders } from '@/lib/cache-headers'
import { apiError } from '@/lib/api-errors'

// GET /api/admin/analytics/performance?period=7|30|90|365 — 퍼포먼스/행동 분석 (Phase 22 §12 ④)
//   세션/페이지뷰 추적층이 없어 페이지뷰·체류·반송률·이탈률·채널은 불가(선결조건).
//   대신 기존 데이터로 라이프사이클 전환 퍼널 + 활동 구성 + 참여 깊이를 즉시 집계.
//   - 퍼널: 가입 → 활동 → 첫 구매 → 재구매 (누적/전체 기준)
//   - 활동 유형 분포(actvty_tp_cd) · 참여 깊이(활동일수) — 최근 period일
//   관리자 전용.

const VALID_PERIODS = [7, 30, 90, 365] as const
const COMPLETED = new Set(['DONE', 'BUYER_DONE'])
const DAY_MS = 86_400_000

function dayEpoch(s: string): number {
  return Date.parse(s.slice(0, 10) + 'T00:00:00Z')
}

const TYPE_LABEL: Record<string, string> = {
  LOGIN: '로그인',
  CHAT: '카페 활동',
  MSG: '메시지',
  PAYMENT: '결제',
}

export async function GET(req: NextRequest) {
  // 뷰어 불변 집계(퍼널·전환·참여깊이 — 개인 식별 정보 없음) → 모든 visitor 공유 edge 캐시
  const raw = Number(req.nextUrl.searchParams.get('period') ?? '30')
  const period = VALID_PERIODS.includes(raw as (typeof VALID_PERIODS)[number])
    ? raw
    : 30

  const db = getSupabaseAdmin()
  const [signupRes, logRes, orderRes] = await Promise.all([
    // sql/127로 del_yn 도입 — 비활성 계정은 전환율 분모(가입자 수)에서 제외
    db
      .from('sys_user')
      .select('id', { count: 'exact', head: true })
      .eq('del_yn', 'N'),
    db
      .from('sys_user_actvty_log')
      .select('usr_id, actvty_dt, actvty_tp_cd')
      .eq('del_yn', 'N'),
    db.from('mps_order').select('buyer_id, order_st_cd').eq('del_yn', 'N'),
  ])

  if (logRes.error || orderRes.error) return apiError('ADM_PERFORMANCE_FAILED', 500)

  const signupCnt = signupRes.count ?? 0
  const logs = (logRes.data ?? []) as {
    usr_id: string
    actvty_dt: string
    actvty_tp_cd: string
  }[]
  const orders = (orderRes.data ?? []) as {
    buyer_id: string
    order_st_cd: string
  }[]

  // ── 라이프사이클 전환 퍼널 (누적/전체) ──
  const activeUsers = new Set(logs.map((l) => l.usr_id))
  const buyerOrderCnt = new Map<string, number>()
  for (const o of orders) {
    if (!COMPLETED.has(o.order_st_cd)) continue
    buyerOrderCnt.set(o.buyer_id, (buyerOrderCnt.get(o.buyer_id) ?? 0) + 1)
  }
  const buyers = buyerOrderCnt.size
  const repeatBuyers = [...buyerOrderCnt.values()].filter((c) => c >= 2).length

  const stageDefs = [
    { key: 'signup', label: '가입', cnt: signupCnt },
    { key: 'active', label: '활동(로그인+)', cnt: activeUsers.size },
    { key: 'buyer', label: '첫 구매', cnt: buyers },
    { key: 'repeat', label: '재구매', cnt: repeatBuyers },
  ]
  const top = signupCnt || 1
  const funnel = stageDefs.map((s, i) => ({
    ...s,
    pctOfTop: (s.cnt / top) * 100,
    convFromPrev:
      i === 0
        ? 100
        : stageDefs[i - 1].cnt > 0
          ? (s.cnt / stageDefs[i - 1].cnt) * 100
          : 0,
  }))

  // ── 최근 period일: 활동 유형 분포 + 참여 깊이 ──
  const periodFrom = dayEpoch(new Date().toISOString()) - (period - 1) * DAY_MS
  const periodLogs = logs.filter((l) => dayEpoch(l.actvty_dt) >= periodFrom)

  const typeMap = new Map<string, number>()
  for (const l of periodLogs)
    typeMap.set(l.actvty_tp_cd, (typeMap.get(l.actvty_tp_cd) ?? 0) + 1)
  const activityTypes = [...typeMap.entries()]
    .map(([cd, cnt]) => ({ cd, label: TYPE_LABEL[cd] ?? cd, cnt }))
    .sort((a, b) => b.cnt - a.cnt)

  // 참여 깊이 — 사용자별 활동일수 분포
  const daysByUser = new Map<string, number>()
  for (const l of periodLogs)
    daysByUser.set(l.usr_id, (daysByUser.get(l.usr_id) ?? 0) + 1)
  const DEPTH_BUCKETS = [
    { code: 'd1', label: '1일', max: 1 },
    { code: 'd2_3', label: '2~3일', max: 3 },
    { code: 'd4_7', label: '4~7일', max: 7 },
    { code: 'd8_14', label: '8~14일', max: 14 },
    { code: 'd15p', label: '15일+', max: Infinity },
  ]
  const depth = DEPTH_BUCKETS.map((b) => ({
    code: b.code,
    label: b.label,
    cnt: 0,
  }))
  for (const d of daysByUser.values()) {
    const idx = DEPTH_BUCKETS.findIndex((b) => d <= b.max)
    depth[idx].cnt++
  }

  return NextResponse.json(
    {
      period,
      funnel,
      conversion: {
        signupToActive:
          signupCnt > 0 ? (activeUsers.size / signupCnt) * 100 : 0,
        activeToBuyer:
          activeUsers.size > 0 ? (buyers / activeUsers.size) * 100 : 0,
        buyerToRepeat: buyers > 0 ? (repeatBuyers / buyers) * 100 : 0,
      },
      activityTypes,
      engagementDepth: depth,
      activeUsersPeriod: daysByUser.size,
      // 세션/페이지뷰 추적층 미구축 → 페이지뷰·체류·반송률·이탈률·채널은 선결조건
      sessionTrackingPending: true,
    },
    { headers: publicCacheHeaders() },
  )
}
