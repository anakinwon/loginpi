// 리버스(순수, PRD_PiErd S4 R2~R4) — DBMS 카탈로그 조회 SQL(서버는 고객 DB에 접속하지 않음 : 사용자가 실행 → CSV 업로드), CSV → 해석 결과,
// 물리명 → 표준 용어 역매핑(완전일치 EXACT → 코멘트 대조 CMNT → 단어 분해 SPLIT = 용어 신청 후보 → NONE), 테이블명 → 엔터티 구성 단어, 관계(선언 FK + 이름 기반 후보)
// AI 추천 매핑은 후속(S5) — 여기서는 규칙 매핑만
import { parseCsv } from '../bulk.ts'
import type { DbmsCd } from './dbms.ts'
import type { RvsResult, RvsTbl } from './ddl-parse.ts'

// 카탈로그 CSV 머리글(대문자) — 칼럼 1행, FK 는 칼럼 행에 평탄화
export const CAT_HEADERS = ['TABLE_NAME', 'TABLE_COMMENT', 'COLUMN_NAME', 'COLUMN_ID', 'DATA_TYPE', 'DATA_LENGTH', 'DATA_SCALE', 'NULLABLE', 'DATA_DEFAULT', 'PK_POS', 'COLUMN_COMMENT', 'FK_NAME', 'REF_TABLE', 'REF_COLUMN'] as const

const ORA = `-- Oracle·Tibero 카탈로그 조회(현재 스키마) — 결과를 CSV(머리글 포함, UTF-8)로 저장해 업로드
SELECT c.table_name AS "TABLE_NAME", tc.comments AS "TABLE_COMMENT", c.column_name AS "COLUMN_NAME", c.column_id AS "COLUMN_ID",
       c.data_type AS "DATA_TYPE",
       CASE WHEN c.data_type IN ('NUMBER','FLOAT') THEN c.data_precision WHEN c.data_type LIKE '%CHAR%' THEN c.char_length END AS "DATA_LENGTH",
       c.data_scale AS "DATA_SCALE", c.nullable AS "NULLABLE", c.data_default AS "DATA_DEFAULT",
       (SELECT cc.position FROM user_constraints k JOIN user_cons_columns cc ON cc.constraint_name = k.constraint_name
         WHERE k.table_name = c.table_name AND k.constraint_type = 'P' AND cc.column_name = c.column_name) AS "PK_POS",
       cm.comments AS "COLUMN_COMMENT",
       f.constraint_name AS "FK_NAME", r.table_name AS "REF_TABLE", rc.column_name AS "REF_COLUMN"
  FROM user_tab_columns c
  JOIN user_tables t ON t.table_name = c.table_name
  LEFT JOIN user_tab_comments tc ON tc.table_name = c.table_name
  LEFT JOIN user_col_comments cm ON cm.table_name = c.table_name AND cm.column_name = c.column_name
  LEFT JOIN user_cons_columns fc ON fc.table_name = c.table_name AND fc.column_name = c.column_name
        AND fc.constraint_name IN (SELECT constraint_name FROM user_constraints WHERE constraint_type = 'R')
  LEFT JOIN user_constraints f ON f.constraint_name = fc.constraint_name
  LEFT JOIN user_constraints r ON r.constraint_name = f.r_constraint_name
  LEFT JOIN user_cons_columns rc ON rc.constraint_name = r.constraint_name AND rc.position = fc.position
 ORDER BY c.table_name, c.column_id`

const PG = `-- PostgreSQL 카탈로그 조회(public 스키마 — 다른 스키마는 아래 'public' 을 바꿈) — 결과를 CSV(머리글 포함, UTF-8)로 저장해 업로드
SELECT c.table_name AS "TABLE_NAME", obj_description(format('%I.%I', c.table_schema, c.table_name)::regclass) AS "TABLE_COMMENT",
       c.column_name AS "COLUMN_NAME", c.ordinal_position AS "COLUMN_ID", upper(c.data_type) AS "DATA_TYPE",
       coalesce(c.character_maximum_length, c.numeric_precision) AS "DATA_LENGTH", c.numeric_scale AS "DATA_SCALE",
       CASE c.is_nullable WHEN 'YES' THEN 'Y' ELSE 'N' END AS "NULLABLE", c.column_default AS "DATA_DEFAULT",
       (SELECT k.ordinal_position FROM information_schema.table_constraints p JOIN information_schema.key_column_usage k
          ON k.constraint_name = p.constraint_name AND k.table_schema = p.table_schema
         WHERE p.table_schema = c.table_schema AND p.table_name = c.table_name AND p.constraint_type = 'PRIMARY KEY' AND k.column_name = c.column_name) AS "PK_POS",
       col_description(format('%I.%I', c.table_schema, c.table_name)::regclass, c.ordinal_position) AS "COLUMN_COMMENT",
       f.constraint_name AS "FK_NAME", f.ref_table AS "REF_TABLE", f.ref_column AS "REF_COLUMN"
  FROM information_schema.columns c
  JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
  LEFT JOIN (
    SELECT con.conname AS constraint_name, cl.relname AS tbl, a.attname AS col, rcl.relname AS ref_table, ra.attname AS ref_column
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      JOIN pg_class rcl ON rcl.oid = con.confrelid
      JOIN LATERAL unnest(con.conkey, con.confkey) AS u(k, rk) ON true
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = u.k
      JOIN pg_attribute ra ON ra.attrelid = con.confrelid AND ra.attnum = u.rk
     WHERE con.contype = 'f'
  ) f ON f.tbl = c.table_name AND f.col = c.column_name
 WHERE c.table_schema = 'public'
 ORDER BY c.table_name, c.ordinal_position`

