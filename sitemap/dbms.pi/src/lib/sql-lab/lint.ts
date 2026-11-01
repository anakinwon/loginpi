// SQL 튜닝 랩 안티패턴 점검 순수 규칙 엔진(PRD 12 §2-3) — SELECT *·칼럼 가공·앞 와일드카드·OR 남용·암시적 형변환·NOT IN 부질의·WHERE 누락
//  + schema.pi 표준 도메인(GET /domains)과 칼럼 접미사(_dt·_cd·_amt …)를 대조해 상수 타입 불일치 탐지. 정규식 기반 휴리스틱(파서 아님)
//  서버·클라이언트 공용. 시험 : node --test src/lib/sql-lab/lint.test.mjs

export type Domain = { domNm: string; lgcTpCd: string; dataLen?: number | null; scale?: number | null }
export type TypeGroup = 'num' | 'date' | 'char'

export type LintIssue = {
  code:
    | 'SELECT_STAR'
    | 'FUNC_ON_COLUMN'
    | 'LEADING_WILDCARD'
    | 'OR_DIFF_COLUMNS'
    | 'IMPLICIT_CAST'
    | 'NOT_IN_SUBQUERY'
    | 'NO_WHERE'
    | 'DOMAIN_MISMATCH'
  severity: 'warn' | 'info'
  snippet: string
  column?: string
  expected?: TypeGroup
}

// 칼럼 접미사 → (표준 도메인명에 들어갈 용어, 기본 타입군). 도메인 목록에 그 용어가 있으면 도메인 타입을 우선
// ponytail: 접미사 고정 목록 — schema.pi 표준단어 약어 API 가 생기면 그걸로 교체
const SUFFIX: Record<string, { term: string; group: TypeGroup }> = {
  dt: { term: '일자', group: 'date' },
  dtm: { term: '일시', group: 'date' },
  amt: { term: '금액', group: 'num' },
  cnt: { term: '수', group: 'num' },
  qty: { term: '수량', group: 'num' },
  rt: { term: '율', group: 'num' },
  seq: { term: '순번', group: 'num' },
  cd: { term: '코드', group: 'char' },
  yn: { term: '여부', group: 'char' },
  nm: { term: '명', group: 'char' },
  id: { term: 'ID', group: 'char' },
  no: { term: '번호', group: 'char' },
  txt: { term: '내용', group: 'char' },
}

export function typeGroupOf(lgcTpCd: string): TypeGroup {
  if (/NUM|INT|DEC|FLOAT|DOUBLE|REAL|SERIAL/i.test(lgcTpCd)) return 'num'
  if (/DATE|TIME/i.test(lgcTpCd)) return 'date'
  return 'char'
}

// 칼럼명 → 기대 타입군(접미사 없으면 null)
export function expectedGroup(col: string, domains: Domain[] = []): TypeGroup | null {
  const name = col.split('.').pop()!.toLowerCase()
  const suffix = name.match(/_([a-z]+)$/)?.[1]
  const rule = suffix ? SUFFIX[suffix] : undefined
  if (!rule) return null
  const dom = domains.find((d) => d.domNm.endsWith(rule.term))
  return dom ? typeGroupOf(dom.lgcTpCd) : rule.group
}

// 주석 제거(문자열은 보존 — 상수 검사에 필요)
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

// 최상위 WHERE 절 본문(첫 WHERE 부터 GROUP/ORDER/LIMIT/HAVING 전까지) — 단순 근사
function whereBody(sql: string): string | null {
  const m = sql.match(/\bwhere\b([\s\S]*?)(?:\bgroup\s+by\b|\border\s+by\b|\blimit\b|\bhaving\b|\bunion\b|$)/i)
  return m ? m[1] : null
}

const IDENT = '[a-z_][\\w]*(?:\\.[a-z_][\\w]*)?'
const OP = '(?:=|<>|!=|<=|>=|<|>)'

