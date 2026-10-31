// @pi/i18n 단위 시험 — 카탈로그·loginpi 스냅숏 데이터 무결성·loginpi 원본 동일성·expand/validate·폴백 깊은 병합·ICU 구조 검증·펼침/조립·locales 검증. 실행 : pnpm --filter @pi/i18n test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deepMerge } from '../src/merge.ts'
import { CATALOG, checkValue, flatten, hasTerm, LOCALE_LANG, rebuild, resolveLanguages, resolveLocales, ROUTING } from '../cli/lib.mjs'

test('카탈로그 : 67개 · 코드 중복 없음 · 필드 완비 · 상위 순서 고정 · RTL 6개', () => {
  assert.equal(CATALOG.length, 67)
  const codes = CATALOG.map((l) => l.code)
  assert.equal(new Set(codes).size, codes.length)
  for (const l of CATALOG) {
    assert.match(l.code, /^[a-z]{2,3}(-[A-Z]{2})?$/, l.code)
    assert.ok(l.nativeName && l.englishName && l.flag, l.code)
    assert.ok(l.dir === 'ltr' || l.dir === 'rtl', l.code)
  }
  assert.deepEqual(codes.slice(0, 3), ['ko', 'en', 'zh'])
  assert.deepEqual(CATALOG.filter((l) => l.dir === 'rtl').map((l) => l.code).sort(), ['ar', 'dv', 'fa', 'he', 'ps', 'ur'])
  // 상위 11개 뒤는 englishName 알파벳순
  const rest = CATALOG.slice(11).map((l) => l.englishName)
  assert.deepEqual(rest, [...rest].sort((a, b) => a.localeCompare(b, 'en')))
})

test('deepMerge : 객체 재귀 · 배열 통째 교체 · 원본 불변', () => {
  const ko = { a: { x: '가', y: '나' }, list: ['1', '2', '3'], s: '다' }
  const en = { a: { x: 'A' }, list: ['one'] }
  const r = deepMerge(ko, en)
  assert.deepEqual(r, { a: { x: 'A', y: '나' }, list: ['one'], s: '다' })
  assert.deepEqual(ko.a, { x: '가', y: '나' })
  // ko → en → locale 3단계
  assert.deepEqual(deepMerge(deepMerge(ko, en), { s: 'D' }).s, 'D')
})

test('flatten / rebuild : 배열은 원소가 모두 있어야 조립', () => {
  const ko = { a: { b: '1' }, list: ['x', 'y'] }
  const flat = flatten(ko)
  assert.deepEqual(flat, { 'a.b': '1', 'list.0': 'x', 'list.1': 'y' })
  assert.deepEqual(rebuild(ko, flat), ko)
  assert.deepEqual(rebuild(ko, { 'a.b': 'B', 'list.0': 'X' }), { a: { b: 'B' } })
})

test('checkValue : 변수·select·태그·plural 범주 검사', () => {
  const g = ['Pi']
  assert.deepEqual(checkValue('{n}명', '{n} people', 'en', g).errors, [])
  assert.ok(checkValue('{n}명', '{count} people', 'en', g).errors.length) // 변수명 바뀜
  assert.deepEqual(checkValue('{n}건', '{n, plural, one {# item} other {# items}}', 'en', g).errors, []) // 숫자형 인자 ↔ plural 허용
  assert.ok(checkValue('{d, date}', '{d}', 'en', g).errors.length) // date 는 엄격
  assert.ok(checkValue('{name}', '{name, number}', 'en', g).errors.length) // 셈 이름 아닌 인자 → number 금지(문자열 값 NaN)
  assert.ok(checkValue('{amount} 결제됨', '{amount, plural, one {# paid} other {# paid}}', 'en', g).errors.length)
  assert.deepEqual(checkValue('{amount} 결제됨', '{amount, plural, other {# paid}}', 'en', g, ['amount']).errors, []) // numericArgs 로 허용
  assert.deepEqual(checkValue('{n, plural, other {#건}}', '{n} items', 'en', g).errors, []) // 숫자형 → 일반 인자는 안전
  assert.ok(checkValue('{a, select, x {가} other {나}}', '{a, select, y {A} other {B}}', 'en', g).errors.length)
  assert.ok(checkValue('<b>{n}</b>개', '{n} items', 'en', g).errors.length) // 태그 빠짐
  assert.ok(checkValue('{n}개', '{n', 'en', g).errors.length) // 파싱 실패
  assert.ok(checkValue('가', '', 'en', g).errors.length) // 빈 값
  // plural : 대상 언어 CLDR 범주는 허용, other 필수
  const ko = '{n, plural, other {#개}}'
  assert.deepEqual(checkValue(ko, '{n, plural, one {# item} other {# items}}', 'en', g).errors, [])
  assert.deepEqual(checkValue(ko, '{n, plural, one {#} few {#} many {#} other {#}}', 'ru', g).errors, [])
  assert.ok(checkValue(ko, '{n, plural, one {# item}}', 'en', g).errors.length)
  assert.ok(checkValue(ko, '{n, plural, few {#} other {#}}', 'en', g).errors.length)
})

