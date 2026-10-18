// 물리 모델(서버, PRD_PiErd S2) — 논리 로더 → 순수 변환(modelpi/phy.ts) 입력 구성, 저장된 물리 모델 조회, 전환(생성) 저장
// 저장은 행 묶음 insert 4회(모델 → 테이블 → 칼럼 → FK). 중간 실패 시 이미 넣은 행을 논리 삭제로 되돌린다
// ponytail: 다단 insert + 보상 논리 삭제 — 동시 전환·부분 실패 빈도가 문제 되면 DB 함수(JSON 입력 1트랜잭션)로
import { db } from './db'
import { loadLogical } from './model-logical'
import { checkLogical } from './modelpi/normalize'
import { toPhysical, type PhyCol, type PhyTbl, type TpMap } from './modelpi/phy'
import { scopeWhy } from './modelpi/stage'
import type { DbmsCd } from './modelpi/dbms'
import type { DdlIn, DdlTbl } from './modelpi/ddl'
import { planSync, type StoredTbl, type SyncOp } from './modelpi/phy-sync'

const PAGE = 1000 // PostgREST max_rows 대응 — range 반복 조회
const TBL_CHUNK = 100 // in() URL 길이 제한 대응

// 변환 계획 — scope = 엔터티 ID 집합(마스터 지시 2026-10-17 : 엔터티별 작성완료 → 선택 전환), null = 프로젝트 전체. 관문도 범위 안에서만 판정
export async function phyPlan(areaId: string, prjId: string, dbms: DbmsCd, scope: Set<string> | null = null) {
  const m0 = await loadLogical(areaId, prjId)
  if (!m0) return null
  const chk = checkLogical(m0.ents, m0.rels, { dbms })
  const m = { ...m0, ents: scope ? m0.ents.filter((e) => scope.has(e.ent_id)) : m0.ents }
  const why = scopeWhy(chk, m0.rels, new Set(m.ents.map((e) => e.ent_id)))
  const tp = await db().from('std_tp_map').select('lgc_tp_cd, phy_tp_nm, len_use_yn').eq('dbms_cd', dbms).eq('del_yn', 'N').order('phy_tp_nm')
  if (tp.error) throw tp.error
  const conv = toPhysical(
    m.ents.map((e) => ({ ent_id: e.ent_id, tbl_phy_nm: e.tbl_phy_nm, ent_desc: e.ent_desc, attrs: e.attrs.map((a) => ({ ...a, dom: a.dom ?? null })) })),
    m.rels,
    tp.data as TpMap[],
    { dbms },
  )
  return { prj: m.prj, why, ...conv, capped: m.capped }
}

