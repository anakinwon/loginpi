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

test('병렬 scope(2026-11-10 c4-anakin-arch-4-claude-a11648 오귀속) : A(Write 전용·진행 중·워크플로)·셸로 고친 실행과 병렬인 B(Bash, 파일 안 씀) — B scope 에 남의 파일 0건, 셸 귀속은 B 명령에 경로·디렉터리가 나올 때만', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'))   // 상태 루트 격리
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-par-')), ses = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-ses-')), git = (...a) => spawnSync('git', a, { cwd: r, encoding: 'utf8' })
  try {
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); fs.writeFileSync(path.join(r, 'base.md'), 'b'); git('add', '-A'); git('commit', '-qm', 'b')
    const now = Date.now(), iso = t => new Date(t).toISOString(), w = (f, s = 'x') => { fs.mkdirSync(path.dirname(path.join(r, f)), { recursive: true }); fs.writeFileSync(path.join(r, f), s) }
    const use = (t, name, input) => ({ type: 'assistant', timestamp: iso(t), message: { content: [{ type: 'tool_use', name, input }] } })
    const sub = path.join(ses, 's1', 'subagents'), wf = path.join(sub, 'workflows', 'wf_1'); fs.mkdirSync(wf, { recursive: true })
    const put = (dir, id, recs) => fs.writeFileSync(path.join(dir, `agent-${id}.jsonl`), recs.map(x => JSON.stringify(x)).join('\n') + '\n')
    // A = 진행 중(종료 기록 없음) Write 전용 · A2 = 워크플로 폴더 Write 전용 · A3 = 셸(node 스크립트)로 하네스 파일을 고친 실행(Write 기록 없음)
    w('.claude/skills/x/SKILL.md'); put(sub, 'aaaaaa01', [use(now - 50e3, 'Write', { file_path: path.join(r, '.claude/skills/x/SKILL.md') })])
    w('scripts/wf.mjs'); put(wf, 'aaaaaa02', [use(now - 40e3, 'Edit', { file_path: path.join(r, 'scripts/wf.mjs') })])
    w('.claude/hooks/h.mjs'); put(sub, 'aaaaaa03', [use(now - 30e3, 'Bash', { command: 'node - <<EOF … EOF' })])
    // B = 링크 점검에 Bash 사용, 자기 산출은 셸로 만든 docs/out.md 1건(명령에 경로 있음)
    w('docs/out.md'); const recsB = [use(now - 60e3, 'Bash', { command: 'grep -rn "](" .claude/skills/x && node scripts/link-check.mjs > docs/out.md' }), use(now + 60e3, 'Read', { file_path: 'x' })]
    put(sub, 'abbbbb01', recsB)
    const res = cg.attributeOf({ recs: recsB, tp: path.join(sub, 'agent-abbbbb01.jsonl'), mainTp: path.join(ses, 's1.jsonl'), agentId: 'abbbbb01', root: r })
    assert.deepEqual(res.files, ['docs/out.md'])
    assert.ok(res.changed.excluded >= 2, `병렬 귀속 제외 건수 ${res.changed.excluded}`)   // SKILL.md(진행 중 A) · scripts/wf.mjs(워크플로 A2)
  } finally { fs.rmSync(r, { recursive: true, force: true }); fs.rmSync(ses, { recursive: true, force: true }) }
})

