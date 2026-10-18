// 논리 → 물리 변환(순수, PRD_PiErd S2 P2~P4) — 엔터티 → 테이블, 속성(용어) → 칼럼, 도메인 → DBMS 타입(std_tp_map), PK·NOT NULL, 관계 → FK 이름, 시스템 칼럼 맨 끝
// 진입 관문 = 논리 점검 통과(N:M 0·FK 누락 0·수정 필요 이슈 0·주식별자 누락 0). 이름은 대문자로 저장하고 대소문자는 DDL 생성 시점에 적용(PRD §3 원칙 4)
// diff = 저장된 물리 모델과 새 변환 결과 비교(추가·삭제·변경 + 도메인 버전 변경 = 영향 칼럼)
import { DBMS_PRFL, type DbmsCd } from './dbms.ts'

export interface PhyDom {
  dom_id: string
  ver_no: number
  lgc_tp_cd: string
  data_len: number | null
  data_scale: number | null
}
export interface PhyAttrIn {
  attr_id: string
  term_phy_nm: string
  pk_yn: string
  pk_seq: number | null
  esntl_yn: string
  dom: PhyDom | null
}
export interface PhyEntIn {
  ent_id: string
  tbl_phy_nm: string
  ent_desc?: string | null
  attrs: PhyAttrIn[]
}
export interface PhyRelIn {
  rel_id: string
  prnt_ent_id: string
  chld_ent_id: string
  crdn_cd: string
}
export interface TpMap {
  lgc_tp_cd: string | null
  phy_tp_nm: string
  len_use_yn: string
}
export interface PhyCol {
  attr_id: string | null
  sys_col_yn: 'Y' | 'N'
  col_nm: string
  col_seq: number
  dom_id: string | null
  dom_ver_no: number | null
  phy_tp_nm: string
  data_len: number | null
  data_scale: number | null
  null_yn: 'Y' | 'N'
  bsc_val_txt: string | null
  pk_yn: 'Y' | 'N'
  pk_seq: number | null
}
export interface PhyTbl {
  ent_id: string
  tbl_nm: string
  tbl_desc: string | null
  cols: PhyCol[]
}
export interface PhyFk {
  rel_id: string
  fk_nm: string
}

// 시스템 칼럼(마스터 지시 2026-10-17) — 4개, 이름 = 표준용어(마스터 지정 정본, 임의 조합 금지) : 최종수정일시 LST_MDDTM·최종수정자ID LST_MDFR_ID·최종등록일시 LST_RGDTM·최종등록자ID LST_RGTR_ID(이 순서로 맨 끝)
//  논리 엔터티·물리 모델·ERD 에는 없고 DDL 생성 때만 테이블 맨 끝에 자동 추가. 삭제여부·삭제일시는 시스템 칼럼이 아님(필요하면 논리 모델 속성으로)
// ponytail: 코드 상수 — 분류체계별 이름·타입 편집 요구가 생기면 테이블화
type SysDef = [nm: string, lgc: string, tp: string, dflt: string]
const SYS_PG: SysDef[] = [
  ['LST_MDDTM', '최종수정일시', 'TIMESTAMPTZ', 'CURRENT_TIMESTAMP'],
  ['LST_MDFR_ID', '최종수정자ID', 'VARCHAR(50)', "'ADMIN'"],
  ['LST_RGDTM', '최종등록일시', 'TIMESTAMPTZ', 'CURRENT_TIMESTAMP'],
  ['LST_RGTR_ID', '최종등록자ID', 'VARCHAR(50)', "'ADMIN'"],
]
const SYS_ORA: SysDef[] = [
  ['LST_MDDTM', '최종수정일시', 'TIMESTAMP', 'SYSTIMESTAMP'],
  ['LST_MDFR_ID', '최종수정자ID', 'VARCHAR2(50)', "'ADMIN'"],
  ['LST_RGDTM', '최종등록일시', 'TIMESTAMP', 'SYSTIMESTAMP'],
  ['LST_RGTR_ID', '최종등록자ID', 'VARCHAR2(50)', "'ADMIN'"],
]
export const sysCols = (dbms: DbmsCd): SysDef[] => (dbms === '0014' ? SYS_PG : SYS_ORA)
export const SYS_COL_NMS = new Set(SYS_PG.map((x) => x[0]))
// 예약어(PostgreSQL·Oracle 공통 주요어) — DDL 은 무인용 식별자라 예약어 이름이면 CREATE 실패 → 변환 이슈로 막음
// ponytail: 주요 예약어만 — 전체 목록(PG 키워드 표·Oracle V$RESERVED_WORDS)이 필요하면 DBMS 프로파일로
export const RSV_WORDS = new Set('ACCESS ADD ALL ALTER AND ANY AS ASC AUDIT BETWEEN BY CASE CHECK CLUSTER COLUMN COMMENT CONSTRAINT CREATE CURRENT DATE DEFAULT DELETE DESC DISTINCT DROP ELSE END EXISTS FILE FOR FOREIGN FROM GRANT GROUP HAVING IN INDEX INSERT INTO IS LEVEL LIKE LIMIT LOCK MODE NOT NULL NUMBER OF OFFSET ON OR ORDER PRIMARY REFERENCES RESOURCE ROW ROWNUM ROWS SELECT SESSION SET SIZE START TABLE THEN TIMESTAMP TO TRIGGER UID UNION UNIQUE UPDATE USER VALUES VIEW WHEN WHERE WITH'.split(' '))

