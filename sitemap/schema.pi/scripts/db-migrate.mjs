// schema.pi DB 마이그레이션 — sql/NNN_*.sql 을 번호 순으로 적용하고 sys_mgrt_hist 에 파일명·SHA-256 기록
// 실행 : pnpm db:migrate [-- --dry-run]   (접속 문자열 SCHEMA_DATABASE_URL 은 .env.local, 커밋 금지)
// 규칙 : 적용된 파일은 수정 금지 — 해시가 바뀐 적용 파일을 발견하면 중단(새 번호 파일로 변경할 것)
import { readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import postgres from 'postgres'

const SQL_DIR = path.resolve(process.argv.find((a) => a.startsWith('--dir='))?.slice(6) ?? 'sql')
const DRY = process.argv.includes('--dry-run')
const url = process.env.SCHEMA_DATABASE_URL
if (!url) {
  console.error('✗ SCHEMA_DATABASE_URL 미설정 — .env.local 에 Supabase Connection string 등록 필요')
  process.exit(2)
}

const files = readdirSync(SQL_DIR).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort()
const sha = (t) => createHash('sha256').update(t).digest('hex')
const sql = postgres(url, { max: 1, onnotice: () => {}, prepare: false })

try {
  // 이력 테이블(append-only 로그 : 물리 삭제 허용 예외, 정본 §4-3)
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS sys_mgrt_hist (
      file_nm   TEXT        NOT NULL,                              -- 파일명
      file_hash TEXT        NOT NULL,                              -- 파일 SHA-256
      regr_id   TEXT        NOT NULL DEFAULT 'ADMIN',              -- 등록자ID
      reg_dtm   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,    -- 등록일시
      modr_id   TEXT        NOT NULL DEFAULT 'ADMIN',              -- 변경자ID
      mod_dtm   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,    -- 변경일시
      CONSTRAINT sys_mgrt_hist_pkey PRIMARY KEY (file_nm)
    );
    ALTER TABLE sys_mgrt_hist DISABLE ROW LEVEL SECURITY;
    REVOKE ALL ON sys_mgrt_hist FROM PUBLIC;
    DO $$ DECLARE r RECORD; BEGIN
      -- Supabase 기본 권한이 신규 테이블에 anon·authenticated 를 부여하므로 명시 회수(001 fn_grant_svc_only 와 같은 규칙)
      FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
        EXECUTE format('REVOKE ALL ON sys_mgrt_hist FROM %I', r.rolname);
      END LOOP;
    END $$;`)
  const done = new Map((await sql`SELECT file_nm, file_hash FROM sys_mgrt_hist`).map((r) => [r.file_nm, r.file_hash]))

  const pending = []
  for (const f of files) {
    const h = sha(readFileSync(path.join(SQL_DIR, f), 'utf8'))
    if (!done.has(f)) pending.push([f, h])
    else if (done.get(f) !== h) {
      throw new Error(`적용된 파일이 수정됨 : ${f} — 새 번호 파일로 변경하십시오`)
    }
  }
  console.log(`· 적용됨 ${done.size}건 / 대기 ${pending.length}건${DRY ? ' (dry-run)' : ''}`)
  for (const [f] of pending) console.log(`  - ${f}`)
  for (const [f, h] of DRY ? [] : pending) {
    await sql.unsafe(readFileSync(path.join(SQL_DIR, f), 'utf8'))
    await sql`INSERT INTO sys_mgrt_hist (file_nm, file_hash) VALUES (${f}, ${h})`
    console.log(`✓ ${f}`)
  }
} catch (e) {
  console.error('✗ 마이그레이션 실패 :', e.message)
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
