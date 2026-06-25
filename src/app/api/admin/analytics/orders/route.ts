import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/admin/analytics/orders?period=7|30|90|365 — 주문 분석 (Phase 22 §12 ②)
//   mps_order 직접 조회 → 요약·주문방법·요일×시간 히트맵·주문간격·RFM을 온더플라이 집계.
//   (사전집계 stat_rfm_segment는 데이터 규모 증가 시 도입 — PRD_21 §6)
//   관리자 전용(개인 식별 RFM 포함). 시간 버킷은 KST(UTC+9) 기준.

const VALID_PERIODS = [7, 30, 90, 365] as const
const COMPLETED = new Set(['DONE', 'BUYER_DONE'])
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

interface OrderRow {
  buyer_id: string
  order_st_cd: string
  order_mthd_cd: string | null
  order_price_pi: number
  reg_dtm: string
}

const METHOD_LABEL: Record<string, string> = {
  DINE_IN: '매장 이용',
  PICKUP: '픽업',
  DELIVERY: '배달',
  UNKNOWN: '미지정',
}

// 정렬된 값 배열에서 value의 5분위 점수(1~5) — 동률·소표본 안전
function quintileScorer(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  return (v: number): number => {
    if (n <= 1) return 3
    // v 이하 개수의 백분위로 1~5 매핑
    let cnt = 0
    for (const s of sorted) if (s <= v) cnt++
    const pct = cnt / n
    return Math.min(5, Math.max(1, Math.ceil(pct * 5)))
  }
}