export const catalogSql = (dbms: DbmsCd) => (dbms === '0014' ? PG : ORA)

// 카탈로그 CSV → 해석 결과(DDL 파서와 같은 모양). 머리글 누락은 오류 목록
export function csvToRvs(text: string): RvsResult | { missing: string[] } {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''))
  const head = (rows[0] ?? []).map((h) => h.trim().toUpperCase())
  const missing = ['TABLE_NAME', 'COLUMN_NAME', 'DATA_TYPE'].filter((h) => !head.includes(h))
  if (missing.length) return { missing }
  const ix = (h: string) => head.indexOf(h)
  const v = (r: string[], h: string) => (ix(h) >= 0 ? (r[ix(h)] ?? '').trim() : '')
  const num = (s: string) => (s === '' || isNaN(Number(s)) ? null : Number(s))
  const tables = new Map<string, RvsTbl>()
  const fkMap = new Map<string, { name: string | null; table: string; cols: string[]; ref_table: string; ref_cols: string[] }>()
  const warnings: string[] = []
  for (const r of rows.slice(1)) {
    const tn = v(r, 'TABLE_NAME').toUpperCase()
    const cn = v(r, 'COLUMN_NAME').toUpperCase()
    if (!tn || !cn) continue
    const t = tables.get(tn) ?? { name: tn, comment: v(r, 'TABLE_COMMENT') || null, cols: [], pk: [] }
    tables.set(tn, t)
    const dup = t.cols.some((c) => c.name === cn) // FK 여러 개로 같은 칼럼 행이 반복될 수 있음 — 칼럼은 1번만, FK 는 행마다
    const pkPos = num(v(r, 'PK_POS'))
    if (!dup) t.cols.push({ name: cn, type: v(r, 'DATA_TYPE').toUpperCase(), len: num(v(r, 'DATA_LENGTH')), scale: num(v(r, 'DATA_SCALE')), nullable: pkPos === null && !/^(N|NO|FALSE)$/i.test(v(r, 'NULLABLE')), dflt: v(r, 'DATA_DEFAULT') || null, comment: v(r, 'COLUMN_COMMENT') || null })
    if (!dup && pkPos !== null) (t as RvsTbl & { pkPos?: Map<string, number> }).pk.push(`${pkPos}\u0000${cn}`)
    const rt = v(r, 'REF_TABLE').toUpperCase()
    if (rt) {
      const k = `${tn}|${v(r, 'FK_NAME') || cn}`
      const f = fkMap.get(k) ?? { name: v(r, 'FK_NAME').toUpperCase() || null, table: tn, cols: [], ref_table: rt, ref_cols: [] }
      f.cols.push(cn)
      f.ref_cols.push(v(r, 'REF_COLUMN').toUpperCase())
      fkMap.set(k, f)
    }
  }
  // 주키 위치 정렬
  for (const t of tables.values()) t.pk = t.pk.sort((a, b) => Number(a.split('\u0000')[0]) - Number(b.split('\u0000')[0])).map((x) => x.split('\u0000')[1])
  if (!tables.size) warnings.push('데이터 행이 없습니다')
  return { tables: [...tables.values()], fks: [...fkMap.values()], skipped: 0, warnings }
}

// 역매핑 입력 — 승인 용어·승인 단어(엔터티 분류어는 테이블 접미어 tbl_sfx_txt 도)
export interface MapTerm {
  term_id: string
  term_log_nm: string
  term_phy_nm: string
}
export interface MapWord {
  dic_id: string
  dic_log_nm: string
  dic_phy_nm: string
  tbl_sfx_txt?: string | null
}
export type MapCd = 'EXACT' | 'CMNT' | 'SPLIT' | 'NONE'
export interface ColMap {
  map_cd: MapCd
  term_id: string | null
  cand_nm: string | null // SPLIT : 단어 논리명 결합(용어 신청 후보)
}

