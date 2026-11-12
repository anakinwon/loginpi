// codex-audit(아소카 승인 감사·메인 판정 요청·재회송) 회귀 시험 — 합성 원장 픽스처로 감사 규칙 전부, 가짜 판정자(CODEX_JS)·합성 메인 기록으로 request·rejudge 종단
// 실행 : node --test test/codex-audit.test.mjs (pnpm test 포함). 임시 CODEX_LOOP_ROOT·CODEX_GATE_STATE — 실제 .omc/state 불변, Codex 실호출 없음
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ST = fs.mkdtempSync(path.join(os.tmpdir(), 'caudit-state-')), LOOPS = path.join(ST, 'loop')
process.env.CODEX_GATE_STATE = ST; process.env.CODEX_LOOP_ROOT = LOOPS   // import 전에 — 원장 루트 격리
const cg = await import('../.claude/hooks/codex-gate.mjs'), cv = await import('../scripts/codex-verify.mjs'), ca = await import('../scripts/codex-audit.mjs')
const CLI = path.join(ROOT, 'scripts', 'codex-audit.mjs'), REAL = path.join(ROOT, '.omc', 'state', 'loop')
const realIds = () => { try { return fs.readdirSync(REAL) } catch { return [] } }
const before = realIds()
// 실제 상태 내용 스냅숏 — 감사·판정이 쓸 수 있는 원장(loop)·게이트 상태(codex-gate) 아래 모든 파일의 sha1(상대경로 → 해시)
const SNAP_DIRS = [REAL, path.join(ROOT, '.omc', 'state', 'codex-gate')]
function snap() {
  const m = new Map()
  for (const d of SNAP_DIRS) for (const e of (fs.existsSync(d) ? fs.readdirSync(d, { recursive: true, withFileTypes: true }) : [])) {
    if (!e.isFile()) continue
    const p = path.join(e.parentPath ?? e.path, e.name)
    m.set(path.relative(ROOT, p).split(path.sep).join('/'), crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex'))
  }
  return m
}
const snapBefore = snap()
const T0 = Date.parse('2026-11-12T01:00:00Z'), iso = m => new Date(T0 + m * 60e3).toISOString()
const put = (f, x) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof x === 'string' ? x : JSON.stringify(x)) }
const codes = a => a.findings.map(f => f.code)
let seq = 0   // 픽스처마다 다른 요청 시각(일감 누적은 같은 요청끼리만)

/**
 * 합성 원장 : 계약 = codex-gate contractOf, 결과 json(judge.via 기본 codex-js) · evidence-N(changed-files.txt · tools.md 머리 K) · ledger.json · gate.json judged(blob = 현재 작업 트리)
 *   o.iters [{ iter, verdict, at }] · o.blocked [{ iter, at, reason, crit? }] · o.patch(crit) 기준 고침 · o.legacy 표식 줄 삭제 · o.blobs judged.blobs 대체
 */
