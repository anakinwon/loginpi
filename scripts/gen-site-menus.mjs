#!/usr/bin/env node
// 사이트 메뉴 지도 생성 — 자사 5개 앱(cafe·sitemap·seminar·schema·dbms)의 메뉴 정의 소스를 TypeScript AST 로 읽어
// sitemap.pi '표' 탭이 쓰는 계층 트리(상위→하위, 링크·권한·다국어 라벨)를 만든다. 앱 코드는 읽기만 한다.
// 실행 : node scripts/gen-site-menus.mjs [--out <파일>] [--check]   (--check = 결과가 다르면 종료코드 1, 쓰지 않음)
// 자동 실행 : .claude/hooks/site-menu-sync.mjs(메뉴·페이지·번역 파일 수정 시) + sitemap.pi prebuild(실패해도 빌드 계속)
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ts = createRequire(path.join(ROOT, 'package.json'))('typescript')
const OUT_DEFAULT = 'sitemap/sitemap.pi/src/data/site-menus.json'

// 사이트 레지스트리 — dir = 앱 루트(저장소 상대), base = 운영 주소(자기 사이트 sitemap.pi 는 내부 링크라 비움)
// 운영 주소 근거 : sitemap/sites.json(cafe) · docs/ENV_GUIDE.md 5절(seminar·schema) · dbms.pi docs/ROADMAP.md
const SITES = [
  { domain: 'cafe.pi', dir: '.', base: 'https://cafepi.vercel.app', build: cafe },
  { domain: 'sitemap.pi', dir: 'sitemap/sitemap.pi', base: '', build: sitemap },
  { domain: 'seminar.pi', dir: 'sitemap/seminar.pi', base: 'https://seminarz.vercel.app', build: seminar },
  { domain: 'schema.pi', dir: 'sitemap/schema.pi', base: 'https://schem.vercel.app', build: schema },
  { domain: 'dbms.pi', dir: 'sitemap/dbms.pi', base: 'https://dbmspi.vercel.app', build: dbms },
]

// 메뉴 소스 파일(저장소 상대) — 이 목록·페이지 파일·ko/en 번역이 바뀌면 훅이 다시 생성한다
export const WATCH = [
  /^src\/components\/layout\/(bottom-nav-client|site-footer)\.tsx$/,
  /^src\/components\/store\/store-nav\.tsx$/,
  /^src\/lib\/admin-nav-catalog\.ts$/,
  /^src\/app\/\[locale\]\/profile\/_components\/profile-tabs\.tsx$/,
  /^sitemap\/sitemap\.pi\/src\/(components\/(site-header|admin-panel)\.tsx|lib\/site\.ts)$/,
  /^sitemap\/seminar\.pi\/src\/components\/site-header\.tsx$/,
  /^sitemap\/schema\.pi\/src\/app\/\[locale\]\/areas\/\[areaId\]\/area-nav\.tsx$/,
  /^sitemap\/dbms\.pi\/src\/lib\/features\.ts$/,
  /^(sitemap\/[^/]+\/)?src\/app\/\[locale\]\/.*page\.tsx$/,
  /^(sitemap\/[^/]+\/)?messages\/(ko|en)\.json$/,
]

// sitemap.pi 노출 금지 — 'Pi 외 통화' 어휘(Bean·토큰, sitemap.pi CLAUDE.md · MAINNET A-5)와 OAuth 콜백·실험 화면(/lab/*·*-test·*lab)
const BANNED = (n) =>
  /bean|token/i.test(`${n.k} ${n.p}`) || /^\/auth\/|(lab|test)(\/|$)/.test(n.p ?? '')
// '@' 로 시작하는 키 = sitemap.pi 자체 번역(siteMenu.*)으로 표시하는 묶음(원 사이트에 라벨이 없는 푸터·그 밖의 화면)
// 라벨 이모지 제거(☕📍🛍️ 등) — 표 글자만 남긴다
const EMOJI = /[\p{Extended_Pictographic}️‍]/gu