// 이름 규칙(P4) : PK = PostgreSQL <테이블>_PKEY / Oracle·Tibero PK_<테이블>, FK = FK_<자식테이블>_NN — 한도 초과 시 테이블 부분을 자름
export const pkName = (dbms: DbmsCd, tbl: string) => cut(dbms === '0014' ? `${tbl}_PKEY` : `PK_${tbl}`, DBMS_PRFL[dbms].identMax, dbms === '0014' ? '_PKEY' : '')
// PK 생성 순서(마스터 지시 2026-10-18) : 유일 인덱스(이름 = PK 제약명) 먼저 → 그 인덱스로 PK 제약
//  PostgreSQL ADD CONSTRAINT … PRIMARY KEY USING INDEX / Oracle·Tibero ADD CONSTRAINT … PRIMARY KEY (칼럼) USING INDEX 인덱스(Tibero 지원 [확인중 : 티베로 기술지원])
export function pkStmts(dbms: DbmsCd, tbl: string, cols: string[], nm: (s: string) => string): string[] {
  const k = nm(pkName(dbms, tbl)), t = nm(tbl), c = cols.map(nm).join(', ')
  return [`CREATE UNIQUE INDEX ${k} ON ${t} (${c});`, dbms === '0014' ? `ALTER TABLE ${t} ADD CONSTRAINT ${k} PRIMARY KEY USING INDEX ${k};` : `ALTER TABLE ${t} ADD CONSTRAINT ${k} PRIMARY KEY (${c}) USING INDEX ${k};`]
}
const cut = (nm: string, max: number, keepSfx = '') => (nm.length <= max ? nm : nm.slice(0, max - keepSfx.length) + keepSfx)
export const fkName = (dbms: DbmsCd, chldTbl: string, n: number) => {
  const sfx = `_${String(n).padStart(2, '0')}`
  return `FK_${chldTbl}`.slice(0, DBMS_PRFL[dbms].identMax - sfx.length) + sfx
}

