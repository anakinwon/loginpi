// 논리 엔터티 추천(순수, 반자동 3단계) — 선택 주제영역에 더할 엔터티명·유형·설명 후보. 저장하지 않음(화면이 등록 폼만 채움)
// 출처 3종 : AI(라우트가 넘겨 줌) → 업종 템플릿(같은 주제영역, 미등록) → 규칙 파생(등록된 엔터티 줄기 + 이력·상세)
// 표준 선행 : 승인 표준단어로 완전 분해·이름 규칙 통과 = 바로 등록(ok), 미등록 단어는 missing_words(표준단어 신청 안내), 프로젝트에 있는 이름 제외
import { entNameError, entNames, type EntTp, type EntWord } from '../model-name.ts'
import { resolveName } from './concept.ts'
import { ENT_CLSS, entKey, type IndstryTmpl } from './template.ts'

export interface LgCand {
  nm: string
  tp: EntTp
  desc: string
}
export interface LgRec extends LgCand {
  tbl_phy_nm: string
  dic_ids: string[]
  ok: boolean
  missing_words: string[]
  rule_error: string | null
  src: 'AI' | 'industry' | 'rule'
}
export const LG_MAX = 12

// 엔터티 분류어(끝 단어)를 뗀 줄기 — '고객기본' → '고객', 분류어가 없으면 그대로
export function entStem(nm: string): string {
  const c = [...ENT_CLSS].sort((a, b) => b.length - a.length).find((x) => nm.endsWith(x) && nm.length > x.length)
  return c ? nm.slice(0, -c.length) : nm
}

// 규칙 파생 — 등록된 엔터티마다 변경 이력(ACT), 행위 엔터티는 상세(ACT)
export function deriveCands(ents: { ent_log_nm: string; ent_tp_cd: string }[]): LgCand[] {
  return ents.flatMap((e) => {
    const s = entStem(e.ent_log_nm)
    const out: LgCand[] = [{ nm: `${s}이력`, tp: 'ACT', desc: `${e.ent_log_nm}의 변경 이력(변경 전후 값·변경 일시 관리)` }]
    if (e.ent_tp_cd === 'ACT' && !e.ent_log_nm.endsWith('상세')) out.push({ nm: `${s}상세`, tp: 'ACT', desc: `${e.ent_log_nm}의 상세 항목(1건에 여러 행)` })
    return out
  })
}

// 후보 합치기·검증 — 앞 출처 우선, 같은 이름·프로젝트 기존 이름 제외, 상한 LG_MAX
export function recommendLogical(o: {
  tmpl: IndstryTmpl | null
  subjNm: string
  subjAbbr: string
  subjEnts: { ent_log_nm: string; ent_tp_cd: string }[]
  have: Set<string>
  dict: EntWord[]
  ai?: LgCand[]
  pfx?: string
  dbms?: string
}): LgRec[] {
  const ind: LgCand[] = (o.tmpl?.entities ?? []).filter((e) => e.subj === o.subjNm).map((e) => ({ nm: entKey(e), tp: e.tp, desc: e.desc }))
  const all: [LgCand, LgRec['src']][] = [...(o.ai ?? []).map((c) => [c, 'AI'] as [LgCand, 'AI']), ...ind.map((c) => [c, 'industry'] as [LgCand, 'industry']), ...deriveCands(o.subjEnts).map((c) => [c, 'rule'] as [LgCand, 'rule'])]
  const seen = new Set(o.have)
  const out: LgRec[] = []
  for (const [c, src] of all) {
    const nm = c.nm.replace(/\s+/g, '')
    if (!nm || seen.has(nm) || out.length >= LG_MAX) continue
    seen.add(nm)
    const r = resolveName(nm, o.dict)
    const err = r.missing.length ? null : entNameError(r.words, c.tp)
    const n = r.words.length && !r.missing.length ? entNames(r.words, o.subjAbbr || '○○○', o.pfx, o.dbms) : null
    out.push({ nm, tp: c.tp, desc: c.desc.trim().slice(0, 300), tbl_phy_nm: n?.tbl_phy_nm ?? '', dic_ids: r.words.map((w) => w.dic_id), ok: !!n && !err, missing_words: r.missing, rule_error: err, src })
  }
  // 바로 등록 가능한 것 먼저(출처 순서는 유지)
  return [...out.filter((x) => x.ok), ...out.filter((x) => !x.ok)]
}
