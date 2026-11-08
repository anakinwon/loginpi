import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

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

// 집계 파이프라인 전체가 KST 날짜 기준 (043: fn_record_activity·fn_build_daily_stats KST 통일)
function todayKst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

function yesterdayKst(): string {
  return new Date(Date.now() + 9 * 3600_000 - 86400_000)
    .toISOString()
    .slice(0, 10)
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
async function rebuildWithRipple(
  from: string,
  to: string,
): Promise<DayResult[]> {
  const today = todayKst()
  const rippleTo = addDays(to, RIPPLE_DAYS)
  const effectiveTo = rippleTo < today ? rippleTo : today
  return rebuildRange(from, effectiveTo < from ? from : effectiveTo)
}

function summarize(results: DayResult[]) {
  const failed = results.filter((r) => !r.ok)
  return {
    total: results.length,
    failed: failed.length,
    failedDates: failed.map((r) => r.date),
  }
}

// ONDEMAND: 통계 대시보드 접속 시 자동 최신화 — 어드민이 직접 실행한 MANUAL과 구분
type TriggerCd = 'CRON' | 'ONDEMAND' | 'MANUAL' | 'BACKFILL'

interface BatchSummary {
  total: number
  failed: number
  failedDates: string[]
}

// 실행 결과를 sys_batch_log에 기록 — 어드민 배치 화면에서 CRON 포함 전체 이력 조회
// 기록 실패가 본 작업 결과를 가리면 안 되므로 오류는 콘솔에만 남긴다
async function logBatchRun(
  triggerCd: TriggerCd,
  fromDt: string,
  toDt: string,
  startDtm: Date,
  summary: BatchSummary,
  regrId: string,
) {
  const { error } = await getSupabaseAdmin()
    .from('sys_batch_log')
    .insert({
      job_nm: 'stats_aggregate',
      trigger_cd: triggerCd,
      from_dt: fromDt,
      to_dt: toDt,
      start_dtm: startDtm.toISOString(),
      end_dtm: new Date().toISOString(),
      success_yn: summary.failed === 0 ? 'Y' : 'N',
      total_cnt: summary.total,
      failed_cnt: summary.failed,
      result_msg:
        summary.failedDates.length > 0
          ? `실패: ${summary.failedDates.join(', ')}`
          : null,
      regr_id: regrId,
      modr_id: regrId,
    })
  if (error) console.error('sys_batch_log 기록 실패:', error.message)
}

// Vercel Cron은 GET으로 호출한다 — 매일 00:00 UTC: 어제 확정 + 오늘 행 갱신
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return apiError('FORBIDDEN', 403)
  }
  const startDtm = new Date()
  const target = yesterdayKst()
  const results = await rebuildWithRipple(target, target)
  const s = summarize(results)
  await logBatchRun('CRON', target, target, startDtm, s, 'SYSTEM')
  return NextResponse.json({ cron: true, ...s })
}

export async function POST(req: NextRequest) {
  // 인증: CRON_SECRET 또는 어드민 세션
  const cronAuth = isCronAuthorized(req)
  let regrId = 'SYSTEM'
  if (!cronAuth) {
    const user = await getSessionUser()
    if (!isAdmin(user)) {
      return apiError('FORBIDDEN', 403)
    }
    regrId = user?.pi_username ?? user?.google_email ?? user?.id ?? 'ADMIN'
  }

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    // 빈 body 허용
  }

  const today = todayKst()

  // 백필 모드: from ~ to 범위 전체 처리
  if (body.backfill === true) {
    let to =
      typeof body.to === 'string' && isValidDate(body.to)
        ? body.to
        : yesterdayKst()
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

    const startDtm = new Date()
    const results = await rebuildWithRipple(from, to)
    const s = summarize(results)
    await logBatchRun('BACKFILL', from, to, startDtm, s, regrId)
    return NextResponse.json({ backfill: true, ...s })
  }

  // 단일 날짜 처리 (기본: 오늘 KST — 온디맨드 최신화). 미래 날짜 요청은 오늘로 보정
  let date =
    typeof body.date === 'string' && isValidDate(body.date) ? body.date : today
  if (date > today) date = today

  const startDtm = new Date()
  const results = await rebuildWithRipple(date, date)
  const s = summarize(results)
  // 대시보드 자동 최신화(ondemand: true)는 ONDEMAND — 어드민 버튼 실행(MANUAL)과 구분
  const triggerCd: TriggerCd = cronAuth
    ? 'CRON'
    : body.ondemand === true
      ? 'ONDEMAND'
      : 'MANUAL'
  await logBatchRun(triggerCd, date, date, startDtm, s, regrId)

  if (s.failed > 0) {
    const dates = s.failedDates.join(', ')
    return NextResponse.json(
      {
        error: `재계산 실패: ${dates}`,
        code: 'ADM_STATS_REBUILD_FAILED',
        params: { dates },
        date,
      },
      { status: 500 },
    )
  }
  return NextResponse.json({ success: true, date, rebuilt: s.total })
}
