// 물리 인덱스(PRD_PiErd S5 잔여, sql/063) — POST : 테이블에 일반·유일 인덱스 추가(이름 = 서버 생성 IX_<테이블>_NN), DELETE ?idx=&ver_no= : 논리 삭제
// 칼럼 = 그 테이블 활성 칼럼(중복 금지, 순서 = 인덱스 칼럼 순서), 같은 구성의 인덱스·PK 중복 금지, 테이블 작성완료면 거부(DB 트리거도 MLK01)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { db } from '@/lib/db'
import { loadPhy } from '@/lib/model-phy'
import type { DbmsCd } from '@/lib/modelpi/dbms'
import { idxName } from '@/lib/modelpi/phy'

type Ctx = { params: Promise<{ areaId: string; prjId: string }> }
const uuid = z.string().uuid()
const body = z.object({
  phy_mdl_id: uuid,
  phy_tbl_id: uuid,
  col_ids: z.array(uuid).min(1).max(16),
  unq_yn: z.enum(['Y', 'N']).default('N'),
  idx_desc: z.string().max(2000).nullish(),
})

export async function POST(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'MODEL_EDIT')
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(prjId).success) return apiError('INVALID_INPUT', 400)
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  try {
    const p = await loadPhy(areaId, b.phy_mdl_id)
    if (!p || p.mdl.prj_id !== prjId) return apiError('NOT_FOUND', 404)
    const t = p.tables.find((x) => x.phy_tbl_id === b.phy_tbl_id)
    if (!t) return apiError('NOT_FOUND', 404)
    if (t.phy_sts_cd === 'CMPTN') return apiError('SUBJ_LOCKED', 409)
    const have = new Set(t.cols.map((c) => c.phy_col_id))
    if (new Set(b.col_ids).size !== b.col_ids.length || b.col_ids.some((id) => !have.has(id))) return apiError('PHY_IDX_COL', 400)
    const key = b.col_ids.join(',')
    const pkKey = t.cols.filter((c) => c.pk_yn === 'Y').sort((a, c) => (a.pk_seq ?? 0) - (c.pk_seq ?? 0)).map((c) => c.phy_col_id).join(',')
    if (key === pkKey || t.indexes.some((x) => x.col_ids.join(',') === key)) return apiError('PHY_IDX_DUP', 409)
    // 이름 : 물리 모델 전체에서 빈 번호(DBMS 의 인덱스 이름은 스키마 단위 유일 — 잘린 테이블명끼리 겹치지 않게)
    const taken = new Set(p.tables.flatMap((x) => x.indexes.map((y) => y.idx_nm)))
    let nm = ''
    for (let n = 1; n < 100 && !nm; n++) if (!taken.has(idxName(p.mdl.dbms_cd as DbmsCd, t.tbl_nm, n))) nm = idxName(p.mdl.dbms_cd as DbmsCd, t.tbl_nm, n)
    if (!nm) return apiError('PHY_IDX_MAX', 409)
    const row = { area_id: areaId, phy_tbl_id: t.phy_tbl_id, idx_nm: nm, unq_yn: b.unq_yn, col_ids: b.col_ids, idx_desc: b.idx_desc ?? null }
    const r = await db().from('mdl_phy_idx').insert({ ...row, regr_id: auth.user.usr_id, modr_id: auth.user.usr_id }).select('phy_idx_id').single()
    if (r.error) throw r.error
    const id = (r.data as { phy_idx_id: string }).phy_idx_id
    await audit({ area_id: areaId, tgt_tp_cd: 'PHY', tgt_id: id, act_cd: 'INS', aftr_val: { ...row, tbl_nm: t.tbl_nm }, usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true, item: { phy_idx_id: id, idx_nm: nm } }, { status: 201 })
  } catch (e) {
    return dbError(e as { code?: string; message?: string }, 'VERSION_CONFLICT') // 동시 추가로 같은 이름 = 활성 유일 인덱스 위반 → 다시 불러와 재시도
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'MODEL_EDIT')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const idxId = sp.get('idx')
  const ver = Number(sp.get('ver_no'))
  if (!uuid.safeParse(prjId).success || !uuid.safeParse(idxId).success || !Number.isInteger(ver)) return apiError('INVALID_INPUT', 400)
  try {
    const x = await db().from('mdl_phy_idx').select('phy_idx_id, idx_nm, unq_yn, col_ids, ver_no, mdl_phy_tbl(tbl_nm, phy_sts_cd, del_yn, mdl_phy_mdl(prj_id, del_yn))').eq('phy_idx_id', idxId!).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
    if (x.error) throw x.error
    const row = x.data as unknown as { idx_nm: string; unq_yn: string; col_ids: string[]; ver_no: number; mdl_phy_tbl: { tbl_nm: string; phy_sts_cd: string; del_yn: string; mdl_phy_mdl: { prj_id: string; del_yn: string } } } | null
    const t = row?.mdl_phy_tbl
    if (!row || !t || t.del_yn !== 'N' || t.mdl_phy_mdl.del_yn !== 'N' || t.mdl_phy_mdl.prj_id !== prjId) return apiError('NOT_FOUND', 404)
    if (t.phy_sts_cd === 'CMPTN') return apiError('SUBJ_LOCKED', 409)
    const r = await db().from('mdl_phy_idx').update({ del_yn: 'Y', del_dtm: new Date().toISOString(), ver_no: ver + 1, modr_id: auth.user.usr_id }).eq('phy_idx_id', idxId!).eq('ver_no', ver).eq('del_yn', 'N').select('phy_idx_id')
    if (r.error) throw r.error
    if (!r.data.length) return apiError('VERSION_CONFLICT', 409)
    await audit({ area_id: areaId, tgt_tp_cd: 'PHY', tgt_id: idxId!, act_cd: 'DEL', bfr_val: { idx_nm: row.idx_nm, unq_yn: row.unq_yn, col_ids: row.col_ids, tbl_nm: t.tbl_nm }, usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
