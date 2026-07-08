#!/usr/bin/env node
/**
 * da-ddl-guard — DA 표준 규칙 강제 Hook (PreToolUse)
 *
 * 정본 규칙: docs/da/데이터표준규칙.md
 * 점검 기준: docs/da/품질점검기준서.md
 *
 * 동작:
 *   - 규칙 전체 준수  → exit 0 (bypass — 물리모델 직행)
 *   - 규칙 위반       → exit 2 (차단 + DA 통보 → 승인절차)
 *   - DA 승인 주석    → exit 0 (-- DA-APPROVED: <사유> 가 SQL에 존재하면 통과)
 *
 * 검사 규칙: R1~R6 차단 / R7 경고
 */

// ---------- stdin 수신 ----------
let raw = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) raw += chunk

let input
try {
  input = JSON.parse(raw)
} catch {
  process.exit(0) // 파싱 불가 입력은 통과 (가드 오작동으로 작업 차단 방지)
}

const toolName = input.tool_name ?? ''
const toolInput = input.tool_input ?? {}

// ---------- 검사 대상 SQL 추출 ----------
let sql = null

if (toolName === 'Write' || toolName === 'Edit') {
  const fp = String(toolInput.file_path ?? '')
  if (/\.sql$/i.test(fp)) {
    sql = toolName === 'Write' ? toolInput.content : toolInput.new_string
  }
} else if (
  toolName === 'mcp__supabase__apply_migration' ||
  toolName === 'mcp__supabase__execute_sql'
) {
  sql = toolInput.query ?? toolInput.sql
}

if (typeof sql !== 'string' || sql.trim() === '') process.exit(0)

// DDL/DML 키워드 없으면 통과 (SELECT 등)
if (!/\b(CREATE|ALTER|DROP|DELETE|TRUNCATE)\b/i.test(sql)) process.exit(0)

// ---------- DA 승인 주석 → bypass ----------
if (/^\s*--\s*DA-APPROVED\s*:/im.test(sql)) {
  process.exit(0)
}

// ---------- 유틸 ----------
const violations = [] // { rule, msg }
const warnings = []

/** SQL 주석 제거본 (키워드 검사용) */
const sqlNoComments = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')

