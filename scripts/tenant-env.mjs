#!/usr/bin/env node
// 멀티테넌트 환경설정 생성기(2026-10-24 마스터 지시) — 키별 구하는 곳·공유 규칙 정본 = docs/ENV_GUIDE.md
//   node scripts/tenant-env.mjs multi                      # 모든 앱 .env.local → 루트 .env.multi 모음 재생성
//   node scripts/tenant-env.mjs new <domain> [--port 3003] [--out <dir>]
//     → sitemap/<domain>/ 에 .env.example · .env.local(로컬·스테이징) · .env.vercel-prod(운영 Vercel 등록용) 한 세트 생성
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

  const files = [
    ['.env.example', tpl],
    ['.env.local', render(local, '로컬·스테이징')],
    ['.env.vercel-prod', render(prod, '운영 Vercel 등록용(Settings → Environment Variables → Production) — 앱이 읽지 않음, 등록 후 보관')],
  ]
  for (const [f, body] of files) {
    const p = join(dir, f)
    if (existsSync(p)) console.log(`건너뜀(이미 있음) : ${relative(ROOT, p)}`)
    else {
      if (f === '.env.example') writeFileSync(p, body) // 비밀값 없음 — 커밋 대상
      else writeSecret(p, body)
      console.log(`생성 : ${relative(ROOT, p)}`)
    }
  }
  // 로컬에서 비워 둬도 되는 키 — 운영 전용(모니터링·운영 DB·uid)·선택(Pi Sign-In·운영 읽기 전용·dev tier)
  const optional = new RegExp(`^(MON_INGEST_|PROD_RO_|STAGING_DB_TARGET|DEV_SUPABASE_|ADMIN_PI_UIDS|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_PI_OAUTH_CLIENT_ID|${NAME}_PROD_)`)
  const empty = keys.filter((k) => !local[k])
  const need = empty.filter((k) => !optional.test(k))
  console.log(`\n직접 발급 필수 ${need.length}개 : ${need.join(', ')}`)
  console.log(`운영·선택(로컬은 비워도 됨) ${empty.length - need.length}개 : ${empty.filter((k) => optional.test(k)).join(', ')}`)
  console.log('→ 구하는 곳 docs/ENV_GUIDE.md 3절, 신규 테넌트 체크리스트 4절')
  if (!outDir) multi()
}

const [cmd, arg] = process.argv.slice(2)
const opt = (k) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 ? process.argv[i + 1] : undefined
}
if (cmd === 'multi') multi()
else if (cmd === 'new' && arg) create(arg, Number(opt('port') ?? 3003), opt('out'))
else {
  console.log('사용 : node scripts/tenant-env.mjs multi | new <domain.pi> [--port 3003] [--out <dir>]')
  process.exit(1)
}
