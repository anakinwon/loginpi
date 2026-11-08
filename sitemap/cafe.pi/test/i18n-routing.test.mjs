// cafe.pi 다국어 라우팅 회귀 시험 — node --test test/i18n-routing.test.mjs (pnpm test)
//  언어 감지·NEXT_LOCALE 쿠키가 다시 켜지면 Pi Browser(쿠키 미저장)에서 저장 언어 ko + 기기 언어 en 일 때 '/' ↔ '/en' 무한 왕복(2026-11-01 57e26d3f)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('routing : localeDetection·localeCookie 끔 (@pi/i18n 표준 6절 1항)', () => {
  const src = readFileSync(new URL('../src/i18n/routing.ts', import.meta.url), 'utf8')
  assert.match(src, /localeDetection:\s*false/)
  assert.match(src, /localeCookie:\s*false/)
  assert.match(src, /alternateLinks:\s*false/) // locale 219개 hreflang Link 헤더 16KB 방지
})
