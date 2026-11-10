// turn-gate(Stop 훅 — 종료 승인 줄 기록기(비차단)) 회귀 시험 : 훅 자체 시험(--selftest) + 자식 프로세스 시험(훅 소스 밖으로 이관)
// 판정·Codex 호출 없음(상태 루트 격리). 시나리오 = 승인·보류 줄 기록 / 줄 없음·깨진 입력 +0 / spawn 4종 status 0·stdout 빈 값 / 소스에 차단·자식 프로세스 흔적 0건. 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOOK = path.join(ROOT, '.claude', 'hooks', 'turn-gate.mjs')

test('turn-gate --selftest 통과(가짜 판정자 — 종료 승인 줄 기록기(비차단))', () => {
  const r = spawnSync(process.execPath, [HOOK, '--selftest'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CODEX_JS: '' }, timeout: 30e3 })
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.match(r.stdout, /selftest ok/)
})

test('훅 소스 : child_process 문자열 0건(정적·동적 import 모두) · 차단 출력 키·묶음 판정 옵션 0건', () => {
  const src = fs.readFileSync(HOOK, 'utf8')
  for (const b of ['child_process', 'decis' + 'ion', '--bun' + 'dle']) assert.ok(!src.includes(b), `소스에 ${b} 있음`)
})

test('spawn 비차단 : 승인 줄·줄 없음·깨진 입력·ACTIVE 모두 종료 0·stdout 빈 값, 기록은 승인 줄 1건만', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'turn-gate-'))
  try {
    const cases = [
      [JSON.stringify({ last_assistant_message: '종료 승인 : 승인 — x' }), {}],
      [JSON.stringify({ last_assistant_message: 'x' }), {}],
      ['not json', {}],
      [JSON.stringify({ last_assistant_message: '종료 승인 : 승인 — y' }), { CODEX_GATE_ACTIVE: '1' }],
    ]
    for (const [inp, env] of cases) {
      const p = spawnSync(process.execPath, [HOOK], { input: inp, encoding: 'utf8', env: { ...process.env, CODEX_GATE_ACTIVE: '', CODEX_GATE_STATE: dir, ...env } })
      assert.equal(p.status, 0, `${inp.slice(0, 30)} → ${p.stderr}`)
      assert.equal(p.stdout, '', inp.slice(0, 30))
    }
    const log = path.join(dir, 'codex-gate', 'approvals.jsonl')
    const rows = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
    assert.equal(rows.length, 1)
    assert.equal(rows[0].kind, '승인'); assert.equal(rows[0].why, 'x')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