// 엔터티 상태(논리 삭제 포함 — 저장된 물리 테이블의 동기화 범위 판정용)
export async function entInfoOf(entIds: string[]) {
  const out = new Map<string, { lgc_sts_cd: string; del_yn: string }>()
  for (let i = 0; i < entIds.length; i += TBL_CHUNK) {
    const r = await db().from('mdl_ent').select('ent_id, lgc_sts_cd, del_yn').in('ent_id', entIds.slice(i, i + TBL_CHUNK))
    if (r.error) throw r.error
    for (const x of r.data as { ent_id: string; lgc_sts_cd: string; del_yn: string }[]) out.set(x.ent_id, x)
  }
  return out
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
    db().from('mdl_phy_tbl').select('phy_tbl_id, ent_id, tbl_nm, tbl_desc, phy_sts_cd, phy_cmptn_dtm, auto_inc_yn, ver_no').eq('phy_mdl_id', mdlId).eq('del_yn', 'N').order('tbl_nm'),
    db().from('mdl_phy_fk').select('phy_fk_id, rel_id, fk_nm').eq('phy_mdl_id', mdlId).eq('del_yn', 'N'),
  ])
  for (const x of [t, f]) if (x.error) throw x.error
  const tbls = t.data as { phy_tbl_id: string; ent_id: string; tbl_nm: string; tbl_desc: string | null; phy_sts_cd: string; phy_cmptn_dtm: string | null; auto_inc_yn: 'Y' | 'N'; ver_no: number }[]
  type Col = PhyCol & { phy_col_id: string; phy_tbl_id: string; ver_no: number }
  const cols: Col[] = []
  for (let i = 0; i < tbls.length; i += TBL_CHUNK) {
    const ids = tbls.slice(i, i + TBL_CHUNK).map((x) => x.phy_tbl_id)
    for (let from = 0; ; from += PAGE) {
      const c = await db()
        .from('mdl_phy_col')
        .select('phy_col_id, phy_tbl_id, attr_id, sys_col_yn, col_nm, col_seq, dom_id, dom_ver_no, phy_tp_nm, data_len, data_scale, null_yn, bsc_val_txt, pk_yn, pk_seq, ver_no')
        .in('phy_tbl_id', ids)
        .eq('sys_col_yn', 'N') // 이전 방식으로 저장된 시스템 칼럼(등록자·삭제여부 등)은 모델에서 제외 — 시스템 칼럼은 DDL 생성 때만
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
  const tables: DdlTbl[] = p.tables.map((t) => ({ ent_id: t.ent_id, tbl_nm: t.tbl_nm, tbl_desc: t.tbl_desc, auto_inc_yn: t.auto_inc_yn, cols: t.cols.map((c) => ({ ...c, col_desc: c.attr_id ? (lbl.get(c.attr_id) ?? null) : null })) }))
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

// 동기화 계획(S5) — 저장 모델 vs 현재 논리 변환
// 범위(sync) = 작성중 테이블 중 엔터티가 작성완료(또는 논리 삭제)인 것 — 논리 편집 중·물리 작성완료 테이블은 건드리지 않음. all = 전환된 테이블 전체(차이 보기), only = 테이블 1개
export async function syncPlan(areaId: string, prjId: string, p: NonNullable<Awaited<ReturnType<typeof loadPhy>>>, mode: 'sync' | 'all' = 'sync', only: string | null = null) {
  const info = await entInfoOf(p.tables.map((t) => t.ent_id))
  let prev = p.tables
  if (mode === 'sync') prev = prev.filter((t) => t.phy_sts_cd === 'WRT' && (info.get(t.ent_id)?.del_yn === 'Y' || info.get(t.ent_id)?.lgc_sts_cd === 'CMPTN'))
  if (only) prev = prev.filter((t) => t.phy_tbl_id === only)
  const prevEnts = new Set(prev.map((t) => t.ent_id))
  // FK 는 전환된 엔터티 전체로 계산(범위 밖 부모를 가리키는 FK 를 삭제로 오판하지 않게), 테이블·칼럼 변경은 범위 안만
  const plan = await phyPlan(areaId, prjId, p.mdl.dbms_cd as DbmsCd, new Set(p.tables.map((t) => t.ent_id)))
  if (!plan) return null
  const next = plan.tables.filter((t) => prevEnts.has(t.ent_id))
  const ops = planSync(prev as unknown as StoredTbl[], next)
  const have = new Map(p.fks.map((f) => [f.rel_id, f]))
  const want = new Set(plan.fks.map((f) => f.rel_id))
  const relChld = await relChldOf([...new Set([...p.fks.map((f) => f.rel_id), ...plan.fks.map((f) => f.rel_id)])])
  // FK 삭제·추가 = 범위 안 자식 테이블만
  const delFk = p.fks.filter((f) => !want.has(f.rel_id) && prevEnts.has(relChld.get(f.rel_id) ?? ''))
  const taken = new Set(p.fks.filter((f) => want.has(f.rel_id)).map((f) => f.fk_nm))
  const addFk = renumber(plan.fks.filter((f) => !have.has(f.rel_id) && prevEnts.has(relChld.get(f.rel_id) ?? '')), taken)
  return { why: plan.why, issues: plan.issues, capped: plan.capped, ops, addFk, delFk, scope: [...prevEnts] }
}

async function relChldOf(relIds: string[]) {
  const out = new Map<string, string>()
  for (let i = 0; i < relIds.length; i += TBL_CHUNK) {
    const r = await db().from('mdl_rel').select('rel_id, chld_ent_id').in('rel_id', relIds.slice(i, i + TBL_CHUNK))
    if (r.error) throw r.error
    for (const x of r.data as { rel_id: string; chld_ent_id: string }[]) out.set(x.rel_id, x.chld_ent_id)
  }
  return out
}

// FK 이름 재번호 — 변환 번호가 기존 FK 이름과 겹치면 같은 접두로 빈 번호
function renumber(fks: { rel_id: string; fk_nm: string }[], taken: Set<string>) {
  return fks.map((f) => {
    const base = f.fk_nm.replace(/_\d{2}$/, '')
    let nm = f.fk_nm
    for (let n = 1; taken.has(nm) && n < 100; n++) nm = `${base}_${String(n).padStart(2, '0')}`
    taken.add(nm)
    return { ...f, fk_nm: nm }
  })
}

// 엔터티 선택 전환(마스터 지시) — 물리 모델(프로젝트 × DBMS)이 없으면 만들고, 선택 엔터티(작성완료·미전환)의 테이블·칼럼·FK 추가
// FK 는 이미 전환된 엔터티와의 관계 포함, 단 자식 테이블이 작성완료(잠금)면 건너뜀(완료 취소 후 동기화로 추가)
export async function convertEntities(areaId: string, prjId: string, o: { dbms: DbmsCd; ltr: 'UPPER' | 'LOWER'; desc: string | null }, entIds: string[], uid: string) {
  const sys = { regr_id: uid, modr_id: uid }
  const ex = await db().from('mdl_phy_mdl').select('phy_mdl_id').eq('area_id', areaId).eq('prj_id', prjId).eq('dbms_cd', o.dbms).eq('del_yn', 'N').maybeSingle()
  if (ex.error) throw ex.error
  let mdlId = (ex.data as { phy_mdl_id: string } | null)?.phy_mdl_id ?? null
  const created = !mdlId
  const p0 = mdlId ? await loadPhy(areaId, mdlId) : null
  const have = new Set(p0?.tables.map((t) => t.ent_id) ?? [])
  const add = entIds.filter((e) => !have.has(e))
  if (!add.length) return { phy_mdl_id: mdlId, created: false, tbl: 0, fk: 0 }
  const plan = await phyPlan(areaId, prjId, o.dbms, new Set([...have, ...add]))
  if (!plan) return null
  if (!mdlId) {
    const m = await db().from('mdl_phy_mdl').insert({ area_id: areaId, prj_id: prjId, dbms_cd: o.dbms, idntfr_ltr_cd: o.ltr, del_col_use_yn: 'N', phy_mdl_desc: o.desc, ...sys }).select('phy_mdl_id').single()
    if (m.error) throw m.error
    mdlId = (m.data as { phy_mdl_id: string }).phy_mdl_id
  }
  const addSet = new Set(add)
  const tables = plan.tables.filter((t) => addSet.has(t.ent_id))
  let newTbl: string[] = [] // 보상용 — 이번에 넣은 테이블
  try {
    if (tables.length) {
      const t = await db().from('mdl_phy_tbl').insert(tables.map((x) => ({ area_id: areaId, phy_mdl_id: mdlId, ent_id: x.ent_id, tbl_nm: x.tbl_nm, tbl_desc: x.tbl_desc, ...sys }))).select('phy_tbl_id, ent_id')
      if (t.error) throw t.error
      const tid = new Map((t.data as { phy_tbl_id: string; ent_id: string }[]).map((x) => [x.ent_id, x.phy_tbl_id]))
      newTbl = [...tid.values()]
      const rows = tables.flatMap((x) => x.cols.map((y) => ({ area_id: areaId, phy_tbl_id: tid.get(x.ent_id), ...y, ...sys })))
      for (let i = 0; i < rows.length; i += 500) {
        const c = await db().from('mdl_phy_col').insert(rows.slice(i, i + 500))
        if (c.error) throw c.error
      }
    }
    const haveRel = new Set(p0?.fks.map((f) => f.rel_id) ?? [])
    const locked = new Set(p0?.tables.filter((t) => t.phy_sts_cd === 'CMPTN').map((t) => t.ent_id) ?? [])
    const relChld = await relChldOf(plan.fks.map((f) => f.rel_id))
    const fks = renumber(plan.fks.filter((f) => !haveRel.has(f.rel_id) && !locked.has(relChld.get(f.rel_id) ?? '')), new Set(p0?.fks.map((f) => f.fk_nm) ?? []))
    if (fks.length) {
      const r = await db().from('mdl_phy_fk').insert(fks.map((f) => ({ area_id: areaId, phy_mdl_id: mdlId, ...f, ...sys })))
      if (r.error) throw r.error
    }
    return { phy_mdl_id: mdlId, created, tbl: tables.length, fk: fks.length }
  } catch (e) {
    if (created && mdlId) await delPhy(mdlId, uid).catch((x) => console.error('[phy] 보상 삭제 실패', mdlId, x))
    else if (newTbl.length) {
      // 기존 모델에 추가하다 실패 — 이번 테이블·칼럼만 논리 삭제(칼럼 없는 테이블이 남아 재전환에서 빠지지 않게)
      const del = { del_yn: 'Y', del_dtm: new Date().toISOString(), modr_id: uid }
      await db().from('mdl_phy_col').update(del).in('phy_tbl_id', newTbl).eq('del_yn', 'N').then((r) => r.error && console.error('[phy] 보상 칼럼 삭제 실패', r.error))
      await db().from('mdl_phy_tbl').update(del).in('phy_tbl_id', newTbl).eq('del_yn', 'N').then((r) => r.error && console.error('[phy] 보상 테이블 삭제 실패', r.error))
    }
    throw e
  }
}

// 동기화 적용 — 모델 ver_no 를 먼저 올려 동시 동기화 차단, 주키 순서 고유 인덱스 충돌을 피해 2단계(주키 해제 → 최종값)
// ponytail: 다단 update(무트랜잭션) — 중간 실패 시 일부 반영, 다시 동기화하면 남은 차이만 반영됨
export async function syncPhy(areaId: string, mdlId: string, verNo: number, s: NonNullable<Awaited<ReturnType<typeof syncPlan>>>, uid: string) {
  const claim = await db().from('mdl_phy_mdl').update({ ver_no: verNo + 1, modr_id: uid }).eq('phy_mdl_id', mdlId).eq('area_id', areaId).eq('ver_no', verNo).eq('del_yn', 'N').select('phy_mdl_id')
  if (claim.error) throw claim.error
  if (!claim.data.length) return 'VERSION_CONFLICT' as const
  const now = new Date().toISOString()
  const del = { del_yn: 'Y', del_dtm: now, modr_id: uid }
  const sys = { regr_id: uid, modr_id: uid }
  const up = async (tb: string, set: Record<string, unknown>, k: string, id: string) => {
    const r = await db().from(tb).update({ ...set, modr_id: uid }).eq(k, id)
    if (r.error) throw r.error
  }
  const of = <K extends SyncOp['op']>(k: K) => s.ops.filter((o): o is Extract<SyncOp, { op: K }> => o.op === k)
  for (const o of of('DEL_COL')) await up('mdl_phy_col', del, 'phy_col_id', o.phy_col_id)
  for (const o of of('DEL_TBL')) {
    const c = await db().from('mdl_phy_col').update(del).eq('phy_tbl_id', o.phy_tbl_id).eq('del_yn', 'N')
    if (c.error) throw c.error
    await up('mdl_phy_tbl', del, 'phy_tbl_id', o.phy_tbl_id)
  }
  // 이름 변경 2단계 : 임시 이름(대문자·고유) → 최종 이름 — 맞바꿈(A↔B)·연쇄(A→B→C)·같은 이름 새 칼럼에서도 고유 인덱스 충돌 없음
  const tmp = (id: string) => `#TMP_${id.replace(/-/g, '').toUpperCase()}`
  for (const o of of('REN_TBL')) await up('mdl_phy_tbl', { tbl_nm: tmp(o.phy_tbl_id) }, 'phy_tbl_id', o.phy_tbl_id)
  for (const o of of('REN_TBL')) await up('mdl_phy_tbl', { tbl_nm: o.to }, 'phy_tbl_id', o.phy_tbl_id)
  const mods = of('MOD_COL')
  const renames = mods.filter((m) => m.from.col_nm !== m.to.col_nm)
  for (const o of renames) await up('mdl_phy_col', { col_nm: tmp(o.phy_col_id) }, 'phy_col_id', o.phy_col_id)
  for (const o of renames) await up('mdl_phy_col', { col_nm: o.to.col_nm }, 'phy_col_id', o.phy_col_id)
  for (const o of mods.filter((m) => m.from.pk_yn === 'Y')) await up('mdl_phy_col', { pk_yn: 'N', pk_seq: null }, 'phy_col_id', o.phy_col_id) // 1단계 : 주키 해제
  for (const o of of('SEQ')) await up('mdl_phy_col', { col_seq: o.col_seq }, 'phy_col_id', o.phy_col_id)
  const add = of('ADD_COL')
  if (add.length) {
    const r = await db().from('mdl_phy_col').insert(add.map((o) => ({ area_id: areaId, phy_tbl_id: o.phy_tbl_id, ...o.col, ...sys })))
    if (r.error) throw r.error
  }
  for (const o of mods) {
    const t = o.to
    await up('mdl_phy_col', { col_nm: t.col_nm, phy_tp_nm: t.phy_tp_nm, data_len: t.data_len, data_scale: t.data_scale, pk_yn: t.pk_yn, pk_seq: t.pk_seq, dom_id: t.dom_id, dom_ver_no: t.dom_ver_no, ...(t.pk_yn === 'Y' ? { null_yn: 'N' } : {}) }, 'phy_col_id', o.phy_col_id) // 2단계 : 최종값(순서·NULL·기본값 = 사용자 결정 유지)
  }
  for (const o of of('ADD_TBL')) {
    const t = await db().from('mdl_phy_tbl').insert({ area_id: areaId, phy_mdl_id: mdlId, ent_id: o.tbl.ent_id, tbl_nm: o.tbl.tbl_nm, tbl_desc: o.tbl.tbl_desc, ...sys }).select('phy_tbl_id').single()
    if (t.error) throw t.error
    const c = await db().from('mdl_phy_col').insert(o.tbl.cols.map((x) => ({ area_id: areaId, phy_tbl_id: (t.data as { phy_tbl_id: string }).phy_tbl_id, ...x, ...sys })))
    if (c.error) throw c.error
  }
  for (const f of s.delFk) await up('mdl_phy_fk', del, 'phy_fk_id', f.phy_fk_id)
  if (s.addFk.length) {
    const r = await db().from('mdl_phy_fk').insert(s.addFk.map((f) => ({ area_id: areaId, phy_mdl_id: mdlId, ...f, ...sys })))
    if (r.error) throw r.error
  }
  return { ops: s.ops.length, addFk: s.addFk.length, delFk: s.delFk.length }
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