function mk(id, o = {}, loops = LOOPS) {
  const dir = path.join(loops, id), files = o.files || ['package.json']
  let ct = cg.contractOf({ id, type: 'anakin_phase-build', agentId: 'abcdef12', files, request: '1. 첫째 요구를 반영한다\n2. 둘째 요구를 반영한다', brief: '작업 지시\n## 수용 기준\n- 시험이 통과한다' })
  if (o.legacy) ct = ct.split('\n').filter(l => l.trim() !== cv.EXEC_RULE_MARK).join('\n')
  put(path.join(dir, 'contract.md'), ct)
  const crit = () => { const cs = cv.criteriaIds(ct).map(x => ({ id: x, status: 'met', met: true, evidence: '실행 확인', exec_ref: 'changed-files.txt' })); o.patch?.(cs); return cs }
  const judge = { kind: 'codex', via: o.via || 'codex-js', model: 'm', durationSec: 1, tokens: { input: 1, cachedInput: 0, output: 1 } }
  const iters = o.iters || (o.blocked ? [] : [{ iter: 1, verdict: 'PASS', at: iso(0) }]), blocked = o.blocked || []
  for (const n of new Set([...iters, ...blocked].map(x => x.iter))) { put(path.join(dir, `evidence-${n}`, 'changed-files.txt'), files.join('\n') + '\n'); put(path.join(dir, `evidence-${n}`, 'tools.md'), '## 도구 사용 기록 — scope 파일 마지막 쓰기 = #0\n(도구 사용 없음)\n') }
  const L = { id, startedAt: new Date().toISOString(), codexCalls: iters.length, iters: [], blocked: [], defects: o.defects || {}, waived: o.waived || {} }
  for (const x of iters) { const out = path.join(dir, `iter-${x.iter}.codex.json`); put(out, { verdict: x.verdict, iter: x.iter, judge, criteria: crit(), defects: o.resDefects || [] }); L.iters.push({ iter: x.iter, at: x.at, out, verdict: x.verdict }) }
  blocked.forEach((x, k) => { const out = path.join(dir, `iter-${x.iter}.blocked-${k + 1}.json`); put(out, { verdict: 'BLOCKED', iter: x.iter, judge, criteria: x.crit ? crit() : [], defects: [] }); if (x.crit) { const r = JSON.parse(fs.readFileSync(out, 'utf8')); x.crit(r.criteria); put(out, r) } L.blocked.push({ iter: x.iter, k: k + 1, at: x.at, reason: x.reason, out }) })
  put(path.join(dir, 'ledger.json'), L)
  const last = [...L.iters, ...L.blocked].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1)
  put(path.join(dir, 'gate.json'), { no: 4, agentType: 'anakin_phase-build', agentId: 'abcdef12', files, part: o.part || null, base: o.base || null, requestAt: o.requestAt ?? T0 + ++seq, transcript: o.transcript ?? null, sessionId: 's', judged: { iter: last.iter, at: last.at, verdict: last.verdict || 'BLOCKED', blobs: o.blobs || cg.blobsOf(files, ROOT) } })
  return id
}

test('감사 규칙 : 정상 ok · PASS 뒤 BLOCKED · 옛 계약 · 무효 exec_ref · blob 불일치 · 판정 출처(기본 원장 루트의 codex-js)', () => {
  const ok = ca.auditLedger(mk('c4-ok-a1'), { loops: LOOPS })
  assert.equal(ok.ok, true, JSON.stringify(ok.findings)); assert.equal(ok.conditional, false); assert.equal(ok.work, 1)
  assert.ok(codes(ca.auditLedger(mk('c4-blk-a1', { iters: [{ iter: 1, verdict: 'PASS', at: iso(0) }], blocked: [{ iter: 2, at: iso(5), reason: 'lock' }] }), { loops: LOOPS })).includes('blocked'))
  assert.ok(codes(ca.auditLedger(mk('c4-leg-a1', { legacy: true }), { loops: LOOPS })).includes('legacy-contract'))
  const ne = ca.auditLedger(mk('c4-nex-a1', { patch: cs => { cs[0].exec_ref = 'tools.md#99' } }), { loops: LOOPS })
  assert.deepEqual(codes(ne), ['no-exec'])
  assert.deepEqual(codes(ca.auditLedger(mk('c4-stl-a1', { blobs: { 'package.json': 'f'.repeat(40) } }), { loops: LOOPS })), ['stale'])
  assert.ok(codes(ca.auditLedger('c4-ok-a1', { loops: LOOPS, defaultLoops: LOOPS })).includes('judge-via'), '기본 원장 루트로 감사 = codex-js 무효')
  assert.ok(codes(ca.auditLedger(mk('c4-ing-a1', { via: 'ingest' }), { loops: LOOPS })).includes('judge-via'))
  assert.deepEqual(codes(ca.auditLedger('c4-none', { loops: LOOPS })), ['missing'])
  // 일감 누적 = 같은 요청·겹치는 파일 원장의 iters + blocked(갈아타기 포함)
  mk('c4-wk1-a1', { requestAt: 42 }); mk('c4-wk2-a1', { requestAt: 42, blocked: [{ iter: 1, at: iso(1), reason: 'lock' }] }); mk('c4-wk3-a1', { requestAt: 42, files: ['README.md'] })
  assert.equal(ca.auditLedger('c4-wk1-a1', { loops: LOOPS }).work, 2)
})

