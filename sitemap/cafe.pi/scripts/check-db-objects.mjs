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

// .env.local의 DEV_DB_URL / PROD_DB_URL 자동 로드 (비밀번호 채팅/명령기록 노출 방지)
try {
  process.loadEnvFile('.env.local')
} catch {
  // .env.local 없으면 argv/기존 env 사용
}

const flags = process.argv.slice(2).filter((a) => a.startsWith('--'))
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const DETAIL = flags.includes('--detail') || process.env.DETAIL === '1'
const devConn = positional[0] || process.env.DEV_DB_URL
const prodConn = positional[1] || process.env.PROD_DB_URL
if (!devConn || !prodConn) {
  console.error(
    '사용법: node scripts/check-db-objects.mjs [--detail] "<dev-conn>" "<prod-conn>"',
  )
  console.error(
    '  또는 .env.local에 DEV_DB_URL / PROD_DB_URL 설정 후 인자 없이 실행',
  )
  console.error('  --detail : FUNCTION 본문 차이를 줄바꿈/공백/로직으로 분류')
  process.exit(1)
}

// Supabase pooler는 self-signed 인증서 체인 → uselibpqcompat=true로 libpq 표준 sslmode 의미 적용
// (암호화는 유지, 체인 검증만 생략). rejectUnauthorized:false 하드코딩보다 표준적이고 안전.
function withSslCompat(conn) {
  let c = conn
  if (!/[?&]sslmode=/.test(c))
    c += (c.includes('?') ? '&' : '?') + 'sslmode=require'
  if (!/[?&]uselibpqcompat=/.test(c)) c += '&uselibpqcompat=true'
  return c
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
  // 본문 해시는 CR 제거 후 계산 — dev(CRLF 적용) vs 운영(git LF replay)의 줄바꿈 차이를
  // 무시하고 "실제 로직"만 비교(거짓 불일치 노이즈 제거). 줄바꿈 차이는 --detail로 별도 확인.
  FUNCTION: `
    SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig,
           md5(replace(pg_get_functiondef(p.oid), E'\\r', '')) AS hash
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
  const client = new pg.Client({ connectionString: withSslCompat(conn) })
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
    `⚠️  총 ${totalIssues}건 불일치.` +
      (DETAIL ? '' : ' 본문 차이 성격 판별은 --detail 플래그로 재실행하세요.'),
  )
}

// ── 상세 분석 (--detail): FUNCTION 본문 차이를 줄바꿈/공백/로직으로 분류 ──
if (DETAIL) {
  console.log('\n' + '='.repeat(64))
  console.log('🔬 FUNCTION 본문 차이 상세 분석 — 차이의 "성격"을 판별합니다\n')
  const defQ = `
    SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig,
           pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.prokind IN ('f','p')`
  const getDefs = async (conn) => {
    const c = new pg.Client({ connectionString: withSslCompat(conn) })
    await c.connect()
    const { rows } = await c.query(defQ)
    await c.end()
    return new Map(rows.map((r) => [r.sig, r.def]))
  }
  const [dDefs, pDefs] = await Promise.all([
    getDefs(devConn),
    getDefs(prodConn),
  ])
  const eol = (s) => s.replace(/\r\n/g, '\n') // CRLF → LF 통일
  const ws = (s) =>
    eol(s)
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .trim()
  const eolOnly = [],
    wsOnly = [],
    logic = []
  for (const [sig, dDef] of dDefs) {
    const pDef = pDefs.get(sig)
    if (pDef === undefined || dDef === pDef) continue
    if (eol(dDef) === eol(pDef)) eolOnly.push(sig)
    else if (ws(dDef) === ws(pDef)) wsOnly.push(sig)
    else logic.push({ sig, dDef, pDef })
  }
  console.log(
    `  ① CRLF/LF 줄바꿈만 다름: ${eolOnly.length}건 (기능 100% 동일·안전)`,
  )
  console.log(`  ② 공백/들여쓰기만 다름: ${wsOnly.length}건 (기능 동일)`)
  console.log(`  ③ 로직(의미) 차이: ${logic.length}건`)
  for (const { sig, dDef, pDef } of logic) {
    const dL = ws(dDef).split('\n'),
      pL = ws(pDef).split('\n')
    let i = 0
    while (i < dL.length && i < pL.length && dL[i] === pL[i]) i++
    console.log(`\n   ⚠️  ${sig}`)
    console.log(`      DEV  L${i + 1}: ${(dL[i] ?? '(끝)').slice(0, 110)}`)
    console.log(`      PROD L${i + 1}: ${(pL[i] ?? '(끝)').slice(0, 110)}`)
  }
  if (logic.length === 0) {
    console.log(
      '\n  ✅ 로직 차이 0 — 모든 본문 불일치가 줄바꿈·공백뿐. 운영 함수는 dev와 기능적으로 동일합니다.',
    )
  }
}

process.exit(totalIssues === 0 ? 0 : 2)
