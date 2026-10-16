// ModelPi 개념모델 추천(순수, MASTER_ROADMAP §6 반자동 2단계) — 프로젝트 업종 템플릿 → 주제영역·핵심 엔터티·관계 후보
// 반자동 : 후보만 만들고 저장하지 않는다(사용자가 골라 기존 등록 API 로 저장 → 이름 규칙·감사 이력 그대로)
// 표준 선행 : 이름은 승인완료 표준단어로 완전 분해될 때만 "바로 등록 가능"(ok), 미등록 단어는 missing_words 로 돌려 표준단어 신청을 안내
import { splitTerm } from '../term-split.ts'
import { entNameError, entNames, subjAbbrCands, type EntTp, type EntWord } from '../model-name.ts'
import { entKey, type IndstryTmpl } from './template.ts'

// 이름 → 표준단어 분해(최장 일치 첫 후보). 미등록 구간은 missing
export function resolveName(name: string, dict: EntWord[]) {
  const segs = splitTerm(name, dict)[0] ?? []
  const words = segs.flatMap((s) => ('word' in s ? [s.word as EntWord] : []))
  const missing = segs.flatMap((s) => ('unknown' in s ? [s.unknown as string] : []))
  return { words, missing: segs.length ? missing : [name] }
}

export interface SubjRec {
  nm: string
  eng: string
  abbr: string
  desc: string
  std_ok: boolean
  missing_words: string[]
}
// 주제영역 후보 — 템플릿 주제영역 중 프로젝트에 없는 이름, 약어는 템플릿 값 → 영문 규칙 후보 순으로 프로젝트에서 안 쓰는 것
export function recommendSubjects(t: IndstryTmpl, existing: { subj_nm: string; subj_abbr_nm: string }[], dict: EntWord[]): SubjRec[] {
  const names = new Set(existing.map((s) => s.subj_nm))
  const taken = new Set(existing.map((s) => s.subj_abbr_nm))
  const out: SubjRec[] = []
  for (const s of t.subjects) {
    if (names.has(s.nm)) continue
    const abbr = [s.abbr, ...subjAbbrCands(s.eng)].find((a) => !taken.has(a)) ?? ''
    taken.add(abbr)
    const r = resolveName(s.nm, dict)
    out.push({ nm: s.nm, eng: s.eng, abbr, desc: s.desc, std_ok: !r.missing.length, missing_words: r.missing })
  }
  return out
}

export interface EntRec {
  ent_log_nm: string
  tbl_phy_nm: string
  dic_ids: string[]
  ent_tp_cd: EntTp
  ent_desc: string
  ok: boolean
  missing_words: string[]
  rule_error: string | null
  src: 'industry' | 'pattern'
}
// 선택 주제영역의 핵심 엔터티 후보 — 템플릿에서 주제영역명이 같은 엔터티(단어 + 엔터티 분류어), 프로젝트에 이미 있는 이름 제외
export function recommendEntities(t: IndstryTmpl, subjNm: string, subjAbbr: string, have: Set<string>, dict: EntWord[], pfx?: string): EntRec[] {
  return t.entities
    .filter((e) => e.subj === subjNm && !have.has(entKey(e)))
    .map((e) => {
      const nm = entKey(e)
      const r = resolveName(nm, dict)
      const err = r.missing.length ? null : entNameError(r.words, e.tp)
      const n = r.words.length && !r.missing.length ? entNames(r.words, subjAbbr || '○○○', pfx) : null
      return { ent_log_nm: nm, tbl_phy_nm: n?.tbl_phy_nm ?? '', dic_ids: r.words.map((w) => w.dic_id), ent_tp_cd: e.tp, ent_desc: e.desc, ok: !!n && !err, missing_words: r.missing, rule_error: err, src: 'industry' as const }
    })
}

export interface RelRec {
  prnt_ent_id: string
  chld_ent_id: string
  prnt_nm: string
  chld_nm: string
  crdn_cd: '11' | '1N' | 'NM'
  idnt_yn: 'Y' | 'N'
  rel_nm: string
}
// 관계 후보 — 템플릿 관계 중 부모·자식 엔터티가 모두 프로젝트에 등록된 것, 같은 부모·자식·관계명이 이미 있으면 제외
export function recommendRelations(t: IndstryTmpl, ents: { ent_id: string; ent_log_nm: string }[], existing: { prnt_ent_id: string; chld_ent_id: string; rel_nm: string | null }[]): RelRec[] {
  const id = new Map(ents.map((e) => [e.ent_log_nm, e.ent_id]))
  const ex = new Set(existing.map((r) => `${r.prnt_ent_id}|${r.chld_ent_id}|${r.rel_nm ?? ''}`))
  return t.rels.flatMap((r) => {
    const p = id.get(r.prnt), c = id.get(r.chld)
    if (!p || !c || ex.has(`${p}|${c}|${r.nm}`)) return []
    return [{ prnt_ent_id: p, chld_ent_id: c, prnt_nm: r.prnt, chld_nm: r.chld, crdn_cd: r.crdn, idnt_yn: r.idnt, rel_nm: r.nm }]
  })
}
