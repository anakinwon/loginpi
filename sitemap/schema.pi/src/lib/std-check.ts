// 표준 점검 규칙 엔진(P17 명명 표준 검사·P18 전수 검사·P19 준수율) — PRD §2.4 규칙 13종, 등급 = 품질관리 지침(안) 별표 2
// 순수 함수(DB 조회 없음) : 호출 측이 분류체계의 승인완료 단어·도메인·용어를 넘기면 위반 목록과 준수율을 돌려준다
import { domName } from './dom-name.ts'
import { termNames, termRuleError, type DicWord } from './term-split.ts'

export type Grade = 'P1' | 'P2' | 'P3'
export type ChkTp = 'DIC' | 'DOM' | 'TERM'
export interface Rule {
  id: string
  tp: ChkTp
  grade: Grade
  nm: string
}

// 규칙 정의(PRD §2.4 표와 같은 순서) — W02·W03 등급은 잠정값 [확인중 : 마스터]
export const RULES: Rule[] = [
  { id: 'T01', tp: 'TERM', grade: 'P2', nm: '표준단어 2개 이상' },
  { id: 'T02', tp: 'TERM', grade: 'P2', nm: '금칙어 포함 불가' },
  { id: 'T03', tp: 'TERM', grade: 'P2', nm: '끝 단어 속성 분류어' },
  { id: 'T04', tp: 'TERM', grade: 'P2', nm: '용어명 = 구성 단어 결합' },
  { id: 'T05', tp: 'TERM', grade: 'P2', nm: '도메인 대표도메인명 = 끝 단어' },
  { id: 'D01', tp: 'DOM', grade: 'P2', nm: '도메인명 = 대표도메인명 + 타입 약어 + 길이' },
  { id: 'D02', tp: 'DOM', grade: 'P2', nm: '대표도메인명 = 지정 대표도메인' },
  { id: 'W01', tp: 'DIC', grade: 'P2', nm: '대체 표기(이음동의어·금칙어)와 논리명 중복' },
  { id: 'W02', tp: 'DIC', grade: 'P3', nm: '물리명 2~4자' },
  { id: 'W03', tp: 'DIC', grade: 'P3', nm: '같은 영문 명(이음동의어 후보)' },
  { id: 'W04', tp: 'DIC', grade: 'P3', nm: '용어에서 쓰지 않음(정리 후보)' },
  { id: 'E01', tp: 'DIC', grade: 'P3', nm: '엔터티 분류어 테이블 접미어 미지정' },
  { id: 'E02', tp: 'DIC', grade: 'P2', nm: '엔터티 분류어가 금칙어' },
]
const RULE = Object.fromEntries(RULES.map((r) => [r.id, r]))
const TERM_RULE: Record<string, string> = { TERM_SINGLE_WORD: 'T01', TERM_FORBIDDEN_WORD: 'T02', TERM_LAST_NOT_ATTR: 'T03' }

export interface ChkWord extends DicWord {
  dic_eng_nm: string | null
  key_dom_yn: string
  ent_clss_yn?: string
  tbl_sfx_txt?: string | null
}
export interface ChkDom {
  dom_id: string
  dom_nm: string
  key_dom_nm: string
  lgc_tp_abbr_nm: string | null
  data_len: number | null
  data_scale: number | null
}
export interface ChkTerm {
  term_id: string
  term_log_nm: string
  term_phy_nm: string
  dom_id: string | null
  nstd_yn: string
  dic_ids: string[] // 단어순번 순서
}
export interface Violation {
  rule: string
  grade: Grade
  tp: ChkTp
  id: string
  name: string
  detail: string
}
export interface Summary {
  tp: ChkTp
  total: number
  ok: number
  rate: number // 0~100, 소수 1자리
}