// ── AST 도우미 ─────────────────────────────────────────────
const parse = (file) =>
  ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const walk = (node, fn) => {
  fn(node)
  ts.forEachChild(node, (c) => walk(c, fn))
}
const str = (n) =>
  n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : undefined
const unwrap = (n) => {
  while (n && (ts.isAsExpression(n) || ts.isParenthesizedExpression(n) || ts.isSatisfiesExpression?.(n) || ts.isAwaitExpression(n)))
    n = n.expression
  return n
}
// 리터럴 → 평범한 JS 값. t('k') 호출은 { call:'t', arg:'k' }, 그 밖의 식은 undefined
function val(n) {
  n = unwrap(n)
  if (!n) return undefined
  const s = str(n)
  if (s !== undefined) return s
  if (ts.isArrayLiteralExpression(n))
    return n.elements.flatMap((e) => (ts.isSpreadElement(e) ? [] : [val(e)]))
  if (ts.isObjectLiteralExpression(n)) {
    const o = {}
    for (const p of n.properties)
      if (ts.isPropertyAssignment(p) && p.name) o[p.name.text ?? p.name.getText()] = val(p.initializer)
    return o
  }
  if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && str(n.arguments[0]) !== undefined)
    return { call: n.expression.text, arg: str(n.arguments[0]) }
  return undefined
}
// 변수 선언 initializer(함수 안 지역 변수 포함, 첫 번째)
function findVar(sf, name) {
  let hit
  walk(sf, (n) => {
    if (!hit && ts.isVariableDeclaration(n) && n.name.getText() === name) hit = n.initializer
  })
  if (!hit) throw new Error(`${sf.fileName}: 변수 ${name} 없음 — 메뉴 소스 구조가 바뀜, gen-site-menus.mjs 수정 필요`)
  return hit
}
// const t = useTranslations('ns') / await getTranslations('ns') → { t:'ns' }
function nsMap(sf) {
  const m = {}
  walk(sf, (n) => {
    if (!ts.isVariableDeclaration(n) || !n.initializer) return
    const c = unwrap(n.initializer)
    if (ts.isCallExpression(c) && /^(useTranslations|getTranslations)$/.test(c.expression.getText()) && str(c.arguments[0]))
      m[n.name.getText()] = str(c.arguments[0])
  })
  return m
}
const keyOf = (ns, v) => (v && typeof v === 'object' && v.call && ns[v.call] ? `${ns[v.call]}.${v.arg}` : '')

// 파일 안의 메뉴 항목 = { href:'…', label: t('k') } 객체 + <Link|NavItem href="…">{t('k')}</…> / label={t('k')} JSX, 소스 순서.
// within = 이 변수 initializer 안만(지역 배열), 조건부(&&) 렌더 좌변 식별자는 cond 로 남긴다
function navEntries(file, within) {
  const sf = parse(file)
  const ns = nsMap(sf)
  const root = within ? findVar(sf, within) : sf
  const out = []
  walk(root, (n) => {
    if (ts.isObjectLiteralExpression(n)) {
      const o = val(n)
      if (typeof o?.href === 'string' && (o.label || o.labelKey)) out.push({ k: keyOf(ns, o.label), p: o.href, pos: n.pos })
      return
    }
    const el = ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null
    if (!el) return
    const attr = (nm) => el.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText() === nm)
    const href = str(attr('href')?.initializer)
    if (!href) return
    let lab = attr('label')?.initializer?.expression
    if (!lab && ts.isJsxElement(n))
      lab = n.children.find((c) => ts.isJsxExpression(c) && c.expression)?.expression
    const k = keyOf(ns, val(lab))
    if (!k) return
    let cond
    for (let p = n.parent; p && p !== root; p = p.parent)
      if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        cond = p.left.getText()
        break
      }
    out.push({ k, p: href, cond, pos: n.pos })
  })
  return out.sort((a, b) => a.pos - b.pos).map(({ pos, ...e }) => e)
}

