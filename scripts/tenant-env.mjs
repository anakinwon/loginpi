#!/usr/bin/env node
// 멀티테넌트 환경설정 생성기(2026-10-24 마스터 지시) — 키별 구하는 곳·공유 규칙 정본 = docs/ENV_GUIDE.md
//   node scripts/tenant-env.mjs multi                      # 모든 앱 .env.local → 루트 .env.multi 모음 재생성
//   node scripts/tenant-env.mjs header --port 3003 --name seminar   # 환경값 출처(사이트·메뉴) 안내 블록만 출력
//   node scripts/tenant-env.mjs new <domain> [--port 3003] [--out <dir>]
//     → sitemap/<domain>/ 에 .env.example · .env.local(로컬·스테이징) · .env.vercel-prod(운영 Vercel 등록용) + docs/PRD·ROADMAP·TROUBLESHOOT 골격 · CLAUDE.md · .claude/settings.json 한 세트 생성, sites.json appSts → BUILDING
//       비밀키는 새로 생성, 공유 키는 기존 앱에서 복사, 포털 발급 값은 빈 칸 + 구하는 곳 주석. 기존 파일은 덮어쓰지 않음
//   ⚠ 생성 파일은 비밀값 포함 — 모두 .gitignore(.env*) 대상(.env.example 만 커밋)
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const TEMPLATE = 'sitemap/sitemap.pi/.env.example' // 신규 사이트 앱 템플릿(키·주석 정본)
const MON_URL = 'https://schem.vercel.app/api/mon/ingest'
const secret = () => randomBytes(48).toString('base64url')
// 비밀값 파일은 소유자만 읽기·쓰기(0600) — mode 는 새 파일에만 적용되므로 기존 파일도 chmod(Windows 는 무시됨)
const writeSecret = (p, body) => {
  writeFileSync(p, body, { mode: 0o600 })
  chmodSync(p, 0o600)
}

// 앱 목록 — 루트(cafe.pi) + sitemap/<domain>.pi 폴더 중 .env.local 이 있는 것
function apps() {
  const list = [{ name: 'cafe.pi', dir: '.' }]
  for (const d of readdirSync(join(ROOT, 'sitemap'), { withFileTypes: true }))
    if (d.isDirectory() && d.name.endsWith('.pi')) list.push({ name: d.name, dir: `sitemap/${d.name}` })
  // 순서 = cafe.pi → 사이트 앱들 → schema.pi(모니터링 수집처라 맨 뒤)
  return list
    .filter((a) => existsSync(join(ROOT, a.dir, '.env.local')))
    .sort((a, b) => (a.name === 'schema.pi') - (b.name === 'schema.pi'))
}

// KEY=VALUE 읽기 — 같은 키가 반복되면 뒤 값(Next.js 로딩과 같음)
function load(p) {
  const env = {}
  for (const line of readFileSync(join(ROOT, p), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line)
    if (m) env[m[1]] = m[2]
  }
  return env
}

// 키 → 묶음(멀티테넌트에서 시스템 간 맞춰야 하는 순서). 정의 없는 키는 '기타'
const GROUPS = [
  ['앱 · 등급', /^(NEXT_PUBLIC_APP_URL|APP_TIER|NEXT_PUBLIC_PI_APP_DOMAIN|ADMIN_PI_)/],
  ['Pi 인증 · 결제 (Pi Developer Portal — 앱마다 다름)', /^(NEXT_PUBLIC_PI_|PI_)/],
  ['Google 로그인 (NextAuth v5 — 앱마다 다름)', /^(AUTH_SECRET|GOOGLE_CLIENT_|NEXT_PUBLIC_GOOGLE_LOGIN)/],
  ['DB (Supabase — 운영 = 앱 전용 프로젝트, 비운영 = pi-nonprod + 스키마)', /(SUPABASE|DATABASE_URL|DB_URL|DB_TARGET)/],
  ['크론 · 모니터링 (MON_* = 세 시스템 같은 값)', /^(CRON_SECRET|MON_INGEST_)/],
]
const groupOf = (k) => GROUPS.find(([, re]) => re.test(k))?.[0] ?? '기타 (앱 전용 — 외부 API·배포 도구)'

function section(env) {
  const out = []
  for (const g of [...GROUPS.map(([n]) => n), '기타 (앱 전용 — 외부 API·배포 도구)']) {
    const ks = Object.keys(env).filter((k) => groupOf(k) === g)
    if (ks.length) out.push('', `# --- ${g}`, ...ks.map((k) => `${k}=${env[k]}`))
  }
  return out
}