export function runCheck(input: { words: ChkWord[]; doms: ChkDom[]; terms: ChkTerm[]; syns: string[]; sep: string }) {
  const { words, doms, terms, syns, sep } = input
  const out: Violation[] = []
  const add = (rule: string, id: string, name: string, detail: string) => out.push({ rule, grade: RULE[rule].grade, tp: RULE[rule].tp, id, name, detail })
  const wById = new Map(words.map((w) => [w.dic_id, w]))
  const wByNm = new Map(words.map((w) => [w.dic_log_nm, w]))
  const dById = new Map(doms.map((d) => [d.dom_id, d]))
  const usedW = new Set<string>()
  const usedD = new Set<string>()
  let nstd = 0

  // 용어 T01~T05
  for (const t of terms) {
    if (t.dom_id) usedD.add(t.dom_id)
    t.dic_ids.forEach((id) => usedW.add(id))
    const ws = t.dic_ids.map((id) => wById.get(id)).filter((w): w is ChkWord => !!w)
    if (ws.length !== t.dic_ids.length) continue // 구성 단어가 승인완료가 아님 : 단어 상태 문제라 용어 규칙에서 제외
    if (t.nstd_yn === 'Y') nstd++
    else {
      const e = termRuleError(ws)
      if (e) add(TERM_RULE[e], t.term_id, t.term_log_nm, ws.map((w) => w.dic_log_nm).join('+'))
    }
    const nm = termNames(ws, sep)
    if (nm.term_log_nm !== t.term_log_nm || nm.term_phy_nm !== t.term_phy_nm) add('T04', t.term_id, t.term_log_nm, `기대 ${nm.term_log_nm} / ${nm.term_phy_nm}`)
    const d = t.dom_id ? dById.get(t.dom_id) : undefined
    const last = ws[ws.length - 1]
    if (d && last && d.key_dom_nm !== last.dic_log_nm) add('T05', t.term_id, t.term_log_nm, `끝 단어 ${last.dic_log_nm} ≠ 도메인 ${d.dom_nm}`)
  }

  // 도메인 D01·D02
  for (const d of doms) {
    if (d.lgc_tp_abbr_nm) {
      const want = domName(d.key_dom_nm, d.lgc_tp_abbr_nm, d.data_len, d.data_scale)
      if (want !== d.dom_nm) add('D01', d.dom_id, d.dom_nm, `기대 ${want}`)
    }
    const k = wByNm.get(d.key_dom_nm)
    if (!k || k.attr_clss_yn !== 'Y' || k.key_dom_yn !== 'Y') add('D02', d.dom_id, d.dom_nm, !k ? `${d.key_dom_nm} : 승인완료 단어 아님` : k.attr_clss_yn !== 'Y' ? `${d.key_dom_nm} : 속성 분류어 아님` : `${d.key_dom_nm} : 대표도메인 미지정`)
  }

  // 단어 W01~W04
  const synSet = new Set(syns)
  const byEng = new Map<string, ChkWord[]>()
  for (const w of words) {
    const e = w.dic_eng_nm?.trim().toLowerCase()
    if (e) byEng.set(e, [...(byEng.get(e) ?? []), w])
  }
  for (const w of words) {
    if (synSet.has(w.dic_log_nm)) add('W01', w.dic_id, w.dic_log_nm, '다른 단어의 대체 표기(이음동의어·금칙어)')
    const n = w.dic_phy_nm.length
    if (n < 2 || n > 4) add('W02', w.dic_id, w.dic_log_nm, `${w.dic_phy_nm} (${n}자)`)
    const same = byEng.get(w.dic_eng_nm?.trim().toLowerCase() ?? '')
    if (same && same.length > 1) add('W03', w.dic_id, w.dic_log_nm, `${w.dic_eng_nm} : ${same.filter((x) => x !== w).map((x) => x.dic_log_nm).join(', ')}`)
    if (!usedW.has(w.dic_id)) add('W04', w.dic_id, w.dic_log_nm, '용어 구성에 쓰이지 않음')
    if (w.ent_clss_yn === 'Y' && !w.tbl_sfx_txt) add('E01', w.dic_id, w.dic_log_nm, '엔터티 분류어 화면에서 접미어 지정')
    if (w.ent_clss_yn === 'Y' && w.forbid_yn === 'Y') add('E02', w.dic_id, w.dic_log_nm, '금칙어는 엔터티 분류어로 쓸 수 없음')
  }
  for (const d of doms) if (!usedD.has(d.dom_id)) out.push({ rule: 'W04', grade: 'P3', tp: 'DOM', id: d.dom_id, name: d.dom_nm, detail: '용어에 쓰이지 않음' })

  // 준수율(P1·P2 위반이 없는 대상 비율, P3 제외)
  const bad = { DIC: new Set<string>(), DOM: new Set<string>(), TERM: new Set<string>() }
  for (const v of out) if (v.grade !== 'P3') bad[v.tp].add(v.id)
  const sum = (tp: ChkTp, total: number): Summary => {
    const ok = total - bad[tp].size
    return { tp, total, ok, rate: total ? Math.round((ok / total) * 1000) / 10 : 100 }
  }
  return { violations: out, summary: [sum('DIC', words.length), sum('DOM', doms.length), sum('TERM', terms.length)], nstd }
}