// 페이지 파일 → 정적 경로 목록(동적 [x]·라우트 그룹 (x) 정리)
function pages(appSrc) {
  const base = path.join(appSrc, 'app', '[locale]')
  return fs
    .readdirSync(base, { recursive: true })
    .filter((f) => /(^|[\\/])page\.tsx$/.test(f))
    .map((f) => {
      const segs = f.split(/[\\/]/).slice(0, -1).filter((s) => !/^\(.*\)$/.test(s))
      return { p: '/' + segs.join('/'), file: path.join(base, f) }
    })
}

// 권한 추정 — 페이지와 그 페이지가 바로 import 하는 @/components 파일에 LoginGate·클라이언트 게이트가 있으면 login
function gateOf(appSrc, file) {
  const txt = fs.readFileSync(file, 'utf8')
  const near = [txt]
  for (const m of txt.matchAll(/from '@\/(components\/[^']+)'/g))
    for (const ext of ['.tsx', '.ts']) {
      const f = path.join(appSrc, m[1] + ext)
      if (fs.existsSync(f)) near.push(fs.readFileSync(f, 'utf8'))
    }
  return near.some((t) => /<LoginGate|<Client\w*Gate|serverAuthed|if \(!user\)\s*return\s*<Client/.test(t))
    ? 'login'
    : 'public'
}

// ── 사이트별 메뉴 구성 ──────────────────────────────────────
function cafe(d) {
  const f = (p) => path.join(d, p)
  const top = navEntries(f('src/components/layout/bottom-nav-client.tsx'))
  const store = navEntries(f('src/components/store/store-nav.tsx'), 'links')
  const footer = navEntries(f('src/components/layout/site-footer.tsx'))
  const cat = parse(f('src/lib/admin-nav-catalog.ts'))
  const items = val(findVar(cat, 'ADMIN_NAV_CATALOG'))
  const secKeys = val(findVar(cat, 'ADMIN_NAV_SECTION_KEYS'))
  const secs = [...new Set(items.map((i) => i.section))].map((s) => ({
    k: `admin.nav.${secKeys[s]}`,
    c: items.filter((i) => i.section === s).map((i) => ({ k: `admin.nav.${i.labelKey}`, p: i.href, a: 'admin' })),
  }))
  const tabs = val(findVar(parse(f('src/app/[locale]/profile/_components/profile-tabs.tsx')), 'TAB_IDS'))
  return [
    ...top.map((e) => ({
      ...e,
      cond: undefined,
      c:
        e.p === '/store' ? store.filter((x) => x.p !== '/store') : e.p === '/admin' ? secs : undefined,
    })),
    // 헤더 계정명 링크(라벨이 사용자명이라 '내 정보' 키로 대체)
    { k: 'header.myProfile', p: '/profile', a: 'login', c: tabs.map((id) => ({ k: `profile.tabs.${id}`, p: `/profile?tab=${id}`, a: 'login' })) },
    { k: '@footer', c: footer },
  ]
}

function sitemap(d) {
  const f = (p) => path.join(d, p)
  const top = navEntries(f('src/components/site-header.tsx'))
  const ctgr = val(findVar(parse(f('src/lib/site.ts')), 'SITE_CTGR'))
  const adminTabs = []
  walk(parse(f('src/components/admin-panel.tsx')), (n) => {
    const v = ts.isCallExpression(n) && val(n)
    if (v?.call === 't' && /^tab[A-Z]/.test(v.arg)) adminTabs.push({ k: `admin.${v.arg}`, p: '/admin', a: 'admin' })
  })
  return [
    { k: 'bubble.ctgrBrowse', p: '/', c: ctgr.map((c) => ({ k: `siteCtgr.${c}`, p: `/c/${c.toLowerCase()}`, a: 'public' })) },
    ...top.map((e) => ({ ...e, c: e.p === '/admin' ? adminTabs : undefined })),
  ]
}

function seminar(d) {
  const file = path.join(d, 'src/components/site-header.tsx')
  const items = navEntries(file, 'items')
  const admin = navEntries(file, 'adminItems').map((e) => ({ ...e, a: 'admin' }))
  return [...items, { k: 'nav.admin', a: 'admin', c: admin }]
}