// ── multi : .env.multi 재생성 ───────────────────────────────────────────
function multi() {
  const sites = JSON.parse(readFileSync(join(ROOT, 'sitemap/sites.json'), 'utf8')).sites
  const all = apps()
  // 모니터링 키는 운영 Vercel 에만 있어 로컬에 없을 수 있음 — 어느 앱이든 가진 값을 공유(세 시스템 같은 값)
  const monKey = all.map((a) => load(`${a.dir}/.env.local`).MON_INGEST_KEY).find(Boolean) ?? readMulti('MON_INGEST_KEY')
  const out = [
    '# ============================================================================',
    '# .env.multi — 멀티테넌트 환경설정 모음 (자동 생성 : node scripts/tenant-env.mjs multi)',
    `# 생성 ${new Date().toISOString().slice(0, 10)} · 출처 = 각 앱 .env.local(로컬·스테이징 값). 운영 값 정본 = Vercel 프로젝트 env`,
    '# 키별 구하는 곳·공유 규칙 = docs/ENV_GUIDE.md',
    '# ⚠ 비밀값 포함 — .gitignore(.env*) 로 커밋 제외. 공유·업로드 금지. 앱은 이 파일을 읽지 않음(참조용)',
    '# ============================================================================',
  ]
  all.forEach((a, i) => {
    const n = i + 1
    const site = sites.find((s) => s.domain === a.name)
    const env = load(`${a.dir}/.env.local`)
    if (monKey && !env.MON_INGEST_KEY) env.MON_INGEST_KEY = monKey
    if (a.name !== 'schema.pi' && !env.MON_INGEST_URL) env.MON_INGEST_URL = MON_URL
    out.push(
      '', '#'.repeat(78), `# ${n}. ${a.name}`, '#'.repeat(78),
      `#   ${n}.1. 설명: ${DESC[a.name] ?? `${site?.ctgr ?? ''} ${site?.preset ?? ''} 사이트 앱(${a.dir})`.trim()}`,
      `#   ${n}.2. URL:`,
      ...(URLS[a.name] ?? [`운영 : ${site?.url ?? '[확인중]'}`, `로컬 : ${env.NEXT_PUBLIC_APP_URL ?? '[확인중]'}`]).map((u) => `#        - ${u}`),
      `#   ${n}.3. ENV_KEY=VALUE  (출처 ${a.dir}/.env.local)`,
      ...section(env),
    )
  })
  writeSecret(join(ROOT, '.env.multi'), out.join('\n') + '\n')
  console.log(`.env.multi 재생성 — 앱 ${all.length}개 : ${all.map((a) => a.name).join(', ')}`)
}
const readMulti = (k) => (existsSync(join(ROOT, '.env.multi')) ? load('.env.multi')[k] : undefined)

const DESC = {
  'cafe.pi': 'Pi 커뮤니티 카페·상점·게시판(루트 앱). Vercel 운영 cafe(production 브랜치) / 스테이징 loginpi(master)',
  'sitemap.pi': 'Pi 생태계 사이트 지도·등록 신청. Vercel 운영 sitemaps(prod/sitemap) / 비운영 스키마 sitemap_dev·sitemap_stg',
  'schema.pi': '데이터 표준·모델링·모니터링 수집처(/api/mon/ingest). Vercel 운영 schema(prod/schema)',
}
const URLS = {
  'cafe.pi': ['운영 : https://cafepi.vercel.app (Pi 앱 도메인 [확인중] cafe7092.pinet.com)', '스테이징 : https://loginpi.vercel.app (Pi 앱 도메인 apppilogintestbd3106.pinet.com)', '로컬 : http://localhost:3000'],
  'sitemap.pi': ['운영 : [확인중] (Vercel 프로젝트 sitemaps 도메인)', '스테이징 : https://sitemapst.vercel.app', '로컬 : http://localhost:3001'],
  'schema.pi': ['운영 : https://schem.vercel.app', '로컬 : http://localhost:3002'],
}