test('면제 : 인용 없음 = waive-unverified · 결함 발견 뒤 면제 낱말 메시지에 그대로 = ok · 발견 전 메시지 = 불인정', () => {
  const tp = path.join(ST, 'waive.jsonl'), q = '이 결함은 면제해도 됩니다'
  const o = { iters: [{ iter: 1, verdict: 'FAIL', at: iso(0) }, { iter: 2, verdict: 'PASS', at: iso(10) }], defects: { 'D-001': { firstSeen: 1, seenCount: 1, lastIter: 1 } }, waived: { 'D-001': { quote: q, reason: 'r', by: 'master' } }, resDefects: [{ id: 'D-001', status: 'waived' }] }
  assert.deepEqual(codes(ca.auditLedger(mk('c4-wv0-a1', o), { loops: LOOPS })), ['waive-unverified'])
  const say = (m, text) => JSON.stringify({ type: 'user', timestamp: iso(m), message: { content: text } })
  fs.writeFileSync(tp, say(-5, `${q} 진행`) + '\n')
  assert.deepEqual(codes(ca.auditLedger(mk('c4-wv1-a1', { ...o, transcript: tp }), { loops: LOOPS })), ['waive-unverified'], '발견 전 메시지')
  fs.appendFileSync(tp, say(3, `${q}  진행해 주세요`) + '\n')
  const w = ca.auditLedger('c4-wv1-a1', { loops: LOOPS }); assert.equal(w.ok, true, JSON.stringify(w.findings))
})

test('실기기 BLOCKED 단독 + 그 밖 met = 조건부 ok · device+scope-missing = 불합격 · 기준 원장 한 묶음 FAIL = 불합격', () => {
  const dev = cs => { cs[0].status = 'unverifiable'; cs[0].evidence = 'Pi Browser 실기기 결제 확인 필요' }
  const c = ca.auditLedger(mk('c4-dev-a1', { blocked: [{ iter: 1, at: iso(1), reason: 'device', crit: dev }] }), { loops: LOOPS })
  assert.equal(c.ok, true, JSON.stringify(c.findings)); assert.equal(c.conditional, true)
  assert.ok(!ca.auditLedger(mk('c4-dev2-a1', { blocked: [{ iter: 1, at: iso(1), reason: 'device,scope-missing', crit: dev }] }), { loops: LOOPS }).ok)
  const nodev = ca.auditLedger(mk('c4-dev3-a1', { blocked: [{ iter: 1, at: iso(1), reason: 'device', crit: cs => { cs[0].status = 'unverifiable'; cs[0].evidence = '코드만 읽음' } }] }), { loops: LOOPS })
  assert.ok(codes(nodev).includes('unverifiable'), '실기기 아닌 unverifiable = 불합격')
  mk('c4-sp-a1-p1', { base: 'c4-sp-a1', part: [1, 2] }); mk('c4-sp-a1-p2', { base: 'c4-sp-a1', part: [2, 2], iters: [{ iter: 1, verdict: 'FAIL', at: iso(0) }] })
  put(path.join(LOOPS, 'c4-sp-a1', 'split.json'), { at: iso(0), parts: ['c4-sp-a1-p1', 'c4-sp-a1-p2'] })
  const sp = ca.auditLedger('c4-sp-a1', { loops: LOOPS })
  assert.equal(sp.ok, false); assert.equal(sp.parts.length, 2); assert.ok(sp.findings.some(f => f.code === 'fail' && f.detail.startsWith('c4-sp-a1-p2 : ')))
})

test('auditFiles : 같은 blob 에 옛 PASS + 새 FAIL = 불합격(가장 최근 판정) · PASS 만 = ok(worktree·staged) · 판정 원장 없음 = no-ledger · 생성물 건너뜀', () => {
  const L2 = path.join(ST, 'loop-files')
  mk('c4-old-a1', {}, L2)
  const pass = ca.auditFiles(['package.json', 'docs/WORK_METRICS.md'], { loops: L2 })
  assert.equal(pass.ok, true, JSON.stringify(pass.files)); assert.deepEqual(pass.files.map(f => f.file), ['package.json'])
  assert.equal(ca.auditFiles(['package.json'], { loops: L2, mode: 'staged' }).ok, true, 'staged = HEAD 그대로인 파일')
  assert.ok(pass.warnings.length === 0, '원문 요구 전부 met = 경고 없음')
  mk('c4-new-a1', { iters: [{ iter: 1, verdict: 'FAIL', at: iso(30) }] }, L2)
  const r = ca.auditFiles(['package.json'], { loops: L2 })
  assert.equal(r.ok, false); assert.equal(r.files[0].ledger, 'c4-new-a1'); assert.ok(r.files[0].findings.some(f => f.code === 'fail'))
  assert.deepEqual(ca.auditFiles(['README-none.md'], { loops: L2 }).files[0].findings.map(f => f.code), ['no-ledger'])
})

