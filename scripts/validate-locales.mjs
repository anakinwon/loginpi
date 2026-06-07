#!/usr/bin/env node
/**
 * validate-locales — locale 매핑 완전성 빌드 타임 검증
 *
 * 배경: et(에티오피아)·mx(멕시코) locale이 messages/에 추가됐지만
 *   LOCALE_CURRENCY 미등록 → pi-price-chip의 `?? 'USD'` fallback이
 *   잘못된 환율을 조용히 표시한 버그 재발 방지 (2026-06-08).
 *
 * 검증: messages/*.json (활성 locale 전체) 기준으로
 *   1. src/lib/locale-currency.ts  — LOCALE_CURRENCY 등재 여부
 *   2. src/lib/locale-country.ts   — LOCALE_COUNTRY 등재 여부
 *   3. src/i18n/routing.ts         — locales 배열 등재 여부
 *
 * 누락 발견 시 exit 1 → pnpm build 실패 (t3-env 환경변수 검증과 동일 철학)
 */
import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// 1. 활성 locale 전체 = messages/*.json
const locales = readdirSync(join(root, 'messages'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort()

// 2. 각 소스 파일에서 등재 키 추출
const currencySrc = readFileSync(join(root, 'src/lib/locale-currency.ts'), 'utf-8')
const countrySrc = readFileSync(join(root, 'src/lib/locale-country.ts'), 'utf-8')
const routingSrc = readFileSync(join(root, 'src/i18n/routing.ts'), 'utf-8')

const currencyKeys = new Set(
  [...currencySrc.matchAll(/(\w+):\s*'[A-Z]{3}'/g)].map((m) => m[1])
)
const countryKeys = new Set(
  [...countrySrc.matchAll(/(\w+):\s*'[a-z]{2}'/g)].map((m) => m[1])
)

// 3. 교차 검증
const errors = []
for (const lc of locales) {
  if (!currencyKeys.has(lc))
    errors.push(`[통화 누락] '${lc}' — src/lib/locale-currency.ts LOCALE_CURRENCY에 추가 필요 (예: ${lc}: 'XXX')`)
  if (!countryKeys.has(lc))
    errors.push(`[국가 누락] '${lc}' — src/lib/locale-country.ts LOCALE_COUNTRY에 추가 필요 (예: ${lc}: 'xx')`)
  if (!routingSrc.includes(`'${lc}'`))
    errors.push(`[라우팅 누락] '${lc}' — src/i18n/routing.ts locales 배열에 추가 필요`)
}

// 4. 결과
if (errors.length > 0) {
  console.error(`\n❌ [validate-locales] locale 매핑 불일치 ${errors.length}건 — 빌드를 중단합니다.\n`)
  for (const e of errors) console.error(`  ${e}`)
  console.error(
    `\n  활성 locale ${locales.length}개: ${locales.join(' ')}` +
    `\n  신규 locale 추가 시 수정 파일: locale-currency.ts · locale-country.ts · routing.ts (단일 소스 원칙)\n`
  )
  process.exit(1)
}

console.log(`✅ [validate-locales] 활성 locale ${locales.length}개 매핑 완전성 검증 통과 (통화·국가·라우팅)`)