// ── new : 신규 테넌트 설정 한 세트 ─────────────────────────────────────
function create(domain, port, outDir) {
  if (!/^[a-z][a-z0-9-]*\.pi$/.test(domain)) throw new Error(`도메인 형식 오류 : ${domain} (예 : yea.pi)`)
  const name = domain.replace(/\.pi$/, '')
  const NAME = name.toUpperCase().replace(/-/g, '_')
  const dir = outDir ?? join(ROOT, 'sitemap', domain)
  mkdirSync(dir, { recursive: true, mode: 0o700 })

  // 템플릿 — sitemap 전용 키는 빼고, 마이그레이션 키 이름은 새 앱 이름으로
  const tpl = readFileSync(join(ROOT, TEMPLATE), 'utf8')
    .replaceAll('sitemap.pi', domain)
    .replace(/^# .*\n(?:# .*\n)*SITEMAP_(VERIFY_SECRET|SHOW_SAMPLES)=\n/gm, '')
    .replaceAll('SITEMAP_', `${NAME}_`)
    .replaceAll('sitemap_dev', `${name}_dev`).replaceAll('sitemap_stg', `${name}_stg`)
    .replace(/\bsitemap(?=NNNN| 앱| 전용)/g, name)
  const keys = [...tpl.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1])

  // 기존 앱에서 복사할 공유 값 — 비운영 Supabase(pi-nonprod) 는 sitemap.pi 와 같은 프로젝트, 관리자·모니터링 키는 전 시스템 공통
  const sm = load('sitemap/sitemap.pi/.env.local')
  const monKey = readMulti('MON_INGEST_KEY') ?? ''
  const local = {
    NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
    NEXT_PUBLIC_PI_SANDBOX: 'true',
    PI_SESSION_SECRET: secret(),
    AUTH_SECRET: secret(),
    NEXT_PUBLIC_GOOGLE_LOGIN: '1',
    CRON_SECRET: secret(),
    ADMIN_PI_USERNAMES: sm.ADMIN_PI_USERNAMES ?? '',
    APP_TIER: 'staging',
    STAGING_SUPABASE_URL: sm.STAGING_SUPABASE_URL ?? '',
    STAGING_SUPABASE_SERVICE_ROLE_KEY: sm.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? '',
    SUPABASE_SCHEMA: `${name}_stg`,
  }
  const prod = {
    NEXT_PUBLIC_APP_URL: '[확인중 : 운영 도메인]',
    NEXT_PUBLIC_PI_SANDBOX: 'false',
    PI_SESSION_SECRET: secret(), // 운영은 로컬과 다른 값(환경별 별도)
    AUTH_SECRET: secret(),
    NEXT_PUBLIC_GOOGLE_LOGIN: '1',
    CRON_SECRET: secret(),
    MON_INGEST_URL: MON_URL,
    MON_INGEST_KEY: monKey,
    ADMIN_PI_USERNAMES: sm.ADMIN_PI_USERNAMES ?? '',
    SUPABASE_SCHEMA: '',
  }
  const render = (vals, title) =>
    [
      `# ${domain} ${title} — node scripts/tenant-env.mjs new 로 생성(${new Date().toISOString().slice(0, 10)}), 키 설명은 .env.example`,
      '# 빈 값 = 직접 발급 필요(docs/ENV_GUIDE.md 의 구하는 곳 참조)',
      ...keys.flatMap((k) => (k in vals ? [`${k}=${vals[k]}`] : [`${k}=`])),
    ].join('\n') + '\n'

  const site = JSON.parse(readFileSync(join(ROOT, 'sitemap/sites.json'), 'utf8')).sites.find((s) => s.domain === domain)
  const files = [
    ['.env.example', tpl],
    ['.env.local', renderStaged(keys, local, domain, NAME, port)],
    ['.env.vercel-prod', render(prod, '운영 Vercel 등록용(Settings → Environment Variables → Production) — 앱이 읽지 않음, 등록 후 보관')],
    // 첫 할 일 문서·설정 — 앱 코드 골격(_template)은 만들지 않는다(PRD_28 §3 선제 작성 금지)
    ['docs/PRD.md', prdDoc(domain, name, site)],
    ['docs/ROADMAP.md', roadmapDoc(domain, name, port)],
    ['docs/TROUBLESHOOT.md', troubleDoc(domain)],
    ['CLAUDE.md', claudeDoc(domain)],
    ['.claude/settings.json', readFileSync(join(ROOT, 'sitemap/sitemap.pi/.claude/settings.json'), 'utf8').replace('"sitemap.pi"', JSON.stringify(domain))],
  ]
  for (const [f, body] of files) {
    const p = join(dir, f)
    if (existsSync(p)) console.log(`건너뜀(이미 있음) : ${relative(ROOT, p)}`)
    else {
      mkdirSync(join(p, '..'), { recursive: true })
      if (f.startsWith('.env.') && f !== '.env.example') writeSecret(p, body)
      else writeFileSync(p, body) // 비밀값 없음 — 커밋 대상
      console.log(`생성 : ${relative(ROOT, p)}`)
    }
  }
  if (!outDir) markBuilding(domain, site)
  // 로컬에서 비워 둬도 되는 키 — 운영 전용(모니터링·운영 DB·uid)·선택(Pi Sign-In·운영 읽기 전용·dev tier)
  const optional = new RegExp(`^(MON_INGEST_|PROD_RO_|STAGING_DB_TARGET|DEV_SUPABASE_|ADMIN_PI_UIDS|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_PI_OAUTH_CLIENT_ID|${NAME}_PROD_)`)
  const empty = keys.filter((k) => !local[k])
  const need = empty.filter((k) => !optional.test(k))
  console.log(`\n직접 발급 필수 ${need.length}개 : ${need.join(', ')}`)
  console.log(`운영·선택(로컬은 비워도 됨) ${empty.length - need.length}개 : ${empty.filter((k) => optional.test(k)).join(', ')}`)
  console.log('→ 구하는 곳 docs/ENV_GUIDE.md 3절')
  console.log(`\n다음 할 일 = sitemap/multitenant_create_TODO-List.md (단계 0 결정 → 2 PRD 확정 → 3 앱 골격 …), 진행 현황 표에 ${domain} 행 추가`)
  if (!outDir) multi()
}

