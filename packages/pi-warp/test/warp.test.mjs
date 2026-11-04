// @pi/warp 규칙 시험 — node --test test/warp.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isWarpArrival, markWarp, stripWarp } from '../src/index.ts'

test('출발 표시 : utm_source=sitemap.pi 추가, 기존 utm_source·비 http 주소·잘못된 주소는 그대로', () => {
  assert.equal(markWarp('https://seminarz.vercel.app/'), 'https://seminarz.vercel.app/?utm_source=sitemap.pi')
  assert.equal(markWarp('https://a.example/p?x=1#h'), 'https://a.example/p?x=1&utm_source=sitemap.pi#h')
  assert.equal(markWarp('https://a.example/?utm_source=ads'), 'https://a.example/?utm_source=ads')
  assert.equal(markWarp('mailto:a@b.c'), 'mailto:a@b.c')
  assert.equal(markWarp('not a url'), 'not a url')
})

test('도착 판정 : 표시 또는 sitemap.pi referrer 만', () => {
  assert.ok(isWarpArrival('https://s.example/?utm_source=sitemap.pi', ''))
  assert.ok(isWarpArrival('https://s.example/', 'https://sitemapst.vercel.app/'))
  assert.ok(isWarpArrival('https://s.example/', 'https://sitemap.pi/site/x'))
  assert.ok(!isWarpArrival('https://s.example/', 'https://google.com/'))
  assert.ok(!isWarpArrival('https://s.example/', 'https://evil-sitemap.vercel.app.attacker.com/'))
  assert.ok(!isWarpArrival('https://s.example/?utm_source=ads', ''))
  assert.ok(!isWarpArrival('https://s.example/', ''))
  assert.ok(!isWarpArrival('https://sitemap.pi/ko', 'https://sitemap.pi/'))
  assert.ok(isWarpArrival('https://sitemap.pi/ko?utm_source=sitemap.pi', 'https://sitemap.pi/'))
})

test('표시 지우기 : 우리 표시만, 다른 질의·해시 보존', () => {
  assert.equal(stripWarp('https://s.example/a?x=1&utm_source=sitemap.pi#h'), '/a?x=1#h')
  assert.equal(stripWarp('https://s.example/?utm_source=sitemap.pi'), '/')
  assert.equal(stripWarp('https://s.example/?utm_source=ads'), null)
})
