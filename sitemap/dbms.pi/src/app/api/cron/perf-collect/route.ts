// 성능 상시 자동 수집 크론(PRD 12 §3-1, ANL-R02, sql/021) — GET /api/cron/perf-collect (Vercel cron '*/10 18-19 * * *' = 매일 KST 03:00~04:50, Authorization: Bearer CRON_SECRET)
//  대상 = dbm_prf_clct_cfg 켜진 행 중 마지막 실행이 오늘 기준 시각(KST 03:00) 이전 → 접속마다 하루 1번, 본체는 수동 수집과 같은 collectOnce(등록자 SYSTEM)
//  결과(src/lib/perf/auto.ts autoNext) : 성공·요금제 D1 미만·schema.pi 요금제 만료 = 오늘 끝 / 일시 오류 = 코드만 기록(다음 회차 재시도, 변경일시 순서로 뒤로) / 토큰 만료·연결 해제·범위 밖·미지원 = 자동 끔
//  fail-closed : CRON_SECRET 미설정·불일치 = 401. @pi/guard 미적용(크론은 Origin 없음 — Bearer 비밀값이 유일한 게이트, sitemap.pi site-sts-sweep 과 같음)
import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { db, dbFail, dbRoute } from '@/lib/api'
import { LinkError } from '@/lib/link/client'
import { curPlan } from '@/lib/plan'
import { allows, type PlanCd } from '@/lib/plan-rules'
import { AUTO_ACTOR, autoNext, lastAutoSlot, type AutoNext } from '@/lib/perf/auto'
import { collectOnce } from '@/lib/perf/collect'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const T = 'dbm_prf_clct_cfg'
const BATCH = 60 // 회차당 대상 상한(남은 행은 다음 회차 — 하루 12회차)
const PER_LINK = 6 // 연결(토큰)당 회차 상한 — schema.pi 토큰당 분당 60회, 수집 1번 = 조회 5회
const BUDGET_MS = 45_000 // maxDuration 60초 안에서 새 수집을 멈추는 선(수집 1번 최대 4초 + 저장)

type Row = { lnk_id: string; conn_id: string; mod_dtm: string }

// 수집 1번 → 결과 코드(OK·LinkError 코드·DB_FAIL)
async function collectCode(r: Row): Promise<string> {
  try {
    const res = await collectOnce(r.lnk_id, r.conn_id, AUTO_ACTOR)
    if (res.ok) return 'OK'
    console.error('[cron perf] 저장 실패', res.dbErr.code)
    return 'DB_FAIL'
  } catch (e) {
    if (e instanceof LinkError) return e.code
    console.error('[cron perf] 수집 실패', e instanceof Error ? e.message : e)
    return 'DB_FAIL'
  }
}

export const GET = dbRoute(async (req: NextRequest) => {
  // Bearer 상수시간 비교 — 이 라우트는 Origin·rate limit 가드가 없어 비밀값이 유일한 게이트
  const secret = process.env.CRON_SECRET
  const given = Buffer.from(req.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${secret ?? ''}`)
  if (!secret || given.length !== want.length || !timingSafeEqual(given, want))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const t0 = Date.now()
  const slot = new Date(lastAutoSlot(t0)).toISOString()
  const due = await db()
    .from(T)
    .select('lnk_id, conn_id, mod_dtm')
    .eq('use_yn', 'Y')
    .eq('del_yn', 'N')
    .or(`lst_run_dtm.is.null,lst_run_dtm.lt.${slot}`)
    .order('mod_dtm')
    .limit(BATCH)
  if (due.error) return dbFail(due.error)
  const rows = (due.data ?? []) as Row[]
  const out = { due: rows.length, ok: 0, done: 0, retry: 0, off: 0, left: 0 }
  if (!rows.length) return NextResponse.json(out)

  // 연결 살아 있음·현재 요금제 — 연결마다 1번(R-P2), 둘은 서로 독립(R-P1). 요금제 조회 실패 = null(그 연결은 재시도)
  const lnkIds = [...new Set(rows.map((r) => r.lnk_id))]
  const [live, plans] = await Promise.all([
    db().from('dbm_lnk').select('lnk_id').in('lnk_id', lnkIds).eq('del_yn', 'N'),
    Promise.all(
      lnkIds.map((id) =>
        curPlan(id).then(
          (p) => [id, p.plan] as const,
          () => [id, null] as const,
        ),
      ),
    ),
  ])
  if (live.error) return dbFail(live.error)
  const liveSet = new Set((live.data ?? []).map((r) => r.lnk_id as string))
  const planOf = new Map<string, PlanCd | null>(plans)
  const perLink = new Map<string, number>()

  // ponytail: 직렬 처리 — 토큰당 분당 호출 한도·고객 DB 부하를 넘지 않는 가장 단순한 방법. 회차당 처리량(약 10~40건 × 12회차)이 모자라면 연결 단위 병렬로
  for (const r of rows) {
    if (Date.now() - t0 > BUDGET_MS) {
      out.left++
      continue
    }
    let code: string
    const plan = planOf.get(r.lnk_id)
    if (!liveSet.has(r.lnk_id)) code = 'LINK_NOT_FOUND'
    else if (plan == null) code = 'DB_UNAVAILABLE'
    else if (!allows(plan, 'PERF_AUTO')) code = 'PLAN_REQUIRED'
    else {
      const n = perLink.get(r.lnk_id) ?? 0
      if (n >= PER_LINK) {
        out.left++
        // 변경일시만 올려 다음 회차 순서 뒤로(한 연결의 접속이 많아도 다른 연결이 밀리지 않게)
        await db().from(T).update({ modr_id: AUTO_ACTOR }).eq('lnk_id', r.lnk_id).eq('conn_id', r.conn_id)
        continue
      }
      perLink.set(r.lnk_id, n + 1)
      code = await collectCode(r)
    }
    const next: AutoNext = autoNext(code)
    out[code === 'OK' ? 'ok' : next]++
    // 일시 오류는 실행일시를 두고 결과·변경일시만(다음 회차에 뒤로 가서 재시도). 변경일시 조건 = 실행 중 사용자가 끄고 다시 켠 설정을 덮어쓰지 않게(R-P5)
    const upd = await db()
      .from(T)
      .update({
        lst_rslt_cd: code,
        modr_id: AUTO_ACTOR,
        ...(next !== 'retry' ? { lst_run_dtm: new Date().toISOString() } : {}),
        ...(next === 'off' ? { use_yn: 'N' } : {}),
      })
      .eq('lnk_id', r.lnk_id)
      .eq('conn_id', r.conn_id)
      .eq('mod_dtm', r.mod_dtm)
    if (upd.error) console.error('[cron perf] 결과 기록 실패', upd.error.code)
  }
  console.log('[cron perf]', JSON.stringify(out))
  return NextResponse.json(out)
})