test('병렬 셸 쓰기 귀속(2026-11-10 c4-aeb16d-ae440b D-001) : A(Edit x + node --test test/*.test.mjs)·B(Bash cat >> test/y.test.mjs) — A scope 에 y 0건, B scope 에 y', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'))
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-shw-')), ses = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-ses-')), git = (...a) => spawnSync('git', a, { cwd: r, encoding: 'utf8' })
  try {
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); fs.mkdirSync(path.join(r, 'test')); fs.writeFileSync(path.join(r, 'test', 'x.test.mjs'), '1'); fs.writeFileSync(path.join(r, 'test', 'y.test.mjs'), '1'); git('add', '-A'); git('commit', '-qm', 'b')
    const now = Date.now(), iso = t => new Date(t).toISOString(), use = (t, name, input) => ({ type: 'assistant', timestamp: iso(t), message: { content: [{ type: 'tool_use', name, input }] } })
    const sub = path.join(ses, 's1', 'subagents'); fs.mkdirSync(sub, { recursive: true })
    const put = (id, recs) => fs.writeFileSync(path.join(sub, `agent-${id}.jsonl`), recs.map(x => JSON.stringify(x)).join('\n') + '\n')
    // 두 실행 모두 상대 쓰기 전에 시작(시간창 겹침) — 수정 시각 = 기록의 쓰기 시각
    const mt = (f, t) => fs.utimesSync(path.join(r, f), new Date(t), new Date(t))
    fs.writeFileSync(path.join(r, 'test', 'x.test.mjs'), 'A'); mt('test/x.test.mjs', now - 40e3); fs.appendFileSync(path.join(r, 'test', 'y.test.mjs'), '\nB'); mt('test/y.test.mjs', now - 50e3)
    const recsA = [use(now - 70e3, 'Read', { file_path: 'x' }), use(now - 40e3, 'Edit', { file_path: path.join(r, 'test', 'x.test.mjs') }), use(now - 10e3, 'Bash', { command: 'node --test test/*.test.mjs' })]
    const recsB = [use(now - 65e3, 'Read', { file_path: 'y' }), use(now - 50e3, 'Bash', { command: "cat >> test/y.test.mjs <<'EOF'\ntest('t', () => { assert.ok(a > b) })   // 본문 안 > 는 쓰기 대상 아님\nEOF" })]
    put('aaaaaa01', recsA); put('abbbbb01', recsB)
    const at = (id, recs) => cg.attributeOf({ recs, tp: path.join(sub, `agent-${id}.jsonl`), mainTp: null, agentId: id, root: r }), SHELL_OF = c => /^[A-Z]\w+-\w+/.test(c) ? 'PowerShell' : 'Bash'
    assert.deepEqual(at('aaaaaa01', recsA).files, ['test/x.test.mjs'])   // 고치기 전 : test/y.test.mjs 가 디렉터리 일치로 2차 귀속
    assert.deepEqual(at('abbbbb01', recsB).files, ['test/y.test.mjs'])
    // c4-build-a9fcfc D-001 : B 가 원본 하나를 '/ 없는 기존 디렉터리'로 복사(cp · Copy-Item) — 대상 = test/y.test.mjs 로 해석해야 A scope 에서 빠지고 B scope 에 들어간다
    for (const cmd of ['cp tmp/y.test.mjs test', 'Copy-Item -Path tmp/y.test.mjs -Destination test']) {
      const recsB2 = [use(now - 65e3, 'Read', { file_path: 'y' }), use(now - 50e3, SHELL_OF(cmd), { command: cmd })]
      put('abbbbb01', recsB2)
      assert.deepEqual(at('aaaaaa01', recsA).files, ['test/x.test.mjs'], cmd)
      assert.deepEqual(at('abbbbb01', recsB2).files, ['test/y.test.mjs'], cmd)
    }
    // c4-build-a9fcfc D-002 : 대상 디렉터리 옵션(-t DIR · -tDIR · -rt DIR · --target-directory=DIR · --target-directory DIR) — cp·mv·install 각각 A scope 제외 / B scope 포함
    for (const c of ['cp', 'mv', 'install']) for (const opt of ['-t test', '-ttest', '-rt test', '--target-directory=test', '--target-directory test']) {
      if (c === 'install' && opt === '-rt test') continue   // install 에 -r 없음
      const cmd = `${c} ${opt} tmp/y.test.mjs`, recsB2 = [use(now - 65e3, 'Read', { file_path: 'y' }), use(now - 50e3, 'Bash', { command: cmd })]
      put('abbbbb01', recsB2)
      assert.deepEqual(at('aaaaaa01', recsA).files, ['test/x.test.mjs'], cmd)
      assert.deepEqual(at('abbbbb01', recsB2).files, ['test/y.test.mjs'], cmd)
    }
    put('abbbbb01', recsB)
    // 같은 원인 형제(값 받는 옵션 때문에 대상·원본을 놓침) : -T(≠ -t) · sed -E(≠ -e)·-ie(접미) · install -m 값 · -- · Copy-Item -Filter 값 · -Dest 약어
    const sw0 = c => [...cg.shellWrites(c, r)].sort()
    assert.deepEqual(sw0('cp -T a/y.md test'), ['test'])
    assert.deepEqual(sw0('cp -t test a/y.md b/z.md'), ['test', 'test/y.md', 'test/z.md'])
    assert.deepEqual(sw0("sed -E -i 's/x/y/' f1.md && sed -ie 's/x/y/' f2.md && sed --in-place=.bak --expression='s/x/y/' f3.md"), ['f1.md', 'f2.md', 'f3.md'])
    assert.deepEqual(sw0('install -m 644 -D a/y.md out/y.md && cp -- -odd.md test'), ['out/y.md', 'test', 'test/-odd.md'])
    assert.deepEqual(sw0('Copy-Item -Filter *.md src test && Copy-Item a/y.md -Dest test'), ['test', 'test/src', 'test/y.md'])
    // 쓰는 형태 판정(shellWrites) : 리다이렉트·tee·sed -i·cp/mv 대상·PowerShell 쓰기 cmdlet / 읽기·실행·heredoc 본문·따옴표 안 > 는 제외
    const sw = c => [...cg.shellWrites(c)].sort()
    assert.deepEqual(sw('node --test test/*.test.mjs && grep -n x a.md && cat b.md 2>/dev/null >&2'), [])
    assert.deepEqual(sw("node -e \"if (a > b) x()\" > out/r.txt; echo 1 >> 'log s.md'"), ['log s.md', 'out/r.txt'])
    assert.deepEqual(sw('ls | tee -a t1.md t2.md && sed -i -e s/a/b/ s1.md s2.md && sed -i.bak "s/x/y/" s3.md'), ['s1.md', 's2.md', 's3.md', 't1.md', 't2.md'])
    assert.deepEqual(sw('cp -r a.md b.md dst && mv old.md new.md'), ['dst', 'dst/a.md', 'dst/b.md', 'new.md'])
    assert.deepEqual(sw("Get-Content a | Set-Content -Path p1.md; 'x' | Out-File -Encoding utf8 p2.md; Add-Content p3.md 'y'"), ['p1.md', 'p2.md', 'p3.md'])
    // 단일 원본 → 기존 디렉터리(판정 시점 stat) : cp·mv·install·Copy-Item·Move-Item(위치 인자 · -Destination) / 디렉터리 아님 = 대상 그대로
    const swr = c => [...cg.shellWrites(c, r)].sort()
    for (const c of ['cp a/y.md test', 'mv a/y.md test', 'install -m 644 a/y.md test', 'Copy-Item a/y.md test', 'Move-Item -Path a/y.md -Destination test', 'Copy-Item -Destination test a/y.md']) assert.deepEqual(swr(c), ['test', 'test/y.md'], c)
    assert.deepEqual(swr('cp a/y.md test/new.md'), ['test/new.md'])
  } finally { fs.rmSync(r, { recursive: true, force: true }); fs.rmSync(ses, { recursive: true, force: true }) }
})