/** CREATE TABLE 블록 추출: [{ name, body }] */
function extractCreateTables(text) {
  const out = []
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)\s*\(/gi
  let m
  while ((m = re.exec(text)) !== null) {
    const name = m[1].replace(/^public\./i, '').replace(/"/g, '')
    // 괄호 짝 맞추기로 본문 추출
    let depth = 1
    let i = re.lastIndex
    while (i < text.length && depth > 0) {
      if (text[i] === '(') depth++
      else if (text[i] === ')') depth--
      i++
    }
    out.push({ name, body: text.slice(re.lastIndex, i - 1) })
  }
  return out
}

// ---------- R5: 물리삭제 금지 (전역) ----------
if (/\bDROP\s+TABLE\b/i.test(sqlNoComments)) {
  violations.push({
    rule: 'R5',
    msg: 'DROP TABLE 감지 — 물리삭제 절대 불가 (정본 §4-1). 논리삭제(del_yn=\'Y\' + del_dtm) 사용',
  })
}
if (/\bDELETE\s+FROM\b/i.test(sqlNoComments)) {
  violations.push({
    rule: 'R5',
    msg: 'DELETE FROM 감지 — 운영 데이터 물리삭제 금지 (정본 §4-1). UPDATE SET del_yn=\'Y\', del_dtm=CURRENT_TIMESTAMP 사용',
  })
}
if (/\bTRUNCATE\b/i.test(sqlNoComments)) {
  violations.push({
    rule: 'R5',
    msg: 'TRUNCATE 감지 — 물리삭제 금지 (정본 §4-1)',
  })
}

// ---------- R3: 소문자 원칙 (전역 — 따옴표 식별자 검사) ----------
const quotedUpper = sqlNoComments.match(/"[^"]*[A-Z][^"]*"/g)
if (quotedUpper) {
  violations.push({
    rule: 'R3',
    msg: `대문자 따옴표 식별자 감지: ${[...new Set(quotedUpper)].slice(0, 5).join(', ')} — PostgreSQL 모든 오브젝트는 소문자 (정본 §2-2)`,
  })
}

// ---------- CREATE TABLE 단위 검사 (R1·R2·R3·R4·R6) ----------
const PREFIX_RE = /^(sys_|brd_|std_|pi_|auth_|cod_|msg_|i18n_|approval_)/
const LOG_TABLE_RE = /(_log|_hist)$/
const SYS_COLS = [
  { col: 'regr_id', re: /\bregr_id\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'ADMIN'/i, spec: "regr_id TEXT NOT NULL DEFAULT 'ADMIN'" },
  { col: 'reg_dtm', re: /\breg_dtm\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+CURRENT_TIMESTAMP/i, spec: 'reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  { col: 'modr_id', re: /\bmodr_id\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'ADMIN'/i, spec: "modr_id TEXT NOT NULL DEFAULT 'ADMIN'" },
  { col: 'mod_dtm', re: /\bmod_dtm\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+CURRENT_TIMESTAMP/i, spec: 'mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP' },
]
// R7: 표준 도메인 약어 (컬럼명 마지막 토큰)
// crd = 좌표값(NUMERIC(11,8)) — 2026-06-12 위경도 표준화로 등재 (std_dom)
const DOMAIN_SUFFIXES = new Set([
  'id', 'uid', 'nm', 'cd', 'yn', 'dtm', 'dt', 'no', 'cnt', 'amt', 'sz', 'ord',
  'url', 'desc', 'txt', 'cont', 'key', 'pi', 'pct', 'seq', 'tp', 'sts', 'emoji', 'tag',
  'crd',
])

// 컬럼명이 표준 도메인 약어로 끝나는지 검사 (CREATE·ALTER 공통). 위반 시 warnings 적재
function checkColumnDomain(colName, tableName) {
  const lastToken = colName.toLowerCase().split('_').pop()
  if (!DOMAIN_SUFFIXES.has(lastToken)) {
    warnings.push(
      `컬럼 '${colName}' (${tableName}) — 표준 도메인 약어로 끝나지 않음 (정본 §1-3). 표준용어 형식: 단어1(_단어n)_도메인`,
    )
  }
}

/** ALTER TABLE ... ADD COLUMN 추출: [{ table, col, type }] — R7 사각지대 해소 */
function extractAlterAddColumns(text) {
  const out = []
  const re = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^\s;]+)([\s\S]*?)(?=;|$)/gi
  let m
  while ((m = re.exec(text)) !== null) {
    const table = m[1].replace(/^public\./i, '').replace(/"/g, '')
    const addRe = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_]+)\s+([A-Za-z0-9_()]+)/gi
    let a
    while ((a = addRe.exec(m[2])) !== null) {
      out.push({ table, col: a[1], type: a[2] })
    }
  }
  return out
}
const CONSTRAINT_LINE_RE = /^\s*(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT|REFERENCES|EXCLUDE)\b/i

