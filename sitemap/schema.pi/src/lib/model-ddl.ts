// DDL 생성 화면(서버, 마스터 지시 2026-10-18) — 프로젝트 > 물리 모델(DBMS) > 주제영역 > 테이블 선택 → DDL 미리보기·내려받기(이후 실행 요청의 스냅샷)
// 대상 = 테이블 작성완료 ∩ 엔터티가 자기 주제영역의 작성완료 ERD(sql/037) 에 배치됨. ERD 하나를 모든 DBMS 물리 모델이 공유
// 식별자 검증(차단, fail-closed) : 테이블·칼럼 이름 = 영문 시작 영문·숫자·_ 와 DBMS 최대 길이, 데이터 타입 = 영문·숫자·공백, 예약어 — 직접 실행 전 SQL 삽입 차단
import { createHash } from 'node:crypto'
import { db } from './db'
import { loadPhy, phyDdlInput } from './model-phy'
import { genDdl } from './modelpi/ddl'
import { splitStatements } from './modelpi/ddl-parse'
import { DBMS_PRFL, type DbmsCd } from './modelpi/dbms'
import { RSV_WORDS } from './modelpi/phy'

export interface DdlTarget {
  phy_tbl_id: string
  ent_id: string
  tbl_nm: string
  subj_id: string
  phy_sts_cd: string
  ok: boolean
  why: string | null // 선택 불가 사유
}

export async function ddlTargets(areaId: string, prjId: string, mdlId: string) {
  const p = await loadPhy(areaId, mdlId)
  if (!p || p.mdl.prj_id !== prjId) return null
  const [s, e, d] = await Promise.all([
    db().from('mdl_subj').select('subj_id, subj_nm').eq('area_id', areaId).eq('prj_id', prjId).eq('del_yn', 'N').order('subj_nm'),
    db().from('mdl_ent').select('ent_id, subj_id').eq('area_id', areaId).eq('prj_id', prjId).eq('del_yn', 'N').limit(5000),
    db().from('mdl_dgm').select('dgm_id, subj_id').eq('area_id', areaId).eq('prj_id', prjId).eq('dgm_sts_cd', 'CMPTN').eq('del_yn', 'N').not('subj_id', 'is', null),
  ])
  for (const x of [s, e, d]) if (x.error) throw x.error
  const dgms = d.data as { dgm_id: string; subj_id: string }[]
  const de = dgms.length ? await db().from('mdl_dgm_ent').select('dgm_id, ent_id').in('dgm_id', dgms.map((x) => x.dgm_id)).eq('del_yn', 'N').limit(10000) : { data: [], error: null }
  if (de.error) throw de.error
  const dgmSubj = new Map(dgms.map((x) => [x.dgm_id, x.subj_id]))
  const placed = new Set((de.data as { dgm_id: string; ent_id: string }[]).map((x) => `${dgmSubj.get(x.dgm_id)}|${x.ent_id}`)) // 주제영역|엔터티(자기 주제영역 ERD 만 인정)
  const doneSubj = new Set(dgms.map((x) => x.subj_id))
  const subjOf = new Map((e.data as { ent_id: string; subj_id: string }[]).map((x) => [x.ent_id, x.subj_id]))
  const tables: DdlTarget[] = p.tables.map((t) => {
    const sj = subjOf.get(t.ent_id) ?? ''
    const why = !sj ? '엔터티가 삭제됨' : t.phy_sts_cd !== 'CMPTN' ? '테이블 작성중' : !doneSubj.has(sj) ? 'ERD 작성완료 필요' : !placed.has(`${sj}|${t.ent_id}`) ? 'ERD 에 없음' : null
    return { phy_tbl_id: t.phy_tbl_id, ent_id: t.ent_id, tbl_nm: t.tbl_nm, subj_id: sj, phy_sts_cd: t.phy_sts_cd, ok: !why, why }
  })
  const subjs = (s.data as { subj_id: string; subj_nm: string }[]).map((x) => ({ ...x, dgm_done: doneSubj.has(x.subj_id), n: tables.filter((t) => t.subj_id === x.subj_id).length }))
  return { mdl: p.mdl, subjs, tables, p }
}

const ID_RE = /^[A-Za-z][A-Za-z0-9_]*$/
const TP_RE = /^[A-Za-z][A-Za-z0-9 ]*$/

// 선택 테이블 DDL — 문장·해시(실행 요청 스냅샷 대조용)·차단 사유. 차단이 하나라도 있으면 실행 요청 불가(미리보기·내려받기는 가능)
export async function buildDdl(areaId: string, prjId: string, mdlId: string, tblIds: string[]) {
  const tg = await ddlTargets(areaId, prjId, mdlId)
  if (!tg) return null
  const want = new Set(tblIds)
  const sel = tg.tables.filter((t) => want.has(t.phy_tbl_id))
  const blockers: string[] = []
  if (sel.length !== want.size) blockers.push('이 물리 모델의 테이블이 아닌 항목이 있습니다')
  for (const t of sel) if (!t.ok) blockers.push(`${t.tbl_nm} : ${t.why}`)
  const x = await phyDdlInput(areaId, prjId, tg.p)
  if (!x) return null
  const only = new Set(sel.filter((t) => t.ok).map((t) => t.ent_id))
  const max = DBMS_PRFL[tg.mdl.dbms_cd as DbmsCd]?.identMax ?? 30
  const idBad = (n: string) => !ID_RE.test(n) || n.length > max || RSV_WORDS.has(n.toUpperCase())
  for (const t of x.d.tables.filter((t) => only.has(t.ent_id))) {
    if (idBad(t.tbl_nm)) blockers.push(`테이블 이름 ${t.tbl_nm} : 영문·숫자·_ ${max}자 이내, 예약어 불가`)
    for (const c of t.cols) {
      if (idBad(c.col_nm)) blockers.push(`${t.tbl_nm}.${c.col_nm} : 칼럼 이름(영문·숫자·_ ${max}자 이내, 예약어 불가)`)
      if (!TP_RE.test(c.phy_tp_nm)) blockers.push(`${t.tbl_nm}.${c.col_nm} : 데이터 타입 ${c.phy_tp_nm}`)
    }
  }
  const ddl = only.size ? genDdl(x.d, { prjNm: x.prjNm, at: new Date().toISOString().slice(0, 16).replace('T', ' ') }, { only }) : ''
  const stmts = splitStatements(ddl)
  // 해시 = 실행 문장(주석 제외) 기준 — 생성 시각 주석이 달라도 같은 모델이면 같은 값
  const hash = createHash('sha256').update(stmts.join(';\n')).digest('hex')
  return { ddl, stmts, hash, blockers, dbms_cd: tg.mdl.dbms_cd as DbmsCd, tbl_cnt: only.size }
}