test('워크플로 병렬 오귀속(2026-11-11 c4-build-4-a609bd·5-a04677·6-aed1dc) : 형제 A·B 병렬, B 가 test/y 를 씀, A 는 `node --test test/*.test.mjs` 만 — A scope 에 y 0건(셸 귀속 = 그 명령 실행 중 바뀐 파일만)', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'))
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-wf-')), ses = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-ses-')), git = (...a) => spawnSync('git', a, { cwd: r, encoding: 'utf8' })
  try {
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); fs.mkdirSync(path.join(r, 'test')); fs.writeFileSync(path.join(r, 'test', 'y.test.mjs'), '1'); fs.writeFileSync(path.join(r, 'a.md'), '1'); git('add', '-A'); git('commit', '-qm', 'b')
    const now = Date.now(), iso = t => new Date(t).toISOString()
    const use = (t, name, input, id = `tu${t}`) => ({ type: 'assistant', timestamp: iso(t), message: { content: [{ type: 'tool_use', id, name, input }] } })
    const res = (t, id) => ({ type: 'user', timestamp: iso(t), message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } })
    const wf = path.join(ses, 's1', 'subagents', 'workflows', 'wf_1'); fs.mkdirSync(wf, { recursive: true })
    const put = (id, recs) => fs.writeFileSync(path.join(wf, `agent-${id}.jsonl`), recs.map(x => JSON.stringify(x)).join('\n') + '\n')
    const mt = (f, t) => fs.utimesSync(path.join(r, f), new Date(t), new Date(t))
    // A = a.md 를 Edit, 끝에 node --test test/*.test.mjs(디렉터리 글롭) 한 번 — B 의 y 쓰기(now-50초)와 시각이 안 겹친다
    fs.writeFileSync(path.join(r, 'a.md'), 'A'); mt('a.md', now - 40e3)
    const recsA = [use(now - 70e3, 'Read', { file_path: 'x' }), use(now - 40e3, 'Edit', { file_path: path.join(r, 'a.md') }), use(now - 10e3, 'Bash', { command: 'node --test test/*.test.mjs' }, 'tA'), res(now - 9e3, 'tA')]
    put('aaaaaa01', recsA)
    const at = (id, recs) => cg.attributeOf({ recs, tp: path.join(wf, `agent-${id}.jsonl`), mainTp: null, agentId: id, root: r }).files
    fs.writeFileSync(path.join(r, 'test', 'y.test.mjs'), 'B'); mt('test/y.test.mjs', now - 50e3)
    // ① 브리프 조건 그대로 : B 가 Edit 로 y — 기록에 실려 있으면 others 로 이미 제외(고치기 전에도 통과)
    put('abbbbb01', [use(now - 50e3, 'Edit', { file_path: path.join(r, 'test', 'y.test.mjs') })])
    assert.deepEqual(at('aaaaaa01', recsA), ['a.md'], '① B Edit 기록 있음')
    // ② 실제 재현(c4-build-6-aed1dc) : A 정지 시점에 B 의 Edit 가 아직 B 기록에 안 실림 — 고치기 전 = y 가 A 글롭으로 귀속
    put('abbbbb01', [use(now - 65e3, 'Read', { file_path: 'y' })])
    assert.deepEqual(at('aaaaaa01', recsA), ['a.md'], '② B Edit 기록 전')
    // ③ 실제 재현(c4-build-3 aac771 → 4·5·6 오귀속) : B 가 `node -e` 로 y 를 씀(shellWrites 로 안 보이는 쓰기) — 고치기 전 = y 가 A 글롭으로 귀속
    const recsB = [use(now - 50.5e3, 'Bash', { command: "node -e \"const fs=require('fs');fs.writeFileSync('test/y.test.mjs','B')\"" }, 'tB'), res(now - 49e3, 'tB')]
    put('abbbbb01', recsB)
    assert.deepEqual(at('aaaaaa01', recsA), ['a.md'], '③ B node -e 쓰기')
    assert.deepEqual(at('abbbbb01', recsB), ['test/y.test.mjs'], '③ B 자신 = 명령 실행 중 바뀐 y 귀속(양성 대조)')
    // 백그라운드 명령(결과 전·상한 없음) = 시작 뒤 바뀐 파일 귀속 유지
    const recsBg = [use(now - 55e3, 'Bash', { command: 'node gen.mjs --out test/y.test.mjs', run_in_background: true }, 'tG'), res(now - 54.9e3, 'tG')]
    put('abbbbb01', recsBg)
    assert.deepEqual(at('abbbbb01', recsBg), ['test/y.test.mjs'], '백그라운드')
  } finally { fs.rmSync(r, { recursive: true, force: true }); fs.rmSync(ses, { recursive: true, force: true }) }
})

