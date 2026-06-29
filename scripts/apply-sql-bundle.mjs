/**
 * 운영DB 마이그레이션 러너 (재개 가능).
 * sql/*.sql 을 (번호,파일명) 순서로 신규 DB에 적용. 적용분은 _sql_migration_log에
 * 기록 → 재실행 시 건너뜀(오류 지점부터 재개 가능, 안전한 재시도).
 *
 * 선행: npm i pg
 * 사용: node scripts/apply-sql-bundle.mjs "<운영DB 연결문자열>"
 *       (또는 PROD_DB_URL 환경변수)
 *   Supabase: Project Settings → Database → Connection string(URI). sslmode=require 권장.
 *
 * ⚠️ 반드시 "신규 운영DB" 연결문자열에만 사용. 현재 운영DB에 돌리지 말 것.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const conn = process.argv[2] || process.env.PROD_DB_URL
if (!conn) {
  console.error(
    '연결문자열 필요: node scripts/apply-sql-bundle.mjs "<connection-string>"',
  )
  process.exit(1)
}

let pg
try {
  pg = (await import('pg')).default
} catch {
  console.error('pg 미설치 → 먼저: npm i pg')
  process.exit(1)
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SQL_DIR = path.join(ROOT, 'sql')
const numOf = (f) => parseInt(f.match(/^(\d+)/)?.[1] ?? '999999', 10)
const files = fs
  .readdirSync(SQL_DIR)
  .filter((f) => f.endsWith('.sql') && !f.startsWith('_'))
  .sort((a, b) => numOf(a) - numOf(b) || a.localeCompare(b))

const client = new pg.Client({ connectionString: conn })
await client.connect()

await client.query(
  'CREATE TABLE IF NOT EXISTS _sql_migration_log (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
)
const done = new Set(
  (await client.query('SELECT filename FROM _sql_migration_log')).rows.map(
    (r) => r.filename,
  ),
)

let applied = 0,
  skipped = 0
for (const f of files) {
  if (done.has(f)) {
    skipped++
    continue
  }
  // fresh DB 셋업: CONCURRENTLY 제거(빈 DB라 불필요 + 멀티문장 암묵 트랜잭션과 충돌). 결과 인덱스 동일.
  const sql = fs
    .readFileSync(path.join(SQL_DIR, f), 'utf8')
    .replace(/\bCONCURRENTLY\b/gi, '')
  try {
    await client.query(sql)
    await client.query('INSERT INTO _sql_migration_log(filename) VALUES($1)', [
      f,
    ])
    applied++
    console.log(`✓ ${f}`)
  } catch (e) {
    console.error(`\n✗ 실패: ${f}\n   ${e.message}`)
    console.error(
      `   → 해당 파일/순서 수정 후 재실행. 적용된 ${applied}건은 자동 건너뜀.`,
    )
    await client.end()
    process.exit(1)
  }
}

await client.end()
console.log(
  `\n✅ 완료 — 신규 적용 ${applied} · 기존 건너뜀 ${skipped} · 총 ${files.length}`,
)
