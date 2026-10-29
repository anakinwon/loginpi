// @pi/db 비운영 tier 운영 DB 오염 차단 판정 시험. 실행 : pnpm --filter @pi/db test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isProdSchemaLeak } from '../src/tier-guard.ts'

const PROD = 'https://prod-ref.supabase.co'

test('비운영 tier 가 운영 URL 의 public 을 쓰면 차단(2026-10-28 사고 구성)', () => {
  assert.equal(isProdSchemaLeak('staging', PROD, 'public', PROD), true)
  assert.equal(isProdSchemaLeak('dev', PROD, 'public', PROD), true)
})

test('URL 표기 차이(끝 슬래시·대소문자·공백)도 같은 운영 URL 로 본다', () => {
  assert.equal(isProdSchemaLeak('staging', ' https://PROD-ref.supabase.co/ ', 'public', PROD), true)
})

test('정상 구성은 허용 — 운영 tier·비운영 스키마·자체 비운영 프로젝트·미설정', () => {
  assert.equal(isProdSchemaLeak('prod', PROD, 'public', PROD), false)
  assert.equal(isProdSchemaLeak('staging', PROD, 'seminar_stg', PROD), false)
  assert.equal(isProdSchemaLeak('staging', 'https://nonprod-ref.supabase.co', 'public', PROD), false)
  assert.equal(isProdSchemaLeak('staging', '', 'public', PROD), false)
  assert.equal(isProdSchemaLeak('staging', PROD, 'public', ''), false)
})