function schema(d) {
  const sf = parse(path.join(d, 'src/app/[locale]/areas/[areaId]/area-nav.tsx'))
  const base = '/areas/[areaId]'
  // 권한 = 자기 perm, 없으면 위(메뉴 → 묶음 게이트 allowed('X'))를 물려받음. 위도 없으면 로그인(분류체계 layout LoginGate)
  const node = (m, up) => {
    const n = m.perm ?? up
    return {
      k: `nav.${m.nm}`,
      p: `${base}/${m.subs && !m.subs.some((x) => x.seg === m.seg) ? m.subs[0].seg : m.seg}`,
      a: n ? 'plan' : 'login',
      n,
      c: m.subs?.map((x) => ({ k: `nav.${x.nm}`, p: `${base}/${x.seg}${x.tab ? `?tab=${x.tab}` : ''}`, a: x.perm ?? n ? 'plan' : 'login', n: x.perm ?? n })),
    }
  }
  // 묶음 = <ul aria-label={t('groupX')}> 안에서 참조하는 메뉴 배열(Item[] / Item 상수), 화면 순서 그대로
  const groups = []
  walk(sf, (n) => {
    if (!ts.isJsxElement(n)) return
    const al = n.openingElement.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText() === 'aria-label')
    const v = val(al?.initializer?.expression)
    if (v?.call !== 't' || !/^group/.test(v.arg)) return
    const ids = new Set()
    walk(n, (x) => ts.isIdentifier(x) && /^[A-Z][A-Z_]+$/.test(x.text) && ids.add(x.text))
    const c = [...ids].flatMap((id) => {
      try {
        const v2 = val(findVar(sf, id))
        return Array.isArray(v2) ? v2 : v2?.seg ? [v2] : []
      } catch {
        return []
      }
    })
    // 묶음 게이트 : {allowed('STD_VIEW') && (<ul …>)}
    let gate
    for (let p = n.parent; p && !gate; p = p.parent)
      if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
        gate = /allowed\('(\w+)'\)/.exec(p.left.getText())?.[1] ?? null
    if (c.length)
      groups.push({ k: `nav.${v.arg}`, a: gate ? 'plan' : 'login', n: gate ?? undefined, c: c.map((m) => node(m, gate ?? undefined)) })
  })
  if (!groups.length) throw new Error('schema.pi area-nav : 묶음(aria-label group*) 없음')
  return groups
}

function dbms(d) {
  const g = val(findVar(parse(path.join(d, 'src/lib/features.ts')), 'FEATURE_GROUPS'))
  const a = (min) => (min === 'FREE' ? 'login' : 'plan')
  return g.map((x) => ({
    k: `nav.groups.${x.key}`,
    p: x.items[0].href,
    c: x.items.map((i) => ({ k: `nav.${i.key}`, p: i.href, a: a(i.min), n: i.min === 'FREE' ? undefined : i.min })),
  }))
}

// ── 조립 ──────────────────────────────────────────────────
const getPath = (o, k) => k.split('.').reduce((v, s) => (v && typeof v === 'object' ? v[s] : undefined), o)

