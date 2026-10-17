// 물리 모델(서버, PRD_PiErd S2) — 논리 로더 → 순수 변환(modelpi/phy.ts) 입력 구성, 저장된 물리 모델 조회, 전환(생성) 저장
// 저장은 행 묶음 insert 4회(모델 → 테이블 → 칼럼 → FK). 중간 실패 시 이미 넣은 행을 논리 삭제로 되돌린다
// ponytail: 다단 insert + 보상 논리 삭제 — 동시 전환·부분 실패 빈도가 문제 되면 DB 함수(JSON 입력 1트랜잭션)로
import { db } from './db'
import { loadLogical } from './model-logical'
import { checkLogical } from './modelpi/normalize'
import { phyGate, toPhysical, type PhyCol, type PhyTbl, type TpMap } from './modelpi/phy'
import type { DbmsCd } from './modelpi/dbms'
import type { DdlIn, DdlTbl } from './modelpi/ddl'

const PAGE = 1000 // PostgREST max_rows 대응 — range 반복 조회
const TBL_CHUNK = 100 // in() URL 길이 제한 대응

export async function phyPlan(areaId: string, prjId: string, dbms: DbmsCd, delCol: boolean) {
  const m = await loadLogical(areaId, prjId)
  if (!m) return null
  const chk = checkLogical(m.ents, m.rels, { dbms })
  const why = phyGate(chk.summary, m.rels, m.ents.length)
  const tp = await db().from('std_tp_map').select('lgc_tp_cd, phy_tp_nm, len_use_yn').eq('dbms_cd', dbms).eq('del_yn', 'N').order('phy_tp_nm')
  if (tp.error) throw tp.error
  const conv = toPhysical(
    m.ents.map((e) => ({ ent_id: e.ent_id, tbl_phy_nm: e.tbl_phy_nm, ent_desc: e.ent_desc, attrs: e.attrs.map((a) => ({ ...a, dom: a.dom ?? null })) })),
    m.rels,
    tp.data as TpMap[],
    { dbms, delCol },
  )
  return { prj: m.prj, why, ...conv, capped: m.capped }
}

export async function listPhy(areaId: string, prjId: string) {
  const r = await db().from('mdl_phy_mdl').select('phy_mdl_id, dbms_cd, idntfr_ltr_cd, del_col_use_yn, phy_mdl_desc, ver_no, reg_dtm').eq('area_id', areaId).eq('prj_id', prjId).eq('del_yn', 'N').order('reg_dtm')
  if (r.error) throw r.error
  return r.data
}

// 저장된 물리 모델 1건 → PhyTbl[](diff·DDL 입력) + FK
export async function loadPhy(areaId: string, mdlId: string) {
  const mdl = await db().from('mdl_phy_mdl').select('phy_mdl_id, prj_id, dbms_cd, idntfr_ltr_cd, del_col_use_yn, ver_no').eq('area_id', areaId).eq('phy_mdl_id', mdlId).eq('del_yn', 'N').maybeSingle()
  if (mdl.error) throw mdl.error
  if (!mdl.data) return null
  const [t, f] = await Promise.all([
    db().from('mdl_phy_tbl').select('phy_tbl_id, ent_id, tbl_nm, tbl_desc, ver_no').eq('phy_mdl_id', mdlId).eq('del_yn', 'N').order('tbl_nm'),
    db().from('mdl_phy_fk').select('phy_fk_id, rel_id, fk_nm').eq('phy_mdl_id', mdlId).eq('del_yn', 'N'),
  ])
  for (const x of [t, f]) if (x.error) throw x.error
  const tbls = t.data as { phy_tbl_id: string; ent_id: string; tbl_nm: string; tbl_desc: string | null; ver_no: number }[]
  type Col = PhyCol & { phy_col_id: string; phy_tbl_id: string; ver_no: number }
  const cols: Col[] = []
  for (let i = 0; i < tbls.length; i += TBL_CHUNK) {
    const ids = tbls.slice(i, i + TBL_CHUNK).map((x) => x.phy_tbl_id)
    for (let from = 0; ; from += PAGE) {
      const c = await db()
        .from('mdl_phy_col')
        .select('phy_col_id, phy_tbl_id, attr_id, sys_col_yn, col_nm, col_seq, dom_id, dom_ver_no, phy_tp_nm, data_len, data_scale, null_yn, bsc_val_txt, pk_yn, pk_seq, ver_no')
        .in('phy_tbl_id', ids)
        .eq('del_yn', 'N')
        .order('phy_col_id')
        .range(from, from + PAGE - 1)
      if (c.error) throw c.error
      cols.push(...(c.data as Col[]))
      if (c.data.length < PAGE) break
    }
  }
  const by = new Map<string, Col[]>()
  for (const y of cols) by.set(y.phy_tbl_id, [...(by.get(y.phy_tbl_id) ?? []), y])
  const tables = tbls.map((x) => ({ ...x, cols: (by.get(x.phy_tbl_id) ?? []).sort((a, b) => a.col_seq - b.col_seq) }))
  return { mdl: mdl.data, tables, fks: f.data as { phy_fk_id: string; rel_id: string; fk_nm: string }[] }
}

