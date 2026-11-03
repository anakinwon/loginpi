/**
 * 사이트 앱 DB 마이그레이션 — @pi/db baseline(packages/pi-db/sql) + 사이트 SQL(sitemap/<app>.pi/sql)을 파일명 순으로 적용 (PRD_28 §5).
 *
 * 대상 스키마(search_path) : dev = <app>_dev · stg = <app>_stg (공유 pi-nonprod 프로젝트) / prod = public (사이트 전용 프로젝트)
 * 1회 적용 보장 : 대상 스키마의 schema_migrations(file_nm PK + SHA-256) — 적용된 파일은 건너뛰고, 내용이 바뀌었으면 경고만(재적용 안 함)
 * 접속 문자열(pg) 우선순위 : --db-url > env <APP>_<TIER>_DATABASE_URL (예: SITEMAP_DEV_DATABASE_URL) > env DATABASE_URL
 *   sitemap/<app>.pi/.env.local 이 있으면 먼저 읽는다(이미 설정된 env 가 우선). Supabase 는 Session pooler(5432) 또는 Direct 접속 문자열 사용
 * 운영 가드(prod 만, 2026-11-03 sitemap 장애 — 운영 키가 pi-nonprod 를 가리켜 엉뚱한 DB 에 적용) :
 *   ① 접속 문자열의 Supabase ref 가 비운영 ref(nonprodRefs)와 같으면 접속 전 중단(dry-run 도 접속하지 않고 중단 — 엉뚱한 DB 를 '적용됨'으로 보여 주는 착각 방지)
 *   ② 대상 스키마의 앱 테이블 수 대조 출력, schema_migrations 가 없으면(첫 적용 = 000 부터 전부) --yes 없이는 중단
 *
 * 사용:
 *   node scripts/db-migrate.mjs --app sitemap --tier dev --dry-run   # 적용 예정 목록만(접속 문자열 없으면 파일 목록만)
 *   node scripts/db-migrate.mjs --app sitemap --tier dev             # 실제 적용
 *   node scripts/db-migrate.mjs --self-test                           # 운영 가드(ref 추출·판정) 자체 점검, DB 접속 없음
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
const YES = argv.includes('--yes')
const APP = (arg('app') ?? '').replace(/\.pi$/, '')
const TIER = arg('tier')

// Supabase 프로젝트 ref(20자) — Session pooler 사용자명 postgres.<ref> · Direct db.<ref>.supabase.co · 프로젝트 URL https://<ref>.supabase.co
function supabaseRef(s) {
  if (!s) return null
  return (
    s.match(/postgres\.([a-z0-9]{20})[:@]/)?.[1] ??
    s.match(/(?:\/\/|db\.)([a-z0-9]{20})\.supabase\.co/)?.[1] ??
    null
  )
}

// 비운영 ref 집합 = (앱이 비운영 스키마 SUPABASE_SCHEMA=<앱>_dev|stg 로 돌 때) Supabase 주소·*_DEV/STG_DATABASE_URL + NONPROD_SUPABASE_REFS(쉼표)
// SUPABASE_SCHEMA 가 비었거나 public 인 단일 프로젝트 앱(seminar·dbms)은 STAGING 주소 = 운영 프로젝트라 env 주소를 쓰지 않는다
function nonprodRefs(env) {
  const split = !!env.SUPABASE_SCHEMA && env.SUPABASE_SCHEMA !== 'public'
  const fromEnv = split
    ? Object.keys(env)
        .filter((k) =>
          /^(STAGING_|DEV_|NEXT_PUBLIC_)?SUPABASE_URL$|_(DEV|STG)_DATABASE_URL$/.test(
            k,
          ),
        )
        .map((k) => supabaseRef(env[k]))
    : []
  const extra = (env.NONPROD_SUPABASE_REFS ?? '')
    .split(',')
    .map((r) => r.trim().toLowerCase())
  return new Set([...fromEnv, ...extra].filter(Boolean))
}

// 운영 접속 문자열이 비운영 프로젝트를 가리키면 오류 문구(ref 앞 6자만 노출), 아니면 null
function prodRefError(dbUrl, env) {
  const ref = supabaseRef(dbUrl)
  if (!ref || !nonprodRefs(env).has(ref)) return null
  return `운영 키가 비운영 프로젝트를 가리킴 — 접속 문자열의 Supabase ref ${ref.slice(0, 6)}… 가 비운영(STAGING·DEV·STG 주소 또는 NONPROD_SUPABASE_REFS)과 같다. 운영 전용 프로젝트의 Session pooler 로 바꿀 것(docs/ENV_GUIDE.md 2절·5절)`
}

if (argv.includes('--self-test')) {
  const { strict: assert } = await import('node:assert')
  const NP = 'whexrbaaaaaaaaaaaaaa' // 비운영(가짜 ref)
  const PR = 'prodzzaaaaaaaaaaaaaa' // 운영(가짜 ref)
  const pooler = (r) =>
    `postgresql://postgres.${r}:p@ss:w0rd@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`
  const url = (r) => `https://${r}.supabase.co`
  assert.equal(supabaseRef(pooler(NP)), NP)
  assert.equal(
    supabaseRef(`postgresql://postgres:pw@db.${NP}.supabase.co:5432/postgres`),
    NP,
  )
  assert.equal(supabaseRef(url(NP)), NP)
  assert.equal(supabaseRef('postgresql://u:pw@localhost:5432/db'), null)
  assert.equal(supabaseRef(undefined), null)
  // 2026-11-03 장애 재현 : sitemap(sitemap_stg) 운영 키 = STAGING 프로젝트 → 차단, 문구에 ref 전체 미노출
  const sitemap = {
    SUPABASE_SCHEMA: 'sitemap_stg',
    STAGING_SUPABASE_URL: url(NP),
  }
  const err = prodRefError(pooler(NP), sitemap)
  assert.ok(err?.includes(NP.slice(0, 6)) && !err.includes(NP))
  assert.equal(prodRefError(pooler(PR), sitemap), null) // 올바른 운영 키는 통과
  assert.ok(
    prodRefError(pooler(NP), {
      SUPABASE_SCHEMA: 'x_dev',
      X_STG_DATABASE_URL: pooler(NP),
    }),
  )
  // 단일 프로젝트 앱(seminar·dbms) : STAGING = 운영 프로젝트 → 통과(기존 운영 적용 불변)
  assert.equal(
    prodRefError(pooler(PR), {
      SUPABASE_SCHEMA: 'public',
      STAGING_SUPABASE_URL: url(PR),
    }),
    null,
  )
  // 운영 읽기 전용 주소는 비운영이 아님
  assert.equal(
    prodRefError(pooler(PR), {
      SUPABASE_SCHEMA: 'x_stg',
      PROD_RO_SUPABASE_URL: url(PR),
    }),
    null,
  )
  // 명시 목록은 SUPABASE_SCHEMA 와 무관, 대소문자·공백 무시
  assert.ok(
    prodRefError(pooler(NP), {
      NONPROD_SUPABASE_REFS: ` ${NP.toUpperCase()} ,x`,
    }),
  )
  console.log('✓ 운영 가드 자체 점검 통과')
  process.exit(0)
}

if (!/^[a-z0-9-]+$/.test(APP) || !['dev', 'stg', 'prod'].includes(TIER)) {
  console.error(
    '사용: node scripts/db-migrate.mjs --app <site> --tier dev|stg|prod [--dry-run] [--yes] [--db-url <pg url>] | --self-test',
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

if (TIER === 'prod') {
  const err = prodRefError(DB_URL, process.env)
  if (err) {
    console.error(`✗ ${err}`)
    process.exit(1) // dry-run 포함 — 비운영 DB 에 접속해 '적용됨'을 보여 주지 않는다
  }
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
  if (TIER === 'prod') {
    // 운영 DB 대조 — 앱 SQL 이 만드는 테이블이 대상 스키마에 몇 개 있는지(엉뚱한 DB·수동 적용 DB 식별)
    const expected = new Set(
      files.flatMap((f) =>
        [
          ...f.sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z0-9_]+)/gi),
        ].map((m) => m[1].toLowerCase()),
      ),
    )
    const { rows: tbls } = await client.query(
      'SELECT tablename FROM pg_tables WHERE schemaname = $1',
      [SCHEMA],
    )
    const found = tbls.filter((t) => expected.has(t.tablename)).length
    console.log(
      `  운영 DB 대조 : ${SCHEMA} 앱 테이블 ${found}/${expected.size}개 · schema_migrations ${hasTbl.length ? '있음' : '없음'}`,
    )
    if (!hasTbl.length) {
      console.log(
        `  ⚠ 첫 적용 — 전 파일 ${files.length}개 적용 예정${found ? ` · 앱 테이블 ${found}개가 이미 있음 = 수동 적용 운영 DB 일 수 있다(000 부터 다시 돌리면 DDL·시드가 겹침 → 적용된 파일을 schema_migrations 에 먼저 등록)` : ''}`,
      )
      if (!DRY && !YES)
        throw new Error(
          '운영 첫 적용은 위 대조 결과를 확인한 뒤 --yes 를 붙여 실행',
        )
    }
  }
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
