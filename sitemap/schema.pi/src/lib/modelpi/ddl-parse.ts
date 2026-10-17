// DDL 리버스 파서(순수, PRD_PiErd S4 R1) — PostgreSQL·Oracle·Tibero DDL 의 부분집합 : CREATE TABLE(칼럼·타입·길이·DEFAULT·NULL·PK·UNIQUE·CHECK 무시·FK), ALTER TABLE ADD CONSTRAINT PK/FK, COMMENT ON TABLE/COLUMN
// 결정(2026-10-17, 권장안 자동 선택) : 문법 생성기(ANTLR) 대신 자체 부분집합 파서 — 새 의존성 없이 모델링에 필요한 문장만, 나머지 문장(함수·트리거·인덱스·GRANT 등)은 건너뜀
// 문장 분리는 작은따옴표 문자열·큰따옴표 식별자·$$ 본문·-- / /* */ 주석을 존중. 이름은 대문자로 정규화(따옴표 식별자는 원문 유지)

export interface RvsCol {
  name: string
  type: string // 길이 제외 타입명(대문자)
  len: number | null
  scale: number | null
  nullable: boolean
  dflt: string | null
  comment: string | null
}
export interface RvsTbl {
  name: string
  comment: string | null
  cols: RvsCol[]
  pk: string[]
}
export interface RvsFk {
  name: string | null
  table: string
  cols: string[]
  ref_table: string
  ref_cols: string[]
}
export interface RvsResult {
  tables: RvsTbl[]
  fks: RvsFk[]
  skipped: number // 건너뛴 문장 수
  warnings: string[]
}

// 문장 분리 — ; 기준, 문자열·식별자·$태그$ 본문·주석 안의 ; 는 무시. 주석은 제거
export function splitStatements(sql: string): string[] {
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < sql.length; ) {
    const c = sql[i], n = sql[i + 1]
    if (c === '-' && n === '-') {
      const j = sql.indexOf('\n', i)
      i = j < 0 ? sql.length : j
      continue
    }
    if (c === '/' && n === '*') {
      const j = sql.indexOf('*/', i + 2)
      i = j < 0 ? sql.length : j + 2
      cur += ' '
      continue
    }
    if (c === "'" || c === '"') {
      let j = i + 1
      for (; j < sql.length; j++) if (sql[j] === c) { if (sql[j + 1] === c) j++; else break }
      cur += sql.slice(i, j + 1)
      i = j + 1
      continue
    }
    if (c === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))
      if (m) {
        const j = sql.indexOf(m[0], i + m[0].length)
        const end = j < 0 ? sql.length : j + m[0].length
        cur += sql.slice(i, end)
        i = end
        continue
      }
    }
    if (c === ';') {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
      i++
      continue
    }
    cur += c
    i++
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

// 식별자 — "따옴표"는 원문, 아니면 대문자. 스키마 접두(s.t)는 마지막 부분만
const ident = (s: string) => {
  const parts = s.trim().match(/"(?:[^"]|"")*"|[^.\s"]+/g) ?? [s]
  const last = parts[parts.length - 1]
  return last.startsWith('"') ? last.slice(1, -1).replace(/""/g, '"') : last.toUpperCase()
}
const list = (s: string) => splitTop(s, ',').map(ident)
const unq = (s: string) => s.slice(1, -1).replace(/''/g, "'")

// 최상위 구분 — 괄호·문자열 안의 구분자는 무시
function splitTop(s: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0, cur = '', q = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      cur += c
      if (c === q) q = s[i + 1] === q ? (cur += s[++i], q) : ''
      continue
    }
    if (c === "'" || c === '"') q = c
    else if (c === '(') depth++
    else if (c === ')') depth--
    if (c === sep && depth === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += c
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}
// 첫 최상위 괄호 묶음의 [시작, 끝] 위치
function paren(s: string, from = 0): [number, number] | null {
  const a = s.indexOf('(', from)
  if (a < 0) return null
  let d = 0, q = ''
  for (let i = a; i < s.length; i++) {
    const c = s[i]
    if (q) { if (c === q) q = s[i + 1] === q ? (i++, q) : ''; continue }
    if (c === "'" || c === '"') q = c
    else if (c === '(') d++
    else if (c === ')' && --d === 0) return [a, i]
  }
  return null
}

