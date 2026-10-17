// 논리 ERD 내보내기(순수) — 논리 모델 → Mermaid erDiagram 텍스트(제안서 P34). 화면 그림은 3단계 PiErd
// 엔터티 = 물리 테이블명(대문자, 물리 전환 전 표기), 속성 = 도메인 타입 약어 + 용어 물리명 + PK/FK + "논리명", 관계 = IE 카디널리티(식별 실선 -- / 비식별 점선 ..)
import type { LEnt, LRel } from './normalize.ts'

const ident = (s: string) => s.replace(/[^A-Za-z0-9_]/g, '_') || 'X'
// 도메인명 끝 타입 약어(번호VC10 → VC10, 금액NM15,2 → NM15_2), 없으면 TEXT
const typeOf = (dom: string | null) => (dom?.match(/[A-Z]{2}[0-9,]*$/)?.[0] ?? 'TEXT').replace(',', '_')
const q = (s: string) => s.replace(/"/g, "'")

export function relMark(r: Pick<LRel, 'crdn_cd' | 'idnt_yn' | 'prnt_opt_yn' | 'chld_opt_yn'>) {
  const line = r.idnt_yn === 'Y' ? '--' : '..'
  if (r.crdn_cd === 'NM') return `}o${line}o{`
  const left = r.prnt_opt_yn === 'Y' ? '|o' : '||'
  const right = r.crdn_cd === '11' ? (r.chld_opt_yn === 'Y' ? 'o|' : '||') : r.chld_opt_yn === 'Y' ? 'o{' : '|{'
  return `${left}${line}${right}`
}

export function toMermaid(ents: LEnt[], rels: LRel[], title = '') {
  const nm = new Map(ents.map((e) => [e.ent_id, ident(e.tbl_phy_nm)]))
  const out = ['erDiagram']
  if (title) out.unshift(`%% ${q(title)} — 논리 모델(schema.pi ModelPi)`)
  for (const e of ents) {
    out.push(`  ${nm.get(e.ent_id)} {`)
    const attrs = [...e.attrs].sort((a, b) => (a.pk_yn === b.pk_yn ? (a.pk_seq ?? 0) - (b.pk_seq ?? 0) : a.pk_yn === 'Y' ? -1 : 1))
    for (const a of attrs) {
      const keys = [a.pk_yn === 'Y' ? 'PK' : '', a.fk_rel_id ? 'FK' : ''].filter(Boolean).join(', ')
      out.push(`    ${typeOf(a.dom_nm)} ${ident(a.term_phy_nm)}${keys ? ` ${keys}` : ''} "${q(a.term_log_nm)}${a.esntl_yn === 'Y' ? ' (필수)' : ''}"`)
    }
    out.push(`  }`)
  }
  for (const r of rels) {
    const p = nm.get(r.prnt_ent_id), c = nm.get(r.chld_ent_id)
    if (p && c) out.push(`  ${p} ${relMark(r)} ${c} : "${q(r.rel_nm ?? '')}"`)
  }
  return out.join('\n') + '\n'
}