// 환경값을 얻는 사이트·메뉴 안내 — .env.local 상단 블록(단일 소스, 상세 = docs/ENV_GUIDE.md 3절). 손으로 정리한 파일엔 `header` 명령 출력을 붙인다
function sourcesHeader(port, NAME) {
  return [
    '# ----------------------------------------------------------------',
    '# 환경값을 얻는 곳 (사이트 → 메뉴) — 상세 docs/ENV_GUIDE.md 3절',
    '# ----------------------------------------------------------------',
    '# [1] Pi Developer Portal — Pi Browser 주소창 develop.pi → Develop → 앱 선택(testnet·mainnet 앱 따로)',
    '#     NEXT_PUBLIC_PI_APP_DOMAIN      앱 화면 맨 위 "Open app" 주소(예 https://xxxxNNNN.pinet.com/)',
    '#     PI_API_KEY                     앱 화면 → API Key → Generate (한 번만 보임 — 즉시 복사)',
    '#     PI_DOMAIN_VALIDATION_KEY       앱 체크리스트 → Verify domain(도메인 검증) 단계의 키',
    '#     NEXT_PUBLIC_PI_OAUTH_CLIENT_ID 앱 화면 → Pi Sign-In → Client ID (콜백 <앱URL>/auth/pi/callback 등록)',
    '#     PI_WALLET_ADDRESS·SEED         앱 화면 → App Wallet (A2U 지급을 쓸 때만)',
    '# [2] Google Cloud Console — https://console.cloud.google.com/apis/credentials (상단에서 프로젝트 선택)',
    '#     GOOGLE_CLIENT_ID·GOOGLE_CLIENT_SECRET  ① 처음이면 OAuth 동의 화면(Google 인증 플랫폼 → 브랜딩·대상) 먼저 설정',
    '#                                    ② + 사용자 인증 정보 만들기 → OAuth 클라이언트 ID → 유형 "웹 애플리케이션"',
    `#                                    ③ 승인된 JavaScript 원본 http://localhost:${port} (운영은 운영 도메인 추가)`,
    `#                                    ④ 승인된 리디렉션 URI http://localhost:${port}/api/auth/callback/google (운영은 운영 도메인 추가)`,
    '#                                    ⑤ 만들기 → 팝업의 "클라이언트 ID"·"클라이언트 보안 비밀번호" 복사',
    '# [3] Supabase — https://supabase.com/dashboard → 프로젝트 선택(비운영 = pi-nonprod, 운영 = 사이트 전용 프로젝트)',
    '#     *_SUPABASE_URL                 Project Settings → Data API → Project URL',
    '#     *_SERVICE_ROLE_KEY             Project Settings → API Keys → secret 키(또는 Legacy API keys 탭의 service_role) — 서버 전용',
    '#     PROD_RO_SUPABASE_KEY           운영 프로젝트의 읽기 전용 권한 키 — 전권 secret 키 사용 금지, 발급 방식 [확인중 : 마스터] (STAGING_DB_TARGET=prod-ro 일 때만)',
    '#     *_PUBLISHABLE_KEY              Project Settings → API Keys → publishable',
    `#     ${NAME}_*_DATABASE_URL         화면 상단 Connect → Session pooler(5432) 접속 문자열 — Vercel 등록 금지`,
    '#     (스키마 노출)                  Project Settings → Data API → Exposed schemas 에 <이름>_dev·<이름>_stg 추가',
    '# [4] Vercel — https://vercel.com/dashboard → 프로젝트 → Settings → Environment Variables',
    '#     운영 값 등록처(Production) — .env.vercel-prod 값을 옮겨 붙이고 재배포',
    '# [5] 직접 생성(사이트 없음) — AUTH_SECRET·PI_SESSION_SECRET·CRON_SECRET 등 비밀키',
    `#     node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  (생성기가 이미 채움)`,
    '# [6] 기존 앱에서 복사 — ADMIN_PI_USERNAMES·STAGING_SUPABASE_*(sitemap/sitemap.pi/.env.local), MON_INGEST_KEY·MON_INGEST_URL(루트 .env.multi — 운영만)',
    '#     ADMIN_PI_UIDS                  관리자가 이 앱(메인넷)에 Pi 로그인한 뒤 Supabase Table Editor → sys_user 의 pi_uid (앱·네트워크마다 값이 다름)',
    '# [7] 그 밖의 외부 서비스(Anthropic·Gemini·GitHub·Telegram·Resend·Google Maps) — ENV_GUIDE 3.6 표',
    '# [8] 설정값(사이트 없음 — 직접 정함)',
    `#     NEXT_PUBLIC_APP_URL            로컬 http://localhost:${port} · 운영은 운영 도메인`,
    '#     NEXT_PUBLIC_PI_SANDBOX         testnet·스테이징·로컬 true, 메인넷 운영 false',
    '#     NEXT_PUBLIC_GOOGLE_LOGIN       Google 로그인 버튼 노출 1(예외 승인 사이트만)',
    '#     APP_TIER                       dev · staging · prod (비우면 VERCEL_ENV 로 판정)',
    '#     SUPABASE_SCHEMA                비운영 <이름>_dev·<이름>_stg, 운영은 비움(public)',
    '#     STAGING_DB_TARGET              스테이징에서 운영 DB 를 읽기 전용으로 볼 때만 prod-ro',
  ]
}

