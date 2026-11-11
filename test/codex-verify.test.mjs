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

test('묶음 판정(--bundle) 삭제 : 옵션·전용 export 가 없다(2026-11-11 보안 지적 — 증거 평탄화 복사가 비밀 경로 필터를 우회)', async () => {
  const m = await import('../scripts/codex-verify.mjs')
  for (const k of ['--bundle', '--skip-judge', '--skip-reason']) assert.throws(() => m.parseArgs([k, 'x', '--id', 't1']), /알 수 없는 인자/, k)
  for (const k of ['bundleTask', 'bundleCriteria', 'splitBundle', 'bundlePrev', 'BUNDLE_RULES']) assert.equal(m[k], undefined, k)
})