// 진입 관문 — 논리 점검 요약(checkLogical)과 관계에서 막는 사유 목록(빈 배열 = 통과)
export function phyGate(sum: { no_pk: number; fk_missing: number; issues: number }, rels: { crdn_cd: string }[], entCnt: number): string[] {
  const why: string[] = []
  if (!entCnt) why.push('엔터티가 없습니다')
  if (sum.no_pk) why.push(`주식별자 없는 엔터티 ${sum.no_pk}개`)
  if (sum.fk_missing) why.push(`FK 상속 누락 ${sum.fk_missing}건`)
  const nm = rels.filter((r) => r.crdn_cd === 'NM').length
  if (nm) why.push(`N:M 관계 ${nm}건(해소 필요)`)
  if (sum.issues) why.push(`수정 필요 점검 이슈 ${sum.issues}건`)
  return why
}

// 변환 — 칼럼 순서 = PK(pk_seq) → 나머지(입력 순서). 시스템 칼럼은 넣지 않음(DDL 생성 때만). 타입 매핑이 없으면 issue(변환은 계속, 타입 '[TBD]')
export function toPhysical(ents: PhyEntIn[], rels: PhyRelIn[], tpMap: TpMap[], opt: { dbms: DbmsCd }) {
  const issues: string[] = []
  const tp = new Map<string, TpMap>()
  for (const m of tpMap) if (m.lgc_tp_cd && !tp.has(m.lgc_tp_cd)) tp.set(m.lgc_tp_cd, m)
  const max = DBMS_PRFL[opt.dbms].identMax
  const tables: PhyTbl[] = ents.map((e) => {
    const ordered = [...e.attrs.filter((a) => a.pk_yn === 'Y').sort((a, b) => (a.pk_seq ?? 0) - (b.pk_seq ?? 0)), ...e.attrs.filter((a) => a.pk_yn !== 'Y')]
    const cols: PhyCol[] = ordered.map((a, i) => {
      const m = a.dom ? tp.get(a.dom.lgc_tp_cd) : undefined
      if (!a.dom) issues.push(`${e.tbl_phy_nm}.${a.term_phy_nm} : 용어 도메인 없음`)
      else if (!m) issues.push(`${e.tbl_phy_nm}.${a.term_phy_nm} : DBMS 타입 매핑 없음(논리타입 ${a.dom.lgc_tp_cd})`)
      if (SYS_COL_NMS.has(a.term_phy_nm.toUpperCase())) issues.push(`${e.tbl_phy_nm}.${a.term_phy_nm} : 시스템 칼럼과 이름이 같습니다(DDL 생성 때 자동 추가되므로 속성에서 빼십시오)`)
      if (RSV_WORDS.has(a.term_phy_nm.toUpperCase())) issues.push(`${e.tbl_phy_nm}.${a.term_phy_nm} : SQL 예약어라 칼럼명으로 쓸 수 없습니다(표준용어 물리명 조정)`)
      if (a.term_phy_nm.length > max) issues.push(`${e.tbl_phy_nm}.${a.term_phy_nm} : 칼럼명 ${a.term_phy_nm.length}자 > 한도 ${max}`)
      if (ordered.findIndex((x) => x.term_phy_nm.toUpperCase() === a.term_phy_nm.toUpperCase()) !== i) issues.push(`${e.tbl_phy_nm}.${a.term_phy_nm} : 칼럼명 중복(다른 용어가 같은 물리명)`)
      const useLen = m?.len_use_yn === 'Y'
      return {
        attr_id: a.attr_id,
        sys_col_yn: 'N',
        col_nm: a.term_phy_nm.toUpperCase(),
        col_seq: i + 1,
        dom_id: a.dom?.dom_id ?? null,
        dom_ver_no: a.dom?.ver_no ?? null,
        phy_tp_nm: m?.phy_tp_nm ?? '[TBD]',
        data_len: useLen ? (a.dom?.data_len ?? null) : null,
        data_scale: useLen ? (a.dom?.data_scale ?? null) : null,
        null_yn: a.pk_yn === 'Y' || a.esntl_yn === 'Y' ? 'N' : 'Y',
        bsc_val_txt: null,
        pk_yn: a.pk_yn === 'Y' ? 'Y' : 'N',
        pk_seq: a.pk_yn === 'Y' ? i + 1 : null, // PK 가 앞에 정렬돼 있으므로 순번 = 위치(입력 pk_seq 중복·누락 방지)
      }
    })
    if (RSV_WORDS.has(e.tbl_phy_nm.toUpperCase())) issues.push(`${e.tbl_phy_nm} : SQL 예약어라 테이블명으로 쓸 수 없습니다`)
    if (e.tbl_phy_nm.length > max) issues.push(`${e.tbl_phy_nm} : 테이블명 ${e.tbl_phy_nm.length}자 > 한도 ${max}`)
    return { ent_id: e.ent_id, tbl_nm: e.tbl_phy_nm.toUpperCase(), tbl_desc: e.ent_desc ?? null, cols }
  })
  const tblOf = new Map(tables.map((t) => [t.ent_id, t.tbl_nm])) // 대문자(저장 CHECK)
  const seq = new Map<string, number>()
  const fks: PhyFk[] = []
  for (const r of rels) {
    const c = tblOf.get(r.chld_ent_id)
    if (!c || !tblOf.has(r.prnt_ent_id) || r.crdn_cd === 'NM') continue
    const n = (seq.get(c) ?? 0) + 1
    seq.set(c, n)
    fks.push({ rel_id: r.rel_id, fk_nm: fkName(opt.dbms, c, n) })
  }
  const dup = fks.filter((f, i) => fks.findIndex((x) => x.fk_nm === f.fk_nm) !== i)
  for (const f of dup) issues.push(`FK명 중복 ${f.fk_nm} : 테이블명을 줄이십시오`)
  return { tables, fks, issues }
}