export function lintSql(input: string, domains: Domain[] = []): LintIssue[] {
  const sql = stripComments(input)
  const issues: LintIssue[] = []
  const add = (i: LintIssue) => {
    if (!issues.some((x) => x.code === i.code && x.snippet === i.snippet)) issues.push(i)
  }
  const cut = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 80)

  for (const m of sql.matchAll(/\bselect\s+(?:distinct\s+)?((?:[a-z_]\w*\.)?\*)/gi))
    add({ code: 'SELECT_STAR', severity: 'warn', snippet: cut(m[0]) })

  for (const m of sql.matchAll(/\bnot\s+in\s*\(\s*select\b/gi))
    add({ code: 'NOT_IN_SUBQUERY', severity: 'warn', snippet: cut(m[0]) })

  for (const m of sql.matchAll(/\blike\s+'%[^']*'/gi)) add({ code: 'LEADING_WILDCARD', severity: 'warn', snippet: cut(m[0]) })

  const where = whereBody(sql)
  if (where === null) {
    if (/\bfrom\b/i.test(sql) && !/\blimit\b|\bfetch\s+first\b/i.test(sql))
      add({ code: 'NO_WHERE', severity: 'info', snippet: cut(sql.match(/\bfrom\b[^()]*/i)?.[0] ?? 'FROM') })
    return issues
  }

  // 조건 좌변 칼럼 가공 — UPPER(col) = …, to_char(col, …) = …, col || … =
  const funcRe = new RegExp(`\\b(upper|lower|trim|substr|substring|to_char|to_date|coalesce|nvl|date_trunc|cast)\\s*\\(\\s*(${IDENT})[^()]*\\)\\s*(?:${OP}|like\\b|in\\b|between\\b)`, 'gi')
  for (const m of where.matchAll(funcRe)) add({ code: 'FUNC_ON_COLUMN', severity: 'warn', snippet: cut(m[0]), column: m[2] })
  for (const m of where.matchAll(new RegExp(`(${IDENT})\\s*\\|\\|[^=<>]*${OP}`, 'gi')))
    add({ code: 'FUNC_ON_COLUMN', severity: 'warn', snippet: cut(m[0]), column: m[1] })

  // OR 로 서로 다른 칼럼 조건을 묶음 — 인덱스 1개로 못 탐
  const orRe = new RegExp(`(${IDENT})\\s*(?:${OP}|like\\b|in\\b)[^()]*?\\bor\\s+(${IDENT})\\s*(?:${OP}|like\\b|in\\b)`, 'gi')
  for (const m of where.matchAll(orRe))
    if (m[1].toLowerCase() !== m[2].toLowerCase()) add({ code: 'OR_DIFF_COLUMNS', severity: 'info', snippet: cut(m[0]) })

  // 칼럼 op 상수 — 상수 타입과 칼럼 기대 타입 대조
  const cmpRe = new RegExp(`(${IDENT})\\s*${OP}\\s*('(?:[^']|'')*'|-?\\d+(?:\\.\\d+)?)(?![\\w.])`, 'gi')
  for (const m of where.matchAll(cmpRe)) {
    const [whole, col, lit] = m
    if (/^(and|or|not|null|true|false)$/i.test(col)) continue
    const quoted = lit.startsWith("'")
    const quotedNumber = quoted && /^'-?\d+(?:\.\d+)?'$/.test(lit)
    const expected = expectedGroup(col, domains)
    if (expected === 'num' && quoted)
      add({ code: 'DOMAIN_MISMATCH', severity: 'warn', snippet: cut(whole), column: col, expected })
    else if (expected === 'char' && !quoted)
      add({ code: 'DOMAIN_MISMATCH', severity: 'warn', snippet: cut(whole), column: col, expected })
    else if (expected === 'date' && !quoted)
      add({ code: 'DOMAIN_MISMATCH', severity: 'warn', snippet: cut(whole), column: col, expected })
    else if (expected === null && quotedNumber)
      add({ code: 'IMPLICIT_CAST', severity: 'info', snippet: cut(whole), column: col })
  }
  return issues
}