function segmentOf(r: number, f: number): { seg: string; label: string } {
  if (r >= 4 && f >= 4) return { seg: 'champion', label: '챔피언' }
  if (f >= 4) return { seg: 'loyal', label: '충성 고객' }
  if (r >= 4) return { seg: 'recent', label: '신규·최근' }
  if (r >= 3) return { seg: 'potential', label: '잠재 고객' }
  if (f >= 3) return { seg: 'at_risk', label: '이탈 위험' }
  return { seg: 'hibernating', label: '휴면' }
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const raw = Number(req.nextUrl.searchParams.get('period') ?? '30')
  const period = VALID_PERIODS.includes(raw as (typeof VALID_PERIODS)[number])
    ? raw
    : 30
  const from = new Date()
  from.setUTCDate(from.getUTCDate() - (period - 1))
  const fromDt = from.toISOString()

  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('mps_order')
    .select('buyer_id, order_st_cd, order_mthd_cd, order_price_pi, reg_dtm')
    .eq('del_yn', 'N')
    .gte('reg_dtm', fromDt)
    .order('reg_dtm', { ascending: true })

  if (error)
    return NextResponse.json({ error: '주문 조회 실패' }, { status: 500 })

  const rows = (data ?? []) as OrderRow[]

  // ── 요약 ──
  const total = rows.length
  const completedRows = rows.filter((r) => COMPLETED.has(r.order_st_cd))
  const cancelled = rows.filter((r) => r.order_st_cd === 'CANCELLED').length
  const completed = completedRows.length
  const revenuePi = completedRows.reduce(
    (s, r) => s + Number(r.order_price_pi),
    0,
  )
  const aovPi = completed > 0 ? revenuePi / completed : 0
  const cancelRate = total > 0 ? (cancelled / total) * 100 : 0

  // ── 주문방법 분포 ──
  const methodMap = new Map<string, number>()
  for (const r of rows) {
    const m = r.order_mthd_cd ?? 'UNKNOWN'
    methodMap.set(m, (methodMap.get(m) ?? 0) + 1)
  }
  const byMethod = [...methodMap.entries()]
    .map(([method, cnt]) => ({
      method,
      label: METHOD_LABEL[method] ?? method,
      cnt,
    }))
    .sort((a, b) => b.cnt - a.cnt)

  // ── 요일×시간 히트맵 (KST 기준, 전체 주문) ──
  const heatmap: number[][] = Array.from({ length: 7 }, () =>
    Array(24).fill(0),
  )
  for (const r of rows) {
    const kst = new Date(new Date(r.reg_dtm).getTime() + KST_OFFSET_MS)
    heatmap[kst.getUTCDay()][kst.getUTCHours()]++
  }

  // ── 구매자별 집계(완료 주문 기준): 주문간격·RFM ──
  const byBuyer = new Map<string, { dates: number[]; monetary: number }>()
  for (const r of completedRows) {
    const b = byBuyer.get(r.buyer_id) ?? { dates: [], monetary: 0 }
    b.dates.push(new Date(r.reg_dtm).getTime())
    b.monetary += Number(r.order_price_pi)
    byBuyer.set(r.buyer_id, b)
  }

  // 주문간격 히스토그램 (연속 주문 사이 일수)
  const INTERVAL_BUCKETS = [
    { label: '0~1일', max: 1 },
    { label: '2~3일', max: 3 },
    { label: '4~7일', max: 7 },
    { label: '8~14일', max: 14 },
    { label: '15~30일', max: 30 },
    { label: '30일+', max: Infinity },
  ]
  const intervalCounts = INTERVAL_BUCKETS.map((b) => ({ label: b.label, cnt: 0 }))
  const now = Date.now()
  let repeatBuyers = 0

  // RFM 원자료
  const rfmRaw: {
    usr_id: string
    recencyDays: number
    freq: number
    monetary: number
  }[] = []

  for (const [usrId, b] of byBuyer.entries()) {
    const sorted = b.dates.sort((a, c) => a - c)
    if (sorted.length >= 2) {
      repeatBuyers++
      for (let i = 1; i < sorted.length; i++) {
        const days = (sorted[i] - sorted[i - 1]) / 86_400_000
        const idx = INTERVAL_BUCKETS.findIndex((bk) => days <= bk.max)
        intervalCounts[idx].cnt++
      }
    }
    const recencyDays = Math.floor((now - sorted[sorted.length - 1]) / 86_400_000)
    rfmRaw.push({
      usr_id: usrId,
      recencyDays,
      freq: sorted.length,
      monetary: b.monetary,
    })
  }

  const buyerCnt = byBuyer.size
  const repeatRate = buyerCnt > 0 ? (repeatBuyers / buyerCnt) * 100 : 0
  // 평균 주문간격 — 전체 간격의 평균
  const totalIntervals = intervalCounts.reduce((s, b) => s + b.cnt, 0)
  // (간격 합/개수를 다시 구하기 위해 재순회 대신 근사: 버킷 중앙값 가중 — 정밀 평균은 별도 보관)
  // 정밀 평균을 위해 위 루프에서 합산했어야 하나, 버킷만으로 충분한 KPI라 생략하고 별도 계산:
  let intervalSum = 0
  let intervalN = 0
  for (const b of byBuyer.values()) {
    const s = b.dates
    for (let i = 1; i < s.length; i++) {
      intervalSum += (s[i] - s[i - 1]) / 86_400_000
      intervalN++
    }
  }
  const avgIntervalDays = intervalN > 0 ? intervalSum / intervalN : 0

  // ── RFM 점수·세그먼트 ──
  const rScorer = quintileScorer(rfmRaw.map((x) => -x.recencyDays)) // 최근일수록 높게(부호 반전)
  const fScorer = quintileScorer(rfmRaw.map((x) => x.freq))
  const mScorer = quintileScorer(rfmRaw.map((x) => x.monetary))

  const segCount = new Map<string, { label: string; cnt: number }>()
  const scored = rfmRaw.map((x) => {
    const r = rScorer(-x.recencyDays)
    const f = fScorer(x.freq)
    const m = mScorer(x.monetary)
    const { seg, label } = segmentOf(r, f)
    const cur = segCount.get(seg) ?? { label, cnt: 0 }
    cur.cnt++
    segCount.set(seg, cur)
    return { ...x, r, f, m, seg, segLabel: label }
  })

  // 상위 고객(매출순) 표시명 — FK 없으므로 sys_user 별도 조회 후 Map 병합
  const top = [...scored].sort((a, b) => b.monetary - a.monetary).slice(0, 12)
  const ids = [...new Set(top.map((t) => t.usr_id))]
  const { data: users } = ids.length
    ? await db
        .from('sys_user')
        .select('id, display_name, nick_nm, pi_username')
        .in('id', ids)
    : { data: [] }
  const nameById = new Map(
    (users ?? []).map((u: Record<string, string | null>) => [
      u.id,
      u.display_name || u.nick_nm || u.pi_username || '(이름 없음)',
    ]),
  )

  return NextResponse.json({
    period,
    summary: {
      total,
      completed,
      cancelled,
      cancelRate,
      aovPi,
      repeatRate,
      avgIntervalDays,
      buyers: buyerCnt,
    },
    byMethod,
    heatmap,
    intervalBuckets: intervalCounts,
    totalIntervals,
    rfm: {
      segments: [...segCount.entries()].map(([seg, v]) => ({
        seg,
        label: v.label,
        cnt: v.cnt,
      })),
      points: scored.map((s) => ({
        r: s.r,
        f: s.f,
        m: s.m,
        seg: s.seg,
        segLabel: s.segLabel,
        recencyDays: s.recencyDays,
        freq: s.freq,
        monetaryPi: s.monetary,
      })),
      top: top.map((t) => ({
        usr_id: t.usr_id,
        display_nm: nameById.get(t.usr_id) ?? '(이름 없음)',
        recencyDays: t.recencyDays,
        freq: t.freq,
        monetaryPi: t.monetary,
        segLabel: t.segLabel,
      })),
    },
  })
}