test('checkValue 경고 : 용어집 누락 · 한글 혼입', () => {
  assert.ok(checkValue('Pi 로 결제', 'Pay with Πι', 'el', ['Pi']).warnings.length)
  assert.deepEqual(checkValue('Pi 로 결제', 'Pay with Pi', 'en', ['Pi']).warnings, [])
  assert.ok(checkValue('결제', '결제 pay', 'en', []).warnings.length)
  assert.equal(hasTerm('Pixel 화면', 'Pi'), false)
  assert.deepEqual(checkValue('Google 계정', 'račun Googlea', 'hr', ['Google']).warnings, []) // 격 어미 허용
  assert.equal(hasTerm('seminar.pi 로', 'seminar.pi'), true)
})

test('resolveLocales(routing) · resolveLanguages(카탈로그) : all · 부분집합 기준 순서 · 잘못된 설정 throw', () => {
  assert.equal(resolveLocales('all').length, 219)
  assert.deepEqual(resolveLocales(['ae', 'en', 'ko']), ['ko', 'en', 'ae']) // loginpi routing 순서
  assert.throws(() => resolveLocales(['ko', 'en', 'xx']))
  assert.throws(() => resolveLocales(['ko', 'ja']))
  assert.equal(resolveLanguages('all').length, 67)
  assert.deepEqual(resolveLanguages(['ja', 'en', 'ko']), ['ko', 'en', 'ja'])
  assert.throws(() => resolveLanguages(['ko', 'en', 'ae'])) // 국가 locale 은 언어가 아님
})

test('PreferredLocaleScript : 저장값 적용 · 같으면 그대로 · 제외 경로 · 기본 locale 접두사 없음', async () => {
  const { PreferredLocaleScript } = await import('../src/preferred-locale.ts')
  const html = PreferredLocaleScript({ locales: ['ko', 'en', 'ja'] }).props.dangerouslySetInnerHTML.__html
  assert.ok(!html.includes('</'), '</script> 조기 종료 방지')
  const run = (saved, pathname, search = '') => {
    let to = null
    const location = { pathname, search, hash: '', replace: (u) => (to = u) }
    new Function('localStorage', 'location', html)({ getItem: () => saved }, location)
    return to
  }
  assert.equal(run('en', '/', '?x=1'), '/en?x=1')
  assert.equal(run('ja', '/s/abc/join'), '/ja/s/abc/join') // 스위처가 없는 화면에도 적용
  assert.equal(run('ko', '/en/plan'), '/plan')
  assert.equal(run('ko', '/en'), '/')
  assert.equal(run('en', '/en/plan'), null) // 이미 같음 → 루프 없음
  assert.equal(run('ko', '/plan'), null)
  assert.equal(run('en', '/admin/rooms'), null) // 제외 경로
  assert.equal(run('en', '/ja/auth/pi/callback'), null)
  assert.equal(run('xx', '/'), null) // 목록 밖 값 무시
  assert.equal(run(null, '/'), null)
})