test('c4-d-002-a5870f-p2 D-001 : 옛 귀속 규칙 버전 기록(오귀속 포함)은 쓰지 않고 다시 계산 — attributionFor = 실제 작성 파일만, attribAt = 0(그래프 캐시 키 변경), 현재 버전 기록 = 그대로', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'))
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-ver-')), ses = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-ses-')), git = (...a) => spawnSync('git', a, { cwd: r, encoding: 'utf8' })
  const id = 'aver0001', fA = path.join(process.env.CODEX_GATE_STATE, 'codex-gate', 'attrib', `${id}.json`)
  try {
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); fs.writeFileSync(path.join(r, 'a.md'), '1'); git('add', '-A'); git('commit', '-qm', 'b')
    const now = Date.now(), iso = t => new Date(t).toISOString(), use = (t, name, input) => ({ type: 'assistant', timestamp: iso(t), message: { content: [{ type: 'tool_use', name, input }] } })
    const sub = path.join(ses, 's1', 'subagents'); fs.mkdirSync(sub, { recursive: true })
    fs.writeFileSync(path.join(r, 'a.md'), 'A')
    const recs = [use(now - 10e3, 'Edit', { file_path: path.join(r, 'a.md') })], tp = path.join(sub, `agent-${id}.jsonl`); fs.writeFileSync(tp, recs.map(x => JSON.stringify(x)).join('\n') + '\n')
    const o = { recs, tp, mainTp: null, agentId: id, root: r, closed: true }
    // 옛 판 기록(rulesVer 없음 — 수정 전 훅이 남긴 꼴) + 오귀속 파일
    fs.mkdirSync(path.dirname(fA), { recursive: true }); fs.writeFileSync(fA, JSON.stringify({ wrote: true, files: ['a.md', 'test/codex-verify.test.mjs'], at: iso(now) }))
    assert.deepEqual(cg.attributionFor(o).files, ['a.md'])   // 고치기 전 : ['a.md', 'test/codex-verify.test.mjs'](기록 그대로)
    assert.equal(cg.attribAt(id), 0, '옛 판 기록 = 캐시 키 0(기록 없음과 같음)')
    assert.ok(JSON.parse(fs.readFileSync(fA, 'utf8')).files.includes('test/codex-verify.test.mjs'), '읽기 = 기록을 덮어쓰지 않음')
    // 현재 판 기록 = 종료 시점 고정 그대로(다시 계산하지 않음)
    cg.saveAttrib(id, { files: ['a.md', 'b.md'] })
    assert.deepEqual(cg.attributionFor(o), { files: ['a.md', 'b.md'], recorded: true }); assert.ok(cg.attribAt(id) > 0)
  } finally { fs.rmSync(r, { recursive: true, force: true }); fs.rmSync(ses, { recursive: true, force: true }); fs.rmSync(fA, { force: true }) }
})

