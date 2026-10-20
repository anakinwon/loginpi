// SQL 편집기 테이블 객체 편집기 DDL 조립(순수 함수, 2026-10-20) — DBeaver PostgreTableManager·addObjectExtraActions 출력 순서 재현
// 순서 : CREATE(칼럼·NOT NULL·DEFAULT·제약 인라인 → INHERITS/PARTITION BY/USING/WITH/TABLESPACE) → CREATE INDEX(제약 인덱스 제외) → COMMENT → 트리거 → 룰 → RLS → 정책 → OWNER·GRANT → FK(ALTER TABLE)
// 식별자 인용 : qi = 필요할 때만(DBeaver 표시), qid = 항상(사용자 입력이 닿는 data·count 동적 SQL). 테스트 : test/sql-obj.test.ts

// PostgreSQL 예약어(키워드 표 'reserved' + 'reserved (can be function or type)') — 이 단어는 소문자여도 인용
const RESERVED = new Set(
  ('all analyse analyze and any array as asc asymmetric authorization binary both case cast check collate collation column concurrently constraint create cross ' +
    'current_catalog current_date current_role current_schema current_time current_timestamp current_user default deferrable desc distinct do else end except false fetch ' +
    'for foreign freeze from full grant group having ilike in initially inner intersect into is isnull join lateral leading left like limit localtime localtimestamp natural ' +
    'not notnull null offset on only or order outer overlaps placing primary references returning right select session_user similar some symmetric system_user table ' +
    'tablesample then to trailing true union unique user using variadic verbose when where window with').split(' '),
)