function build(site) {
  const dir = path.join(ROOT, site.dir)
  const appSrc = path.join(dir, 'src')
  const pgs = pages(appSrc)
  const pageSet = new Set(pgs.map((x) => x.p))
  let tree = site.build(dir)

  // 메뉴에 없는 정적 페이지 = '그 밖의 화면'(새 페이지가 메뉴 정의 밖에 생겨도 자동으로 잡힌다)
  const seen = new Set()
  const mark = (ns) => ns?.forEach((n) => (n.p && seen.add(n.p.split('?')[0]), mark(n.c)))
  mark(tree)
  const rest = pgs
    .filter((x) => !x.p.includes('[') && !seen.has(x.p) && x.p !== '/' && !/^\/admin\//.test(x.p))
    .sort((a, b) => a.p.localeCompare(b.p))
    .map((x) => ({ p: x.p }))
  if (rest.length) tree.push({ k: '@etc', c: rest })

  // 정리 : 금지 항목 제거, 권한 기본값(페이지 게이트 추정), 동적 경로는 가장 가까운 정적 상위 페이지로 링크
  const clean = (ns, parentAuth) =>
    ns
      .filter((n) => !BANNED(n))
      .map((n) => {
        const bare = n.p?.split('?')[0]
        let a = n.a ?? (n.cond ? 'admin' : undefined) ?? (bare?.startsWith('/admin') ? 'admin' : undefined)
        if (!a && bare && !bare.includes('[')) {
          const pg = pgs.find((x) => x.p === bare)
          a = pg ? gateOf(appSrc, pg.file) : parentAuth
        }
        let h
        if (n.p?.includes('[')) {
          const segs = bare.split('/')
          while (segs.length > 1 && (segs.join('/').includes('[') || !pageSet.has(segs.join('/') || '/'))) segs.pop()
          h = segs.join('/') || '/'
        }
        const c = n.c ? clean(n.c, a ?? parentAuth) : undefined
        return Object.fromEntries(
          Object.entries({ k: n.k || undefined, p: n.p || undefined, h, a: a ?? parentAuth, n: n.n, c: c?.length ? c : undefined }).filter(
            ([, v]) => v !== undefined,
          ),
        )
      })
      .filter((n) => n.p || n.c)
  tree = clean(tree, 'public')

  // 라벨 — ko·en + 언어별(messages/lang/<언어>.json, cafe 는 messages/<언어>.json). en 과 같은 값은 생략(조회 때 en 폴백)
  const keys = new Set()
  const collect = (ns) => ns.forEach((n) => (n.k && !n.k.startsWith('@') && keys.add(n.k), n.c && collect(n.c)))
  collect(tree)
  const msgDir = path.join(dir, 'messages')
  const langDir = fs.existsSync(path.join(msgDir, 'lang')) ? path.join(msgDir, 'lang') : msgDir
  const langs = [
    ['ko', path.join(msgDir, 'ko.json')],
    ['en', path.join(msgDir, 'en.json')],
    ...fs
      .readdirSync(langDir)
      .filter((f) => /^[a-z]{2,3}\.json$/.test(f) && !/^(ko|en)\.json$/.test(f))
      .map((f) => [f.slice(0, -5), path.join(langDir, f)]),
  ]
  const t = Object.fromEntries([...keys].sort().map((k) => [k, {}]))
  for (const [lang, file] of langs) {
    const msg = JSON.parse(fs.readFileSync(file, 'utf8'))
    for (const k of keys) {
      const v = getPath(msg, k)
      if (typeof v !== 'string' || !v) continue
      const clean = v.replace(EMOJI, '').replace(/\s+/g, ' ').trim()
      if (lang === 'ko' || lang === 'en' || clean !== t[k].en) t[k][lang] = clean
    }
  }
  const missing = [...keys].filter((k) => !t[k].ko && !t[k].en)
  if (missing.length) throw new Error(`${site.domain}: 번역 키 없음 ${missing.join(', ')}`)
  return { base: site.base, menus: tree, t }
}

function main() {
  const args = process.argv.slice(2)
  const outRel = args.includes('--out') ? args[args.indexOf('--out') + 1] : OUT_DEFAULT
  const out = path.resolve(ROOT, outRel)
  const data = { $comment: '자동 생성 — node scripts/gen-site-menus.mjs (손으로 고치지 말 것)', sites: {} }
  for (const s of SITES) data.sites[s.domain] = build(s)
  const json = JSON.stringify(data, null, 1) + '\n'
  const prev = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : ''
  if (args.includes('--check')) {
    console.log(prev === json ? 'site-menus : 최신' : 'site-menus : 갱신 필요')
    process.exit(prev === json ? 0 : 1)
  }
  if (prev === json) return console.log('site-menus : 변경 없음')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, json, 'utf8')
  const n = (ns) => ns.reduce((s, x) => s + 1 + (x.c ? n(x.c) : 0), 0)
  console.log(`site-menus : 갱신 ${outRel} — ${Object.entries(data.sites).map(([d, s]) => `${d} ${n(s.menus)}`).join(', ')}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
