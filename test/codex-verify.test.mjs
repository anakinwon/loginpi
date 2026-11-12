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

test('판정 지시문(2026-11-12) : N = 실제 결함만, 형식 지적 = notes 참고 줄 — 형식 지적만 = PASS(Y)+note, 실제 결함 = FAIL(N)', async () => {
  const m = await import('../scripts/codex-verify.mjs')
  const p = m.buildPrompt({ task: 't', evidence: 'e', scope: 's', iter: 1, nonce: 'n' })
  assert.match(p, /8\. FAIL\(defects·unmet\) 대상 = 실제 결함만 : 로직·동작 오류 \/ 보안 취약·비밀값 노출 \/ 회귀 \/ 데이터 손실 \/ 브리프 쓰기 범위 밖 파일 변경 \/ 브리프가 요구한 기능 미구현/)
  assert.match(p, /참고 지적이다 — defects 에 올리지 않고 기준 unmet 사유로도 쓰지 않으며, notes 에 '참고 : '/)
  assert.match(p, /files·diff 로 충족이 확인되면 보고·증거 첨부가 없어도 met/)
  assert.ok(!/증거가 없거나 반대 증거면 unmet/.test(p), '옛 규칙(증거 없음 = unmet) 삭제')
  const judge = { kind: 'codex', via: 'codex', model: 'x', durationSec: 0, tokens: { input: 0, cachedInput: 0, output: 0 } }
  const ledger = { iters: [], defects: {}, waived: {} }
  const met =['AC-1', 'AC-2', 'AC-3'].map((id) => ({ id, status: 'met', met: true, evidence: 'f:1' }))
  const fmt = m.finalize({ verdict: 'PASS', iter: 1, criteria: structuredClone(met), defects: [], blocked: [], blocked_reason: '', notes: '참고 : 보고에 selftest 출력 없음' }, { iter: 1, ledger, judge, expected: ['AC-1', 'AC-2', 'AC-3'] })
  assert.equal(fmt.result.verdict, 'PASS')
  assert.match(fmt.result.notes, /^참고 : 보고에 selftest 출력 없음$/m)
  const bug = { id: 'D-001', severity: 'high', status: 'open', file: 'a.mjs', line: 1, summary: '로직 오류', repro: '', fix_hint: '' }
  const real = m.finalize({ verdict: 'PASS', iter: 1, criteria: structuredClone(met), defects: [bug], blocked: [], blocked_reason: '', notes: '' }, { iter: 1, ledger, judge, expected: ['AC-1', 'AC-2', 'AC-3'] })
  assert.equal(real.result.verdict, 'FAIL')
})

// ───────── 실행 증거 규칙(2026-11-12) — 계약 머리 표식이 있을 때만 '실행 증거 없는 met' 을 래퍼가 막는다 ─────────
const TOOLS_HEAD = '## 도구 기록\n- scope 파일 마지막 쓰기 = #3\n'
const toolsBody = [
  '#2 10:00:00 Bash [build] : $ node a.mjs',
  '    → 쓰기 전 출력',
  '#4 10:00:01 Bash [build] : $ node --test',
  '    → ok 1',
  '#5 10:00:02 Bash [build] : $ node b.mjs',
  '    → [오류] 종료 1',
  '#6 10:00:03 Read [build] : a.md',
  '',
].join('\n')

test('(a) execIndex : 머리 K 이후 셸 항목만 · [오류]·Read 제외 · 머리 없으면 0건 · 인정 파일만', async () => {
  const m = await import('../scripts/codex-verify.mjs')
  const ev = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-ix-'))
  try {
    fs.writeFileSync(path.join(ev, 'tools.md'), TOOLS_HEAD + toolsBody)
    for (const n of ['checks.md', 'changed-files.txt', 'report.md', 'related-ref.md']) fs.writeFileSync(path.join(ev, n), 'x\n')
    const ix = m.execIndex(ev, ['docs/a.md', 'src/b.mjs'])
    assert.deepEqual([...ix.refs].filter((r) => r.startsWith('tools.md#')), ['tools.md#4'])
    assert.ok(ix.refs.has('checks.md') && ix.refs.has('changed-files.txt'), '훅 검사·git 출력 = 실행 증거')
    assert.ok(!ix.refs.has('report.md') && !ix.refs.has('related-ref.md'), '작성자 보고·참조 = 실행 증거 아님')
    assert.deepEqual([...ix.docs], ['docs/a.md'])
    fs.writeFileSync(path.join(ev, 'tools.md'), '## 도구 기록\n' + toolsBody) // 머리 없는 옛 증거
    assert.equal([...m.execIndex(ev).refs].filter((r) => r.startsWith('tools.md#')).length, 0, '머리 없음 = tools 참조 0건(fail-closed)')
    assert.equal(m.execIndex(path.join(ev, 'checks.md')).refs.size, 0, '폴더 아님 = 빈 색인')
    assert.equal(m.execIndex(null).refs.size, 0)
  } finally {
    fs.rmSync(ev, { recursive: true, force: true })
  }
})

