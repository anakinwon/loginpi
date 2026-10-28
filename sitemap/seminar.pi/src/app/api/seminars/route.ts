// 세미나 목록·개설 API(PRD F-02·F-03).
//  GET  ?tab=all|hosted|joined&page=N — 서버 페이지네이션(12건), 건수는 페이저가 쓰므로 exact. all = 예정·진행 중 시작일시 순(x_smn_mst_01),
//       hosted = 내가 연 것(x_smn_mst_02), joined = 내 참가(x_smn_ptc_02). all 은 공개 캐시, 나머지는 로그인 필요·private no-store
//  POST 개설 — Pi 로그인 사용자 모두(PRD D-1 개정, 요금제 2026-10-28). 참가자 입장은 모두 무료(입장료 0 고정 — 개최자는 요금제 이용권으로 시간을 산다, 마스터 2026-10-28). 비로그인 401(redirect 없음)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import {
  apiError,
  db,
  dbFail,
  dbRoute,
  parseBody,
  requireUser,
} from '@/lib/api'
import { SMN_COLS, toCard, type SmnRow } from '@/lib/seminar'
import {
  ONE_LINE_RE,
  SUB_TTL_MAX,
  OPEN_STS,
  PAGE_SIZE,
  parsePage,
  parseTab,
  startAtOk,
} from '@/lib/seminar-rules'

const PUBLIC_CACHE = 'public, s-maxage=30, stale-while-revalidate=120'
const NO_STORE = 'private, no-store'

export const GET = withAuthGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const tab = parseTab(sp.get('tab'))
    const page = parsePage(sp.get('page'))
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    if (tab === 'all') {
      const { data, error, count } = await db()
        .from('smn_mst')
        .select(SMN_COLS, { count: 'exact' })
        .eq('del_yn', 'N')
        .in('smn_sts_cd', [...OPEN_STS])
        .order('start_dtm', { ascending: true })
        .order('smn_id') // 같은 시작 시각(정각 개설이 흔함)이면 쪽 사이 중복·누락 — 경계 고정(T04 r3)
        .range(from, to)
        .returns<SmnRow[]>()
      if (error) return dbFail(error)
      return NextResponse.json(
        { rows: data.map(toCard), total: count ?? 0, page },
        { headers: { 'Cache-Control': PUBLIC_CACHE } },
      )
    }

    const user = await requireUser(req)
    if (user instanceof NextResponse) return user

    if (tab === 'hosted') {
      const { data, error, count } = await db()
        .from('smn_mst')
        .select(SMN_COLS, { count: 'exact' })
        .eq('del_yn', 'N')
        .eq('hst_usr_id', user.id)
        .order('start_dtm', { ascending: false })
        .order('smn_id') // 동률 경계 고정(T04 r3)
        .range(from, to)
        .returns<SmnRow[]>()
      if (error) return dbFail(error)
      return NextResponse.json(
        { rows: data.map(toCard), total: count ?? 0, page },
        { headers: { 'Cache-Control': NO_STORE } },
      )
    }

    // joined — 참가 행 + 세미나(삭제된 세미나는 inner 조인으로 제외)
    const { data, error, count } = await db()
      .from('smn_ptc')
      .select(`smn_mst!inner(${SMN_COLS})`, { count: 'exact' })
      .eq('del_yn', 'N')
      .eq('usr_id', user.id)
      .eq('smn_mst.del_yn', 'N')
      .order('reg_dtm', { ascending: false })
      .order('ptc_id') // 동률 경계 고정(T04 r3)
      .range(from, to)
      .returns<{ smn_mst: SmnRow }[]>()
    if (error) return dbFail(error)
    return NextResponse.json(
      { rows: data.map((r) => toCard(r.smn_mst)), total: count ?? 0, page },
      { headers: { 'Cache-Control': NO_STORE } },
    )
  }),
)

// 이름은 받지 않는다 — 남은 섬 이름에서 무작위로 정한다(sql/011 fn_crt_smn, 마스터 2026-10-28)
const createSchema = z.object({
  // ISO 일시(오프셋 포함) — 지금 이후 ~ 1년 안(S5)
  startAt: z.iso
    .datetime({ offset: true })
    .refine((v) => startAtOk(Date.parse(v))),
  maxCnt: z.number().int().min(1).max(100),
  subTitle: z.string().trim().max(SUB_TTL_MAX).regex(ONE_LINE_RE).optional(), // 부제(sql/012) — 나중에 상세에서도 수정
})

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    // 세션·본문 병렬(R-P1)
    const [user, body] = await Promise.all([
      requireUser(req),
      parseBody(req, createSchema),
    ])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body
    // 섬 고르기 + 저장을 한 함수·한 트랜잭션으로(잠금으로 동시 개설이 같은 섬을 고르지 않음, R-P5)
    const { data, error } = await db()
      .rpc('fn_crt_smn', {
        p_hst_usr_id: user.id,
        p_start_dtm: new Date(body.startAt).toISOString(),
        p_max_cnt: body.maxCnt,
        p_ent_pi_amt: '0', // 입장료 없음(마스터 2026-10-28) — 유료 입장 경로(SMN_ENT)는 기존 세미나용으로 남는다
      })
    if (error) return dbFail(error)
    const r = (data as { smn_id: string; smn_nm: string }[] | null)?.[0]
    if (!r) return apiError('ISLAND_FULL', 409) // 진행·예정 세미나가 섬 수(100)만큼 열려 있음
    // 부제는 만든 뒤 1회 저장(앞 결과의 id 가 필요해 직렬). 실패해도 세미나는 이미 열렸으니 상세에서 다시 저장하면 된다
    if (body.subTitle) {
      const { error: subErr } = await db().from('smn_mst').update({ subttl: body.subTitle }).eq('smn_id', r.smn_id)
      if (subErr) console.error('[seminars] 부제 저장 실패', subErr.code)
    }
    return NextResponse.json(
      { id: r.smn_id, name: r.smn_nm },
      { status: 201, headers: { 'Cache-Control': NO_STORE } },
    )
  }),
)
