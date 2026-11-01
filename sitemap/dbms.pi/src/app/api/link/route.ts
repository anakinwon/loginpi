// 내 schema.pi 연결 — GET 목록(페이지 20건, ?page=1~), POST 등록 { tkn } : schema.pi GET /area 로 토큰 검증 후 봉인 저장
//  같은 분류체계를 다시 등록하면 기존 행의 토큰만 교체(사용자 + 분류체계 활성 1건, x_dbm_lnk_01)
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withGuard } from '@pi/guard'
import { db, dbFail, dbRoute, parseBody, requireUser } from '@/lib/api'
import { linkErrorResponse, schemaFetch } from '@/lib/link/client'
import { seal } from '@/lib/link/seal'

const PAGE = 20

export const GET = withGuard(
  dbRoute(async (req) => {
    const user = await requireUser(req)
    if (user instanceof NextResponse) return user
    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page')) || 1)
    const from = (page - 1) * PAGE
    // 1건 더 읽어 다음 페이지 여부 판정(정확 건수 불필요 — R-P3)
    const { data, error } = await db()
      .from('dbm_lnk')
      .select('lnk_id, area_id, area_nm, reg_dtm, mod_dtm')
      .eq('usr_id', user.id)
      .eq('del_yn', 'N')
      .order('reg_dtm', { ascending: false })
      .range(from, from + PAGE)
    if (error) return dbFail(error)
    const rows = data ?? []
    return NextResponse.json({
      items: rows.slice(0, PAGE).map((r) => ({
        linkId: r.lnk_id,
        areaId: r.area_id,
        areaNm: r.area_nm,
        regDtm: r.reg_dtm,
        modDtm: r.mod_dtm,
      })),
      page,
      hasMore: rows.length > PAGE,
    })
  }),
)

const bodySchema = z.object({ tkn: z.string().trim().regex(/^slk_[A-Za-z0-9_-]{16,200}$/) })

export const POST = withGuard(
  dbRoute(async (req) => {
    const [user, body] = await Promise.all([requireUser(req), parseBody(req, bodySchema)])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body

    // 토큰 검증 + 분류체계 이름(외부 호출 4초 상한) — 기존 행 조회와 독립이라 병렬
    const [area, existing] = await Promise.all([
      schemaFetch<{ areaId: string; areaNm: string }>(body.tkn, '/area').catch((e: unknown) => e),
      db().from('dbm_lnk').select('lnk_id, area_id').eq('usr_id', user.id).eq('del_yn', 'N'),
    ])
    if (area instanceof Error) return linkErrorResponse(area)
    const a = area as { areaId: string; areaNm: string }
    if (existing.error) return dbFail(existing.error)
    const now = new Date().toISOString()
    const areaNm = String(a.areaNm).slice(0, 200)

    const prev = existing.data?.find((r) => r.area_id === a.areaId)
    if (prev) {
      const { error } = await db()
        .from('dbm_lnk')
        .update({ tkn_enc_txt: seal(body.tkn, prev.lnk_id), area_nm: areaNm, modr_id: user.id, mod_dtm: now })
        .eq('lnk_id', prev.lnk_id)
      if (error) return dbFail(error)
      return NextResponse.json({ link: { linkId: prev.lnk_id, areaId: a.areaId, areaNm }, replaced: true })
    }

    const lnkId = randomUUID()
    const { error } = await db().from('dbm_lnk').insert({
      lnk_id: lnkId,
      usr_id: user.id,
      area_id: a.areaId,
      area_nm: areaNm,
      tkn_enc_txt: seal(body.tkn, lnkId),
      regr_id: user.id,
      modr_id: user.id,
    })
    // 23505 = 같은 분류체계 동시 등록 경합(R-P5) — 다시 누르면 교체 경로로 처리됨
    if (error) return error.code === '23505' ? NextResponse.json({ error: '이미 등록 중입니다. 다시 시도하세요', code: 'LINK_DUP' }, { status: 409 }) : dbFail(error)
    return NextResponse.json({ link: { linkId: lnkId, areaId: a.areaId, areaNm }, replaced: false })
  }),
)
