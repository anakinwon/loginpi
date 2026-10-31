// 접속 국가 자동 언어 선택 시험 — node --test test/geo.test.mjs
//  countryLocaleMap(국가 → locale) + PreferredLocaleScript 인라인 스크립트를 vm 에서 돌려 저장값·이동 결과를 확인
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { countryLocaleMap, countryToLocale } from '../src/geo.ts'
import { PreferredLocaleScript } from '../src/preferred-locale.ts'
import { ROUTING_LOCALES } from '../src/index.ts'

test('국가 → locale : 언어 locale 우선(KR→ko, US→en, JP→ja), 국가코드 locale, 대응 없음 = null', () => {
  const m = countryLocaleMap(ROUTING_LOCALES)
  assert.equal(m.kr, 'ko')
  assert.equal(m.us, 'en')
  assert.equal(m.jp, 'ja')
  assert.equal(countryToLocale('VN', ROUTING_LOCALES), 'vi')
  assert.equal(countryToLocale('zz', ROUTING_LOCALES), null)
  assert.equal(countryToLocale(null, ROUTING_LOCALES), null)
  for (const l of Object.values(m)) assert.ok(ROUTING_LOCALES.includes(l))
})

const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }
// 인라인 스크립트 실행 — fetch 는 country 를 돌려주는 가짜, 결과 = 저장소·이동 주소·조회 횟수
async function run({ path = '/', store = {}, country = 'JP', delay = 0 }) {
  const html = PreferredLocaleScript({ locales: ROUTING_LOCALES }).props.dangerouslySetInnerHTML.__html
  const ls = { ...store }
  const out = { replaced: null, fetched: 0, ls }
  const ctx = {
    localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v) } },
    location: { pathname: path, search: '', hash: '', replace: (u) => { out.replaced = u } },
    fetch: () => { out.fetched++; return new Promise((r) => setTimeout(() => r({ json: () => Promise.resolve({ country }) }), delay)) },
    Date, String,
  }
  vm.runInNewContext(html, ctx)
  await new Promise((r) => setTimeout(r, delay + 10))
  return out
}

test('처음 접속(저장 없음) + 첫 화면 = IP 국가 언어로 저장(src geo)·이동', async () => {
  const o = await run({})
  assert.equal(o.fetched, 1)
  assert.equal(o.replaced, '/ja')
  assert.equal(o.ls.preferred_locale, 'ja')
  assert.equal(o.ls.preferred_locale_src, 'geo')
  assert.equal(o.ls.preferred_locale_day, today())
})

test('수동 선택 언어가 있으면 IP 조회 없이 마지막 언어로', async () => {
  const o = await run({ store: { preferred_locale: 'en', preferred_locale_src: 'manual' } })
  assert.equal(o.fetched, 0)
  assert.equal(o.replaced, '/en')
})

test('예전 저장값(src 없음)도 수동 선택으로 존중', async () => {
  const o = await run({ store: { preferred_locale: 'de' } })
  assert.equal(o.fetched, 0)
  assert.equal(o.replaced, '/de')
})

test('IP 로 정한 언어 : 오늘이면 그대로(조회 없음), 날짜가 바뀌면 다시 조회', async () => {
  const same = await run({ store: { preferred_locale: 'ja', preferred_locale_src: 'geo', preferred_locale_day: today() } })
  assert.equal(same.fetched, 0)
  assert.equal(same.replaced, '/ja')
  const next = await run({ store: { preferred_locale: 'ja', preferred_locale_src: 'geo', preferred_locale_day: '2000-1-1' }, country: 'VN' })
  assert.equal(next.fetched, 1)
  assert.equal(next.replaced, '/vi')
  assert.equal(next.ls.preferred_locale, 'vi')
})

test('언어를 지정한 주소(/en/…)는 IP 로 바꾸지 않음 · 현재와 같으면 이동 없음 · 대응 없는 나라는 그대로', async () => {
  const pinned = await run({ path: '/en/plan' })
  assert.equal(pinned.fetched, 0)
  assert.equal(pinned.replaced, null)
  const kr = await run({ country: 'KR' })
  assert.equal(kr.replaced, null) // 첫 화면 '/' = ko
  assert.equal(kr.ls.preferred_locale, 'ko')
  const none = await run({ country: 'ZZ' })
  assert.equal(none.replaced, null)
  assert.equal(none.ls.preferred_locale, undefined)
})

test('제외 경로(/admin·/auth/pi/callback)는 아무것도 안 함', async () => {
  const o = await run({ path: '/admin/users' })
  assert.equal(o.fetched, 0)
  assert.equal(o.replaced, null)
})

test('국가 응답이 1.5초 넘게 늦으면 이동하지 않고 저장만(다음 접속에 적용)', async () => {
  const o = await run({ delay: 1600 })
  assert.equal(o.fetched, 1)
  assert.equal(o.replaced, null)
  assert.equal(o.ls.preferred_locale, 'ja')
  assert.equal(o.ls.preferred_locale_src, 'geo')
})
