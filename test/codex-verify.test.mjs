// codex-verify 래퍼 증거 전달 회귀 테스트 — 루프 폴더(.omc/state/loop/<id>/evidence-N/)의 증거가 프롬프트 evidence 구획에 실리는지
// 실호출 없음 : 판정자는 CODEX_JS 가짜(받은 프롬프트의 evidence 구획을 notes 로 돌려줌). 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readEvidence } from '../scripts/codex-verify.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WRAPPER = path.join(ROOT, 'scripts', 'codex-verify.mjs')
const MARK = 'EVIDENCE-MARK-7f3a'

test('readEvidence : 루프 폴더 증거는 싣고 그 안의 비밀 파일만 뺀다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-ev-'))
  try {
    const ev = path.join(root, '.omc', 'state', 'loop', 'x1', 'evidence-1')
    fs.mkdirSync(ev, { recursive: true })
    fs.writeFileSync(path.join(ev, 'test.txt'), `${MARK}\n`)
    fs.writeFileSync(path.join(ev, '.env'), 'PI_API_KEY=zzz\n')
    const out = readEvidence(ev, root)
    assert.ok(out.includes('### test.txt') && out.includes(MARK), '증거 본문 포함')
    assert.ok(!out.includes('PI_API_KEY'), '.env 제외')
    assert.match(out, /제외한 증거 1건/)
    // 루프 폴더 밖 .omc 는 그대로 비밀 경로
    const other = path.join(root, '.omc', 'secret.txt')
    fs.writeFileSync(other, 'nope')
    assert.equal(readEvidence(other, root).trim(), '(비밀 경로라 제외한 증거 1건)')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('CODEX_JS 가짜 판정자 : evidence 구획이 채워진 프롬프트를 받는다', () => {
  const id = `t-evidence-${process.pid}`
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-fake-'))
  const loopDir = path.join(tmp, 'loop', id)   // 원장 루트 격리(2026-11-10 E — 시험이 실제 .omc/state/loop 를 건드리지 않게, env CODEX_LOOP_ROOT)
  try {
    const fake = path.join(tmp, 'fake codex.mjs') // 공백 포함 경로도 시험
    fs.writeFileSync(
      fake,
      [
        "import fs from 'node:fs'",
        "if (process.argv.includes('login')) process.exit(0) // 래퍼의 로그인 확인",
        "let s = ''",
        "process.stdin.on('data', (d) => (s += d))",
        "process.stdin.on('end', () => {",
        "  const m = s.match(/section=evidence>>>\\n([\\s\\S]*?)\\n<<<END DATA/)",
        "  const o = process.argv[process.argv.indexOf('-o') + 1]",
        "  fs.writeFileSync(o, JSON.stringify({ verdict: 'PASS', iter: 1, criteria: [], defects: [], blocked: [], blocked_reason: '', notes: m ? m[1].slice(0, 2000) : 'NO-SECTION' }))",
        '})',
      ].join('\n'),
    )
    const task = path.join(tmp, 'task.md')
    fs.writeFileSync(task, '# 시험 과제\n증거 전달 확인\n')
    const run = (args) => spawnSync(process.execPath, [WRAPPER, ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CODEX_JS: fake, CODEX_LOOP_ROOT: path.join(tmp, 'loop') } })
    assert.equal(run(['--init', '--id', id]).status, 0)
    const ev = path.join(loopDir, 'evidence-1')
    fs.mkdirSync(ev, { recursive: true })
    fs.writeFileSync(path.join(ev, 'test.txt'), `${MARK}\n`)
    const r = run(['--task', task, '--evidence', ev, '--id', id, '--iter', '1', '--scope', 'test/codex-verify.test.mjs', '--timeout-min', '2'])
    assert.ok([0, 1].includes(r.status), r.stderr + r.stdout) // 판정(PASS·FAIL)은 무관 — BLOCKED·오류만 아니면 된다
    const res = JSON.parse(fs.readFileSync(path.join(loopDir, 'iter-1.codex.json'), 'utf8'))
    assert.ok(res.notes.includes(MARK), `evidence 구획 비어 있음 : ${res.notes.slice(0, 200)}`)
  } finally {
    fs.rmSync(loopDir, { recursive: true, force: true })
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('묶음 판정 : 칸 계약을 접두 ID 로 묶고, 결과를 칸별 판정자 출력(AC-n · D-NNN)으로 나눈다', async () => {
  const { bundleTask, bundleCriteria, splitBundle } = await import('../scripts/codex-verify.mjs')
  const cells = [{ id: 'c1-turn-k', no: 1, prefix: 'P', contract: 'p.md' }, { id: 'c3-turn-k', no: 3, prefix: 'H', contract: 'h.md' }, { id: 'c6-turn-k', no: 6, prefix: 'T', contract: 't.md' }]
  const read = (f) => `# 계약 ${f}\n- AC-1 : a\n- AC-2 : b\n`
  const task = bundleTask(cells, read)
  assert.match(task, /## 칸 P — 원장 c1-turn-k \(c1\)[\s\S]*- P-1 : a\n- P-2 : b[\s\S]*## 칸 H — 원장 c3-turn-k \(c3\)[\s\S]*- H-1 : a/)
  assert.ok(!/AC-\d/.test(task.split('## 칸 P')[1]), '칸 절 안 AC-n 은 모두 접두 ID 로')
  assert.deepEqual(bundleCriteria(cells, read), ['P-1', 'P-2', 'H-1', 'H-2', 'T-1', 'T-2'])
  const c = (id, status) => ({ id, status, met: status === 'met', evidence: 'e' })
  const raw = { verdict: 'FAIL', iter: 2, criteria: [c('P-1', 'met'), c('P-2', 'met'), c('H-1', 'unmet'), c('H-2', 'met'), c('T-1', 'met')], defects: [{ id: 'H-D-001', severity: 'high', status: 'open', file: 'a', line: 1, summary: 's', repro: 'r', fix_hint: 'f', firstSeen: 1, seenCount: 1 }, { id: 'D-009', severity: 'low', status: 'open', file: 'b', line: 0, summary: '접두 없음', repro: '', fix_hint: '' }], blocked: [{ reason: 'device', detail: 'H: 실기기' }], blocked_reason: '', notes: 'n' }
  const per = splitBundle(raw, cells, '묶음 분리')
  assert.deepEqual(Object.keys(per), ['c1-turn-k', 'c3-turn-k', 'c6-turn-k'])
  assert.equal(per['c1-turn-k'].verdict, 'PASS'); assert.deepEqual(per['c1-turn-k'].criteria.map((x) => x.id), ['AC-1', 'AC-2']); assert.deepEqual(per['c1-turn-k'].defects, [])
  assert.equal(per['c3-turn-k'].verdict, 'FAIL'); assert.deepEqual(per['c3-turn-k'].defects.map((d) => d.id), ['D-001']); assert.ok(!('firstSeen' in per['c3-turn-k'].defects[0]), '판정자 출력 모양(MODEL_SCHEMA)만')
  assert.deepEqual(per['c3-turn-k'].blocked, [{ reason: 'device', detail: 'H: 실기기' }]); assert.deepEqual(per['c1-turn-k'].blocked, [])
  assert.equal(per['c6-turn-k'].verdict, 'FAIL'); assert.deepEqual(per['c6-turn-k'].defects.map((d) => d.id), ['D-009'])   // 접두 없는 결함 = 총괄(마지막 칸), T-2 누락 = FAIL
  assert.match(per['c6-turn-k'].notes, /^묶음 분리\nn$/)
  // c4-codex-ac436f-p2 D-001 : 묶음 판정 규칙 = 신뢰 구획(BUNDLE_RULES → buildPrompt rules), task(데이터)에는 계약만
  const { BUNDLE_RULES, buildPrompt, bundlePrev } = await import('../scripts/codex-verify.mjs')
  assert.ok(!task.includes('묶음 판정 규칙') && !task.includes('결함 id 는'))
  const pr = buildPrompt({ task, evidence: 'E', diffText: '', scope: '', files: '', prevDefects: [], iter: 1, rules: BUNDLE_RULES, nonce: 'n1' })
  assert.ok(pr.indexOf(BUNDLE_RULES) > 0 && pr.indexOf(BUNDLE_RULES) < pr.indexOf('# 입력 묶음') && pr.indexOf('<<<BEGIN DATA nonce=n1 section=task>>>') > pr.indexOf(BUNDLE_RULES), '규칙은 데이터 구획 밖·앞')
  // c4-codex-ac436f-p2 D-002 : 칸 원장별 마지막 결과 결함 + waived 사유 → 접두 id
  const lr = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-prev-'))
  try {
    const out = path.join(lr, 'c3-turn-k', 'iter-2.codex.json')
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, JSON.stringify({ defects: [{ id: 'D-001', severity: 'high', status: 'open', file: 'a', line: 1, summary: 's' }, { id: 'D-002', severity: 'low', status: 'open', file: 'b', line: 2, summary: 't' }] }))
    fs.writeFileSync(path.join(lr, 'c3-turn-k', 'ledger.json'), JSON.stringify({ iters: [{ iter: 1, out: 'none' }, { iter: 2, out }], waived: { 'D-002': { reason: '팀장 면제' } } }))
    assert.deepEqual(bundlePrev(cells, lr).map((d) => [d.id, d.status, d.waiveReason]), [['H-D-001', 'open', undefined], ['H-D-002', 'waived', '팀장 면제']])
  } finally {
    fs.rmSync(lr, { recursive: true, force: true })
  }
  const bl = splitBundle({ verdict: 'BLOCKED', iter: 1, criteria: [], defects: [], blocked: [{ reason: 'judge-unavailable', detail: 'token_expired' }], blocked_reason: 'token_expired', notes: '' }, cells)
  assert.ok(Object.values(bl).every((r) => r.verdict === 'BLOCKED' && r.blocked[0].reason === 'judge-unavailable' && r.blocked_reason === 'token_expired'))
})
