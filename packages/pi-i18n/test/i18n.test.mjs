// @pi/i18n 단위 시험 — 카탈로그 무결성·폴백 깊은 병합·ICU 구조 검증·펼침/조립·locales 검증. 실행 : pnpm --filter @pi/i18n test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deepMerge } from '../src/merge.ts'
import { CATALOG, checkValue, flatten, hasTerm, rebuild, resolveLocales } from '../cli/lib.mjs'

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

test('resolveLocales : all · 부분집합 카탈로그 순서 · 잘못된 설정 throw', () => {
  assert.equal(resolveLocales('all').length, 67)
  assert.deepEqual(resolveLocales(['ja', 'en', 'ko']), ['ko', 'en', 'ja'])
  assert.throws(() => resolveLocales(['ko', 'en', 'xx']))
  assert.throws(() => resolveLocales(['ko', 'ja']))
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
