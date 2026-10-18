// SQL 편집기 문장 분리·분류·위험 판정(순수, 2026-10-18 — DBeaver SQLScriptParser·SQLQuery.isDeleteUpdateDangerous 참고)
// 문자열('…'·E'…'·"…"·$tag$…$tag$·Oracle q'[…]')·주석(--·중첩 /* */)을 공백으로 가린 mask 로만 판정 → 문자열 안의 ; ·키워드에 속지 않음
// 사용 : splitSql(편집기 전체, 'PG'|'ORA') → 문장 목록(원문 위치 포함), classify·danger 는 서버가 실행 전에 다시 판정(클라이언트 판정 신뢰 안 함)

export type Dialect = 'PG' | 'ORA'
export type Stmt = { txt: string; from: number; to: number; mask: string; code: string } // code = 식별자 글자 남긴 가림(함수 판정)
export type Kind = 'READ' | 'WRITE' | 'TXN'
export type Danger = 'NO_WHERE' | 'DROP' | 'TRUNCATE' | 'ALTER'

// 문자열·주석 → 공백(글자 수 그대로 — 위치 유지, 문자열·블록 주석 안 줄바꿈도 가려 빈 줄 구분에 안 걸림)
// keepIdent : 따옴표 식별자 안 글자는 남기고 따옴표만 지움(code — 부작용 함수 판정용, "pg_terminate_backend"(…) 우회 차단)
export function maskSql(text: string, d: Dialect, keepIdent = false): string {
  const out = text.split('')
  const blank = (a: number, b: number) => { for (let k = a; k < b; k++) out[k] = ' ' }
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i], c2 = text.slice(i, i + 2)
    if (c2 === '--') { const e = text.indexOf('\n', i); const end = e < 0 ? n : e; blank(i, end); i = end; continue }
    if (c2 === '/*') {
      // 중첩 주석은 PostgreSQL 만 — Oracle 은 첫 */ 에서 끝남(해석 차이로 숨은 문장 방지)
      let depth = 0, j = i
      while (j < n) {
        if (text.startsWith('/*', j) && (d === 'PG' || !depth)) { depth++; j += 2 } else if (text.startsWith('*/', j)) { depth--; j += 2; if (!depth) break } else j++
      }
      blank(i, j); i = j; continue
    }
    if (d === 'ORA' && /[qQ]/.test(c) && text[i + 1] === "'" && !/\w/.test(text[i - 1] ?? '')) {
      const open = text[i + 2] ?? '', close = ({ '[': ']', '{': '}', '(': ')', '<': '>' } as Record<string, string>)[open] ?? open
      const e = text.indexOf(close + "'", i + 3); const end = e < 0 ? n : e + 2
      blank(i + 2, end - 1); i = end; continue
    }
    if (c === "'") {
      const esc = d === 'PG' && /[eE]/.test(text[i - 1] ?? '') && !/\w/.test(text[i - 2] ?? '')
      let j = i + 1
      while (j < n) {
        if (esc && text[j] === '\\') { j += 2; continue }
        if (text[j] === "'") { if (text[j + 1] === "'") { j += 2; continue } break }
        j++
      }
      blank(i + 1, j); i = j + 1; continue
    }
    if (c === '"') { const e = text.indexOf('"', i + 1); const end = e < 0 ? n : e; if (keepIdent) blank(i, i + 1), blank(end, end + 1); else blank(i + 1, end); i = end + 1; continue }
    if (d === 'PG' && c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i))
      if (m && !/\w/.test(text[i - 1] ?? '')) {
        const e = text.indexOf(m[0], i + m[0].length); const end = e < 0 ? n : e + m[0].length
        blank(i + m[0].length, end - m[0].length); i = end; continue
      }
    }
    i++
  }
  return out.join('')
}

// Oracle PL/SQL 블록 — 안쪽 ; 로 자르지 않고 '/' 단독 줄까지 한 문장
const ORA_BLOCK = /^\s*(DECLARE|BEGIN|CREATE\s+(OR\s+REPLACE\s+)?(EDITIONABLE\s+|NONEDITIONABLE\s+)?(PROCEDURE|FUNCTION|PACKAGE|TRIGGER|TYPE\s+BODY|TYPE))\b/i