const RE_FK = /^(?:CONSTRAINT\s+("?[\w$#]+"?)\s+)?FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+((?:"(?:[^"]|"")*"|[\w$#]+)(?:\s*\.\s*(?:"(?:[^"]|"")*"|[\w$#]+))*)\s*(?:\(([^)]*)\))?/i
const RE_PK = /^(?:CONSTRAINT\s+("?[\w$#]+"?)\s+)?PRIMARY\s+KEY\s*\(([^)]*)\)/i

function parseCol(def: string): RvsCol | null {
  const m = /^("(?:[^"]|"")*"|[\w$#]+)\s+(.*)$/s.exec(def.trim())
  if (!m) return null
  const rest = m[2]
  // 타입 = 제약 키워드 전까지(DOUBLE PRECISION·TIMESTAMP WITH TIME ZONE·CHARACTER VARYING 같은 여러 단어 포함)
  const stop = /\s+(?:DEFAULT|NOT\s+NULL|NULL|PRIMARY\s+KEY|UNIQUE|CHECK|REFERENCES|CONSTRAINT|COLLATE|GENERATED|IDENTITY)\b/i.exec(rest)
  const tpRaw = (stop ? rest.slice(0, stop.index) : rest).trim()
  const tail = stop ? rest.slice(stop.index) : ''
  const lm = /^(.*?)\s*\(\s*(\d+|\*)\s*(?:(?:BYTE|CHAR)\s*)?(?:,\s*(-?\d+)\s*)?\)\s*(.*)$/is.exec(tpRaw) // NUMBER(*,0) = 정밀도 없음
  const type = (lm ? `${lm[1]}${lm[4] ? ` ${lm[4]}` : ''}` : tpRaw).replace(/\s+/g, ' ').toUpperCase()
  const dm = /\bDEFAULT\s+('(?:[^']|'')*'|\([^)]*\)|[^\s,]+(?:\s*\([^)]*\))?)/i.exec(tail)
  return {
    name: ident(m[1]),
    type,
    len: lm && lm[2] !== '*' ? Number(lm[2]) : null,
    scale: lm && lm[3] !== undefined ? Number(lm[3]) : null,
    nullable: !/\bNOT\s+NULL\b|\bPRIMARY\s+KEY\b/i.test(tail),
    dflt: dm ? dm[1] : null,
    comment: null,
  }
}

export const COL_CAP = 50_000 // 전체 칼럼 상한 — 넘으면 해석 중단(경고), 큰 스키마는 나누어 올림

