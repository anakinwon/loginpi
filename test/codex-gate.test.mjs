// codex-gate 훅 회귀 시험 — 훅 자체 시험(--selftest : 원장 매핑·기록 읽기·재진입 금지·가짜 판정자 CODEX_JS 로 --init → 판정 → 메인 전달)을 node:test 에 묶는다
// 실호출 없음(가짜 판정자). 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('codex-gate --selftest 통과(가짜 판정자)', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, '.claude', 'hooks', 'codex-gate.mjs'), '--selftest'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CODEX_JS: '' } })
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.match(r.stdout, /selftest ok/)
})