for (const t of extractCreateTables(sqlNoComments)) {
  // R3: 테이블명 대문자
  if (/[A-Z]/.test(t.name)) {
    violations.push({ rule: 'R3', msg: `테이블명 '${t.name}' 에 대문자 포함 — 소문자 snake_case 필수 (정본 §2-2)` })
  }
  // R2: 도메인 접두사
  if (!PREFIX_RE.test(t.name.toLowerCase())) {
    violations.push({
      rule: 'R2',
      msg: `테이블명 '${t.name}' 도메인 접두사 누락 — sys_/brd_/std_/pi_/auth_/cod_/msg_/i18n_ 중 하나로 시작 (정본 §2-1)`,
    })
  }
  // R1: 시스템 컬럼 4개
  for (const c of SYS_COLS) {
    if (!c.re.test(t.body)) {
      violations.push({ rule: 'R1', msg: `테이블 '${t.name}' 시스템 컬럼 누락/형식 불일치: ${c.spec} (정본 §3-1)` })
    }
  }
  // R6: 논리삭제 컬럼 (로그성 테이블 제외)
  if (!LOG_TABLE_RE.test(t.name)) {
    if (!/\bdel_yn\b/i.test(t.body)) {
      violations.push({ rule: 'R6', msg: `테이블 '${t.name}' 에 del_yn CHAR(1) 누락 (정본 §4-1)` })
    }
    if (!/\bdel_dtm\b/i.test(t.body)) {
      violations.push({ rule: 'R6', msg: `테이블 '${t.name}' 에 del_dtm TIMESTAMPTZ 누락 — 신규 테이블은 삭제일시 필수 (정본 §4-1)` })
    }
  }
  // 컬럼 단위 검사 (R3·R4·R7)
  for (const line of t.body.split(/,(?![^(]*\))/)) {
    const trimmed = line.trim()
    if (trimmed === '' || CONSTRAINT_LINE_RE.test(trimmed)) continue
    const cm = trimmed.match(/^([A-Za-z0-9_]+)\s+([A-Za-z0-9_()]+)/)
    if (!cm) continue
    const [, colName, colType] = cm
    // R3: 컬럼명 대문자
    if (/[A-Z]/.test(colName)) {
      violations.push({ rule: 'R3', msg: `컬럼명 '${colName}' (${t.name}) 대문자 포함 — 소문자 필수 (정본 §2-2)` })
    }
    // R4: 날짜 컬럼 문자열 타입 금지
    if (/_(dt|dtm)$/i.test(colName) && /^(varchar|text|char|character)/i.test(colType)) {
      violations.push({
        rule: 'R4',
        msg: `컬럼 '${colName}' (${t.name}) 이 ${colType} 타입 — 날짜는 DATE/TIMESTAMPTZ(UTC) 필수 (정본 §3-5)`,
      })
    }
    // R7 (경고): 표준 도메인 약어 종결
    checkColumnDomain(colName, t.name)
  }
}

// ---------- R4·R7: ALTER TABLE ADD COLUMN 검사 (R7 사각지대 해소 — 2026-06-12) ----------
// 과거 lat/lng가 ALTER ADD COLUMN으로 들어와 R7 검사를 우회한 사례 재발방지
for (const c of extractAlterAddColumns(sqlNoComments)) {
  if (/[A-Z]/.test(c.col)) {
    violations.push({ rule: 'R3', msg: `컬럼명 '${c.col}' (${c.table}) 대문자 포함 — 소문자 필수 (정본 §2-2)` })
  }
  if (/_(dt|dtm)$/i.test(c.col) && /^(varchar|text|char|character)/i.test(c.type)) {
    violations.push({ rule: 'R4', msg: `컬럼 '${c.col}' (${c.table}) 이 ${c.type} 타입 — 날짜는 DATE/TIMESTAMPTZ(UTC) 필수 (정본 §3-5)` })
  }
  checkColumnDomain(c.col, c.table)
}

// ---------- 판정 ----------
if (violations.length === 0) {
  if (warnings.length > 0) {
    process.stderr.write(`[da-ddl-guard] ⚠️ 경고 ${warnings.length}건 (통과):\n` + warnings.map((w) => `  - ${w}`).join('\n') + '\n')
  }
  process.exit(0) // ✅ bypass — 물리모델 직행
}

// ⛔ 차단 + DA 승인절차 안내
const lines = []
lines.push(`⛔ [da-ddl-guard] DA 표준 위반 ${violations.length}건 — DDL이 차단되었습니다.`)
lines.push('')
for (const v of violations) lines.push(`  [${v.rule}] ${v.msg}`)
if (warnings.length > 0) {
  lines.push('')
  lines.push(`  ⚠️ 추가 경고 ${warnings.length}건:`)
  for (const w of warnings) lines.push(`  - ${w}`)
}
lines.push('')
lines.push('다음 절차를 따르세요 (정본 §0-4 bypass/승인절차):')
lines.push('  1. 위반 내역을 수정하여 표준을 준수하면 자동 통과(bypass)됩니다.')
lines.push('  2. 수정이 불가능한 예외 사유가 있으면, 위반 내역을 사용자(DA)에게 보고하고 승인을 요청하세요.')
lines.push("  3. DA 승인 시 SQL 최상단에 주석을 추가하면 통과합니다: -- DA-APPROVED: <승인사유> (<YYYY-MM-DD>)")
lines.push('')
lines.push('정본 규칙: docs/da/데이터표준규칙.md · 점검 기준: docs/da/품질점검기준서.md')

process.stderr.write(lines.join('\n') + '\n')
process.exit(2)