// DDL·물리 정의서 입력 — 저장된 물리 모델 + 논리(칼럼 설명 = 용어 논리명, FK 칼럼 쌍 원천 = 속성 fk_rel_id·src_attr_id, 관계 부모·자식)
export async function phyDdlInput(areaId: string, prjId: string, p: NonNullable<Awaited<ReturnType<typeof loadPhy>>>): Promise<{ prjNm: string; d: DdlIn } | null> {
  const m = await loadLogical(areaId, prjId)
  if (!m) return null
  const attrs = m.ents.flatMap((e) => e.attrs)
  const lbl = new Map(attrs.map((a) => [a.attr_id, a.term_log_nm]))
  const rel = new Map(m.rels.map((r) => [r.rel_id, r]))
  const tables: DdlTbl[] = p.tables.map((t) => ({ ent_id: t.ent_id, tbl_nm: t.tbl_nm, tbl_desc: t.tbl_desc, cols: t.cols.map((c) => ({ ...c, col_desc: c.attr_id ? (lbl.get(c.attr_id) ?? null) : null })) }))
  return {
    prjNm: (m.prj as { prj_nm: string }).prj_nm,
    d: {
      dbms: p.mdl.dbms_cd as DbmsCd,
      ltr: p.mdl.idntfr_ltr_cd as 'UPPER' | 'LOWER',
      tables,
      fks: p.fks.flatMap((f) => {
        const r = rel.get(f.rel_id)
        return r ? [{ rel_id: f.rel_id, fk_nm: f.fk_nm, prnt_ent_id: r.prnt_ent_id, chld_ent_id: r.chld_ent_id }] : [] // 관계가 삭제된 FK 는 제외(diff 대상)
      }),
      src: new Map(attrs.map((a) => [a.attr_id, a.src_attr_id ?? null])),
      fkOf: new Map(attrs.map((a) => [a.attr_id, a.fk_rel_id])),
    },
  }
}

// 전환 저장 — 실패 시 보상(논리 삭제) 후 오류 던짐
export async function savePhy(areaId: string, prjId: string, opt: { dbms: DbmsCd; ltr: 'UPPER' | 'LOWER'; delCol: boolean; desc: string | null }, tables: PhyTbl[], fks: { rel_id: string; fk_nm: string }[], uid: string) {
  const sys = { regr_id: uid, modr_id: uid }
  const m = await db()
    .from('mdl_phy_mdl')
    .insert({ area_id: areaId, prj_id: prjId, dbms_cd: opt.dbms, idntfr_ltr_cd: opt.ltr, del_col_use_yn: opt.delCol ? 'Y' : 'N', phy_mdl_desc: opt.desc, ...sys })
    .select('phy_mdl_id, ver_no')
    .single()
  if (m.error) throw m.error
  const id = (m.data as { phy_mdl_id: string }).phy_mdl_id
  try {
    if (tables.length) {
      const t = await db()
        .from('mdl_phy_tbl')
        .insert(tables.map((x) => ({ area_id: areaId, phy_mdl_id: id, ent_id: x.ent_id, tbl_nm: x.tbl_nm, tbl_desc: x.tbl_desc, ...sys })))
        .select('phy_tbl_id, ent_id')
      if (t.error) throw t.error
      const tid = new Map((t.data as { phy_tbl_id: string; ent_id: string }[]).map((x) => [x.ent_id, x.phy_tbl_id]))
      const c = await db()
        .from('mdl_phy_col')
        .insert(tables.flatMap((x) => x.cols.map((y) => ({ area_id: areaId, phy_tbl_id: tid.get(x.ent_id), ...y, ...sys }))))
      if (c.error) throw c.error
    }
    if (fks.length) {
      const f = await db().from('mdl_phy_fk').insert(fks.map((x) => ({ area_id: areaId, phy_mdl_id: id, ...x, ...sys })))
      if (f.error) throw f.error
    }
  } catch (e) {
    await delPhy(id, uid).catch((x) => console.error('[phy] 보상 삭제 실패', id, x)) // 원래 오류를 가리지 않음
    throw e
  }
  return m.data as { phy_mdl_id: string; ver_no: number }
}

// 논리 삭제 — 모델 먼저(중간 실패 시 남는 하위 행은 비활성 모델 소속이라 목록·고유 인덱스에 영향 없음, 재시도로 정리)
export async function delPhy(mdlId: string, uid: string) {
  const now = new Date().toISOString()
  const del = { del_yn: 'Y', del_dtm: now, modr_id: uid }
  const m = await db().from('mdl_phy_mdl').update(del).eq('phy_mdl_id', mdlId).eq('del_yn', 'N')
  if (m.error) throw m.error
  const t = await db().from('mdl_phy_tbl').select('phy_tbl_id').eq('phy_mdl_id', mdlId).eq('del_yn', 'N')
  if (t.error) throw t.error
  const ids = (t.data as { phy_tbl_id: string }[]).map((x) => x.phy_tbl_id)
  for (let i = 0; i < ids.length; i += TBL_CHUNK) {
    const c = await db().from('mdl_phy_col').update(del).in('phy_tbl_id', ids.slice(i, i + TBL_CHUNK)).eq('del_yn', 'N')
    if (c.error) throw c.error
  }
  for (const tb of ['mdl_phy_tbl', 'mdl_phy_fk']) {
    const r = await db().from(tb).update(del).eq('phy_mdl_id', mdlId).eq('del_yn', 'N')
    if (r.error) throw r.error
  }
}