// ── loginpi 동일성 · 스냅숏 데이터 ──────────────────────────────────────────
// src 의 확장자 없는 상대 import('./merge')를 Node 타입 제거 실행에서 .ts 로 풀어 준다(앱 번들러와 같은 해석) — 아래 동적 import 전에 등록
const { registerHooks } = await import('node:module')
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx)
    } catch (e) {
      if (spec.startsWith('.') && !/\.([cm]?[jt]sx?|json)$/.test(spec)) return next(`${spec}.ts`, ctx)
      throw e
    }
  },
})
const { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs')
const { join } = await import('node:path')
const { tmpdir } = await import('node:os')
const REPO = join(import.meta.dirname, '..', '..', '..')
const readData = (f) => JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src', 'data', f), 'utf8'))

test('routing : loginpi src/i18n/routing.ts locales 와 같은 목록·순서', async () => {
  const { parseRoutingLocales } = await import('../cli/snapshot.mjs')
  const file = join(REPO, 'src', 'i18n', 'routing.ts')
  if (!existsSync(file)) return // 저장소 밖 실행
  assert.deepEqual(ROUTING, parseRoutingLocales(readFileSync(file, 'utf8')))
  assert.equal(ROUTING.length, 219)
  assert.deepEqual(ROUTING.slice(0, 3), ['ko', 'en', 'zh'])
})

test('locale → 언어 매핑 : loginpi 와 같음(국가코드 ≠ 언어코드)', () => {
  const cases = { ae: 'ar', am: 'hy', et: 'am', ee: 'et', si: 'sl', lk: 'si', bn: 'ms', bd: 'bn', ca: 'en', ad: 'ca', sr: 'nl', rs: 'sr', tw: 'zh-TW', il: 'he', ir: 'fa', no: 'nb', au: 'en', mx: 'es', 'ar-AR': 'es', 'en-ZA': 'en', ko: 'ko', en: 'en' }
  for (const [l, lang] of Object.entries(cases)) assert.equal(LOCALE_LANG[l], lang, l)
  const langs = new Set(CATALOG.map((c) => c.code))
  for (const [l, lang] of Object.entries(LOCALE_LANG)) if (lang !== null) assert.ok(langs.has(lang), `${l} → ${lang}`)
  // 67개 언어 모두 최소 1개 locale 로 노출
  assert.equal(new Set(Object.values(LOCALE_LANG).filter(Boolean)).size, 67)
})

test('스냅숏 데이터 : 활성 locale 은 전부 routing·언어 매핑·국기(getAlpha2)·통화(LOCALE_CURRENCY 또는 국가마스터) 보유', async () => {
  const { getAlpha2, LOCALE_CURRENCY, getDir } = await import('../src/index.ts')
  const locales = readData('locales.json')
  const countries = readData('countries.json')
  assert.ok(locales.length >= 180 && countries.length >= 180)
  for (const k of ['locale_cd', 'locale_nm', 'flag_emoji', 'sort_ord']) assert.ok(k in locales[0], k)
  for (const k of ['country_cd', 'dis_ord_seq', 'country_eng_nm', 'country_mot_nm', 'currency_cd', 'locale_cd', 'use_yn']) assert.ok(k in countries[0], k)
  const sorted = locales.map((l) => l.sort_ord)
  assert.deepEqual(sorted, [...sorted].sort((a, b) => a - b))
  const ccCurrency = new Map(countries.map((c) => [c.country_cd.toUpperCase(), c.currency_cd]))
  for (const l of locales) {
    const cd = l.locale_cd
    assert.ok(ROUTING.includes(cd), `${cd} routing`)
    assert.ok(LOCALE_LANG[cd], `${cd} 언어 매핑`)
    const a2 = getAlpha2(cd)
    assert.match(a2, /^[a-z]{2}$/, `${cd} alpha2`)
    assert.ok(LOCALE_CURRENCY[cd] ?? ccCurrency.get(a2.toUpperCase()), `${cd} 통화`)
  }
  assert.equal(getDir('il'), 'rtl')
  assert.equal(getDir('ae'), 'rtl')
  assert.equal(getDir('am'), 'ltr')
  assert.equal(getDir('kr'), 'ltr') // 파일 없는 locale
})

test('loginpi 원본 복제 동일 : locale-currency · locale-country · combo-search', () => {
  const pairs = [
    ['locale-currency.ts', 'src/lib/locale-currency.ts'],
    ['locale-country.ts', 'src/lib/locale-country.ts'],
    ['combo-search.ts', 'src/lib/combo-search.ts'],
  ]
  const strip = (t) => t.replace(/\r/g, '')
  for (const [pkg, root] of pairs) {
    const rootFile = join(REPO, root)
    if (!existsSync(rootFile)) continue
    const mine = strip(readFileSync(join(import.meta.dirname, '..', 'src', pkg), 'utf8')).split('\n').slice(1).join('\n') // 1행 = 복제 표시 주석
    assert.equal(mine, strip(readFileSync(rootFile, 'utf8')), pkg)
  }
})

test('comboMatch : 빈 검색어 전체 · 대소문자 무시 부분일치 · 다중 필드', async () => {
  const { comboMatch } = await import('../src/index.ts')
  assert.equal(comboMatch('  ', 'x'), true)
  assert.equal(comboMatch('KR', null, 'krw'), true)
  assert.equal(comboMatch('zz', 'Korea', undefined), false)
})

test('스위처 문구 : loginpi locale 원문(ko·en·am=아르메니아어·et=암하라어)', () => {
  const m = readData('switcher-messages.json')
  assert.equal(m.ko.langSwitcher.activeLangs, '활성 언어')
  assert.equal(m.en.langSwitcher.label, 'Select Language')
  assert.equal(m.ko.common.fetching, '불러오는 중…')
  assert.match(m.am.langSwitcher.label, /[Ա-֏]/) // 아르메니아 문자
  assert.match(m.et.langSwitcher.label, /[ሀ-፿]/) // 에티오피아 문자
})

test('expand · validate : 언어 소스 → routing locale 복사, 미동기·routing 밖 파일은 오류', async () => {
  const { expand } = await import('../cli/expand.mjs')
  const { validate } = await import('../cli/validate.mjs')
  const app = mkdtempSync(join(tmpdir(), 'pi-i18n-'))
  try {
    const dir = join(app, 'messages')
    mkdirSync(join(dir, 'lang'), { recursive: true })
    writeFileSync(join(dir, 'ko.json'), JSON.stringify({ a: '가', n: '{n}개' }))
    writeFileSync(join(dir, 'en.json'), JSON.stringify({ a: 'A', n: '{n} items' }))
    writeFileSync(join(dir, 'lang', 'hy.json'), JSON.stringify({ a: 'Ա' }))
    writeFileSync(join(dir, 'lang', 'ar.json'), JSON.stringify({ a: 'أ' }))
    const r = expand(app)
    const read = (l) => readFileSync(join(dir, `${l}.json`), 'utf8')
    assert.equal(read('am'), read('lang/hy')) // am = 아르메니아(loginpi)
    assert.equal(read('ae'), read('lang/ar'))
    assert.equal(read('au'), read('en')) // 영어권 국가 = en 복사
    assert.equal(existsSync(join(dir, 'et.json')), false) // 암하라어 소스 없음 → 폴백
    assert.equal(existsSync(join(dir, 'kr.json')), false) // loginpi 도 파일 없음
    assert.ok(r.written.includes('am') && r.written.length > 50)
    assert.equal(expand(app).written.length, 0) // 다시 돌리면 변경 없음
    assert.equal(validate(app).errorCount, 0)
    writeFileSync(join(dir, 'am.json'), '{}') // 손으로 고친 locale 파일
    writeFileSync(join(dir, 'hy.json'), '{}') // 언어 소스를 잘못된 위치에
    const v = validate(app)
    assert.equal(v.errorCount, 2)
    assert.ok(v.lines.some((l) => l.includes('[am]') && l.includes('expand')))
    assert.ok(v.lines.some((l) => l.includes('hy.json') && l.includes('lang/')))
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})

test('getMessages : 스위처 문구(loginpi 원문)를 바탕에 깔고 ko → en → locale 병합 · 앱 값 우선', async () => {
  const { getMessages } = await import('../src/server.ts')
  const app = mkdtempSync(join(tmpdir(), 'pi-i18n-'))
  try {
    mkdirSync(join(app, 'messages'))
    writeFileSync(join(app, 'messages', 'en.json'), JSON.stringify({ a: 'A' }))
    writeFileSync(join(app, 'messages', 'am.json'), JSON.stringify({ a: 'Ա', common: { fetching: 'X' } }))
    const opts = { loadSource: async () => ({ a: '가', common: { ok: '확인' } }), messagesDir: join(app, 'messages') }
    const ko = await getMessages('ko', opts)
    assert.equal(ko.langSwitcher.label, '언어 선택')
    assert.deepEqual(ko.common, { fetching: '불러오는 중…', ok: '확인' })
    const am = await getMessages('am', opts)
    assert.equal(am.a, 'Ա')
    assert.equal(am.common.fetching, 'X') // 앱 값 우선
    assert.match(am.langSwitcher.label, /[Ա-֏]/)
    const kr = await getMessages('kr', opts) // 파일 없는 locale → en 폴백
    assert.equal(kr.a, 'A')
    assert.equal(kr.langSwitcher.label, 'Select Language')
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})

test('routes : /api/i18n/countries 는 스냅숏을 loginpi 와 같은 모양으로', async () => {
  const { countriesGET } = await import('../src/routes.ts')
  const body = await countriesGET().json()
  assert.deepEqual(Object.keys(body), ['locales', 'countries'])
  assert.deepEqual(body.locales, readData('locales.json'))
})
