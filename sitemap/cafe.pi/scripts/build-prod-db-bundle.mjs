/**
 * 운영DB 초기화 번들 생성기.
 * sql/*.sql 전체를 (번호, 파일명) 순서로 연결해 sql/_prod_db_bundle.sql 생성.
 * 신규 운영 Supabase에 1회 적용 → 스키마 + 참조 시드(i18n·테마·요금제 등),
 * 사용자 데이터는 없음(베타→GA clean start).
 *
 * 사용:  node scripts/build-prod-db-bundle.mjs
 * 적용:  psql "<운영DB 연결문자열>" -v ON_ERROR_STOP=1 -f sql/_prod_db_bundle.sql
 *        (또는 Supabase SQL editor에 분할 붙여넣기)
 *
 * ⚠️ _prod_db_bundle.sql은 파생물 → git 미커밋(.gitignore). 적용 직전 재생성 권장.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SQL_DIR = path.join(ROOT, 'sql')
const OUT_NAME = '_prod_db_bundle.sql'
const OUT = path.join(SQL_DIR, OUT_NAME)

const numOf = (f) => parseInt(f.match(/^(\d+)/)?.[1] ?? '999999', 10)

const files = fs
  .readdirSync(SQL_DIR)
  .filter((f) => f.endsWith('.sql') && f !== OUT_NAME)
  .sort((a, b) => numOf(a) - numOf(b) || a.localeCompare(b))

let out =
  '-- ════════════════════════════════════════════════════════\n' +
  '-- 운영DB 초기화 번들 (자동 생성 — scripts/build-prod-db-bundle.mjs)\n' +
  `-- ${files.length}개 마이그레이션을 (번호,파일명) 순서로 연결.\n` +
  '-- 신규 운영 Supabase에 1회 적용: 스키마 + 참조 시드, 사용자 데이터 없음.\n' +
  '-- 적용: psql "<운영DB 연결문자열>" -v ON_ERROR_STOP=1 -f sql/_prod_db_bundle.sql\n' +
  '-- ════════════════════════════════════════════════════════\n\n'

for (const f of files) {
  out += `\n-- ═══════════════ ${f} ═══════════════\n`
  // fresh DB 셋업: CONCURRENTLY 제거(빈 DB라 불필요 + 트랜잭션 충돌 방지). 결과 동일.
  out +=
    fs
      .readFileSync(path.join(SQL_DIR, f), 'utf8')
      .replace(/\bCONCURRENTLY\b/gi, '')
      .trimEnd() + '\n'
}

fs.writeFileSync(OUT, out, 'utf8')
console.log(
  `${files.length} files → sql/${OUT_NAME} (${(out.length / 1024).toFixed(0)} KB)`,
)