export function parseDdl(sql: string): RvsResult {
  let colTotal = 0
  const tables = new Map<string, RvsTbl>()
  const fks: RvsFk[] = []
  const warnings: string[] = []
  let skipped = 0
  for (const st of splitStatements(sql)) {
    const s = st.replace(/\s+/g, ' ').trim()
    let m: RegExpExecArray | null
    if ((m = /^CREATE\s+(?:GLOBAL\s+TEMPORARY\s+|UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"(?:[^"]|"")*"|[\w$#]+)(?:\s*\.\s*(?:"(?:[^"]|"")*"|[\w$#]+))*)\s*\(/i.exec(s))) {
      const name = ident(m[1])
      const p = paren(s, m[0].length - 1)
      if (!p) { warnings.push(`${name} : 괄호가 닫히지 않음`); continue }
      const t: RvsTbl = { name, comment: null, cols: [], pk: [] }
      const seen = new Set<string>() // 중복 칼럼 O(1) 판정
      for (const part of splitTop(s.slice(p[0] + 1, p[1]), ',')) {
        let k: RegExpExecArray | null
        if ((k = RE_PK.exec(part))) t.pk = list(k[2])
        else if ((k = RE_FK.exec(part))) fks.push({ name: k[1] ? ident(k[1]) : null, table: name, cols: list(k[2]), ref_table: ident(k[3]), ref_cols: k[4] ? list(k[4]) : [] })
        else if (/^(CONSTRAINT\b|UNIQUE\s*(\(|KEY\b|INDEX\b)|CHECK\s*\(|EXCLUDE\b|LIKE\s+[\w"])/i.test(part)) continue // 제약 절(같은 이름 칼럼과 구분 — 인라인 KEY·INDEX 절은 MySQL 문법이라 대상 아님)
        else {
          const c = parseCol(part)
          if (!c) { warnings.push(`${name} : 해석 못 한 정의 "${part.slice(0, 40)}"`); continue }
          if (seen.has(c.name)) {
            warnings.push(`${name}.${c.name} : 중복 칼럼 — 뒤의 정의는 무시`)
            continue
          }
          if (/\bPRIMARY\s+KEY\b/i.test(part)) t.pk.push(c.name)
          const r = /\bREFERENCES\s+((?:"(?:[^"]|"")*"|[\w$#]+)(?:\s*\.\s*(?:"(?:[^"]|"")*"|[\w$#]+))*)\s*(?:\(([^)]*)\))?/i.exec(part)
          if (r) fks.push({ name: null, table: name, cols: [c.name], ref_table: ident(r[1]), ref_cols: r[2] ? list(r[2]) : [] })
          seen.add(c.name)
          t.cols.push(c)
          if (++colTotal > COL_CAP) break
        }
      }
      for (const c of t.cols) if (t.pk.includes(c.name)) c.nullable = false
      tables.set(name, t)
      if (colTotal > COL_CAP) {
        warnings.push(`칼럼이 ${COL_CAP.toLocaleString()}개를 넘어 해석을 중단했습니다 — 스키마·주제영역 단위로 나누어 올리십시오`)
        break
      }
    } else if ((m = /^ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?((?:"(?:[^"]|"")*"|[\w$#]+)(?:\s*\.\s*(?:"(?:[^"]|"")*"|[\w$#]+))*)\s+ADD\s+(.*)$/i.exec(s))) {
      const name = ident(m[1])
      let k: RegExpExecArray | null
      if ((k = RE_FK.exec(m[2]))) fks.push({ name: k[1] ? ident(k[1]) : null, table: name, cols: list(k[2]), ref_table: ident(k[3]), ref_cols: k[4] ? list(k[4]) : [] })
      else if ((k = RE_PK.exec(m[2])) && tables.has(name)) {
        const t = tables.get(name)!
        t.pk = list(k[2])
        for (const c of t.cols) if (t.pk.includes(c.name)) c.nullable = false
      } else skipped++
    } else if ((m = /^COMMENT\s+ON\s+TABLE\s+((?:"(?:[^"]|"")*"|[\w$#]+)(?:\s*\.\s*(?:"(?:[^"]|"")*"|[\w$#]+))*)\s+IS\s+('(?:[^']|'')*')$/i.exec(s))) {
      const t = tables.get(ident(m[1]))
      if (t) t.comment = unq(m[2])
    } else if ((m = /^COMMENT\s+ON\s+COLUMN\s+((?:"(?:[^"]|"")*"|[\w$#]+)(?:\s*\.\s*(?:"(?:[^"]|"")*"|[\w$#]+))*)\s+IS\s+('(?:[^']|'')*')$/i.exec(s))) {
      const parts = m[1].match(/"(?:[^"]|"")*"|[\w$#]+/g) ?? []
      const t = tables.get(ident(parts[parts.length - 2] ?? ''))
      const c = t?.cols.find((x) => x.name === ident(parts[parts.length - 1] ?? ''))
      if (c) c.comment = unq(m[2])
    } else skipped++
  }
  // 참조 칼럼 생략 FK = 부모 PK
  for (const f of fks) if (!f.ref_cols.length) f.ref_cols = tables.get(f.ref_table)?.pk ?? []
  return { tables: [...tables.values()], fks, skipped, warnings }
}
