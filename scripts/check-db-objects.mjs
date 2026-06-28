/**
 * DB 오브젝트 동기화 점검 — dev ↔ 운영DB 비(非)테이블 오브젝트 일치 검증.
 *
 * 어제 테이블 싱크 이후, 함수·프로시저·트리거·뷰·인덱스·시퀀스·확장이
 * 두 DB 간 "이름·시그니처·본문(md5 해시)"까지 동일한지 비교한다.
 * pg_dump 전체 복제 후 한쪽에만 적용된 CREATE OR REPLACE를 잡아내는 게 목적.
 *
 * 선행: pnpm i (pg 포함)
 * 사용:
 *   node scripts/check-db-objects.mjs "<DEV 연결문자열>" "<PROD 연결문자열>"
 *   (또는 환경변수 DEV_DB_URL / PROD_DB_URL)
 *   Supabase: Project Settings → Database → Connection string(URI). sslmode=require 권장.
 *
 * 읽기 전용(SELECT만) — 운영DB 읽기전용 모드에서도 안전. 어떤 쓰기도 하지 않는다.
 */

const devConn = process.argv[2] || process.env.DEV_DB_URL
const prodConn = process.argv[3] || process.env.PROD_DB_URL
if (!devConn || !prodConn) {
  console.error(
    '사용법: node scripts/check-db-objects.mjs "<dev-conn>" "<prod-conn>"',
  )
  console.error('  또는 환경변수 DEV_DB_URL / PROD_DB_URL 설정')
  process.exit(1)
}

let pg
try {
  pg = (await import('pg')).default
} catch {
  console.error('pg 미설치 → 먼저: pnpm i')
  process.exit(1)
}

// 각 오브젝트 카테고리: sig(식별자) + hash(본문 md5). hash=null이면 존재만 비교.
const QUERIES = {
  FUNCTION: `
    SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig,
           md5(pg_get_functiondef(p.oid)) AS hash
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
    ORDER BY 1`,
  TRIGGER: `
    SELECT event_object_table || '.' || trigger_name AS sig,
           md5(string_agg(action_timing || ' ' || event_manipulation || ' ' || action_statement,
                          ',' ORDER BY event_manipulation)) AS hash
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    GROUP BY 1 ORDER BY 1`,
  VIEW: `
    SELECT table_name AS sig, md5(view_definition) AS hash
    FROM information_schema.views WHERE table_schema = 'public' ORDER BY 1`,
  MATVIEW: `
    SELECT matviewname AS sig, md5(definition) AS hash
    FROM pg_matviews WHERE schemaname = 'public' ORDER BY 1`,
  INDEX: `
    SELECT indexname AS sig, md5(indexdef) AS hash
    FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1`,
  SEQUENCE: `
    SELECT sequence_name AS sig, NULL AS hash
    FROM information_schema.sequences WHERE sequence_schema = 'public' ORDER BY 1`,
  EXTENSION: `
    SELECT extname AS sig, extversion AS hash FROM pg_extension ORDER BY 1`,
}

async function inventory(conn, label) {
  // SSL은 연결문자열의 sslmode=require에 위임(공인 CA 검증 유지). TLS 검증 비활성화 금지.
  const client = new pg.Client({ connectionString: conn })
  await client.connect()
  const out = {}
  for (const [cat, q] of Object.entries(QUERIES)) {
    const { rows } = await client.query(q)
    out[cat] = new Map(rows.map((r) => [r.sig, r.hash]))
  }
  await client.end()
  console.log(
    `· ${label} 조회 완료: ` +
      Object.entries(out)
        .map(([k, v]) => `${k}=${v.size}`)
        .join(' '),
  )
  return out
}

function diffCat(devMap, prodMap) {
  const onlyDev = [] // 운영DB에 누락 (위험)
  const onlyProd = [] // dev에 없음 (잉여/구버전)
  const mismatch = [] // 본문 다름 (가장 위험)
  for (const [sig, hash] of devMap) {
    if (!prodMap.has(sig)) onlyDev.push(sig)
    else if (hash !== null && prodMap.get(sig) !== hash) mismatch.push(sig)
  }
  for (const sig of prodMap.keys()) if (!devMap.has(sig)) onlyProd.push(sig)
  return { onlyDev, onlyProd, mismatch }
}

console.log('🔍 DB 오브젝트 동기화 점검 (dev ↔ 운영DB)\n')
const dev = await inventory(devConn, 'DEV ')
const prod = await inventory(prodConn, 'PROD')

console.log('\n' + '='.repeat(64))
let totalIssues = 0
for (const cat of Object.keys(QUERIES)) {
  const { onlyDev, onlyProd, mismatch } = diffCat(dev[cat], prod[cat])
  const issues = onlyDev.length + onlyProd.length + mismatch.length
  totalIssues += issues
  const mark = issues === 0 ? '✅' : '⚠️ '
  console.log(
    `\n${mark} [${cat}] dev=${dev[cat].size} prod=${prod[cat].size} · 불일치 ${issues}`,
  )
  if (onlyDev.length) {
    console.log(`   🔴 운영DB에 누락(${onlyDev.length}) — dev에만 존재:`)
    onlyDev.forEach((s) => console.log(`      - ${s}`))
  }
  if (mismatch.length) {
    console.log(
      `   🟠 본문 다름(${mismatch.length}) — 한쪽에만 CREATE OR REPLACE 적용 의심:`,
    )
    mismatch.forEach((s) => console.log(`      ~ ${s}`))
  }
  if (onlyProd.length) {
    console.log(`   🟡 dev에 없음(${onlyProd.length}) — 운영DB 잉여/구버전:`)
    onlyProd.forEach((s) => console.log(`      + ${s}`))
  }
}

console.log('\n' + '='.repeat(64))
if (totalIssues === 0) {
  console.log(
    '✅ 완전 동기화 — 모든 비테이블 오브젝트가 dev와 운영DB에서 일치합니다.',
  )
} else {
  console.log(
    `⚠️  총 ${totalIssues}건 불일치 — 위 목록을 sql/ 마이그레이션으로 양쪽 재정렬 필요.`,
  )
  process.exit(2)
}
