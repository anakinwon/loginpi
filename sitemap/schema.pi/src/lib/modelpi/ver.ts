// 모델 버전 스냅샷·비교(순수, PRD_PiErd S5 ERD-4, sql/065 mdl_ver) — 논리 모델(로더 출력) → 저장용 축약 스냅샷, 두 스냅샷 → 추가·삭제·변경 목록
// 비교 키 = ID(엔터티·속성·관계) : 이름만 바뀐 것은 "변경"으로, 지웠다 다시 만든 것은 "삭제 + 추가"로 보인다
import type { LEnt, LRel } from './normalize.ts'

export interface SnapAttr {
  attr_id: string
  term_log_nm: string
  term_phy_nm: string
  dom_nm: string | null
  pk_yn: string
  pk_seq: number | null
  esntl_yn: string
  fk_rel_id: string | null
  attr_desc: string | null
}
export interface SnapEnt {
  ent_id: string
  ent_log_nm: string
  tbl_phy_nm: string
  ent_tp_cd: string
  subj_nm: string
  ent_desc: string | null
  attrs: SnapAttr[]
}
export type SnapRel = Pick<LRel, 'rel_id' | 'prnt_ent_id' | 'chld_ent_id' | 'rel_nm' | 'crdn_cd' | 'idnt_yn' | 'prnt_opt_yn' | 'chld_opt_yn'> & { rel_desc: string | null }
export interface Snap {
  ents: SnapEnt[]
  rels: SnapRel[]
}

export type DiffOp = 'INS' | 'DEL' | 'UPD'
export interface DiffChg {
  fld: string
  bfr: unknown
  aftr: unknown
}
export interface DiffItem {
  op: DiffOp
  id: string
  ent_nm: string // 엔터티 = 자기 이름, 속성 = 소속 엔터티, 관계 = 부모 엔터티
  ent_id?: string // 속성만 — 소속 엔터티(ERD 에 삭제된 속성 수 표시)
  nm: string // 엔터티·속성 = 논리명, 관계 = "부모 → 자식 (관계명)"
  chg?: DiffChg[]
}
export interface Diff {
  ents: DiffItem[]
  attrs: DiffItem[]
  rels: DiffItem[]
}

// 비교 항목 = 화면에 보여 줄 의미 있는 값(표시 순서·버전번호·등록일시 제외 — 저장만 다시 해도 변경으로 잡히지 않게)
const ENT_F = ['ent_log_nm', 'tbl_phy_nm', 'ent_tp_cd', 'subj_nm', 'ent_desc'] as const
const ATTR_F = ['term_log_nm', 'term_phy_nm', 'dom_nm', 'pk_yn', 'pk_seq', 'esntl_yn', 'fk_rel_id', 'attr_desc'] as const
const REL_F = ['prnt_ent_id', 'chld_ent_id', 'rel_nm', 'crdn_cd', 'idnt_yn', 'prnt_opt_yn', 'chld_opt_yn', 'rel_desc'] as const

export function toSnap(ents: LEnt[], rels: LRel[]): Snap {
  return {
    ents: ents.map((e) => ({
      ent_id: e.ent_id,
      ent_log_nm: e.ent_log_nm,
      tbl_phy_nm: e.tbl_phy_nm,
      ent_tp_cd: e.ent_tp_cd,
      subj_nm: e.subj_nm,
      ent_desc: e.ent_desc ?? null,
      attrs: e.attrs.map((a) => ({ attr_id: a.attr_id, term_log_nm: a.term_log_nm, term_phy_nm: a.term_phy_nm, dom_nm: a.dom_nm, pk_yn: a.pk_yn, pk_seq: a.pk_seq, esntl_yn: a.esntl_yn, fk_rel_id: a.fk_rel_id, attr_desc: a.attr_desc ?? null })),
    })),
    rels: rels.map((r) => ({ rel_id: r.rel_id, prnt_ent_id: r.prnt_ent_id, chld_ent_id: r.chld_ent_id, rel_nm: r.rel_nm, crdn_cd: r.crdn_cd, idnt_yn: r.idnt_yn, prnt_opt_yn: r.prnt_opt_yn, chld_opt_yn: r.chld_opt_yn, rel_desc: r.rel_desc ?? null })),
  }
}

export const snapCnt = (s: Snap) => ({ ent_cnt: s.ents.length, attr_cnt: s.ents.reduce((n, e) => n + e.attrs.length, 0), rel_cnt: s.rels.length })