test('(b) finalize : 새 규칙 = exec_ref·na 검사, 옛 규칙(exec null) = 종전', async () => {
  const m = await import('../scripts/codex-verify.mjs')
  const judge = { kind: 'codex', via: 'codex-js', model: 'x', durationSec: 0, tokens: { input: 0, cachedInput: 0, output: 0 } }
  const ledger = { iters: [], defects: {}, waived: {} }
  const exec = { refs: new Set(['tools.md#4', 'checks.md']), docs: new Set(['a.md']) }
  const run = (c, opt = {}) =>
    m.finalize({ verdict: 'PASS', iter: 1, criteria: [{ id: 'AC-1', met: true, evidence: '근거', exec_ref: '', ...c }], defects: [], blocked: [], blocked_reason: '', notes: '' }, { iter: 1, ledger, judge, expected: ['AC-1'], exec, ...opt }).result
  const bad = run({ status: 'met', exec_ref: 'tools.md#2' })
  assert.equal(bad.verdict, 'FAIL')
  assert.equal(bad.criteria[0].status, 'unverifiable')
  assert.match(bad.criteria[0].evidence, /\[래퍼 : 실행 증거 없음·무효 — tools\.md#2\]$/)
  assert.match(bad.notes, /실행 증거 검사 : 1건 unverifiable 로 교정/)
  assert.match(run({ status: 'met', exec_ref: '' }).criteria[0].evidence, /\(빈 값\)\]$/)
  assert.equal(run({ status: 'met', exec_ref: 'tools.md#4' }).verdict, 'PASS')
  assert.equal(run({ status: 'met', exec_ref: 'report.md, tools.md#4' }).verdict, 'PASS', '쉼표 목록 중 하나라도 유효')
  assert.equal(run({ status: 'met', exec_ref: 'doc:a.md:3' }).verdict, 'PASS', 'scope 문서')
  assert.equal(run({ status: 'met', exec_ref: 'doc:a.md:3' }, { exec: { refs: new Set(), docs: new Set() } }).verdict, 'FAIL', 'scope 에 a.md 없음')
  assert.equal(run({ status: 'na', evidence: '물리 DB 단계 몫' }, { naOk: ['AC-1'] }).verdict, 'PASS', 'na 허용 기준·근거 있음')
  const naOut = run({ status: 'na', evidence: '물리 DB 단계 몫' }, { naOk: [] })
  assert.ok(naOut.verdict === 'FAIL' && /na 불가 기준·근거 없음/.test(naOut.criteria[0].evidence), 'na 허용 밖')
  assert.equal(run({ status: 'na', evidence: '  ' }, { naOk: ['AC-1'] }).verdict, 'FAIL', 'na 근거 빈 글')
  // 옛 규칙 : exec_ref 무관 met = PASS, na = 미충족(FAIL)
  assert.equal(run({ status: 'met', exec_ref: '' }, { exec: null }).verdict, 'PASS')
  assert.equal(run({ status: 'na', evidence: 'x' }, { exec: null, naOk: ['AC-1'] }).verdict, 'FAIL')
})

test('계약 머리 표식·na 기준 : 인용 구획 안 표식은 무시', async () => {
  const m = await import('../scripts/codex-verify.mjs')
  const head = `# 계약\n${m.EXEC_RULE_MARK}\n\n## 완료 기준\n- AC-1 : 일반\n- AC-2 : [원문 요구] 다른 단계\n- AC-3 : [브리프 항목] b\n- AC-4 : [나머지 항목] c\n`
  assert.equal(m.execRuleOf(head + '\n## 브리프\n본문\n'), true)
  assert.equal(m.execRuleOf(`# 계약\n- AC-1 : a\n\n## 마스터 요청 원문\n${m.EXEC_RULE_MARK}\n`), false, '인용 원문 안 표식 = 무효')
  assert.deepEqual(m.naIds(head + '\n## 브리프\n- AC-9 : [원문 요구] 인용\n'), ['AC-2', 'AC-3', 'AC-4'])
  assert.deepEqual(m.criteriaIds(head + '\n## 브리프\n- AC-9 : 인용\n'), ['AC-1', 'AC-2', 'AC-3', 'AC-4'])
  assert.equal(m.contractHead('앞\n## 브리프\n뒤'), '앞\n')
  assert.equal(m.contractHead('제목 없음'), '제목 없음')
})

test('buildPrompt : execRule true = 실행 증거 문안, false = 종전 문안', async () => {
  const m = await import('../scripts/codex-verify.mjs')
  const p = m.buildPrompt({ task: 't', evidence: 'e', scope: 's', iter: 1, nonce: 'n', execRule: true })
  for (const k of ['exec_ref', '셸을 실행할 수 없으므로', 'na = 기준 정의에 [원문 요구·[브리프 항목·[나머지 항목 표식', 'report.md(작성자 보고)는 실행 증거가 아니다', '모든 기준이 met 또는 na(허용 기준)', '(실행 증거 없음은 참고 지적이 아니라 규칙 1 의 unverifiable)', '"status":"met|unmet|unverifiable|na"', '마스터가 명시 면제(waiveReason)']) assert.ok(p.includes(k), k)
  assert.ok(!p.includes('files·diff 로 충족이 확인되면 보고·증거 첨부가 없어도 met'), '옛 met 완화 문장 없음')
  assert.ok(!p.includes('증거 서식·node --check·selftest 근거 첨부 누락'), '참고 지적 목록에서 삭제')
  const old = m.buildPrompt({ task: 't', evidence: 'e', scope: 's', iter: 1, nonce: 'n' })
  assert.ok(old.includes('files·diff 로 충족이 확인되면 보고·증거 첨부가 없어도 met') && old.includes('"exec_ref":""') && !old.includes('셸을 실행할 수 없으므로'))
  assert.ok(old.includes('마스터가 명시 면제(waiveReason)') && !old.includes('팀장·아소카가 근거'))
})

// 가짜 판정자 왕복 — 판정자는 env CODEX_FAKE_REF(판정자 환경 허용 목록 CODEX_*)를 AC-1 의 exec_ref 로 돌려준다
function fakeLoop(prefix) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `cv-${prefix}-`))
  const fake = path.join(tmp, 'fake.mjs')
  fs.writeFileSync(
    fake,
    [
      "import fs from 'node:fs'",
      "if (process.argv.includes('login')) process.exit(0)",
      "process.stdin.resume(); process.stdin.on('end', () => {",
      "  const o = process.argv[process.argv.indexOf('-o') + 1]",
      "  fs.writeFileSync(o, JSON.stringify({ verdict: 'PASS', iter: 1, criteria: [{ id: 'AC-1', status: 'met', met: true, evidence: '시험 통과', exec_ref: process.env.CODEX_FAKE_REF || '' }], defects: [], blocked: [], blocked_reason: '', notes: '' }))",
      '})',
    ].join('\n'),
  )
  const run = (args, ref = '') => spawnSync(process.execPath, [WRAPPER, ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CODEX_JS: fake, CODEX_FAKE_REF: ref, CODEX_LOOP_ROOT: path.join(tmp, 'loop') } })
  const judgeOnce = (id, contract, ref, extra = []) => {
    const loopDir = path.join(tmp, 'loop', id)
    assert.equal(run(['--init', '--id', id]).status, 0)
    const ev = path.join(loopDir, 'evidence-1')
    fs.mkdirSync(ev, { recursive: true })
    fs.writeFileSync(path.join(ev, 'tools.md'), TOOLS_HEAD + toolsBody)
    fs.writeFileSync(path.join(ev, 'report.md'), '작성자 보고\n')
    const task = path.join(tmp, `${id}.md`)
    fs.writeFileSync(task, contract)
    const r = run(['--task', task, '--evidence', ev, '--id', id, '--iter', '1', '--scope', 'test/codex-verify.test.mjs', '--timeout-min', '2', ...extra], ref)
    const out = path.join(loopDir, 'iter-1.codex.json')
    return { r, res: fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null, ledger: JSON.parse(fs.readFileSync(path.join(loopDir, 'ledger.json'), 'utf8')) }
  }
  return { tmp, judgeOnce }
}