test('c4-build-a19b07-p1 D-001 : 옛 고정 ``` 울타리 계약 + 중첩 인용 \'- AC-9 :\' + 오염 원장(criteriaIds AC-9) — 재작성(refreshContract = keepEvidence) 뒤 재판정 = 기준 AC-1 만·PASS', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'))
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const loops = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-loop-')), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-old-')), id = 'c4-oldfence-a19b07', dir = path.join(loops, id), ev = path.join(tmp, 'ev'), fake = path.join(tmp, 'fake-codex.mjs')
  try {
    // 가짜 판정자 = AC-1~3 met PASS(hook selftest 와 같은 꼴) — 기대 기준에 AC-9 가 있으면 래퍼가 unverifiable 로 채워 FAIL
    fs.writeFileSync(fake, ["import fs from 'node:fs'", "if (process.argv.includes('login')) process.exit(0)", "process.stdin.resume(); process.stdin.on('end', () => { const o = process.argv[process.argv.indexOf('-o') + 1]; fs.writeFileSync(o, JSON.stringify({ verdict: 'PASS', iter: 1, criteria: ['AC-1', 'AC-2', 'AC-3'].map(id => ({ id, status: 'met', met: true, evidence: 'fake' })), defects: [], blocked: [], blocked_reason: '', notes: '' })) })"].join('\n'))
    fs.mkdirSync(ev); fs.writeFileSync(path.join(ev, 'report.md'), '보고')
    const env = { ...process.env, CODEX_LOOP_ROOT: loops, CODEX_JS: fake }, run = a => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'codex-verify.mjs'), ...a], { cwd: ROOT, encoding: 'utf8', env })
    assert.equal(run(['--init', '--id', id]).status, 0)
    const lf = path.join(dir, 'ledger.json'), l = JSON.parse(fs.readFileSync(lf, 'utf8')); l.criteriaIds = ['AC-1', 'AC-9']; fs.writeFileSync(lf, JSON.stringify(l))   // 수정 전 판이 저장한 오염 원장
    const old = [`# 자동 계약 — ${id} (옛 판)`, '', '- 기준선 : 없음', '- scope = 1건', '', '## 완료 기준', '- AC-1 : 실제', '',
      '## 마스터 요청 원문', '', '```text', 'R', '```', '', '## 브리프(첫 프롬프트 + 추가 지시)', '', '```text', '인용 시작', '```', '- AC-9 : 인용 기준', '```', ''].join('\n')   // 옛 고정 울타리 — 안쪽 ``` 가 울타리를 일찍 닫음
    const ct = path.join(dir, 'contract.md'); fs.writeFileSync(ct, cg.refreshContract(old, { id, files: ['docs/__cgate-old__.md'], part: null }, 'HEAD', null))
    assert.ok(fs.readFileSync(ct, 'utf8').includes('- AC-9 : 인용 기준'), '인용 보존')
    const r = run(['--task', ct, '--evidence', ev, '--id', id, '--iter', '1', '--scope', 'docs/__codex-gate-no-files__', '--diff', 'HEAD', '--timeout-min', '2', '--confirm-real'])
    assert.equal(r.status, 0, r.stdout + r.stderr)   // 고치기 전 : 1(FAIL — AC-9 unverifiable)
    assert.deepEqual(JSON.parse(fs.readFileSync(lf, 'utf8')).criteriaIds, ['AC-1'])   // 오염 원장 = 이번 판정에서 계약으로 다시 셈
  } finally { fs.rmSync(loops, { recursive: true, force: true }); fs.rmSync(tmp, { recursive: true, force: true }) }
})