// 문장 분리 : 바깥 ; · 빈 줄(DBeaver '빈 줄은 문장 구분') · Oracle '/' 단독 줄
export function splitSql(text: string, d: Dialect): Stmt[] {
  const mask = maskSql(text, d), code = maskSql(text, d, true)
  const res: Stmt[] = []
  let start = 0
  const push = (a: number, b: number) => {
    const raw = text.slice(a, b), lead = raw.length - raw.trimStart().length
    const txt = raw.trim()
    if (!mask.slice(a, b).trim()) return // 주석뿐인 조각 제외
    res.push({ txt, from: a + lead, to: a + lead + txt.length, mask: mask.slice(a + lead, a + lead + txt.length), code: code.slice(a + lead, a + lead + txt.length) })
  }
  // PL/SQL 블록 여부는 문장 첫 글자가 나올 때 1회 판정
  let block: boolean | null = null
  const reset = (k: number) => { start = k; block = null }
  let i = 0
  while (i < text.length) {
    if (block === null && /\S/.test(mask[i])) block = d === 'ORA' && ORA_BLOCK.test(mask.slice(i, i + 200))
    if (i === 0 || mask[i - 1] === '\n') {
      const e = mask.indexOf('\n', i), line = mask.slice(i, e < 0 ? text.length : e)
      if (d === 'ORA' && line.trim() === '/') { push(start, i); i = e < 0 ? text.length : e + 1; reset(i); continue }
      if (!block && !line.trim()) { push(start, i); reset(i) } // 주석뿐인 조각은 push 가 버림
    }
    if (mask[i] === ';' && !block) { push(start, i); reset(i + 1) }
    i++
  }
  push(start, text.length)
  return res
}

// 커서가 든 문장(커서가 문장 사이 빈 곳이면 바로 앞 문장, 맨 앞이면 첫 문장)
export function stmtAt(stmts: Stmt[], cursor: number): Stmt | null {
  let hit: Stmt | null = null
  for (const s of stmts) if (s.from <= cursor) hit = s
  return hit ?? stmts[0] ?? null
}

