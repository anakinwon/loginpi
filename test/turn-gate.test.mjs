// turn-gate(Stop 훅 — 턴 묶음 판정 + 아소카 종료 승인 강제) 회귀 시험 : 훅 자체 시험(--selftest)을 node:test 에 묶는다
// 실호출 없음(가짜 판정자 CODEX_JS · 상태 루트 격리). 시나리오 = 승인 줄 없음 차단 / 승인 줄 + 전부 Y 허용 / N 결함 차단 / 판정자 미가용 보류 줄 없으면 차단 / 보류 줄 있으면 차단 0회 / 쿨다운 안 Codex 호출 0회 / 연속 차단 3회 상한 / 훅 예외 허용. 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('turn-gate --selftest 통과(가짜 판정자 — 시나리오 6종)', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, '.claude', 'hooks', 'turn-gate.mjs'), '--selftest'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CODEX_JS: '' }, timeout: 280e3 })
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.match(r.stdout, /selftest ok/)
})