// .env.local 을 '언제 채우나' 단계별로 — ✅ 값 있음 · ⬜ 비어 있음 + 키별 구하는 곳(ENV_GUIDE 3절 요약). 단계에 없는 키는 '기타'로 보존
function renderStaged(keys, vals, domain, NAME, port) {
  const N = {
    NEXT_PUBLIC_APP_URL: `로컬 주소 http://localhost:${port}`,
    NEXT_PUBLIC_PI_SANDBOX: '로컬·스테이징 true (메인넷 운영만 false)',
    PI_SESSION_SECRET: '세션 서명 비밀키 — 자동 생성(운영은 .env.vercel-prod 의 다른 값)',
    AUTH_SECRET: 'Google 로그인(NextAuth) 비밀키 — 자동 생성',
    NEXT_PUBLIC_GOOGLE_LOGIN: 'Google 로그인 버튼 노출 1',
    CRON_SECRET: '크론 호출 비밀키 — 자동 생성',
    ADMIN_PI_USERNAMES: '관리자 Pi 사용자명 — 기존 앱과 같은 값',
    APP_TIER: 'staging — 비운영 DB(pi-nonprod) 사용',
    SUPABASE_SCHEMA: '비운영 스키마(<이름>_stg)',
    STAGING_SUPABASE_URL: 'pi-nonprod 프로젝트 주소 — sitemap.pi 에서 복사',
    STAGING_SUPABASE_SERVICE_ROLE_KEY: 'pi-nonprod 서버 키 — sitemap.pi 에서 복사',
    NEXT_PUBLIC_PI_APP_DOMAIN: 'Portal 앱 화면 "Open app" 주소 — ENV_GUIDE 3.2',
    PI_API_KEY: 'Portal → API Key → Generate(한 번만 표시)',
    PI_DOMAIN_VALIDATION_KEY: 'Portal 체크리스트 → 도메인 검증 키',
    NEXT_PUBLIC_PI_OAUTH_CLIENT_ID: '(선택) 일반 브라우저 Pi 로그인 — Portal → Pi Sign-In',
    GOOGLE_CLIENT_ID: `Google Cloud Console → OAuth 클라이언트(리디렉션 http://localhost:${port}/api/auth/callback/google) — ENV_GUIDE 3.3`,
    GOOGLE_CLIENT_SECRET: '위와 같은 화면',
    [`${NAME}_STG_DATABASE_URL`]: 'pi-nonprod → Connect → Session pooler(5432) — 마이그레이션 전용, Vercel 등록 금지',
    [`${NAME}_DEV_DATABASE_URL`]: '위와 같은 접속 문자열(dev 스키마 적용 시)',
    DEV_SUPABASE_URL: '(선택) APP_TIER=dev 로 돌릴 때만',
    DEV_SUPABASE_SERVICE_ROLE_KEY: '(선택) 위와 같음',
    NEXT_PUBLIC_SUPABASE_URL: '운영 사이트 전용 Supabase 주소',
    SUPABASE_SERVICE_ROLE_KEY: '운영 서버 키',
    MON_INGEST_URL: '모니터링 수집 주소 — 운영만',
    MON_INGEST_KEY: '세 시스템 공통 값 — 운영만',
    ADMIN_PI_UIDS: '운영 관리자 Pi uid(메인넷 앱 기준)',
    [`${NAME}_PROD_DATABASE_URL`]: '운영 DB 마이그레이션 때만 잠시 사용',
    STAGING_DB_TARGET: '(선택) 스테이징에서 운영 DB 읽기 전용 볼 때',
    PROD_RO_SUPABASE_URL: '(선택) 위와 같음',
    PROD_RO_SUPABASE_KEY: '(선택) 위와 같음',
  }
  const STEPS = [
    ['STEP 1 — Pi 로그인을 붙일 때 (Pi Developer Portal testnet 앱 등록 후)', ['NEXT_PUBLIC_PI_APP_DOMAIN', 'PI_API_KEY', 'PI_DOMAIN_VALIDATION_KEY', 'NEXT_PUBLIC_PI_OAUTH_CLIENT_ID']],
    ['STEP 2 — Google 연동을 붙일 때 (마스터 예외 승인 사이트만 — PRD 4절)', ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']],
    ['STEP 3 — 첫 DB 테이블을 만들 때 (sql/001)', [`${NAME}_STG_DATABASE_URL`, `${NAME}_DEV_DATABASE_URL`, 'DEV_SUPABASE_URL', 'DEV_SUPABASE_SERVICE_ROLE_KEY']],
    ['STEP 4 — 운영 전용 (로컬은 비워 둠 — 값은 .env.vercel-prod 에 모아 Vercel Production 에 등록)', ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'MON_INGEST_URL', 'MON_INGEST_KEY', 'ADMIN_PI_UIDS', `${NAME}_PROD_DATABASE_URL`, 'STAGING_DB_TARGET', 'PROD_RO_SUPABASE_URL', 'PROD_RO_SUPABASE_KEY']],
  ]
  const left = new Set(keys)
  const line = (k, note) => {
    left.delete(k)
    return [`# ${vals[k] ? '✅' : '⬜'} ${note ?? ''}`.trimEnd(), `${k}=${vals[k] ?? ''}`]
  }
  const head = (t) => ['', '# ================================================================', `# ${t}`, '# ================================================================']
  // STEP 0 = 생성기가 값을 넣은 키(비밀키 생성·공유 값 복사)
  const out = [
    '# ================================================================',
    `# ${domain} .env.local — "언제 설정하나" 단계별 정리 (node scripts/tenant-env.mjs new 생성, ${new Date().toISOString().slice(0, 10)})`,
    '# ✅ = 값 있음 · ⬜ = 아직 비어 있음(해당 단계가 오면 채움) · 키 설명은 .env.example',
    '# 키별 구하는 곳 = docs/ENV_GUIDE.md 3절 · 전체 단계 = sitemap/multitenant_create_TODO-List.md',
    '# ⚠ 비밀값 포함 — git 제외(.gitignore). 값을 바꾸면 dev 서버 재시작',
    '# ================================================================',
    ...sourcesHeader(port, NAME),
    ...head('STEP 0 — 이미 설정됨 (생성기가 넣음, 손대지 않음)'),
    ...keys.filter((k) => vals[k]).flatMap((k) => line(k, N[k] ?? '생성기 기본값')),
  ]
  for (const [t, ks] of STEPS) {
    const own = ks.filter((k) => left.has(k))
    if (own.length) out.push(...head(t), ...own.flatMap((k) => line(k, N[k])))
  }
  if (left.size) out.push(...head('기타 (단계 미분류 — 앱 전용 키, .env.example 설명 참고)'), ...[...left].flatMap((k) => line(k)))
  return out.join('\n') + '\n'
}

