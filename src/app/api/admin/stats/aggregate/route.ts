import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// WAU/MAU 윈도우: 날짜 D의 활동 로그는 D ~ D+29 행의 wau_cnt·mau_cnt에 영향을 준다
const RIPPLE_DAYS = 29

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

// 날짜 형식 검증 (YYYY-MM-DD)
function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s))
}

// 집계 파이프라인 전체가 UTC 날짜 기준 (sys_user_actvty_log.actvty_dt = CURRENT_DATE)
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

function yesterdayUtc(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

interface DayResult {
  date: string
  ok: boolean
  msg?: string
}

// [from, to] 구간을 하루씩 fn_build_daily_stats로 재계산 (멱등)
async function rebuildRange(from: string, to: string): Promise<DayResult[]> {
  const db = getSupabaseAdmin()
  const results: DayResult[] = []
  for (let dt = from; dt <= to; dt = addDays(dt, 1)) {
    const { error } = await db.rpc('fn_build_daily_stats', { p_dt: dt })
    results.push({ date: dt, ok: !error, msg: error?.message })
  }
  return results
}

// 집계 대상 [from, to]에 더해 to 이후 WAU/MAU 파급 구간(to+1 ~ to+29, 오늘 이하)까지 재계산
// — 과거 날짜의 로그가 바뀌면 그 날짜를 윈도우에 포함하는 이후 행들도 갱신해야 기준이 유지된다
async function rebuildWithRipple(from: string, to: string): Promise<DayResult[]> {
  const today = todayUtc()
  const rippleTo = addDays(to, RIPPLE_DAYS)
  const effectiveTo = rippleTo < today ? rippleTo : today
  return rebuildRange(from, effectiveTo < from ? from : effectiveTo)
}

function summarize(results: DayResult[]) {
  const failed = results.filter(r => !r.ok)
  return { total: results.length, failed: failed.length, failedDates: failed.map(r => r.date) }
}

// Vercel Cron은 GET으로 호출한다 — 매일 00:00 UTC: 어제 확정 + 오늘 행 갱신
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }
  const results = await rebuildWithRipple(yesterdayUtc(), yesterdayUtc())
  return NextResponse.json({ cron: true, ...summarize(results) })
}

export async function POST(req: NextRequest) {
  // 인증: CRON_SECRET 또는 어드민 세션
  const cronAuth = isCronAuthorized(req)
  if (!cronAuth) {
    const user = await getSessionUser()
    if (!isAdmin(user)) {
      return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    }
  }

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    // 빈 body 허용
  }

  const today = todayUtc()

  // 백필 모드: from ~ to 범위 전체 처리
  if (body.backfill === true) {
    let to = typeof body.to === 'string' && isValidDate(body.to) ? body.to : yesterdayUtc()
    if (to > today) to = today

    // from 미지정 시 sys_user_actvty_log의 최초 날짜 사용
    let from: string
    if (typeof body.from === 'string' && isValidDate(body.from)) {
      from = body.from
    } else {
      const { data } = await getSupabaseAdmin()
        .from('sys_user_actvty_log')
        .select('actvty_dt')
        .eq('del_yn', 'N')
        .order('actvty_dt', { ascending: true })
        .limit(1)
        .maybeSingle()
      from = typeof data?.actvty_dt === 'string' ? data.actvty_dt : to
    }
    if (from > to) from = to

    const results = await rebuildWithRipple(from, to)
    return NextResponse.json({ backfill: true, ...summarize(results) })
  }

  // 단일 날짜 처리 (기본: 오늘 UTC — 온디맨드 최신화)
  // 클라이언트 로컬(KST 등) 날짜가 UTC보다 앞서는 경우 오늘로 보정
  let date = typeof body.date === 'string' && isValidDate(body.date) ? body.date : today
  if (date > today) date = today

  const results = await rebuildWithRipple(date, date)
  const s = summarize(results)

  if (s.failed > 0) {
    return NextResponse.json(
      { error: `재계산 실패: ${s.failedDates.join(', ')}`, date },
      { status: 500 },
    )
  }
  return NextResponse.json({ success: true, date, rebuilt: s.total })
}