// ponytail: FK 추가·삭제는 diff 미포함(관계 변경분은 S5 ALTER DDL 에서)
// diff — 저장된 물리 테이블(prev) vs 새 변환(next). 순서·NULL·기본값은 사용자 결정값이라 비교하지 않음(이름·타입·PK 만 '변경'), 도메인 영향은 별도 목록
export interface PhyDiff {
  add_tbl: string[]
  del_tbl: string[]
  chg_tbl: string[] // 테이블명 변경(이전 → 현재)
  add_col: string[]
  del_col: string[]
  chg_col: string[]
  dom_chg: string[]
}
export function phyDiff(prev: PhyTbl[], next: PhyTbl[]): PhyDiff {
  const d: PhyDiff = { add_tbl: [], del_tbl: [], chg_tbl: [], add_col: [], del_col: [], chg_col: [], dom_chg: [] }
  const pm = new Map(prev.map((t) => [t.ent_id, t]))
  const nm = new Map(next.map((t) => [t.ent_id, t]))
  for (const t of next) if (!pm.has(t.ent_id)) d.add_tbl.push(t.tbl_nm)
  for (const t of prev) if (!nm.has(t.ent_id)) d.del_tbl.push(t.tbl_nm)
  for (const n of next) {
    const p = pm.get(n.ent_id)
    if (!p) continue
    if (p.tbl_nm !== n.tbl_nm) d.chg_tbl.push(`${p.tbl_nm} → ${n.tbl_nm}`)
    const key = (c: PhyCol) => c.attr_id ?? `SYS:${c.col_nm}`
    const pc = new Map(p.cols.map((c) => [key(c), c]))
    const ncs = new Map(n.cols.map((c) => [key(c), c]))
    for (const c of n.cols) {
      const o = pc.get(key(c))
      if (!o) d.add_col.push(`${n.tbl_nm}.${c.col_nm}`)
      else {
        // 도메인 영향 : 버전 차이는 1차 거르기(설명만 고쳐도 올라감), 최종 = 타입·길이·소수점이 실제로 달라졌는지(DA 검토 ③)
        const shape = o.phy_tp_nm !== c.phy_tp_nm || o.data_len !== c.data_len || o.data_scale !== c.data_scale
        const domHit = o.dom_id !== c.dom_id || (o.dom_ver_no !== c.dom_ver_no && shape)
        if (domHit) d.dom_chg.push(`${n.tbl_nm}.${c.col_nm}`)
        if (o.col_nm !== c.col_nm || o.pk_yn !== c.pk_yn || o.pk_seq !== c.pk_seq || (shape && !domHit)) d.chg_col.push(`${n.tbl_nm}.${c.col_nm}`) // 도메인 영향과 별개로 표시
      }
    }
    for (const c of p.cols) if (!ncs.has(key(c))) d.del_col.push(`${p.tbl_nm}.${c.col_nm}`)
  }
  return d
}

