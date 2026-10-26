// 세미나 목록·개설 API(PRD F-02·F-03).
//  GET  ?tab=all|hosted|joined&page=N — 서버 페이지네이션(12건), 건수는 페이저가 쓰므로 exact. all = 예정·진행 중 시작일시 순(x_smn_mst_01),
//       hosted = 내가 연 것(x_smn_mst_02), joined = 내 참가(x_smn_ptc_02). all 은 공개 캐시, 나머지는 로그인 필요·private no-store
//  POST 개설 — ADMIN 만(PRD D-1). 비로그인 401·비관리자 403(redirect 없음)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import {
  db,
  dbFail,
  dbRoute,
  parseBody,
  requireAdmin,
  requireUser,
} from '@/lib/api'
import { SMN_COLS, toCard, type SmnRow } from '@/lib/seminar'
import {
  FEE_RE,
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
      .range(from, to)
      .returns<{ smn_mst: SmnRow }[]>()
    if (error) return dbFail(error)
    return NextResponse.json(
      { rows: data.map((r) => toCard(r.smn_mst)), total: count ?? 0, page },
      { headers: { 'Cache-Control': NO_STORE } },
    )
  }),
)

const createSchema = z.object({
  title: z.string().trim().min(1).max(100),
  // ISO 일시(오프셋 포함) — 지금 이후 ~ 1년 안(S5)
  startAt: z.iso
    .datetime({ offset: true })
    .refine((v) => startAtOk(Date.parse(v))),
  maxCnt: z.number().int().min(1).max(100),
  fee: z.coerce.string().trim().regex(FEE_RE),
})

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    // 세션·본문 병렬(R-P1)
    const [user, body] = await Promise.all([
      requireAdmin(req),
      parseBody(req, createSchema),
    ])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body
    const { data, error } = await db()
      .from('smn_mst')
      .insert({
        hst_usr_id: user.id,
        smn_nm: body.title,
        start_dtm: new Date(body.startAt).toISOString(),
        max_cnt: body.maxCnt,
        ent_pi_amt: body.fee,
        regr_id: user.id,
        modr_id: user.id,
      })
      .select('smn_id')
      .single<{ smn_id: string }>()
    if (error) return dbFail(error)
    return NextResponse.json(
      { id: data.smn_id },
      { status: 201, headers: { 'Cache-Control': NO_STORE } },
    )
  }),
)
