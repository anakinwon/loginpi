// 논리 모델 정의서(순수, PRD_PiErd S1 L6) — 엔터티·속성·관계 정의서 표(머리글 + 행) → CSV(엑셀 한글 BOM) / 인쇄용 HTML(3종 한 문서, 브라우저 인쇄 = PDF)
// 입력 = 논리 모델 로더 결과(loadLogical). DA# 정의서 양식은 복제하지 않고 공공 DA 산출물 공통 항목만 둔다
import { toCsv } from '../bulk.ts'
import type { LEnt, LRel } from './normalize.ts'

export const DOC_TYPES = { ent: '엔터티정의서', attr: '속성정의서', rel: '관계정의서' } as const
export type DocType = keyof typeof DOC_TYPES
type Cell = string | number | null | undefined
export interface DocTable {
  title: string
  headers: string[]
  rows: Cell[][]
}

const TP_NM: Record<string, string> = { BASE: '실체·기준', ACT: '행위', AGG: '집계' }
const CRDN_NM: Record<string, string> = { '11': '1:1', '1N': '1:N', NM: 'N:M' }
const yn = (v: string | null | undefined) => (v === 'Y' ? 'Y' : 'N')

type DEnt = LEnt & { mdl_lvl_cd?: string; ent_desc?: string | null }
type DRel = LRel & { rel_desc?: string | null }

export function docTables(ents: DEnt[], rels: DRel[]): Record<DocType, DocTable> {
  const byId = new Map(ents.map((e) => [e.ent_id, e]))
  const relCnt = (id: string) => rels.filter((r) => r.prnt_ent_id === id || r.chld_ent_id === id).length
  const ent: DocTable = {
    title: DOC_TYPES.ent,
    headers: ['주제영역', '엔터티명', '테이블명', '엔터티 유형', '모델 단계', '주식별자', '속성 수', '관계 수', '설명'],
    rows: ents.map((e) => [
      e.subj_nm,
      e.ent_log_nm,
      e.tbl_phy_nm,
      TP_NM[e.ent_tp_cd] ?? e.ent_tp_cd,
      e.mdl_lvl_cd === 'LGCL' ? '논리' : '핵심',
      e.attrs
        .filter((a) => a.pk_yn === 'Y')
        .sort((a, b) => (a.pk_seq ?? 0) - (b.pk_seq ?? 0))
        .map((a) => a.term_log_nm)
        .join(', '),
      e.attrs.length,
      relCnt(e.ent_id),
      e.ent_desc ?? '',
    ]),
  }
  const attr: DocTable = {
    title: DOC_TYPES.attr,
    headers: ['엔터티명', '테이블명', '순서', '속성명', '칼럼명', '도메인', 'PK', 'PK 순서', '필수', 'FK(부모 엔터티)', '설명'],
    rows: ents.flatMap((e) =>
      e.attrs.map((a, i) => {
        const r = a.fk_rel_id ? rels.find((x) => x.rel_id === a.fk_rel_id) : undefined
        return [e.ent_log_nm, e.tbl_phy_nm, i + 1, a.term_log_nm, a.term_phy_nm, a.dom_nm ?? '', yn(a.pk_yn), a.pk_seq ?? '', yn(a.esntl_yn), r ? (byId.get(r.prnt_ent_id)?.ent_log_nm ?? '') : '', a.attr_desc ?? '']
      }),
    ),
  }
  const rel: DocTable = {
    title: DOC_TYPES.rel,
    headers: ['부모 엔터티', '자식 엔터티', '관계명', '카디널리티', '식별', '부모 선택', '자식 선택', '설명'],
    rows: rels.map((r) => [byId.get(r.prnt_ent_id)?.ent_log_nm ?? '', byId.get(r.chld_ent_id)?.ent_log_nm ?? '', r.rel_nm ?? '', CRDN_NM[r.crdn_cd] ?? r.crdn_cd, r.idnt_yn === 'Y' ? '식별' : '비식별', yn(r.prnt_opt_yn), yn(r.chld_opt_yn), r.rel_desc ?? '']),
  }
  return { ent, attr, rel }
}

// 수식 인젝션 방지 : =·+·-·@·탭·CR 로 시작하는 문자열 셀은 앞에 ' (엑셀이 수식으로 실행하지 않음), 숫자 셀은 그대로
const safe = (v: Cell): Cell => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v)
export const docCsv = (t: DocTable) => toCsv([t.headers, ...t.rows.map((r) => r.map(safe))])

const esc = (v: Cell) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// 인쇄용 HTML(정의서 3종, 표 머리글 반복, 가로 A4) — 외부 자원 없음
export function docHtml(prjNm: string, at: string, tables: DocTable[], capped = false): string {
  const sec = (t: DocTable) =>
    `<section><h2>${esc(t.title)} <small>(${t.rows.length}건)</small></h2><table><thead><tr>${t.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(prjNm)} 논리 모델 정의서</title><style>
@page{size:A4 landscape;margin:12mm}body{font-family:'Malgun Gothic',sans-serif;font-size:10px;color:#111}h1{font-size:16px;margin:0 0 4px}
.meta{color:#555;margin-bottom:12px}h2{font-size:13px;margin:14px 0 6px;border-left:4px solid #1f3a68;padding-left:6px}small{color:#666;font-weight:normal}
table{width:100%;border-collapse:collapse;margin-bottom:8px}thead{display:table-header-group}th,td{border:1px solid #999;padding:3px 4px;vertical-align:top;text-align:left}
th{background:#e9eff9}tr{page-break-inside:avoid}section{page-break-after:always}section:last-child{page-break-after:auto}
</style></head><body><h1>${esc(prjNm)} — 논리 모델 정의서</h1><div class="meta">출력 ${esc(at)} · 표준 데이터 모델(승인 표준단어·용어 기준)</div>${capped ? '<p style="color:#b00"><b>※ 조회 상한(엔터티 500·속성 5,000·관계 5,000)을 넘어 일부만 출력되었습니다 — 주제영역 단위로 나누어 출력하십시오</b></p>' : ''}${tables.map(sec).join('')}</body></html>`
}