// 칼럼 그리드 편집 검증(P5) — 한 테이블의 편집 묶음(순서·NULL·기본값)을 적용한 결과로 판정, 오류 코드 또는 null
// 기본값은 DDL DEFAULT 에 그대로 들어가므로 허용 목록만(숫자·작은따옴표 문자열·키워드) — 인젝션 차단
const BSC_RE = /^(-?\d{1,18}(\.\d{1,18})?|'(?:[^'&\p{Cc}\p{Zl}\p{Zp}]|'')*'|CURRENT_TIMESTAMP|CURRENT_DATE)$/iu // 문자열 안 제어문자·줄바꿈·&(SQL*Plus 치환) 금지
const BSC_KW: Record<DbmsCd, RegExp> = { '0014': /^(TRUE|FALSE)$/i, '0001': /^(SYSDATE|SYSTIMESTAMP)$/i, '0013': /^(SYSDATE|SYSTIMESTAMP)$/i } // DBMS 전용 키워드
export const bscOk = (v: string | null, dbms: DbmsCd) => v === null || (v.length <= 200 && (BSC_RE.test(v) || BSC_KW[dbms].test(v)))
export interface ColEdit {
  phy_col_id: string
  col_seq?: number
  null_yn?: 'Y' | 'N'
  bsc_val_txt?: string | null
}
export function checkColEdits(cols: (PhyCol & { phy_col_id: string })[], edits: ColEdit[], dbms: DbmsCd): 'PHY_COL_INVALID' | 'PHY_COL_DEFAULT' | 'PHY_COL_PK_NULL' | 'PHY_COL_SYS' | 'PHY_COL_SEQ' | null {
  const by = new Map(cols.map((c) => [c.phy_col_id, { ...c }]))
  if (new Set(edits.map((e) => e.phy_col_id)).size !== edits.length) return 'PHY_COL_INVALID' // 같은 칼럼 중복 편집(부분 반영 방지)
  for (const e of edits) {
    const c = by.get(e.phy_col_id)
    if (!c) return 'PHY_COL_INVALID'
    if (c.sys_col_yn === 'Y' && (e.col_seq !== undefined || e.null_yn !== undefined || e.bsc_val_txt !== undefined)) return 'PHY_COL_SYS' // 시스템 칼럼은 고정
    if (e.bsc_val_txt !== undefined && !bscOk(e.bsc_val_txt, dbms)) return 'PHY_COL_DEFAULT'
    Object.assign(c, Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)))
    if (c.pk_yn === 'Y' && c.null_yn === 'Y') return 'PHY_COL_PK_NULL'
  }
  const all = [...by.values()]
  const seqs = all.map((c) => c.col_seq)
  if (new Set(seqs).size !== seqs.length || seqs.some((s) => !Number.isInteger(s) || s < 1)) return 'PHY_COL_SEQ'
  const maxNormal = Math.max(0, ...all.filter((c) => c.sys_col_yn !== 'Y').map((c) => c.col_seq))
  if (all.some((c) => c.sys_col_yn === 'Y' && c.col_seq < maxNormal)) return 'PHY_COL_SEQ' // 시스템 칼럼은 맨 끝
  return null
}