test('연관 군집 같은 묶음(2026-11-10 c4-fail-5-aeb16d-p1·p2 scope-missing) : 연관 2개 + 시험 1개(+ 언급 문서)가 상한으로 나뉠 때 한 묶음, 군집이 상한을 넘으면 다른 묶음에 참조 발췌', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'))   // 상태 루트 격리
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const src = {
    'scripts/a.mjs': "import { helper } from './b.mjs'\nexport const run = () => helper(1)\n",
    'scripts/b.mjs': '// 도우미\nexport function helper(x) {\n  return x + 1\n}\nexport const other = 2\n',
    'test/a.test.mjs': "import { run } from '../scripts/a.mjs'\nrun()\n",
    'docs/guide.md': '`b.mjs` 사용법\n',
    'docs/big.md': '무관 문서\n',
    'scripts/rg.mjs': "let attr = {}; try { const cg = await import('../.claude/hooks/cg.mjs'); attr = { recordAt: cg.attribAt } } catch {}\n",
    '.claude/hooks/cg.mjs': 'export const attribAt = id => 1\nexport const unused = 0\n',
  }
  const read = f => src[f] ?? null, K = 1024, plan = [{ no: 4, id: 'c4-x-a1b2c3' }]
  // ① 군집 {a, b, a.test, guide} = 290K ≤ 360K → 한 묶음(종전 큰 것부터 첫 맞춤 = [big, a, guide] · [b, a.test] 로 갈라짐)
  const cost1 = { 'docs/big.md': 200 * K, 'scripts/a.mjs': 100 * K, 'scripts/b.mjs': 100 * K, 'test/a.test.mjs': 80 * K, 'docs/guide.md': 10 * K }
  const j1 = cg.jobsFor(plan, Object.keys(cost1).sort(), f => cost1[f], { budget: 360 * K, read })
  assert.deepEqual(j1.map(j => j.files), [['docs/big.md'], ['docs/guide.md', 'scripts/a.mjs', 'scripts/b.mjs', 'test/a.test.mjs']])
  // ② 군집 하나가 상한을 넘을 때만 쪼갬 → 각 묶음 = 다른 묶음 연관 파일의 관련 함수 발췌(참조 — 판정 대상 아님)
  const j2 = cg.jobsFor(plan, ['scripts/a.mjs', 'scripts/b.mjs'], () => 200 * K, { budget: 300 * K, read })
  assert.deepEqual(j2.map(j => j.files), [['scripts/a.mjs'], ['scripts/b.mjs']])
  assert.match(j2[0].related, /참조\(판정 대상 아님\)[\s\S]*scripts\/b\.mjs[\s\S]*L2: export function helper\(x\) \{\nL3:   return x \+ 1\nL4: \}/)   // a 묶음 = b 의 helper 정의
  assert.ok(!j2[0].related.includes('other = 2'), '쓰지 않는 함수는 발췌하지 않음')
  assert.match(j2[1].related, /scripts\/a\.mjs[\s\S]*L1: import \{ helper \} from '\.\/b\.mjs'\nL2: export const run = \(\) => helper\(1\)/)   // b 묶음 = a 의 사용 줄
  // ③ 동적 import 네임스페이스(request-graph 의 cg.attribAt — p2 BLOCKED 사유) = 정의 발췌
  const j3 = cg.jobsFor(plan, ['.claude/hooks/cg.mjs', 'scripts/rg.mjs'], () => 200 * K, { budget: 300 * K, read })
  assert.equal(j3.length, 2); assert.match(j3[1].related, /\.claude\/hooks\/cg\.mjs[\s\S]*L1: export const attribAt = id => 1/); assert.ok(!j3[1].related.includes('unused'))
  // 상한 재점검(AC-2) : 묶음 예산 = 래퍼 프롬프트 상한 − 실측 고정 구획 — 보통 크기 계약·증거면 종전 고정값 360K 보다 크고, 증거는 래퍼 증거 상한까지만 뺀다
  assert.ok(cg.budgetOf({ contract: 15e3, evidence: 60e3 }) > 360 * K)
  assert.equal(cg.budgetOf({ contract: 0, evidence: 10e6 }), cg.budgetOf({ contract: 0, evidence: cg.W.evidence }))
})

test('재분할 계약 = 실제 묶음 파일로 하네스 목록·AC-4 재산정(2026-11-10 c4-scope-missing-ab2c5d D-001) : 하네스 들어옴·빠짐·옮김', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'))
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const base = { no: 4, type: 't', agentId: 'a1', part: [1, 2] }, ac4 = c => c.match(/^- AC-4 .*$/gm) || []
  const noH = cg.contractOf({ ...base, id: 'c4-x-a1b2c3-p1', files: ['a.md'] })
  const inH = cg.refreshContract(noH, { id: 'c4-x-a1b2c3-p2', files: ['.claude/hooks/x.mjs', 'a.md'], part: [2, 2] }, 'HEAD', null)
  assert.deepEqual(ac4(inH), ['- AC-4 : 하네스 파일 변경 1건(.claude/hooks/x.mjs) — 규칙 정합 / 우회·회귀 없음 / selftest·node --check 통과 근거가 보고에 있다'])   // 들어옴
  assert.ok(/^- AC-3 [^\n]*\n- AC-4 /m.test(inH), 'AC-3 바로 뒤')
  const withH = cg.contractOf({ ...base, id: 'c4-x-a1b2c3-p1', files: ['.claude/hooks/x.mjs', 'b.md'] })
  assert.deepEqual(ac4(cg.refreshContract(withH, { id: 'c4-x-a1b2c3-p1', files: ['b.md'], part: [1, 2] }, 'HEAD', null)), [])   // 빠짐
  const moved = ac4(cg.refreshContract(withH, { id: 'c4-x-a1b2c3-p1', files: ['.claude/hooks/y.mjs'], part: [1, 2] }, 'HEAD', null))
  assert.equal(moved.length, 1); assert.ok(moved[0].includes('.claude/hooks/y.mjs') && !moved[0].includes('x.mjs'))   // 옮김 = 옛 목록 안 남음
})