const word = (m: string) => (/^[\s(]*([A-Za-z]+)/.exec(m)?.[1] ?? '').toUpperCase()
// 조회 문장 안이라도 부작용 있는 함수 = 쓰기(DA 만) — READ ONLY 트랜잭션이 못 막는 것들
const SIDE_FX = /\b(set_config|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|pg_advisory\w*|pg_try_advisory\w*|lo_import|lo_export|lo_unlink|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_reset\w*|dblink\w*|pg_notify|nextval|setval|txid_current|pg_switch_wal|pg_create_\w+|pg_drop_replication_slot|pg_logical_\w+|pg_sleep\w*|query_to_xml\w*|cursor_to_xml\w*|table_to_xml\w*|schema_to_xml\w*|database_to_xml\w*|pg_file_\w+|pg_logdir_ls)\s*\(/i // 질의 문자열을 받아 실행하는 함수(…_to_xml)도 — 안쪽 질의의 부작용 함수 숨기기 차단
// Oracle 조회는 허용 목록(fail-closed) — 사용자 함수·패키지(DBMS_*·UTL_*)는 자율 트랜잭션으로 READ ONLY 를 벗어날 수 있어
//  아래 내장 함수·키워드·타입 밖의 이름( 호출, 패키지·스키마 호출(a.b(), DB 링크(@)가 있으면 쓰기(DA 만)
const ORA_OK = new Set(('IN EXISTS AS OVER PARTITION WITHIN FILTER KEEP ANY ALL SOME FROM JOIN ON AND OR NOT WHERE SELECT WHEN THEN ELSE BY USING VALUES WITH ' +
  'CAST DECODE NVL NVL2 COALESCE NULLIF TO_CHAR TO_DATE TO_NUMBER TO_TIMESTAMP TO_CLOB TRUNC ROUND SUBSTR SUBSTRB INSTR LENGTH LENGTHB UPPER LOWER INITCAP TRIM LTRIM RTRIM LPAD RPAD REPLACE TRANSLATE CONCAT ' +
  'ABS MOD CEIL FLOOR SIGN POWER SQRT EXP LN LOG GREATEST LEAST COUNT SUM AVG MIN MAX STDDEV VARIANCE MEDIAN ROW_NUMBER RANK DENSE_RANK NTILE LAG LEAD FIRST_VALUE LAST_VALUE LISTAGG ' +
  'ADD_MONTHS MONTHS_BETWEEN LAST_DAY NEXT_DAY EXTRACT NUMTODSINTERVAL NUMTOYMINTERVAL REGEXP_LIKE REGEXP_SUBSTR REGEXP_REPLACE REGEXP_INSTR REGEXP_COUNT CHR ASCII RAWTOHEX HEXTORAW ' +
  'SYS_CONTEXT JSON_VALUE JSON_QUERY JSON_EXISTS VARCHAR2 NVARCHAR2 CHAR NCHAR NUMBER RAW TIMESTAMP FLOAT INTERVAL DATE').split(' '))
const oraUnsafe = (code: string) => /@/.test(code) || /[\w$#"]\s*\.\s*[A-Za-z_][\w$#]*\s*\(/.test(code) || [...code.matchAll(/([A-Za-z_][\w$#]*)\s*\(/g)].some((m) => !ORA_OK.has(m[1].toUpperCase()))
// 트랜잭션 제어·읽기 전용 해제 = 항상 거부(Auto 커밋 모델 깨짐, READ ONLY 탈출)
const TXN = /^\s*(BEGIN(?!\s*\w+\s*:=)|START\s+TRANSACTION|COMMIT|ROLLBACK|END|ABORT|SAVEPOINT|RELEASE|PREPARE\s+TRANSACTION|SET\s+TRANSACTION|SET\s+SESSION\s+CHARACTERISTICS|SET\s+(SESSION\s+|LOCAL\s+)?(DEFAULT_)?TRANSACTION_READ_ONLY|SET\s+CONSTRAINTS)\b/i

export function classify(s: Pick<Stmt, 'mask' | 'code'>, d: Dialect): Kind {
  const m = s.mask.trim()
  if (TXN.test(m) && !(d === 'ORA' && /^\s*BEGIN\b/i.test(m))) return 'TXN' // Oracle BEGIN = PL/SQL 블록(쓰기)
  if (/\b(set\s+)?(default_)?transaction_read_only\b/i.test(m)) return 'TXN'
  if (d === 'ORA' && oraUnsafe(s.code)) return 'WRITE'
  if (SIDE_FX.test(s.code) || /U&\s*"/i.test(s.mask)) return 'WRITE' // 따옴표 식별자·유니코드 이스케이프 식별자(U&"…") 우회 차단
  const w = word(m)
  if (w === 'EXPLAIN') {
    if (d === 'ORA') return 'WRITE' // EXPLAIN PLAN FOR = PLAN_TABLE 에 기록
    const inner = m.replace(/^\s*EXPLAIN\s*(\([^)]*\)\s*)?((ANALY[SZ]E|VERBOSE|COSTS|BUFFERS|TIMING|SUMMARY|SETTINGS|WAL|FORMAT\s+\w+)\s+)*/i, '')
    return classify({ mask: inner, code: '' }, d) === 'READ' ? 'READ' : 'WRITE'
  }
  if (w === 'SHOW' || w === 'VALUES' || w === 'TABLE') return 'READ'
  if (w === 'SELECT' || w === 'WITH') {
    if (/\b(INSERT|UPDATE|DELETE|MERGE|INTO)\b/i.test(m)) return 'WRITE' // 쓰는 CTE·SELECT … INTO
    if (/\bFOR\s+(NO\s+KEY\s+)?(UPDATE|SHARE|KEY\s+SHARE)\b/i.test(m)) return 'WRITE' // 행 잠금
    return 'READ'
  }
  return 'WRITE'
}

// 괄호 밖(깊이 0) 텍스트 — 하위 질의 안 WHERE 를 바깥 WHERE 로 오인하지 않게
const depth0 = (m: string) => { let d = 0, o = ''; for (const c of m) { if (c === '(') d++; if (!d) o += c; if (c === ')' && d) d-- } return o }

export function danger(s: Pick<Stmt, 'mask'>): Danger | null {
  const m = s.mask.trim(), w = word(m)
  if (w === 'UPDATE' || w === 'DELETE') return /\bWHERE\b/i.test(depth0(m)) ? null : 'NO_WHERE'
  if (w === 'DROP') return 'DROP'
  if (w === 'TRUNCATE') return 'TRUNCATE'
  if (w === 'ALTER') return 'ALTER'
  return null
}

export const DANGER_NM: Record<Danger, string> = { NO_WHERE: 'WHERE 없는 UPDATE·DELETE(전체 행)', DROP: '객체 삭제(DROP)', TRUNCATE: '전체 행 삭제(TRUNCATE)', ALTER: '구조 변경(ALTER)' }

// 식별자 표기 — 단순 이름(PG 소문자·Oracle 대문자)은 그대로, 그 밖은 따옴표 식별자(카탈로그·결과 칼럼 이름을 SQL 로 옮길 때)
export const quoteIdent = (n: string, d: Dialect) => ((d === 'ORA' ? /^[A-Z][A-Z0-9_$#]*$/ : /^[a-z_][a-z0-9_$]*$/).test(n) ? n : `"${n.replace(/"/g, '""')}"`)

// 입력 중 예약어 대문자(DBeaver 'Convert keyword case') — 흔한 칼럼명(name·type·value·key·data 등)은 빼고 예약어 위주로
const KW = new Set(('SELECT FROM WHERE AND OR NOT IN IS NULL AS ON JOIN LEFT RIGHT INNER OUTER FULL CROSS NATURAL USING GROUP BY ORDER HAVING LIMIT OFFSET FETCH FIRST NEXT ROWS ONLY ' +
  'UNION INTERSECT EXCEPT MINUS ALL ANY SOME DISTINCT INSERT INTO VALUES UPDATE SET DELETE MERGE MATCHED CREATE TABLE ALTER DROP TRUNCATE INDEX UNIQUE VIEW SEQUENCE SCHEMA ' +
  'PRIMARY FOREIGN REFERENCES CONSTRAINT CHECK DEFAULT CASCADE RESTRICT CASE WHEN THEN ELSE END EXISTS BETWEEN LIKE ILIKE ESCAPE ASC DESC NULLS WITH RECURSIVE RETURNING ' +
  'GRANT REVOKE TRUE FALSE CAST OVER PARTITION WINDOW LATERAL TEMPORARY TEMP REPLACE TRIGGER FUNCTION PROCEDURE RETURNS LANGUAGE DECLARE BEGIN COMMIT ROLLBACK EXPLAIN ANALYZE ' +
  'COUNT SUM AVG MIN MAX COALESCE NVL DECODE ROWNUM SYSDATE CURRENT_DATE CURRENT_TIMESTAMP INTERVAL').split(' '))

// before = 커서 앞 글 전체(방금 경계 문자를 치기 직전). 끝 단어가 예약어이고 문자열·주석·식별자·a.b 의 b 가 아니면 바꿀 위치·대문자
export function kwUpper(before: string, d: Dialect): { from: number; to: number; upper: string } | null {
  const m = /(^|[^\w$."])([A-Za-z_]+)$/.exec(before)
  if (!m) return null
  const word = m[2], up = word.toUpperCase()
  if (word === up || !KW.has(up)) return null
  const from = before.length - word.length
  if (maskSql(before, d).slice(from) !== word) return null // 문자열·주석 안
  return { from, to: before.length, upper: up }
}
