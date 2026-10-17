// N:M 해소(순수, PRD_PiErd S1 L3) — N:M 관계를 교차 엔터티 + 식별 관계 2개로 바꿀 때 교차 엔터티 이름 후보(표준단어 분해·이름 규칙 검증)
// 후보 : 부모 줄기 + 자식 줄기 + 관계·내역(엔터티 분류어), 관계명이 있으면 관계명 + 내역·부모 줄기 + 관계명 + 내역. 저장하지 않음(사용자가 고른 후보로 서버가 다시 검증해 생성)
import { entNameError, entNames } from '../model-name.ts'
import type { EntWord } from '../model-name.ts'
import { resolveName } from './concept.ts'
import { entStem } from './logical-ent.ts'

export interface NmCand {
  nm: string
  dic_ids: string[]
  tbl_phy_nm: string
  ok: boolean
  missing_words: string[]
  rule_error: string | null
  dup: boolean
}

export function nmNameCands(o: { prntNm: string; chldNm: string; relNm: string | null; dict: EntWord[]; have: Set<string>; subjAbbr: string; pfx?: string; dbms?: string }): NmCand[] {
  const p = entStem(o.prntNm), c = entStem(o.chldNm)
  const rn = (o.relNm ?? '').replace(/\s+/g, '')
  const names = [`${p}${c}관계`, `${p}${c}내역`, ...(rn ? [`${rn}내역`, `${p}${rn}내역`] : [])]
  const out: NmCand[] = []
  for (const nm of [...new Set(names)]) {
    const r = resolveName(nm, o.dict)
    const err = r.missing.length ? null : entNameError(r.words, 'ACT')
    const n = r.words.length && !r.missing.length ? entNames(r.words, o.subjAbbr || '○○○', o.pfx, o.dbms) : null
    const dup = o.have.has(nm)
    out.push({ nm, dic_ids: r.words.map((w) => w.dic_id), tbl_phy_nm: n?.tbl_phy_nm ?? '', ok: !!n && !err && !dup, missing_words: r.missing, rule_error: err, dup })
  }
  return [...out.filter((x) => x.ok), ...out.filter((x) => !x.ok)]
}