// sites.json 해당 사이트 appSts PLANNED → BUILDING (서식 보존 위해 텍스트 치환, 없으면 안내만)
function markBuilding(domain, site) {
  if (!site) return console.log(`⚠ sitemap/sites.json 에 ${domain} 없음 — 레지스트리 등록은 PRD_28 §8 기준으로 직접 추가`)
  if (site.appSts !== 'PLANNED') return
  const p = join(ROOT, 'sitemap/sites.json')
  const s = readFileSync(p, 'utf8')
  const at = s.indexOf(`"domain": "${domain}"`)
  const end = s.indexOf('}', at)
  const block = s.slice(at, end).replace('"appSts": "PLANNED"', '"appSts": "BUILDING"')
  writeFileSync(p, s.slice(0, at) + block + s.slice(end))
  console.log(`sites.json : ${domain} appSts PLANNED → BUILDING`)
}

// ── 첫 할 일 문서 골격 — 값은 sites.json, 규칙은 PRD_28 §1.1 링크(복제 금지), 미정은 [TBD] ──
const today = () => new Date().toISOString().slice(0, 10)
const R = '../../../docs' // sitemap/<domain>/docs → 루트 docs

function prdDoc(domain, name, site = {}) {
  return `# PRD: ${domain}

> 버전 v0.1(골격) · 작성 ${today()} · \`node scripts/tenant-env.mjs new\` 생성 — [TBD] 를 채워 v1.0 확정 후 앱 코드 착수
> 상위 플랜 : [PRD_28 멀티사이트](${R}/PRD_28_PI_MULTISITE.md) §8 · 사업 근거 : [PRD_27](${R}/PRD_27_PI_FACTORY.md) 사이트 표 · 할 일 : [TODO 목록](../../multitenant_create_TODO-List.md)

## 1. 개요 (sitemap/sites.json)

| 항목 | 값 |
|---|---|
| 도메인 | ${domain} |
| 카테고리 · 프리셋 | ${site.ctgr ?? '[TBD]'} · ${site.preset ?? '[TBD]'} |
| 웨이브 | ${site.wave ?? '[TBD]'} |
| 요금제(디렉터리 버블) | ${site.planCd ?? '[TBD]'} |
| 보류 플래그 | ${site.hold ?? '없음'} |
| 한 줄 정의 | [TBD] |

## 2. 핵심 가치 (절대 불가침)

1. Pi Browser 에서 Pi 계정으로 로그인할 수 있어야 한다.
2. Pi Browser 에서 Pi 로 결제할 수 있어야 한다.
3. [TBD : 이 사이트 고유 가치]

## 3. 공통 규칙 — 상속(복제 금지)

- 등재 가드레일 9개 : PRD_28 §1.1 (사이트 간 데이터 교차 0 · 거래는 Pi만(Bean·토큰 어휘 금지) · 교차 프로모션 금지 · 템플릿 그대로 제출 금지 · 순차 제출)
- 구축 결함 재발 방지 R-P0~P6 : 루트 CLAUDE.md · 원장 [BUILD_DEFECTS](${R}/BUILD_DEFECTS.md) 1절 신규 시스템 체크리스트
- 로그인 3경로 : [LOGIN_PLAYBOOK](${R}/LOGIN_PLAYBOOK.md) — Google 연동은 마스터 예외 승인 사이트만
- 환경변수 : [ENV_GUIDE](${R}/ENV_GUIDE.md)

## 4. 로그인 방식

[TBD : 마스터] Pi 전용(기본) / Pi + Google 연동(예외 — PRD_28 §1.1-2·LOGIN_PLAYBOOK 갱신 필요)

## 5. 기능 요구사항

| ID | 기능 | 우선순위 | 비고 |
|---|---|---|---|
| F-01 | Pi 로그인(@pi/auth) | P0 | 공용 패키지 배선만 |
| F-02 | [TBD] | | |

## 6. 화면

[TBD] — 첫 출시 화면 목록(화면 수 최소화)

## 7. 데이터

- DB : 비운영 = pi-nonprod 프로젝트 \`${name}_dev\`·\`${name}_stg\` 스키마 / 운영 = ${domain} 전용 Supabase 프로젝트 \`public\`
- 마이그레이션 : \`packages/pi-db/sql\` baseline + \`sitemap/${domain}/sql/001_${name}_*.sql\` → \`node scripts/db-migrate.mjs --app ${name} --tier dev|stg|prod\`
- 명명 : DA 표준(docs/da/데이터표준규칙.md), 시스템 칼럼 4개·논리삭제

## 8. 수익 모델

[TBD] — 거래는 Pi만, 판매자·개최자 수익 + 플랫폼 수수료 구조(PRD_27 원칙)

## 9. 확인 필요

| # | 질문 | 담당 | 상태 |
|---|---|---|---|
| 1 | [TBD] | 마스터 | [확인중] |

## 변경 이력

| 날짜 | 내용 |
|---|---|
| ${today()} | 골격 생성(tenant-env.mjs new) |
`
}