const cli = (args, env = {}) => spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CODEX_GATE_STATE: ST, CODEX_LOOP_ROOT: LOOPS, CLAUDE_CODE_CHILD_SESSION: '', CODEX_GATE_ACTIVE: '', ...env } })

test('CLI : check --id 정상 = 종료 0 · 불충족 = 종료 1·rejudge 안내 · 인자 없음 = 사용법·종료 2', () => {
  const a = cli(['check', '--id', 'c4-ok-a1']); assert.equal(a.status, 0, a.stdout + a.stderr); assert.match(a.stdout, /✔ c4-ok-a1 — Y\(1회차 PASS·codex-js\) · 기준 met \d+·na 0 · 일감 1\/5/)
  const b = cli(['check', '--id', 'c4-nex-a1']); assert.equal(b.status, 1); assert.match(b.stdout, /✖ c4-nex-a1 — no-exec : [\s\S]*→ node scripts\/codex-audit\.mjs rejudge c4-nex-a1 \[--note <지적>\]/)
  const c = cli([]); assert.equal(c.status, 2); assert.match(c.stderr, /사용법/)
  assert.equal(cli(['nope']).status, 2)
})

test('request : 서브에이전트(CLAUDE_CODE_CHILD_SESSION=1) = 종료 2 · CODEX_AUDIT_TRANSCRIPT 는 CODEX_JS 없으면 무시', () => {
  const tp = path.join(ST, 'none.jsonl'); fs.writeFileSync(tp, '')
  const a = cli(['request', 'package.json'], { CLAUDE_CODE_CHILD_SESSION: '1', CODEX_AUDIT_TRANSCRIPT: tp, CODEX_JS: path.join(ST, 'x.mjs') })
  assert.equal(a.status, 2); assert.match(a.stderr, /request 는 메인 전용/)
  const b = cli(['request', 'package.json'], { CODEX_AUDIT_TRANSCRIPT: tp, CODEX_JS: '', CLAUDE_CODE_SESSION_ID: `caudit-none-${process.pid}` })
  assert.equal(b.status, 2); assert.match(b.stderr, /메인 세션 기록 없음/)
})

// 가짜 판정자 : 프롬프트 task 구획의 AC 를 전부 met. 모드 파일(fake-mode.txt)이 device = 첫 기준 실기기 unverifiable + BLOCKED(device), lock = BLOCKED(lock)
const FAKE = path.join(ST, 'fake-codex.mjs'), FAKE_MODE = path.join(ST, 'fake-mode.txt')
fs.writeFileSync(FAKE, [
  "import fs from 'node:fs'",
  "if (process.argv.includes('login')) process.exit(0)",
  `const mode = (() => { try { return fs.readFileSync(${JSON.stringify(FAKE_MODE)}, 'utf8').trim() } catch { return 'pass' } })()`,
  "let s = ''; process.stdin.on('data', d => { s += d }); process.stdin.on('end', () => {",
  "  const o = process.argv[process.argv.indexOf('-o') + 1], m = /section=task>>>\\n([\\s\\S]*?)\\n<<<END DATA nonce=\\w+ section=task>>>/.exec(s), head = (m ? m[1] : '').split(/^## (?:마스터 요청 원문|브리프)/m)[0]",
  "  const ids = [...new Set([...head.matchAll(/^\\s*-\\s*(AC-\\d+)\\s*:/gm)].map(x => x[1]))]",
  "  const criteria = ids.map(id => ({ id, status: 'met', met: true, evidence: '가짜 판정자', exec_ref: 'changed-files.txt' }))",
  "  if (mode === 'pass') return fs.writeFileSync(o, JSON.stringify({ verdict: 'PASS', iter: 1, criteria, defects: [], blocked: [], blocked_reason: '', notes: '' }))",
  "  if (mode === 'device') Object.assign(criteria[0], { status: 'unverifiable', met: false, evidence: 'Pi Browser 실기기 확인 필요', exec_ref: '' })",
  "  fs.writeFileSync(o, JSON.stringify({ verdict: 'BLOCKED', iter: 1, criteria, defects: [], blocked: [{ reason: mode, detail: mode === 'device' ? 'Pi Browser 실기기 확인 필요' : '잠금' }], blocked_reason: mode, notes: '' }))",
  '})',
].join('\n'))
const setMode = m => fs.writeFileSync(FAKE_MODE, m)
/** 합성 메인 기록 : 마스터 메시지(번호 항목) + Edit + Bash 출력 */
function mainLog(tp, abs, rel) {
  const now = Date.now(), at = s => new Date(now - s * 1000).toISOString()
  fs.writeFileSync(tp, [
    { type: 'user', timestamp: at(120), message: { content: '1. 감사 시험 문서를 만든다\n2. 내용이 맞는지 확인한다' } },
    { type: 'assistant', timestamp: at(60), message: { content: [{ type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: abs } }] } },
    { type: 'assistant', timestamp: at(30), message: { content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: `node --check ${rel}` } }] } },
    { type: 'user', timestamp: at(29), message: { content: [{ type: 'tool_result', tool_use_id: 'b1', content: '확인 완료' }] } },
  ].map(x => JSON.stringify(x)).join('\n') + '\n')
  return now
}