export const qid = (s: string) => '"' + s.replace(/"/g, '""') + '"'
export const qi = (s: string) => (/^[a-z_][a-z0-9_$]*$/.test(s) && !RESERVED.has(s) ? s : qid(s))
export const lit = (s: string) => "'" + s.replace(/'/g, "''") + "'"

export interface DdlCol {
  name: string
  type: string // format_type
  collation: string | null // 타입 기본과 다를 때만
  nn: boolean
  default: string | null
  identity: 'a' | 'd' | null
  generated: boolean // attgenerated='s' → default 가 생성식
  local: boolean // 상속받은 칼럼은 false
  comment: string | null
}
export interface DdlIn {
  schema: string
  name: string
  kind: string // r p v m f S
  persistence: string // p u t
  owner: string | null
  tablespace: string | null // 기본이면 null
  am: string | null // heap 아니면
  rls: boolean
  partKey: string | null
  partOf: { schema: string; name: string; bound: string } | null // 파티션(relispartition)
  inherits: { schema: string; name: string }[]
  options: string[] | null // reloptions
  comment: string | null
  viewDef: string | null
  foreign: { server: string; options: string[] | null } | null
  seq: { type: string; start: string; inc: string; min: string; max: string; cache: string; cycle: boolean } | null
  cols: DdlCol[]
  cons: { name: string; definition: string; comment: string | null }[] // PK·UNIQUE·CHECK·EXCLUDE
  fks: { name: string; definition: string; comment: string | null }[]
  idx: { name: string; schema: string; definition: string; comment: string | null }[] // 제약 인덱스 제외
  trg: { name: string; definition: string; comment: string | null }[]
  rules: { definition: string }[]
  pol: { name: string; permissive: string; command: string; roles: string; using: string | null; with_check: string | null }[]
  grants: { grantee: string; privilege: string; grantable: boolean; column: string | null }[] // 명시 ACL 만(기본 ACL 이면 빈 배열)
}

// 옵션 text[] 'k=v' → k 'v'(외부 테이블 OPTIONS)
const optList = (a: string[]) =>
  a.map((x) => {
    const i = x.indexOf('=')
    return `${qi(x.slice(0, i))} ${lit(x.slice(i + 1))}`
  })

function colDef(c: DdlCol): string {
  let s = `\t${qi(c.name)} ${c.type}`
  if (c.collation) s += ` COLLATE ${qid(c.collation)}`
  if (c.generated && c.default) s += ` GENERATED ALWAYS AS (${c.default}) STORED`
  if (c.identity) s += ` GENERATED ${c.identity === 'a' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`
  s += c.nn ? ' NOT NULL' : ' NULL'
  if (c.default && !c.generated) s += ` DEFAULT ${c.default}`
  return s
}

// 권한 → GRANT 문(받는 쪽·칼럼·WITH GRANT 묶음 단위로 권한을 모음)
function grantLines(on: string, target: string, g: DdlIn['grants']): string[] {
  const m = new Map<string, string[]>()
  for (const x of g) {
    const k = JSON.stringify([x.grantee, x.column, x.grantable])
    ;(m.get(k) ?? m.set(k, []).get(k)!).push(x.privilege)
  }
  return [...m].map(([k, p]) => {
    const [who, col, opt] = JSON.parse(k) as [string, string | null, boolean]
    const priv = col ? p.map((x) => `${x}(${qi(col)})`).join(', ') : p.join(', ')
    return `GRANT ${priv} ON ${on} ${target} TO ${who === 'PUBLIC' ? 'PUBLIC' : qi(who)}${opt ? ' WITH GRANT OPTION' : ''};`
  })
}

// 주석 줄에 넣는 카탈로그 이름의 줄바꿈 무력화 — 이름에 개행이 있으면 주석이 끊겨 뒤 글자가 SQL 문장이 됨(2026-10-20 보안 검토)
const cm = (s: string) => s.replace(/[\r\n\u2028\u2029]/g, ' ')

export function buildDdl(o: DdlIn): string {
  const t = `${qi(o.schema)}.${qi(o.name)}`
  const kw = o.kind === 'v' ? 'VIEW' : o.kind === 'm' ? 'MATERIALIZED VIEW' : o.kind === 'f' ? 'FOREIGN TABLE' : o.kind === 'S' ? 'SEQUENCE' : 'TABLE'
  const out: string[] = [`-- DROP ${kw} ${cm(t)};`, '']
  const cmts: string[] = []
  if (o.comment != null) cmts.push(`COMMENT ON ${kw} ${t} IS ${lit(o.comment)};`)

  if (o.kind === 'S' && o.seq) {
    const q = o.seq
    out.push(`CREATE SEQUENCE ${t}\n\tAS ${q.type}\n\tINCREMENT BY ${q.inc}\n\tMINVALUE ${q.min}\n\tMAXVALUE ${q.max}\n\tSTART ${q.start}\n\tCACHE ${q.cache}\n\t${q.cycle ? 'CYCLE' : 'NO CYCLE'};`)
  } else if ((o.kind === 'v' || o.kind === 'm') && o.viewDef != null) {
    const def = o.viewDef.trim().replace(/;$/, '')
    out.push(o.kind === 'v' ? `CREATE OR REPLACE VIEW ${t}\nAS ${def};` : `CREATE MATERIALIZED VIEW ${t}${o.tablespace ? `\nTABLESPACE ${qi(o.tablespace)}` : ''}\nAS ${def}\nWITH DATA;`)
  } else if (o.partOf) {
    out.push(`CREATE TABLE ${t} PARTITION OF ${qi(o.partOf.schema)}.${qi(o.partOf.name)} ${o.partOf.bound}${o.partKey ? `\nPARTITION BY ${o.partKey}` : ''}${o.tablespace ? `\nTABLESPACE ${qi(o.tablespace)}` : ''};`)
  } else {
    const lines = o.cols.filter((c) => c.local).map(colDef)
    for (const c of o.cons) lines.push(`\tCONSTRAINT ${qi(c.name)} ${c.definition}`)
    const pre = o.kind === 'f' ? 'CREATE FOREIGN TABLE' : o.persistence === 'u' ? 'CREATE UNLOGGED TABLE' : o.persistence === 't' ? 'CREATE TEMPORARY TABLE' : 'CREATE TABLE'
    let s = `${pre} ${t} (\n${lines.join(',\n')}\n)`
    if (o.inherits.length) s += `\nINHERITS (${o.inherits.map((x) => `${qi(x.schema)}.${qi(x.name)}`).join(', ')})`
    if (o.partKey) s += `\nPARTITION BY ${o.partKey}`
    if (o.am) s += `\nUSING ${qi(o.am)}`
    if (o.foreign) s += `\nSERVER ${qi(o.foreign.server)}${o.foreign.options?.length ? `\nOPTIONS (${optList(o.foreign.options).join(', ')})` : ''}`
    if (o.options?.length) s += `\nWITH (\n\t${o.options.join(',\n\t')}\n)`
    if (o.tablespace) s += `\nTABLESPACE ${qi(o.tablespace)}`
    out.push(s + ';')
  }
  for (const i of o.idx) out.push(i.definition + ';')

  // 코멘트 — 테이블 → 칼럼 → 제약 → FK → 인덱스(DBeaver includeComments 순서)
  const colCmts = o.cols.filter((c) => c.comment != null).map((c) => `COMMENT ON COLUMN ${t}.${qi(c.name)} IS ${lit(c.comment!)};`)
  if (cmts.length) out.push('', '-- Table comment', '', ...cmts)
  if (colCmts.length) out.push('', '-- Column comments', '', ...colCmts)
  const conCmts = [...o.cons, ...o.fks].filter((c) => c.comment != null).map((c) => `COMMENT ON CONSTRAINT ${qi(c.name)} ON ${t} IS ${lit(c.comment!)};`)
  const idxCmts = o.idx.filter((c) => c.comment != null).map((c) => `COMMENT ON INDEX ${qi(c.schema)}.${qi(c.name)} IS ${lit(c.comment!)};`)
  if (conCmts.length || idxCmts.length) out.push('', '-- Constraint comments', '', ...conCmts, ...idxCmts)

  if (o.trg.length) {
    out.push('', '-- Table Triggers', '')
    for (const g of o.trg) {
      out.push(g.definition + ';')
      if (g.comment != null) out.push(`COMMENT ON TRIGGER ${qi(g.name)} ON ${t} IS ${lit(g.comment)};`)
    }
  }
  if (o.rules.length) out.push('', '-- Table Rules', '', ...o.rules.map((r) => r.definition.trim().replace(/;?$/, ';')))
  if (o.rls) out.push('', `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`)
  if (o.pol.length) {
    out.push('', '-- Table Policies', '')
    for (const p of o.pol)
      out.push(`CREATE POLICY ${qi(p.name)} ON ${t}\n\tAS ${p.permissive}\n\tFOR ${p.command}\n\tTO ${p.roles}${p.using != null ? `\n\tUSING (${p.using})` : ''}${p.with_check != null ? `\n\tWITH CHECK (${p.with_check})` : ''};`)
  }
  if (o.owner || o.grants.length) {
    out.push('', '-- Permissions', '')
    if (o.owner) out.push(`ALTER ${kw} ${t} OWNER TO ${qi(o.owner)};`)
    out.push(...grantLines(o.kind === 'S' ? 'SEQUENCE' : 'TABLE', t, o.grants))
  }
  if (o.fks.length) out.push('', '', `-- ${cm(o.schema)}.${cm(o.name)} foreign keys`, '', ...o.fks.map((f) => `ALTER TABLE ${t} ADD CONSTRAINT ${qi(f.name)} ${f.definition};`))
  return out.join('\n') + '\n'
}
