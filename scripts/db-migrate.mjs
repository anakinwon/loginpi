/**
 * 사이트 앱 DB 마이그레이션 — @pi/db baseline(packages/pi-db/sql) + 사이트 SQL(sitemap/<app>.pi/sql)을 파일명 순으로 적용 (PRD_28 §5).
 *
 * 대상 스키마(search_path) : dev = <app>_dev · stg = <app>_stg (공유 pi-nonprod 프로젝트) / prod = public (사이트 전용 프로젝트)
 * 1회 적용 보장 : 대상 스키마의 schema_migrations(file_nm PK + SHA-256) — 적용된 파일은 건너뛰고, 내용이 바뀌었으면 경고만(재적용 안 함)
 * 접속 문자열(pg) 우선순위 : --db-url > env <APP>_<TIER>_DATABASE_URL (예: SITEMAP_DEV_DATABASE_URL) > env DATABASE_URL
 *   sitemap/<app>.pi/.env.local 이 있으면 먼저 읽는다(이미 설정된 env 가 우선). Supabase 는 Session pooler(5432) 또는 Direct 접속 문자열 사용
 *
 * 사용:
 *   node scripts/db-migrate.mjs --app sitemap --tier dev --dry-run   # 적용 예정 목록만(접속 문자열 없으면 파일 목록만)
 *   node scripts/db-migrate.mjs --app sitemap --tier dev             # 실제 적용
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const argv = process.argv.slice(2)
const arg = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i > -1 ? argv[i + 1] : undefined
}
const DRY = argv.includes('--dry-run')
const APP = (arg('app') ?? '').replace(/\.pi$/, '')
const TIER = arg('tier')

if (!/^[a-z0-9-]+$/.test(APP) || !['dev', 'stg', 'prod'].includes(TIER)) {
  console.error(
    '사용: node scripts/db-migrate.mjs --app <site> --tier dev|stg|prod [--dry-run] [--db-url <pg url>]',
  )
  process.exit(2)
}

const APP_DIR = join(ROOT, 'sitemap', `${APP}.pi`)
if (!existsSync(APP_DIR)) {
  console.error(`✗ 앱 폴더 없음: sitemap/${APP}.pi`)
  process.exit(2)
}
if (existsSync(join(APP_DIR, '.env.local')))
  process.loadEnvFile(join(APP_DIR, '.env.local'))

// 스키마명은 식별자로 쓰이므로 하이픈 → 밑줄 (예: team-korea → team_korea_dev)
const SCHEMA = TIER === 'prod' ? 'public' : `${APP.replace(/-/g, '_')}_${TIER}`
const ENV_KEY = `${APP.replace(/-/g, '_').toUpperCase()}_${TIER.toUpperCase()}_DATABASE_URL`
const DB_URL = arg('db-url') ?? process.env[ENV_KEY] ?? process.env.DATABASE_URL

// 적용 순서 = baseline(공용) → 사이트. 각 폴더 안은 파일명(NNN_) 순
const sources = [
  ['pi-db', join(ROOT, 'packages', 'pi-db', 'sql')],
  [`${APP}.pi`, join(APP_DIR, 'sql')],
]
const files = sources.flatMap(([prefix, dir]) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map((f) => {
          const sql = readFileSync(join(dir, f), 'utf8')
          return {
            key: `${prefix}/${f}`,
            sql,
            sha: createHash('sha256').update(sql).digest('hex'),
          }
        })
    : [],
)

console.log(
  `앱 ${APP}.pi · tier ${TIER} · 스키마 ${SCHEMA} · 파일 ${files.length}개${DRY ? ' · DRY-RUN' : ''}`,
)

if (!DB_URL) {
  console.log(
    `접속 문자열 없음(--db-url 또는 env ${ENV_KEY} / DATABASE_URL) — 적용 상태 미확인, 파일 순서만 표시:`,
  )
  files.forEach((f, i) =>
    console.log(`  ${i + 1}. ${f.key}  sha256:${f.sha.slice(0, 12)}`),
  )
  process.exit(DRY ? 0 : 1)
}

const { default: pg } = await import('pg')
const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(DB_URL)
// Supabase 인증서는 Node 기본 신뢰 저장소에 없음 → 원격은 암호화만 강제(검증 생략), 로컬은 평문
const client = new pg.Client({
  connectionString: DB_URL,
  ssl: local ? false : { rejectUnauthorized: false },
})
await client.connect()

try {
  const ident = client.escapeIdentifier(SCHEMA)
  if (SCHEMA !== 'public') {
    if (DRY) {
      const { rowCount } = await client.query(
        'SELECT 1 FROM pg_namespace WHERE nspname = $1',
        [SCHEMA],
      )
      if (!rowCount)
        console.log(`  (스키마 ${SCHEMA} 없음 — 실제 실행 시 생성)`)
    } else {
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${ident}`)
    }
  }
  // 이후 모든 DDL 은 스키마 접두 없이 이 스키마에 생성된다(SQL 파일의 스키마 비의존 규칙)
  await client.query(`SET search_path TO ${ident}`)

  const applied = new Map()
  const { rows: hasTbl } = await client.query(
    `SELECT 1 FROM pg_tables WHERE schemaname = $1 AND tablename = 'schema_migrations'`,
    [SCHEMA],
  )
  if (hasTbl.length) {
    const { rows } = await client.query(
      'SELECT file_nm, chksum_val FROM schema_migrations',
    )
    rows.forEach((r) => applied.set(r.file_nm, r.chksum_val))
  } else if (!DRY) {
    // 마이그레이션 이력 — 도구 테이블(시스템 컬럼 2종만). 물리 DELETE 금지 원칙 동일
    await client.query(`CREATE TABLE schema_migrations (
      file_nm    TEXT        NOT NULL PRIMARY KEY,  -- 파일키 (pi-db/000_baseline.sql 등)
      chksum_val TEXT        NOT NULL,              -- SHA-256
      regr_id    TEXT        NOT NULL DEFAULT 'MIGRATE',
      reg_dtm    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`)
  }

  let pending = 0
  for (const f of files) {
    const prev = applied.get(f.key)
    if (prev) {
      console.log(
        `  = ${f.key} (적용됨${prev === f.sha ? '' : ' · ⚠ 적용 후 내용 변경 — 새 NNN 파일로 분리할 것'})`,
      )
      continue
    }
    pending++
    if (DRY) {
      console.log(`  + ${f.key} (적용 예정)`)
      continue
    }
    console.log(`  → ${f.key} 적용 중…`)
    // 파일 자체가 BEGIN/COMMIT 을 갖는다 — 실패 시 파일 단위 롤백 후 중단
    try {
      await client.query(f.sql)
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      throw new Error(`${f.key} 실패: ${e.message}`)
    }
    await client.query(
      'INSERT INTO schema_migrations (file_nm, chksum_val) VALUES ($1, $2)',
      [f.key, f.sha],
    )
    console.log(`  ✓ ${f.key}`)
  }
  // PostgREST 스키마 캐시 갱신(Supabase) — 일반 PostgreSQL 에선 수신자 없는 무해한 알림
  if (pending && !DRY) await client.query(`NOTIFY pgrst, 'reload schema'`)
  console.log(
    pending
      ? `${DRY ? '적용 예정' : '적용 완료'} ${pending}건`
      : '변경 없음 — 모두 적용됨',
  )
} catch (e) {
  console.error(`✗ ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