test('재분할 = 이전 회차 열린 결함 파일은 그 결함이 나온 묶음 id 에 고정, 못 들어가면 결함 함수 본문 참조 / scope 밖 짝 시험 블록 발췌(2026-11-10 c4-fail-5-aeb16d iter-3 blocked-3)', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'))
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const src = {
    'scripts/x.mjs': "import { yy } from './y.mjs'\nexport function xx() {\n  return yy()\n}\n",
    'scripts/y.mjs': 'export const yy = () => 1\n',
    'zz/z.md': '무관 문서\n',
    'test/x.test.mjs': "import { xx } from '../scripts/x.mjs'\n\ntest('xx 캐시 우선', () => {\n  xx()\n})\n\ntest('무관 시험', () => {\n  1\n})\n",
    'test/w.test.mjs': "import { ww } from '../scripts/w.mjs'\ntest('w', () => ww())\n",
    'scripts/w.mjs': 'export function ww() {\n  return 2\n}\nexport const other = 3\n',
  }
  const read = f => src[f] ?? null, K = 1024, cost = f => ({ 'scripts/x.mjs': 200 * K, 'scripts/y.mjs': 100 * K, 'zz/z.md': 150 * K })[f]
  const L = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-pin-'))
  const part = (id, files, defects) => {
    fs.mkdirSync(path.join(L, id), { recursive: true }); fs.writeFileSync(path.join(L, id, 'gate.json'), JSON.stringify({ files }))
    fs.writeFileSync(path.join(L, id, 'iter-1.codex.json'), JSON.stringify({ verdict: 'FAIL', defects }))
    fs.writeFileSync(path.join(L, id, 'ledger.json'), JSON.stringify({ iters: [{ iter: 1, verdict: 'FAIL', out: path.join(L, id, 'iter-1.codex.json') }], waived: {} }))
  }
  try {
    fs.mkdirSync(path.join(L, 'c4-sm')); fs.writeFileSync(path.join(L, 'c4-sm', 'split.json'), JSON.stringify({ parts: ['c4-sm-p1', 'c4-sm-p2'] }))
    const D = { id: 'D-001', severity: 'med', status: 'open', file: 'scripts/x.mjs', line: 3, summary: 'xx 결함' }
    part('c4-sm-p1', ['scripts/y.mjs', 'zz/z.md'], []); part('c4-sm-p2', ['scripts/x.mjs'], [D])
    const T = [{ id: 'c4-sm-p2', base: 'c4-sm', part: [2, 2], reason: 'scope-missing', files: ['scripts/x.mjs'] }]
    const opt = { read, budgetFor: () => 360 * K, dry: true }
    // a) 결함 나온 묶음(p2) = 결함 파일 x.mjs 가 든 묶음(경로순으로는 p1 이 될 자리)
    const j = cg.resplit(T, () => cost, L, opt)
    assert.deepEqual(j.map(x => [x.id, x.files, x.part]), [['c4-sm-p1', ['zz/z.md'], [1, 2]], ['c4-sm-p2', ['scripts/x.mjs', 'scripts/y.mjs'], [2, 2]]])
    assert.ok(!fs.existsSync(path.join(L, 'c4-sm-p1', 'superseded.json')), 'dry = 원장 쓰기 없음')
    // a) 두 묶음 결함이 한 묶음으로 모이면 먼저 고정된 묶음이 갖고, 다른 묶음에는 결함 목록 + 결함 함수 본문 전체 참조
    part('c4-sm-p1', ['scripts/y.mjs', 'zz/z.md'], [{ ...D, id: 'D-009', file: 'scripts/y.mjs', line: 1, summary: 'yy 결함' }])
    const j2 = cg.resplit(T, () => cost, L, opt), p2 = j2.find(x => x.id === 'c4-sm-p2')
    assert.deepEqual(j2.find(x => x.id === 'c4-sm-p1').files, ['scripts/x.mjs', 'scripts/y.mjs']); assert.deepEqual(p2.files, ['zz/z.md'])
    assert.match(p2.related, /옛 묶음 c4-sm-p2 열린 결함 D-001 \(scripts\/x\.mjs:3\) xx 결함[\s\S]*L2: export function xx\(\) \{\nL3:   return yy\(\)\nL4: \}/)
    // b) scope 코드 x.mjs 의 짝 시험 test/x.test.mjs(scope 밖) = 변경 함수 xx 가 나오는 시험 블록만 · scope 시험의 대상 w.mjs(scope 밖) = 가져다 쓰는 ww 정의
    const one = cg.jobsFor([{ no: 4, id: 'c4-y-a1b2c3' }], ['scripts/x.mjs', 'scripts/y.mjs', 'test/w.test.mjs'], () => 1, { budget: 360 * K, read, changed: f => (f === 'scripts/x.mjs' ? [3] : []) })
    assert.equal(one.length, 1)
    assert.match(one[0].related, /test\/x\.test\.mjs[\s\S]*L3: test\('xx 캐시 우선'/); assert.ok(!one[0].related.includes('무관 시험'))
    assert.match(one[0].related, /scripts\/w\.mjs[\s\S]*L1: export function ww\(\) \{/); assert.ok(!one[0].related.includes('other = 3'))
  } finally { fs.rmSync(L, { recursive: true, force: true }) }
})

test('짧은 이름(1~2자) 바뀐 함수도 짝 시험 블록 발췌 — 잡음은 길이가 아니라 단어 경계 + 호출·참조 형태로 거름(2026-11-10 c4-scope-missing-ab2c5d D-002)', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'))
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const src = {
    'scripts/s.mjs': 'export function q(x) {\n  return x\n}\nexport const qq = 1\n',
    'test/s.test.mjs': "import { q } from '../scripts/s.mjs'\n\ntest('q 호출', () => {\n  q(1)\n})\n\ntest('문자열 q 만', () => {\n  const s = 'q'\n})\n\ntest('qq 참조', () => {\n  return m.qq\n})\n\ntest('비슷한 이름 sq', () => {\n  sq(1)\n})\n",
  }
  const r = cg.testRefs(['scripts/s.mjs'], ['scripts/s.mjs'], f => src[f] ?? null, () => [2, 4])
  assert.equal(r.length, 1); const tx = r[0][1]
  assert.match(tx, /L3: test\('q 호출'/)   // 1자 이름 호출 = 발췌
  assert.match(tx, /L11: test\('qq 참조'/)   // 2자 이름 멤버 참조 = 발췌
  assert.ok(!tx.includes('문자열 q 만') && !tx.includes('비슷한 이름 sq'), tx)   // 문자열 안·다른 이름의 일부 = 잡음
})

test('같은 원장 재시도(단일 scope-missing · 묶음 원장 lock 등)도 참조를 지금 파일·바뀐 함수로 다시 만든다 — 기존 related-ref.md 를 지우지 않게(2026-11-10 c4-scope-missing-ab2c5d D-003)', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'))
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const src = {
    'scripts/x.mjs': "import { yy } from './y.mjs'\nexport function xx() {\n  return yy()\n}\n",
    'scripts/y.mjs': 'export const yy = () => 1\n',
    'test/x.test.mjs': "import { xx } from '../scripts/x.mjs'\n\ntest('xx 캐시 우선', () => {\n  xx()\n})\n",
  }
  const read = f => src[f] ?? null, L = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-same-'))
  try {
    // 단일 원장 : 첫 판정 때 참조(related-ref.md)가 있었던 원장이 scope-missing 으로 막힘
    fs.mkdirSync(path.join(L, 'c4-one', 'evidence-1'), { recursive: true }); fs.writeFileSync(path.join(L, 'c4-one', 'evidence-1', 'related-ref.md'), '옛 참조')
    const opt = { read, changed: () => () => [3], dry: true }
    const [one] = cg.resplit([{ id: 'c4-one', reason: 'scope-missing', files: ['scripts/x.mjs', 'scripts/y.mjs'], part: null }], () => () => 1, L, opt)
    assert.equal(one.id, 'c4-one'); assert.match(one.related || '', /test\/x\.test\.mjs[\s\S]*L3: test\('xx 캐시 우선'/)
    // 묶음 원장 같은 원장 재시도(lock) : 다른 묶음 연관 파일 발췌 유지
    fs.mkdirSync(path.join(L, 'c4-sm')); fs.writeFileSync(path.join(L, 'c4-sm', 'split.json'), JSON.stringify({ parts: ['c4-sm-p1', 'c4-sm-p2'] }))
    for (const [p, fl] of [['c4-sm-p1', ['scripts/x.mjs']], ['c4-sm-p2', ['scripts/y.mjs']]]) { fs.mkdirSync(path.join(L, p)); fs.writeFileSync(path.join(L, p, 'gate.json'), JSON.stringify({ files: fl })) }
    const [p1] = cg.resplit([{ id: 'c4-sm-p1', base: 'c4-sm', part: [1, 2], reason: 'lock', files: ['scripts/x.mjs'] }], () => () => 1, L, opt)
    assert.equal(p1.id, 'c4-sm-p1'); assert.match(p1.related || '', /scripts\/y\.mjs \(다른 묶음[\s\S]*L1: export const yy/)
  } finally { fs.rmSync(L, { recursive: true, force: true }) }
})