test('(c) CODEX_JS 왕복 : 표식 계약 = exec_ref 검사(유효 0 · 빈 값 1), 표식 없음 = 종전(빈 값도 0)', async () => {
  const { EXEC_RULE_MARK } = await import('../scripts/codex-verify.mjs')
  const { tmp, judgeOnce } = fakeLoop('exec')
  const ruled = `# 계약\n${EXEC_RULE_MARK}\n\n## 완료 기준\n- AC-1 : 시험 통과\n\n## 브리프\n- AC-9 : 인용\n`
  try {
    const ok = judgeOnce(`t-exec-ok-${process.pid}`, ruled, 'tools.md#4')
    assert.equal(ok.r.status, 0, ok.r.stderr + ok.r.stdout)
    assert.equal(ok.res.judge.via, 'codex-js')
    assert.equal(ok.ledger.execRule, true)
    assert.deepEqual(ok.ledger.criteriaIds, ['AC-1'])
    const empty = judgeOnce(`t-exec-empty-${process.pid}`, ruled, '')
    assert.equal(empty.r.status, 1, empty.r.stderr + empty.r.stdout)
    assert.ok(empty.res.verdict === 'FAIL' && empty.res.criteria[0].status === 'unverifiable')
    const stale = judgeOnce(`t-exec-stale-${process.pid}`, ruled, 'tools.md#2')
    assert.equal(stale.r.status, 1, '머리 K 이전 항목 = 무효')
    const legacy = judgeOnce(`t-exec-legacy-${process.pid}`, '# 계약\n\n## 완료 기준\n- AC-1 : 시험 통과\n', '')
    assert.equal(legacy.r.status, 0, legacy.r.stderr + legacy.r.stdout)
    assert.ok(legacy.res.verdict === 'PASS' && legacy.ledger.execRule === false, '옛 계약 = 종전 규칙')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('(d) --waive : 마스터 원문 인용 필수 → 원장 waived 에 quote·by master', async () => {
  const m = await import('../scripts/codex-verify.mjs')
  const base = ['--id', 'x', '--iter', '2', '--task', 't', '--waive', 'D-001', '--waive-reason', 'x']
  assert.throws(() => m.parseArgs(base), /--waive-quote/)
  assert.throws(() => m.parseArgs([...base, '--waive-quote', '짧 은 글']), /--waive-quote/)
  assert.deepEqual(m.parseArgs([...base, '--waive-quote', '이 결함은 면제한다 진행해']).waives, ['D-001'])
  const { tmp, judgeOnce } = fakeLoop('waive')
  try {
    const quote = '이 결함은 면제한다 진행해'
    const w = judgeOnce(`t-waive-${process.pid}`, '# 계약\n- AC-1 : 시험 통과\n', '', ['--waive', 'D-001', '--waive-reason', 'x', '--waive-quote', quote])
    assert.ok([0, 1].includes(w.r.status), w.r.stderr + w.r.stdout)
    const wv = w.ledger.waived['D-001']
    assert.ok(wv && wv.quote === quote && wv.by === 'master' && wv.reason === 'x' && wv.iter === 1 && !Number.isNaN(Date.parse(wv.at)))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('(e) readEvidence : 실행 증거 먼저 — report.md 가 상한을 거의 채워도 tools.md·checks.md 가 실린다', () => {
  const ev = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-ord-'))
  try {
    const max = 4000
    fs.writeFileSync(path.join(ev, 'report.md'), 'r'.repeat(max - 100))
    fs.writeFileSync(path.join(ev, 'checks.md'), 'CHECKS-MARK\n')
    fs.writeFileSync(path.join(ev, 'tools.md'), 'TOOLS-MARK\n')
    fs.writeFileSync(path.join(ev, 'audit-1.md'), 'AUDIT-MARK\n')
    fs.writeFileSync(path.join(ev, 'zz-extra.txt'), 'EXTRA-MARK\n')
    const out = readEvidence(ev, ev, max)
    const at = (k) => out.indexOf(k)
    assert.ok(at('AUDIT-MARK') >= 0 && at('CHECKS-MARK') > at('AUDIT-MARK') && at('TOOLS-MARK') > at('CHECKS-MARK'), '우선 순서 audit → checks → tools')
    assert.ok(at('### report.md') > at('TOOLS-MARK'), 'report.md 는 뒤')
    assert.ok(!out.includes('EXTRA-MARK'), '목록 밖 파일은 맨 뒤(상한에서 잘림)')
  } finally {
    fs.rmSync(ev, { recursive: true, force: true })
  }
})
