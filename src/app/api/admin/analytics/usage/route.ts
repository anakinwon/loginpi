import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { publicCacheHeaders } from '@/lib/cache-headers'

// GET /api/admin/analytics/usage?period=7|30|90|365 — 접속·사용 분석 (Phase 22 §12 ③)
//   sys_user_actvty_log(일별 활동, UNIQUE usr_id×actvty_dt) + sys_user(가입일) +
//   usr_loc_hist(지역)를 온더플라이 집계. 신규 집계 테이블 의존 없음.
//   - 신규 vs 재방문(일별), 가입 코호트 리텐션(최근 8주), 지역 분포(시도별)
//   관리자 전용. 코호트는 기간 필터와 무관하게 항상 최근 8주.

const VALID_PERIODS = [7, 30, 90, 365] as const
const COHORT_WEEKS = 8
const DAY_MS = 86_400_000

// 'YYYY-MM-DD' 또는 timestamp → UTC 자정 epoch
function dayEpoch(s: string): number {
  return Date.parse(s.slice(0, 10) + 'T00:00:00Z')
}

export async function GET(req: NextRequest) {
  // 뷰어 불변 집계(신규/재방문·코호트·지역 — 개인 식별 정보 없음) → 모든 visitor 공유 edge 캐시
  const raw = Number(req.nextUrl.searchParams.get('period') ?? '30')
  const period = VALID_PERIODS.includes(raw as (typeof VALID_PERIODS)[number])
    ? raw
    : 30

  const todayEpoch = dayEpoch(new Date().toISOString())
  // 코호트 8주를 커버하도록 충분히 조회
  const windowDays = Math.max(period, COHORT_WEEKS * 7)
  const fromEpoch = todayEpoch - (windowDays - 1) * DAY_MS
  const fromDt = new Date(fromEpoch).toISOString().slice(0, 10)

  const db = getSupabaseAdmin()
  const [logRes, userRes, locRes] = await Promise.all([
    db
      .from('sys_user_actvty_log')
      .select('usr_id, actvty_dt')
      .eq('del_yn', 'N')
      .gte('actvty_dt', fromDt),
    // sql/127로 del_yn 도입 — 비활성 계정은 가입자·코호트 모수에서 제외(지표 부풀림 방지)
    db.from('sys_user').select('id, reg_dtm').eq('del_yn', 'N'),
    db
      .from('usr_loc_hist')
      .select('user_str_id, sido_nm, reg_dtm')
      .eq('del_yn', 'N')
      .eq('consent_yn', 'Y')
      .not('sido_nm', 'is', null),
  ])

  if (logRes.error || userRes.error)
    return NextResponse.json({ error: '사용 분석 조회 실패' }, { status: 500 })

  const logs = (logRes.data ?? []) as { usr_id: string; actvty_dt: string }[]
  const users = (userRes.data ?? []) as { id: string; reg_dtm: string }[]
  const locs = (locRes.data ?? []) as {
    user_str_id: string
    sido_nm: string
    reg_dtm: string
  }[]

  // 가입일 맵 (usr_id → 가입 epoch)
  const signupEpoch = new Map<string, number>()
  for (const u of users) signupEpoch.set(u.id, dayEpoch(u.reg_dtm))

  // ── 신규 vs 재방문 (최근 period일) ──
  const periodFrom = todayEpoch - (period - 1) * DAY_MS
  const dailyActive = new Map<number, Set<string>>() // epoch → active user set
  for (const l of logs) {
    const e = dayEpoch(l.actvty_dt)
    if (e < periodFrom) continue
    const set = dailyActive.get(e) ?? new Set<string>()
    set.add(l.usr_id)
    dailyActive.set(e, set)
  }
  const newReturning: { date: string; newCnt: number; returningCnt: number }[] =
    []
  for (let e = periodFrom; e <= todayEpoch; e += DAY_MS) {
    const set = dailyActive.get(e)
    let newCnt = 0
    let returningCnt = 0
    if (set) {
      for (const uid of set) {
        const su = signupEpoch.get(uid)
        if (su !== undefined && su >= e) newCnt++
        else returningCnt++
      }
    }
    newReturning.push({
      date: new Date(e).toISOString().slice(0, 10),
      newCnt,
      returningCnt,
    })
  }

  // ── 가입 코호트 리텐션 (최근 8주) ──
  // weeksAgo: 0=이번 주 ... 7=8주 전. 코호트 = 가입 weeksAgo, offset k = 가입 후 k주차.
  const weeksAgo = (e: number) => Math.floor((todayEpoch - e) / (7 * DAY_MS))

  // 사용자별 활동 주차 집합
  const activeWeeks = new Map<string, Set<number>>()
  for (const l of logs) {
    const w = weeksAgo(dayEpoch(l.actvty_dt))
    if (w < 0 || w >= COHORT_WEEKS) continue
    const s = activeWeeks.get(l.usr_id) ?? new Set<number>()
    s.add(w)
    activeWeeks.set(l.usr_id, s)
  }
  // 코호트별 사용자
  const cohortUsers = new Map<number, string[]>()
  for (const u of users) {
    const w = weeksAgo(signupEpoch.get(u.id)!)
    if (w < 0 || w >= COHORT_WEEKS) continue
    const arr = cohortUsers.get(w) ?? []
    arr.push(u.id)
    cohortUsers.set(w, arr)
  }
  // 행: 오래된 코호트(c=7)부터, 열: 가입 후 k주차(0..c)
  const cohort: {
    cohort: string
    size: number
    retention: (number | null)[]
  }[] = []
  for (let c = COHORT_WEEKS - 1; c >= 0; c--) {
    const members = cohortUsers.get(c) ?? []
    const size = members.length
    const row: (number | null)[] = []
    for (let k = 0; k <= c; k++) {
      if (size === 0) {
        row.push(null)
        continue
      }
      const targetWeek = c - k // 가입 후 k주차의 weeksAgo
      let active = 0
      for (const uid of members) {
        if (activeWeeks.get(uid)?.has(targetWeek)) active++
      }
      row.push(Math.round((active / size) * 100))
    }
    cohort.push({ cohort: `${c}주 전`, size, retention: row })
  }

  // ── 지역 분포 (시도별 고유 사용자, 최신 위치 기준) ──
  const latestSido = new Map<string, { sido: string; e: number }>()
  for (const l of locs) {
    const e = Date.parse(l.reg_dtm)
    const cur = latestSido.get(l.user_str_id)
    if (!cur || e > cur.e) latestSido.set(l.user_str_id, { sido: l.sido_nm, e })
  }
  const sidoCount = new Map<string, number>()
  for (const { sido } of latestSido.values())
    sidoCount.set(sido, (sidoCount.get(sido) ?? 0) + 1)
  const regions = [...sidoCount.entries()]
    .map(([sido, cnt]) => ({ sido, cnt }))
    .sort((a, b) => b.cnt - a.cnt)
    .slice(0, 12)

  return NextResponse.json(
    {
      period,
      newReturning,
      cohort,
      regions,
      locatedUsers: latestSido.size,
    },
    { headers: publicCacheHeaders() },
  )
}