const norm = (v: unknown) => (v === undefined || v === '' ? null : v)
function chgOf<T>(a: T, b: T, fs: readonly (keyof T)[]): DiffChg[] {
  return fs.filter((f) => norm(a[f]) !== norm(b[f])).map((f) => ({ fld: String(f), bfr: norm(a[f]), aftr: norm(b[f]) }))
}
// ID 기준 대조 — 앞(a)에만 = 삭제, 뒤(b)에만 = 추가, 둘 다 + 값 차이 = 변경
function cmp<T>(a: T[], b: T[], key: (x: T) => string, fs: readonly (keyof T)[], item: (x: T, op: DiffOp) => Omit<DiffItem, 'op' | 'chg'>): DiffItem[] {
  const am = new Map(a.map((x) => [key(x), x]))
  const bm = new Map(b.map((x) => [key(x), x]))
  const out: DiffItem[] = []
  for (const x of a) if (!bm.has(key(x))) out.push({ op: 'DEL', ...item(x, 'DEL') })
  for (const y of b) {
    const x = am.get(key(y))
    if (!x) out.push({ op: 'INS', ...item(y, 'INS') })
    else {
      const chg = chgOf(x, y, fs)
      if (chg.length) out.push({ op: 'UPD', ...item(y, 'UPD'), chg })
    }
  }
  return out
}

// a = 기준(이전), b = 대상(이후)
export function diffSnap(a: Snap, b: Snap): Diff {
  const entNm = new Map([...a.ents, ...b.ents].map((e) => [e.ent_id, e.ent_log_nm])) // 뒤 버전 이름 우선
  const ents = cmp(a.ents, b.ents, (e) => e.ent_id, ENT_F, (e) => ({ id: e.ent_id, ent_nm: e.ent_log_nm, nm: e.ent_log_nm }))
  // 속성 : 양쪽 모두 있는 엔터티만(엔터티 자체 추가·삭제는 엔터티 목록에서 속성 수로 보임)
  const bEnt = new Map(b.ents.map((e) => [e.ent_id, e]))
  const attrs = a.ents.flatMap((ea) => {
    const eb = bEnt.get(ea.ent_id)
    return eb ? cmp(ea.attrs, eb.attrs, (t) => t.attr_id, ATTR_F, (t) => ({ id: t.attr_id, ent_nm: eb.ent_log_nm, ent_id: eb.ent_id, nm: t.term_log_nm })) : []
  })
  const relNm = (r: SnapRel) => `${entNm.get(r.prnt_ent_id) ?? '?'} → ${entNm.get(r.chld_ent_id) ?? '?'}${r.rel_nm ? ` (${r.rel_nm})` : ''}`
  const rels = cmp(a.rels, b.rels, (r) => r.rel_id, REL_F, (r) => ({ id: r.rel_id, ent_nm: entNm.get(r.prnt_ent_id) ?? '?', nm: relNm(r) }))
  // 관계의 부모·자식 변경은 ID 대신 엔터티 이름으로 보여 준다
  for (const d of rels) for (const c of d.chg ?? []) if (c.fld === 'prnt_ent_id' || c.fld === 'chld_ent_id') Object.assign(c, { bfr: entNm.get(c.bfr as string) ?? c.bfr, aftr: entNm.get(c.aftr as string) ?? c.aftr })
  return { ents, attrs, rels }
}

export const diffCnt = (d: Diff) => {
  const all = [...d.ents, ...d.attrs, ...d.rels]
  return { ins: all.filter((x) => x.op === 'INS').length, del: all.filter((x) => x.op === 'DEL').length, upd: all.filter((x) => x.op === 'UPD').length }
}

// ERD 표시 지도(ERD-4 화면 표시) — 캔버스는 현재 모델이라 추가·변경은 해당 엔터티·속성·관계에 색, 삭제는 캔버스에 없으므로 건수로만(속성 삭제는 소속 엔터티에 개수)
export interface VerMark {
  ent: Record<string, DiffOp>
  attr: Record<string, DiffOp>
  rel: Record<string, DiffOp>
  delAttr: Record<string, number> // 엔터티ID → 삭제된 속성 수
  delEnt: number
  delRel: number
}
export function toMark(d: Diff): VerMark {
  const m: VerMark = { ent: {}, attr: {}, rel: {}, delAttr: {}, delEnt: 0, delRel: 0 }
  for (const x of d.ents) x.op === 'DEL' ? m.delEnt++ : (m.ent[x.id] = x.op)
  for (const x of d.rels) x.op === 'DEL' ? m.delRel++ : (m.rel[x.id] = x.op)
  for (const x of d.attrs) {
    if (x.op !== 'DEL') m.attr[x.id] = x.op
    else if (x.ent_id) m.delAttr[x.ent_id] = (m.delAttr[x.ent_id] ?? 0) + 1
    // 속성만 바뀐 엔터티도 변경으로 표시(엔터티 자체 추가는 그대로 추가)
    if (x.ent_id && !m.ent[x.ent_id]) m.ent[x.ent_id] = 'UPD'
  }
  return m
}