export function mapCol(col: { name: string; comment: string | null }, terms: MapTerm[], words: MapWord[]): ColMap {
  const nm = col.name.toUpperCase()
  const ex = terms.find((t) => t.term_phy_nm.toUpperCase() === nm)
  if (ex) return { map_cd: 'EXACT', term_id: ex.term_id, cand_nm: null }
  const cm = col.comment?.trim()
  const ct = cm ? terms.find((t) => t.term_log_nm === cm) : undefined
  if (ct) return { map_cd: 'CMNT', term_id: ct.term_id, cand_nm: null }
  const byPhy = new Map(words.map((w) => [w.dic_phy_nm.toUpperCase(), w]))
  const parts = nm.split('_').filter(Boolean)
  const ws = parts.map((p) => byPhy.get(p))
  if (parts.length >= 2 && ws.every(Boolean)) return { map_cd: 'SPLIT', term_id: null, cand_nm: ws.map((w) => w!.dic_log_nm).join('') }
  return { map_cd: 'NONE', term_id: null, cand_nm: null }
}

// 테이블명 → 엔터티 구성 단어 : 알려진 접두·주제영역 약어(skip)를 먼저 떼고, 앞쪽 미등록 토큰은 건너뛰고, 나머지가 모두 표준단어(물리명 또는 테이블 접미어)여야 함
export function tblWords(tblNm: string, words: MapWord[], skip: Set<string> = new Set()): MapWord[] | null {
  const byPhy = new Map(words.map((w) => [w.dic_phy_nm.toUpperCase(), w]))
  const bySfx = new Map(words.filter((w) => w.tbl_sfx_txt).map((w) => [w.tbl_sfx_txt!.replace(/^_+/, '').toUpperCase(), w])) // 접미어는 '_M' 처럼 구분자 포함 저장
  let parts = tblNm.toUpperCase().split('_').filter(Boolean)
  while (parts.length > 1 && skip.has(parts[0])) parts = parts.slice(1) // 프로젝트 테이블 접두·주제영역 약어(단어와 겹쳐도 먼저 제거)
  const at = parts.findIndex((p) => byPhy.has(p))
  if (at < 0) return null
  const out: MapWord[] = []
  for (const [i, p] of parts.slice(at).entries()) {
    const w = byPhy.get(p) ?? (i === parts.length - at - 1 ? bySfx.get(p) : undefined) // 접미어는 마지막 토큰만
    if (!w) return null
    out.push(w)
  }
  return out
}

// 관계 후보(R4) — 선언 FK(확정) + 이름 기반(자식 칼럼명 = 다른 테이블의 단일 주키 칼럼명, 범용 이름 제외, 자동 체크 안 함)
export const GENERIC_COLS = new Set(['ID', 'SEQ', 'SN', 'NO', 'CD', 'NM', 'TYPE', 'STATUS', 'NAME', 'CODE'])
export interface RelCand {
  prnt: string
  chld: string
  cols: string[]
  ref_cols: string[]
  src: 'FK' | 'NAME'
  fk_nm: string | null
  idnt: boolean // 자식 주키에 포함
  opt: boolean // 자식 칼럼 NULL 허용 = 부모 선택
}
export function relCands(r: RvsResult): RelCand[] {
  const byNm = new Map(r.tables.map((t) => [t.name, t]))
  const out: RelCand[] = []
  const seen = new Set<string>()
  const add = (c: RelCand) => {
    const k = `${c.prnt}>${c.chld}>${c.cols.join(',')}`
    if (seen.has(k)) return
    seen.add(k)
    out.push(c)
  }
  for (const f of r.fks) {
    const ch = byNm.get(f.table)
    if (!ch || !byNm.has(f.ref_table)) continue
    add({ prnt: f.ref_table, chld: f.table, cols: f.cols, ref_cols: f.ref_cols, src: 'FK', fk_nm: f.name, idnt: f.cols.every((c) => ch.pk.includes(c)), opt: f.cols.some((c) => ch.cols.find((x) => x.name === c)?.nullable) })
  }
  const pk1 = new Map(r.tables.filter((t) => t.pk.length === 1 && !GENERIC_COLS.has(t.pk[0])).map((t) => [t.pk[0], t.name]))
  for (const t of r.tables)
    for (const c of t.cols) {
      const p = pk1.get(c.name)
      if (!p || p === t.name || out.some((x) => x.chld === t.name && x.cols.includes(c.name))) continue
      add({ prnt: p, chld: t.name, cols: [c.name], ref_cols: [c.name], src: 'NAME', fk_nm: null, idnt: t.pk.includes(c.name), opt: c.nullable })
    }
  return out
}