test('request·rejudge 종단(가짜 판정자 + 합성 메인 기록) : Y·judged.blobs·[원문 요구] → 수정 뒤 stale·내용 변경 → 되돌린 뒤 rejudge --note = audit-N.md → 일감 5회 거부', { timeout: 300e3 }, () => {
  const rel = `docs/__caudit-${process.pid}__.md`, abs = path.join(ROOT, rel), tp = path.join(ST, 'main.jsonl')
  setMode('pass'); const now = mainLog(tp, abs, rel)
  const env = { CODEX_JS: FAKE, CODEX_AUDIT_TRANSCRIPT: tp, CLAUDE_CODE_SESSION_ID: `caudit-${process.pid}` }
  try {
    fs.writeFileSync(abs, '# 감사 시험 문서\n\n내용 A\n')
    const r1 = cli(['request', rel], env); assert.equal(r1.status, 0, r1.stdout + r1.stderr)
    const id = fs.readdirSync(LOOPS).find(x => x.startsWith(`c4-main-caudit-${process.pid}-`)); assert.ok(id, fs.readdirSync(LOOPS).join(','))
    const g = JSON.parse(fs.readFileSync(path.join(LOOPS, id, 'gate.json'), 'utf8'))
    assert.equal(g.judged.verdict, 'PASS'); assert.equal(g.judged.blobs[rel], cg.blobsOf([rel], ROOT)[rel]); assert.equal(g.agentType, 'main')
    assert.match(fs.readFileSync(path.join(LOOPS, id, 'contract.md'), 'utf8'), /^- AC-\d+ : \[원문 요구 #[0-9a-f]{6}\] 감사 시험 문서를 만든다/m)
    assert.match(r1.stdout, new RegExp(`✔ ${id} — Y\\(1회차 PASS·codex-js\\)`))
    // 수정 뒤 = stale · rejudge 거부(내용 변경)
    fs.writeFileSync(abs, '# 감사 시험 문서\n\n내용 B\n')
    const c = cli(['check', '--files', rel], env); assert.equal(c.status, 1); assert.match(c.stdout, /stale[\s\S]*→ node scripts\/codex-audit\.mjs request /)
    const j1 = cli(['rejudge', id], env); assert.equal(j1.status, 1); assert.match(j1.stderr, /내용 변경 — request/)
    // 되돌린 뒤 rejudge = 감사 통과·지적 없음 거부, --note = 다음 회차 + audit-2.md
    fs.writeFileSync(abs, '# 감사 시험 문서\n\n내용 A\n')
    const j2 = cli(['rejudge', id], env); assert.equal(j2.status, 1); assert.match(j2.stderr, /재판정 불필요/)
    const j3 = cli(['rejudge', id, '--note', '문구 확인 바람'], env); assert.equal(j3.status, 0, j3.stdout + j3.stderr)
    const au = fs.readFileSync(path.join(LOOPS, id, 'evidence-2', 'audit-2.md'), 'utf8'); assert.match(au, /아소카 감사 재회송[\s\S]*문구 확인 바람/)
    assert.match(j3.stdout, new RegExp(`✔ ${id} — Y\\(2회차 PASS·codex-js\\)`))
    // 일감 5회 = request·rejudge 거부(원장 기록에 BLOCKED 3건을 앞 시각으로 덧붙임 — 시험 원장만)
    const lf = path.join(LOOPS, id, 'ledger.json'), l = JSON.parse(fs.readFileSync(lf, 'utf8'))
    l.blocked.push(...[1, 2, 3].map(k => ({ iter: 1, k, at: new Date(now - 200e3).toISOString(), reason: 'lock' }))); fs.writeFileSync(lf, JSON.stringify(l))
    const q = cli(['request', rel], env); assert.equal(q.status, 1); assert.match(q.stderr, /일감 누적 5회/)
    const j4 = cli(['rejudge', id, '--note', 'x'], env); assert.equal(j4.status, 1); assert.match(j4.stderr, /일감 누적 5\/5/)
  } finally { fs.rmSync(abs, { force: true }) }
})

test('조건부 종료 코드 : 실기기 단독 BLOCKED + 그 밖 met = request·rejudge 종료 0(◐) · 실기기 아닌 BLOCKED = 종료 1', { timeout: 300e3 }, () => {
  const rel = `docs/__caudit-dev-${process.pid}__.md`, abs = path.join(ROOT, rel), tp = path.join(ST, 'main-dev.jsonl')
  mainLog(tp, abs, rel)
  const env = { CODEX_JS: FAKE, CODEX_AUDIT_TRANSCRIPT: tp, CLAUDE_CODE_SESSION_ID: `caudit-dev-${process.pid}` }
  try {
    fs.writeFileSync(abs, '# 실기기 조건부 시험 문서\n')
    setMode('device')
    const r1 = cli(['request', rel], env); assert.equal(r1.status, 0, r1.stdout + r1.stderr)
    const id = fs.readdirSync(LOOPS).find(x => x.startsWith(`c4-main-caudit-dev-${process.pid}-`)); assert.ok(id, fs.readdirSync(LOOPS).join(','))
    assert.match(r1.stdout, new RegExp(`◐ ${id} — 조건부\\(실기기 미검증`))
    const a = ca.auditLedger(id, { loops: LOOPS }); assert.equal(a.ok, true, JSON.stringify(a.findings)); assert.equal(a.conditional, true)
    const j1 = cli(['rejudge', id, '--note', '실기기 항목 재확인'], env); assert.equal(j1.status, 0, j1.stdout + j1.stderr); assert.match(j1.stdout, new RegExp(`◐ ${id} — 조건부`))
    // 실기기가 아닌 BLOCKED(lock) = 감사 불합격·종료 1 (이전 기록이 실기기여도 새 기록 기준)
    setMode('lock')
    const j2 = cli(['rejudge', id, '--note', '잠금 시험'], env); assert.equal(j2.status, 1, j2.stdout + j2.stderr); assert.match(j2.stdout, new RegExp(`✖ ${id} — blocked : BLOCKED lock`))
  } finally { fs.rmSync(abs, { force: true }); setMode('pass') }
})

test('실제 .omc/state 불변(기존 파일 내용·삭제 0건 · 시험 원장 0건 · 시험 문서 삭제)', () => {
  const now = snap(), changed = [], deleted = []
  for (const [k, h] of snapBefore) if (!now.has(k)) deleted.push(k); else if (now.get(k) !== h) changed.push(k)
  assert.ok(snapBefore.size > 0, '스냅숏 대상 없음')
  assert.deepEqual({ changed, deleted }, { changed: [], deleted: [] })
  console.log(`실제 상태 스냅숏 ${snapBefore.size}파일 — 내용 변경 0 · 삭제 0 · 새 파일 ${[...now.keys()].filter(k => !snapBefore.has(k)).length}`)
  assert.deepEqual(realIds().filter(x => !before.includes(x) && /caudit|c4-(ok|blk|leg|nex|stl|ing|wv\d|dev\d?|sp|old|new)-a1/.test(x)), [])
  assert.ok(!fs.existsSync(path.join(ROOT, `docs/__caudit-${process.pid}__.md`)) && !fs.existsSync(path.join(ROOT, `docs/__caudit-dev-${process.pid}__.md`)))
  fs.rmSync(ST, { recursive: true, force: true })
})
