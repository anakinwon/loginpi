// /api/analytics/datasets — 레이크 데이터셋 카탈로그(dbm_lake_ds, sql/070, PRD 12 §8-3) :
//  GET ?link=&page= 목록(페이지 20) · POST {link, prjId, prjNm, tblNms} schema.pi /model 로 다시 계산해 upsert · PATCH {link, dsId, del} 논리삭제
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { z } from 'zod'
import { db, dbFail, dbRoute, parseBody } from '@/lib/api'
import { linkGet } from '@/lib/link/client'
import { buildLake, PRJ_ID_RE, type Dataset, type ModelRes } from '@/lib/analytics/lake'
import { linkFail, linkGate } from '@/lib/monitor/server'

const PAGE = 20
const COLS =
  'ds_id, prj_id, prj_nm, tbl_nm, raw_tbl_nm, std_tbl_nm, cur_tbl_nm, col_cnt, cnfm_pct, load_sts_cd, lst_load_dtm, mod_dtm'
type Row = {
  ds_id: string
  prj_id: string
  prj_nm: string | null
  tbl_nm: string
  raw_tbl_nm: string
  std_tbl_nm: string
  cur_tbl_nm: string
  col_cnt: number
  cnfm_pct: number | string
  load_sts_cd: Dataset['loadStsCd']
  lst_load_dtm: string | null
  mod_dtm: string
}
const toDs = (r: Row): Dataset => ({
  dsId: r.ds_id,
  prjId: r.prj_id,
  prjNm: r.prj_nm,
  tblNm: r.tbl_nm,
  rawNm: r.raw_tbl_nm,
  stdNm: r.std_tbl_nm,
  curNm: r.cur_tbl_nm,
  colCnt: r.col_cnt,
  cnfmPct: Number(r.cnfm_pct),
  loadStsCd: r.load_sts_cd,
  lstLoadDtm: r.lst_load_dtm,
  modDtm: r.mod_dtm,
})
const notFound = () => NextResponse.json({ error: 'NOT_FOUND', code: 'NOT_FOUND' }, { status: 404 })

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const page = Math.max(1, Math.floor(Number(sp.get('page') ?? 1)) || 1)
    const g = await linkGate(req, sp.get('link'))
    if (g instanceof NextResponse) return g
    const from = (page - 1) * PAGE
    // 정확 건수 없이 1행 더 읽어 다음 쪽 여부만 판정(R-P3)
    const r = await db()
      .from('dbm_lake_ds')
      .select(COLS)
      .eq('lnk_id', g.linkId)
      .eq('del_yn', 'N')
      .order('mod_dtm', { ascending: false })
      .range(from, from + PAGE)
    if (r.error) return dbFail(r.error)
    const rows = r.data as Row[]
    return NextResponse.json({ items: rows.slice(0, PAGE).map(toDs), page, hasMore: rows.length > PAGE })
  }),
)

const PostSchema = z.object({
  link: z.string(),
  prjId: z.string().regex(PRJ_ID_RE),
  prjNm: z.string().trim().max(200).nullable().optional(),
  tblNms: z.array(z.string().trim().min(1).max(128)).min(1).max(100),
})

export const POST = withGuard(
  dbRoute(async (req) => {
    const b = await parseBody(req, PostSchema)
    if (b instanceof NextResponse) return b
    const g = await linkGate(req, b.link)
    if (g instanceof NextResponse) return g
    let model: ModelRes
    try {
      model = await linkGet<ModelRes>(g.linkId, `/model?prjId=${encodeURIComponent(b.prjId)}`)
    } catch (e) {
      return linkFail(e)
    }
    // 화면이 보낸 이름은 선택만 — 3층 이름·적합률은 서버가 모델에서 다시 계산(위조 방지)
    const want = new Set(b.tblNms)
    const picked = buildLake(model).filter((t) => want.has(t.tblNm))
    if (picked.length === 0) return notFound()
    const who = g.usrId || 'ADMIN'
    const now = new Date().toISOString()
    // ponytail: 되살리기 upsert 가 regr_id·reg_dtm 은 건드리지 않지만 적재 상태도 유지 — 설계 변경 시 상태 초기화가 필요하면 load_sts_cd 를 함께 보냄
    const up = await db()
      .from('dbm_lake_ds')
      .upsert(
        picked.map((t) => ({
          lnk_id: g.linkId,
          prj_id: b.prjId,
          prj_nm: b.prjNm ?? null,
          tbl_nm: t.tblNm,
          raw_tbl_nm: t.rawNm,
          std_tbl_nm: t.stdNm,
          cur_tbl_nm: t.curNm,
          col_cnt: t.cols.length,
          cnfm_pct: t.cnfmPct,
          del_yn: 'N',
          del_dtm: null,
          modr_id: who,
          mod_dtm: now,
        })),
        { onConflict: 'lnk_id,prj_id,tbl_nm' },
      )
      .select('ds_id')
    if (up.error) return dbFail(up.error)
    return NextResponse.json({ saved: up.data.length })
  }),
)

const PatchSchema = z.object({ link: z.string(), dsId: z.string().uuid(), del: z.literal(true) })

export const PATCH = withGuard(
  dbRoute(async (req) => {
    const b = await parseBody(req, PatchSchema)
    if (b instanceof NextResponse) return b
    const g = await linkGate(req, b.link)
    if (g instanceof NextResponse) return g
    const now = new Date().toISOString()
    const r = await db()
      .from('dbm_lake_ds')
      .update({ del_yn: 'Y', del_dtm: now, modr_id: g.usrId || 'ADMIN', mod_dtm: now })
      .eq('ds_id', b.dsId)
      .eq('lnk_id', g.linkId)
      .eq('del_yn', 'N')
      .select('ds_id')
    if (r.error) return dbFail(r.error)
    if (r.data.length === 0) return notFound()
    return NextResponse.json({ ok: true })
  }),
)