function roadmapDoc(domain, name, port) {
  return `# ROADMAP: ${domain}

> 작성일 ${today()} · 요구사항 \`PRD.md\` · 공통 단계 정본 [TODO 목록](../../multitenant_create_TODO-List.md)

## 진행률 요약

| Phase | 이름 | 상태 |
|---|---|---|
| 0 | 선결(결정·환경·포털·DB) | **진행중** |
| 1 | MVP(로그인 + 고유 기능 1개 + 결제 1개) | 대기 — PRD v1.0 확정 후 |
| 2 | 수익 | 대기 |
| 3 | 등재(A-1~A-7·실기기) | 대기 |

## Phase 0 — 선결

- [x] 설정 한 세트 생성 — \`node scripts/tenant-env.mjs new ${domain} --port ${port}\` (${today()})
- [ ] PRD v1.0 확정(4절 로그인·5절 기능·8절 수익)
- [ ] Pi Developer Portal testnet 앱 등록 · API 키 · 도메인 검증 (ENV_GUIDE 3.2)
- [ ] pi-nonprod Exposed schemas \`${name}_dev\`·\`${name}_stg\` + \`db-migrate.mjs --app ${name} --tier dev\`
- [ ] Vercel 프로젝트(Root Directory \`sitemap/${domain}\`, 운영 브랜치 \`prod/${name}\`)

**완료 기준** : PRD v1.0 · Pi 앱 ID · 비운영 DB · 스테이징 URL

## Phase 1 — MVP

- [ ] 앱 골격(sitemap.pi 복제 지점 — TODO 3단계) · \`pnpm build\` 통과
- [ ] 모니터링 연결(TODO 7단계)
- [ ] Pi Browser 실기기 로그인·결제
`
}

function troubleDoc(domain) {
  return `# TROUBLESHOOT: ${domain}

> 장애·결함의 원인과 결과를 남겨 같은 문제를 재발시키지 않는다(R-P0). 공통 사례 = [BUILD_DEFECTS](${R}/BUILD_DEFECTS.md)

| 날짜 | 증상 | 원인 | 조치 | 재발 방지 |
|---|---|---|---|---|
`
}

function claudeDoc(domain) {
  return `# CLAUDE.md — ${domain}

@../../CLAUDE.md

> **우선순위** : 위 루트(loginpi) CLAUDE.md 규칙을 먼저 적용한다. 이 파일은 ${domain} 전용 추가 규칙만 담고, 충돌 시 루트를 따른다.

- 요구사항 정본 : \`docs/PRD.md\` / 로드맵 : \`docs/ROADMAP.md\` / 장애 기록 : \`docs/TROUBLESHOOT.md\`
- 상위 플랜 : \`../../docs/PRD_28_PI_MULTISITE.md\` — 사이트별 앱·DB·배포 분리(PDB). 공용 코드는 \`packages/pi-*\` 사용, 복제 금지
- 공통 할 일 : \`../multitenant_create_TODO-List.md\` · 환경변수 : \`../../docs/ENV_GUIDE.md\`

## 명령어 (앱 골격 생성 후 유효)

\`\`\`bash
pnpm dev | pnpm build | pnpm lint | pnpm tsc --noEmit
\`\`\`

라우트·API 변경 커밋 전 최소 관문은 \`pnpm build\`.

## 구축 결함 재발 방지

루트 \`loginpi/CLAUDE.md\` '구축 결함 재발 방지 R-P0~P6' 상속(정본 복제 금지) — 첫 운영 배포 전 \`../../docs/BUILD_DEFECTS.md\` 1절 신규 시스템 체크리스트 통과.

## 변경 이력

| 날짜 | 내용 |
|---|---|
| ${today()} | 최초 생성(tenant-env.mjs new) |
`
}

const [cmd, arg] = process.argv.slice(2)
const opt = (k) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 ? process.argv[i + 1] : undefined
}
if (cmd === 'multi') multi()
else if (cmd === 'header') console.log(sourcesHeader(opt('port') ?? 3003, (opt('name') ?? 'APP').toUpperCase()).join('\n'))
else if (cmd === 'new' && arg) create(arg, Number(opt('port') ?? 3003), opt('out'))
else {
  console.log('사용 : node scripts/tenant-env.mjs multi | new <domain.pi> [--port 3003] [--out <dir>] | header [--port 3003] [--name seminar]')
  process.exit(1)
}
