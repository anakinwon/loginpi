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

test('셸 cd 작업 디렉터리 추적(2026-11-11 후속 2 — `cd <dir> && cat > f` 의 f 가 루트 기준으로 풀림) : 쓰기 대상 = 그 cwd 기준, 저장소 밖 = 귀속 0, 추적 불가 뒤 상대 쓰기 = 제외, 병렬 형제 귀속', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'))
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-cd-')), ses = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-ses-')), git = (...a) => spawnSync('git', a, { cwd: r, encoding: 'utf8' })
  try {
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); fs.writeFileSync(path.join(r, 'base.md'), 'b'); git('add', '-A'); git('commit', '-qm', 'b')
    const rel = p => (a => path.isAbsolute(a) ? path.relative(r, a).replace(/\\/g, '/') : p)(p.replace(/^\/([a-z])\//i, '$1:/')), sw = c => [...cg.shellWrites(c, r)].map(rel).sort()
    const R = r.replace(/\\/g, '/'), gb = '/' + R[0].toLowerCase() + R.slice(2)   // Git Bash 표기 /c/…
    // 고치기 전 결과는 각 줄 끝 주석(전부 루트 기준) — 7번(절대경로 쓰기)만 고치기 전과 같음
    const want = {
      '1 cd sub + heredoc': [["cd sub && cat > f.txt <<'EOF'\na > b\nEOF", ['sub/f.txt']]],   // 전 ['f.txt']
      '3 cd 누적': [['cd a; cd b && echo x > f', ['a/b/f']], ['cd a/b && cd .. && echo x >> g', ['a/g']]],   // 전 ['f'] · ['g']
      '4 cd /d': [[`cd /d ${r}\\sub && echo x > f`, ['sub/f']], [`cd ${gb}/sub && echo y | tee t1 t2`, ['sub/t1', 'sub/t2']]],   // 전 ['f'] · ['t1','t2']
      '5 PowerShell': [['Set-Location sub; Set-Content f x', ['sub/f']], ["sl -LiteralPath 'my dir'; Out-File -FilePath g", ['my dir/g']], ['Push-Location -Path "p q"; Add-Content h y', ['p q/h']], ['pushd sub && cp a.md b.md', ['sub/b.md']]],   // 전 ['f'] · ['g'] · ['h'] · ['b.md']
      '6 따옴표 공백 경로': [['cd "my dir" && cat > f', ['my dir/f']]],   // 전 ['f']
      '7 절대경로 쓰기(cd 무관)': [[`cd sub && echo x > ${R}/abs.md`, ['abs.md']], [`cd $D && echo x > ${gb}/abs2.md`, ['abs2.md']]],   // 전 같음
      '8 추적 불가 뒤 상대 = 없음': [['(cd sub && cat > f)', []], ['cd $D && cat > f', []], ['cd "$D" && cat > f', []], ['cd ~ && echo > f', []], ['cd - && echo > f', []], ['cd && echo > f', []],
        ['cd `pwd`/x && echo > f', []], ['cd "$(dirname x)" && echo > f', []], ['cd %TEMP% && echo > f', []], ['pushd sub; popd; echo x > f', []], ['if true; then cd sub; fi; echo > f', []],
        [`cd $D; cd ${R}/sub && echo x > f`, ['sub/f']]],   // 전 전부 ['f'] / 절대 cd 로 다시 추적
      // c4-2-cd-a10f27 회송 결정(4회차 단순화) : 복합 셸(서브셸·묶음·제어문·명령 치환·popd)에 cd 계열이 있으면 첫 cd 세그먼트부터 상대 쓰기 = 귀속 안 함(누락 허용, 오귀속 방지)
      //   — 경계 사례(조건문 D-001 → 서브셸 D-002 → 그룹 리다이렉트 D-003 → 중괄호 D-004)를 하나씩 막으면 회차마다 새 구멍이 나와서. 아래 일부는 bash 실제 위치(예 `(cd sub && x) > f` = 루트 f)와 다르지만 의도된 누락
      '8b 복합 + cd = 첫 cd 뒤 상대 쓰기 없음': [['if true\nthen\ncd sub\nfi\necho > f', []], ['while x; do\ncd sub; done; echo > f', []], ['while x\ndo\ncd sub\ndone\necho > f', []],
        ['if [ -d a ]; then\n  cd a\nfi\necho > f', []], ['for d in a b; do cd sub; done; echo > f', []], ['case $x in a) cd sub;; esac; echo > f', []], ['if x; then echo y; fi\ncd sub && echo > f', []],
        ['cd sub && (cat > f)', []], ['(cd sub && make) && cat > f', []], ['(cd sub && cat > g); cat > f', []], ['cd a && (cd b; x) && cat > f', []],
        ['(cd sub && x) > f', []], ['cd a && (cd b && x) > f', []], ['(cd sub && cat > g) > f', []], ['{ cd sub; x; } > f', []], ['cd a && { x; } > f', []], ['echo $(cd sub; pwd) > f', []],
        ['{ x; cd sub; cat > g; } > f', []], ['{\n  x\n  cd sub\n  cat > g\n} > f', []]],   // 3회차 판 : D-004 두 경우 = ['sub/g', 'f'](여러 세그먼트로 나뉜 중괄호 안 cd 를 그대로 추적)
      // 복합이어도 첫 cd 앞 상대 쓰기(루트 확정)·절대 쓰기 = 반환 / cd 계열이 없으면 전부 루트(서브셸은 부모 cwd 상속 — D-002 '결함 아님' 유지)
      '10 복합 — cd 앞·cd 없음': [['echo a > pre; (cd sub && x) > f', ['pre']], [`(cd sub && x) > ${R}/abs.md`, ['abs.md']], ['(cat > f)', ['f']], ['{ x; } > f', ['f']], ['if x; then echo > f; fi', ['f']]],
    }
    const got = Object.fromEntries(Object.entries(want).map(([k, cs]) => [k, cs.map(([c]) => [c, sw(c)])]))
    assert.deepEqual(got, want)
    // 2 저장소 밖 cd(진단 사례 aed1dc pscheck.ps1) : 쓰기 대상 = 저장소 밖 절대경로, 루트에 같은 이름 파일이 바뀌어도 귀속 0건(said·mine 둘 다)
    const now = Date.now(), iso = t => new Date(t).toISOString(), mt = (f, t) => fs.utimesSync(path.join(r, f), new Date(t), new Date(t))
    const out = '/c/Users/x/AppData/Local/Temp', ps = `cd ${out} && cat > pscheck.ps1 <<'EOF'\nWrite-Host 1\nEOF`
    assert.deepEqual([...cg.shellWrites(ps, r)].map(p => p.replace(/\\/g, '/').toLowerCase()), ['c:/users/x/appdata/local/temp/pscheck.ps1'])   // 전 ['pscheck.ps1']
    fs.writeFileSync(path.join(r, 'pscheck.ps1'), 'other'); mt('pscheck.ps1', now - 10e3)
    assert.deepEqual([...cg.changedFiles([], now - 60e3, null, r, { shell: [{ c: ps, t: now - 20e3, t1: now - 5e3 }] })], [])   // 전 ['pscheck.ps1']
    // 9 병렬 형제 : A = `cd sitemap/x && cat > src/a.ts`, B = `node --test sitemap/x/src/`(같은 시간) — A scope 에 a.ts, B scope 0건(others 가 A 의 쓰기를 sitemap/x/src/a.ts 로 봄)
    const use = (t, name, input, id) => ({ type: 'assistant', timestamp: iso(t), message: { content: [{ type: 'tool_use', id, name, input }] } })
    const res = (t, id) => ({ type: 'user', timestamp: iso(t), message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } })
    const sub = path.join(ses, 's1', 'subagents'); fs.mkdirSync(sub, { recursive: true })
    const put = (id, recs) => fs.writeFileSync(path.join(sub, `agent-${id}.jsonl`), recs.map(x => JSON.stringify(x)).join('\n') + '\n')
    fs.rmSync(path.join(r, 'pscheck.ps1')); fs.mkdirSync(path.join(r, 'sitemap/x/src'), { recursive: true }); fs.writeFileSync(path.join(r, 'sitemap/x/src/a.ts'), 'export const a = 1\n'); mt('sitemap/x/src/a.ts', now - 49.5e3)
    const recsA = [use(now - 50e3, 'Bash', { command: "cd sitemap/x && cat > src/a.ts <<'EOF'\nexport const a = 1\nEOF" }, 'tA'), res(now - 49e3, 'tA')]
    const recsB = [use(now - 60e3, 'Bash', { command: 'node --test sitemap/x/src/' }, 'tB'), res(now - 30e3, 'tB')]
    put('aaaaaa01', recsA); put('abbbbb01', recsB)
    const at = (id, recs) => cg.attributeOf({ recs, tp: path.join(sub, `agent-${id}.jsonl`), mainTp: null, agentId: id, root: r }).files
    assert.deepEqual({ A: at('aaaaaa01', recsA), B: at('abbbbb01', recsB) }, { A: ['sitemap/x/src/a.ts'], B: [] })   // 전 { A: [], B: ['sitemap/x/src/a.ts'] }
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
  assert.deepEqual(ac4(inH), ['- AC-4 : 하네스 파일 변경 1건(.claude/hooks/x.mjs) — 규칙 정합 / 우회·회귀 없음 / selftest·node --check 근거 = 증거 checks.md'])   // 들어옴(11c : 근거 = 훅이 돌린 checks.md)
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

test('도구 기록 셸 출력 발췌 = 앞 2줄 + 끝 8줄(P4 — 끝의 시험 요약 줄 ℹ pass 106 이 증거에 남음), 겹치면 합침 · 줄당 200자 · 비밀 가림 유지', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'))
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const sec = 'ghp_' + 'A'.repeat(30)
  const tl = out => cg.toolLines([{ type: 'assistant', timestamp: '2026-11-11T01:00:00Z', message: { content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'node --test test/*.test.mjs' } }] } },
    { type: 'user', timestamp: '2026-11-11T01:00:05Z', message: { content: [{ type: 'tool_result', tool_use_id: 'b1', content: out.join('\n') }] } }])[0].split('\n    → ').slice(1)
  // 30줄(빈 줄 섞임) : 앞 2 + 생략 표식 + 끝 8 — 끝 줄(요약)·긴 줄 200자 자름·끝 구간 비밀 가림
  const o30 = Array.from({ length: 30 }, (_, i) => `줄${i + 1}`); o30.splice(5, 0, ''); o30[25] = `비밀 ${sec}`; o30[26] = 'x'.repeat(300); o30[30] = 'ℹ pass 106'
  const got = tl(o30)
  assert.equal(got.at(-1), 'ℹ pass 106')   // 고치기 전 : ['줄1', '줄2'] — 요약 줄 없음
  assert.deepEqual(got.slice(0, 3), ['줄1', '줄2', '…(가운데 20줄 생략)'])
  assert.equal(got.length, 11); assert.ok(got.includes('x'.repeat(200)) && !got.some(l => l.includes(sec)) && got.some(l => l.includes('[REDACTED')), got.join('\n'))
  // 10줄 이하 = 겹침 → 전부 한 번씩(생략 표식 없음)
  assert.deepEqual(tl(['a', 'b', 'c', 'd', 'e']), ['a', 'b', 'c', 'd', 'e'])
  assert.deepEqual(tl(Array.from({ length: 10 }, (_, i) => `L${i}`)), Array.from({ length: 10 }, (_, i) => `L${i}`))
})

test('otherWrites 형제 기록 기억(P3-3) : 같은 경로·크기·mtime = 다시 읽지 않음(같은 결과), 크기·mtime 이 바뀌면 다시 읽음', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'))
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-owc-')), wr = p => JSON.stringify({ type: 'assistant', timestamp: '2026-11-11T01:05:00Z', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: p } }] } }) + '\n'
  try {
    const sib = path.join(d, 'agent-a2.jsonl'), t0 = Date.parse('2026-11-11T01:00:00Z'), ow = () => [...cg.otherWrites(d, path.join(d, 'agent-a1.jsonl'), null, t0)].sort()
    const T = t0 / 1000 + 3600; fs.writeFileSync(sib, wr('x1.md')); fs.utimesSync(sib, T, T)   // mtime = 정수 초(Date 왕복의 밀리초 아래 손실 없이 같은 값 재설정)
    assert.deepEqual(ow(), ['x1.md'])
    fs.writeFileSync(sib, wr('y1.md')); fs.utimesSync(sib, T, T)   // 같은 크기·mtime 으로 내용만 바꿈 = 기억한 결과(다시 읽지 않았다는 증거)
    assert.deepEqual(ow(), ['x1.md'])
    fs.appendFileSync(sib, wr('z2.md'))   // 덧붙임 = 크기 바뀜 → 다시 읽음
    assert.deepEqual(ow(), ['y1.md', 'z2.md'])
  } finally { fs.rmSync(d, { recursive: true, force: true }) }
})

test('codex-flush.mjs 얇은 진입(P1) : 같은 pending 입력 = codex-gate --flush 와 출력 바이트 동일 · pending 없음·agent_id·CODEX_GATE_ACTIVE = 침묵(pending 그대로)', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  const st = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-flush-')), pend = path.join(st, 'codex-gate', 'pending')
  const env = { ...process.env, CODEX_GATE_STATE: st }; delete env.CODEX_GATE_ACTIVE
  const run = (file, args, input, e = env) => spawnSync(process.execPath, [path.join(ROOT, '.claude', 'hooks', file), ...args], { cwd: ROOT, input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', env: e })
  const recs = [{ agentType: 'anakin_phase-build', agentId: 'af00d1234', changed: 2, baseRef: null, results: [{ id: 'c4-x-af00d1', no: 4, iter: 1, code: 0, verdict: 'PASS', ledger: '.omc/state/loop/c4-x-af00d1' }] },
    { agentType: 't', agentId: 'ab0000002', changed: 1, baseRef: 'f'.repeat(40), results: [{ id: 'c4-y-ab0000-p1', no: 4, iter: 2, code: 1, verdict: 'FAIL', base: 'c4-y-ab0000', part: [1, 2], ledger: 'l' }, { id: 'c4-y-ab0000-p2', no: 4, iter: 1, code: 0, verdict: 'PASS', base: 'c4-y-ab0000', part: [2, 2], ledger: 'l2' }] }]
  const seed = () => { fs.mkdirSync(pend, { recursive: true }); recs.forEach((r, i) => fs.writeFileSync(path.join(pend, `100${i}-x.json`), JSON.stringify(r))); fs.writeFileSync(path.join(pend, 'note.txt'), 'json 아님') }
  try {
    for (const input of [{ hook_event_name: 'PostToolUse' }, { hook_event_name: 'UserPromptSubmit' }, {}, 'not json']) {
      seed(); const a = run('codex-gate.mjs', ['--flush'], input)
      seed(); const b = run('codex-flush.mjs', [], input)
      assert.equal(a.status, 0); assert.equal(b.status, 0); assert.ok(a.stdout.length > 0, JSON.stringify(input))
      assert.ok(Buffer.from(b.stdout).equals(Buffer.from(a.stdout)), `${JSON.stringify(input)}\n${a.stdout}\n${b.stdout}`)
      assert.deepEqual(fs.readdirSync(pend), ['note.txt'])   // 둘 다 pending → sent
    }
    // 침묵 3종 : 서브에이전트 안 · 훅 프로세스 안(pending 그대로) · pending 없음(폴더 없음 포함)
    seed()
    assert.equal(run('codex-flush.mjs', [], { hook_event_name: 'PostToolUse', agent_id: 'a999' }).stdout, '')
    assert.equal(run('codex-flush.mjs', [], { hook_event_name: 'PostToolUse' }, { ...env, CODEX_GATE_ACTIVE: '1' }).stdout, '')
    assert.equal(fs.readdirSync(pend).filter(f => f.endsWith('.json')).length, 2)
    fs.rmSync(path.join(st, 'codex-gate'), { recursive: true, force: true })
    for (const f of ['codex-flush.mjs', 'codex-gate.mjs']) { const r = run(f, f === 'codex-gate.mjs' ? ['--flush'] : [], { hook_event_name: 'PostToolUse' }); assert.equal(r.status, 0); assert.equal(r.stdout, '', f) }
  } finally { fs.rmSync(st, { recursive: true, force: true }) }
})

test('같은 내용 재판정 건너뜀(P6) : 브리프만 바뀌어도 다시 판정 · 같은 해시 + 마지막 PASS = 건너뜀(새 회차 없음) · FAIL·BLOCKED 원장은 건너뛰지 않음 · 묶음 AND 에 건너뛴 PASS 반영', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'))
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-same-')), dir = path.join(process.env.CODEX_GATE_STATE, 'loop', `c4-same-${process.pid}`)
  try {
    fs.writeFileSync(path.join(r, 'a.md'), 'A1')
    const job = { no: 4, id: path.basename(dir), files: ['a.md'] }, ctx = { type: 'anakin_phase-build', agentId: 'a1b2c3d4', brief: '브리프 B1', request: '마스터 원문 R', root: r }
    const h = cg.judgeHash(job, ctx, r)
    assert.match(h, /^[0-9a-f]{40}$/); assert.equal(cg.judgeHash(job, { ...ctx, baseRef: 'f'.repeat(40), own: ['a.md'] }, r), h, '계약 머리(기준선·귀속 줄) = 해시 밖')
    // ① 브리프만 · 원문만 · 파일 내용만 바뀜 = 다른 해시(다시 판정)
    assert.notEqual(cg.judgeHash(job, { ...ctx, brief: '브리프 B2' }, r), h)
    assert.notEqual(cg.judgeHash(job, { ...ctx, request: '마스터 원문 R2' }, r), h)
    fs.writeFileSync(path.join(r, 'a.md'), 'A2'); assert.notEqual(cg.judgeHash(job, ctx, r), h); fs.writeFileSync(path.join(r, 'a.md'), 'A1')
    // ② 같은 해시 + 마지막 판정 PASS = 건너뜀 : Codex·새 회차·증거 없음, 이전 회차 PASS 를 돌려줌
    fs.mkdirSync(dir, { recursive: true })
    const led = (iters, blocked = []) => fs.writeFileSync(path.join(dir, 'ledger.json'), JSON.stringify({ id: job.id, iters, blocked }))
    led([{ iter: 1, at: '2026-11-11T01:00:00Z', verdict: 'FAIL' }, { iter: 2, at: '2026-11-11T02:00:00Z', verdict: 'PASS' }]); fs.writeFileSync(path.join(dir, 'gate.json'), JSON.stringify({ no: 4, passHash: { hash: h, iter: 1 } }))
    assert.equal(cg.passedSame(dir, h), null, 'passHash 회차 ≠ 마지막 PASS 회차(2) = 다시 판정')
    fs.writeFileSync(path.join(dir, 'gate.json'), JSON.stringify({ no: 4, passHash: { hash: h, iter: 2 } }))
    assert.equal(cg.passedSame(dir, h), 2)
    const res = await cg.judgeOne(job, ctx, Date.now() + 60e3)
    assert.deepEqual([res.iter, res.code, res.verdict, res.reason], [2, 0, 'PASS', '변경 없음 — 이전 PASS 유지'])
    assert.deepEqual(fs.readdirSync(dir).sort(), ['gate.json', 'ledger.json'])   // 계약·증거·회차 파일 안 생김
    assert.equal(cg.passedSame(dir, cg.judgeHash(job, { ...ctx, brief: '브리프 B2' }, r)), null)   // 브리프만 바뀜 = 판정
    // ③ FAIL 원장 · PASS 뒤 BLOCKED · 해시 없음 = 건너뛰지 않음
    led([{ iter: 1, at: '2026-11-11T01:00:00Z', verdict: 'PASS' }, { iter: 2, at: '2026-11-11T02:00:00Z', verdict: 'FAIL' }]); assert.equal(cg.passedSame(dir, h), null)
    led([{ iter: 1, at: '2026-11-11T01:00:00Z', verdict: 'PASS' }], [{ iter: 2, at: '2026-11-11T02:00:00Z', reason: 'lock' }]); assert.equal(cg.passedSame(dir, h), null)
    led([{ iter: 1, at: '2026-11-11T01:00:00Z', verdict: 'PASS' }]); fs.writeFileSync(path.join(dir, 'gate.json'), JSON.stringify({ no: 4 })); assert.equal(cg.passedSame(dir, h), null)
    // ④ 묶음 : 건너뛴 p1 PASS + 판정한 p2 PASS = AND Y, 결과 글에 '변경 없음 — 이전 PASS 유지'
    const msg = cg.summarize({ agentType: 'anakin_phase-build', agentId: 'a1b2c3d4', baseRef: 'x', results: [{ ...res, id: 'c4-y-a1b2c3-p1', base: 'c4-y-a1b2c3', part: [1, 2], ledger: 'l1' }, { id: 'c4-y-a1b2c3-p2', iter: 1, code: 0, verdict: 'PASS', base: 'c4-y-a1b2c3', part: [2, 2], ledger: 'l2' }] })
    assert.match(msg, /c4-y-a1b2c3-p1 2회차 PASS\(종료 0\) — 변경 없음 — 이전 PASS 유지[\s\S]*c4-y-a1b2c3 묶음 2개 AND → Y[\s\S]*전부 PASS\(Y\)/)
  } finally { fs.rmSync(r, { recursive: true, force: true }); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('반복 지적 승격(2026-11-11 마스터 선택) : contested 2회 = 승격 문구 · 1회·open 반복 = 기존 회송 문구만', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'))
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const loops = path.join(process.env.CODEX_GATE_STATE, 'loop'), made = []
  const ledger = (id, defects, extra = {}) => {
    const dir = path.join(loops, `${id}-${process.pid}`); made.push(dir); fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'ledger.json'), JSON.stringify({ id: path.basename(dir), iters: [{ iter: 2, verdict: 'FAIL' }], blocked: [] }))
    fs.writeFileSync(path.join(dir, 'iter-2.codex.json'), JSON.stringify({ verdict: 'FAIL', defects, ...extra }))
    return path.basename(dir)
  }
  const msgOf = id => cg.summarize({ agentType: 'anakin_phase-build', agentId: 'a1b2c3d4', baseRef: 'x', results: [{ id, iter: 2, code: 1, verdict: 'FAIL', ledger: 'l' }] })
  try {
    const d = (id, status, seenCount) => ({ id, severity: 'med', status, file: 'a.mjs', line: 1, summary: 's', seenCount })
    const c2 = ledger('c4-promo-c2', [d('D-002', 'contested', 2), d('D-003', 'open', 1)]), m = msgOf(c2)
    assert.match(m, new RegExp(`반복 지적 승격\\*\\* — 회송 대신 teamanakin-admin 면제 판단\\(13절 9항\\) : ${c2} D-002\\(이의 2회\\)`))
    assert.doesNotMatch(m, /D-003\(/, '조건 밖 결함은 승격 안 함')
    assert.match(m, /FAIL 은 그 결과를 낸 에이전트에 결함/, '기존 회송 문구 유지')
    assert.doesNotMatch(msgOf(ledger('c4-promo-c1', [d('D-001', 'contested', 1)])), /반복 지적 승격/, '1회 지적 = 승격 없음')
    assert.doesNotMatch(msgOf(ledger('c4-promo-o2', [d('D-001', 'open', 3)])), /반복 지적 승격/, 'open 반복 = 승격 없음')
    // 이의 인정 표식(D-001 회송) : notes·기준 evidence 한 문장에 결함 id + 구절
    const ack = ledger('c4-promo-ack', [d('D-004', 'open', 2)], { notes: '도구 없이 판정했다. D-004 는 의도된 동작이라 결함이 아니다. 끝', criteria: [{ id: 'AC-1', status: 'unmet', met: false, evidence: 'x' }] })
    assert.match(msgOf(ack), new RegExp(`${ack} D-004\\(이의 2회\\)`), '표식 있음 + open 2회 = 승격')
    const ev = ledger('c4-promo-ev', [d('D-005', 'open', 2)], { notes: '', criteria: [{ id: 'AC-2', status: 'unmet', met: false, evidence: '근거 · D-005 Not a defect' }] })
    assert.match(msgOf(ev), /D-005\(이의 2회\)/, '기준 evidence 표식(대소문자 무시)')
    assert.doesNotMatch(msgOf(ledger('c4-promo-noack', [d('D-004', 'open', 2)], { notes: 'D-004 는 아직 남았다' })), /반복 지적 승격/, '표식 없음 + open 2회 = 승격 없음')
    assert.doesNotMatch(msgOf(ledger('c4-promo-other', [d('D-004', 'open', 2)], { notes: 'D-004 는 남았다. D-007 은 결함이 아니다' })), /반복 지적 승격/, '다른 결함 id 문장의 구절 = 승격 없음')
    assert.doesNotMatch(msgOf(ledger('c4-promo-prefix', [d('D-004', 'open', 2)], { notes: 'D-0040 은 결함이 아니다' })), /반복 지적 승격/, 'D-0040 문장 = D-004 표식 아님(c4-build-ad8596 D-002)')
  } finally { for (const dir of made) fs.rmSync(dir, { recursive: true, force: true }) }
})

test('c4-build-a8915f D-001 : 판정 시도 중 잠금으로 판정·BLOCKED 기록이 모두 실패한 내용은 다음 실행에서 이전 PASS 로 재사용하지 않는다(해시 = 확정 PASS 회차와 결합해서만 저장)', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'))
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-lock-')), dir = path.join(process.env.CODEX_GATE_STATE, 'loop', `c4-lock-${process.pid}`), js0 = process.env.CODEX_JS
  const fake = path.join(r, 'fake-codex.mjs'); fs.writeFileSync(fake, "process.exit(3)\n"); process.env.CODEX_JS = fake   // 안전 : 잠금이 안 걸려도 실제 Codex 호출 없음
  try {
    fs.writeFileSync(path.join(r, 'a.md'), '판정받은 내용 A1')
    const job = { no: 4, id: path.basename(dir), files: ['a.md'] }, ctx = { type: 'anakin_phase-build', agentId: 'a1b2c3d4', brief: 'B', request: 'R', root: r }
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'ledger.json'), JSON.stringify({ id: job.id, startedAt: '2026-11-11T00:00:00Z', iters: [{ iter: 1, at: '2026-11-11T01:00:00Z', verdict: 'PASS' }], blocked: [] }))
    fs.writeFileSync(path.join(dir, 'gate.json'), JSON.stringify({ no: 4, passHash: { hash: cg.judgeHash(job, ctx, r), iter: 1 } }))   // A1 = 1회차 PASS 로 확정
    const before = fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8')
    fs.writeFileSync(path.join(r, 'a.md'), '판정 안 받은 내용 A2'); fs.writeFileSync(path.join(dir, 'ledger.lock'), '{}')   // 다른 실행이 잡은 잠금 = --init·--ingest 모두 실패
    const r1 = await cg.judgeOne(job, ctx, Date.now() + 60e3)
    assert.equal(r1.verdict, 'BLOCKED'); assert.match(r1.reason, /원장 기록 실패/); assert.equal(fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8'), before, '원장 그대로(마지막 = 1회차 PASS)')
    const r2 = await cg.judgeOne(job, ctx, Date.now() + 60e3)   // 같은 A2 로 다시 실행
    assert.notEqual(r2.reason, '변경 없음 — 이전 PASS 유지', '판정 안 받은 A2 를 이전 PASS 로 재사용')   // 고치기 전 : 1회차 PASS(건너뜀)
    assert.equal(r2.verdict, 'BLOCKED')
    fs.rmSync(path.join(dir, 'ledger.lock')); fs.writeFileSync(path.join(r, 'a.md'), '판정받은 내용 A1')
    assert.equal(cg.passedSame(dir, cg.judgeHash(job, ctx, r)), null, '실패한 시도가 gate.json 을 다시 써 옛 확정 해시는 사라짐(보수적 — 다시 판정)')
  } finally { if (js0 === undefined) delete process.env.CODEX_JS; else process.env.CODEX_JS = js0; fs.rmSync(r, { recursive: true, force: true }); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('인터프리터 쓰기 귀속(11c — c4-c-ecc-flush-a1dd68 `cd /c/…; node -e …; for …; done` 0건 · c4-build-abc938 `cd …/references && node - <<EOF` 누락) : node -e·heredoc × /c/… · C:\\… 4형태 귀속, 다른 실행 경로·실행 밖 수정·node --test = 귀속 안 함', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'))
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-ip-')), git = (...a) => spawnSync('git', a, { cwd: r, encoding: 'utf8' })
  const fsAll = ['.claude/settings.json', 'sub/ref/a.md', 'sub/ref/b.md', 'c.json', 'other.md', 'late.md', 'tst.md']
  const w = (f, s) => { fs.mkdirSync(path.dirname(path.join(r, f)), { recursive: true }); fs.writeFileSync(path.join(r, f), s) }
  try {
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); for (const f of fsAll) w(f, '0'); git('add', '-A'); git('commit', '-qm', 'b')
    const now = Date.now(), mt = (f, t) => { w(f, '1'); fs.utimesSync(path.join(r, f), new Date(t), new Date(t)) }
    const R = r.replace(/\\/g, '/'), gb = '/' + R[0].toLowerCase() + R.slice(2), win = r   // Git Bash /c/… · Windows C:\…
    const tail = '; for f in x; do echo $f; done'   // 실제 사례 꼴 : 복합 꼬리(for) = cwd 추적 불가 → 상대 언급이 버려지던 것
    const sh = [
      { c: `cd ${gb}; node -e "const fs=require('fs');fs.writeFileSync('.claude/settings.json','{}')"${tail}`, t: now - 100e3, t1: now - 99e3, f: '.claude/settings.json' },
      { c: `cd ${win}; node -e "require('fs').writeFileSync('c.json','{}')"${tail}`, t: now - 90e3, t1: now - 89e3, f: 'c.json' },
      { c: `cd ${gb}/sub/ref && node - <<'EOF'\nconst fs=require('fs'),f=['a'].map(x=>x+'.md')[0];fs.writeFileSync(f,'1')\nEOF\nfor f in x; do echo; done`, t: now - 80e3, t1: now - 79e3, f: 'sub/ref/a.md' },   // 쓰기 대상이 코드로 만들어짐(글에 없음)
      { c: `cd ${win}\\sub\\ref && node - <<'EOF'\nrequire('fs').writeFileSync(require('path').join('.', 'b' + '.md'), '1')\nEOF\nfor f in x; do echo; done`, t: now - 70e3, t1: now - 69e3, f: 'sub/ref/b.md' },
    ]
    for (const x of sh) mt(x.f, x.t + 500)
    mt('other.md', now - 99.5e3)   // 같은 창 안 수정이지만 다른 실행이 Write·Edit 로 쓴 경로 = 제외
    mt('late.md', now - 50e3)      // 어느 인터프리터 실행 창에도 안 걸림 = 귀속 안 함
    mt('tst.md', now - 30e3)       // node --test(인터프리터 인라인 아님) 실행 중 수정 = 귀속 안 함
    const shell = [...sh.map(({ c, t, t1 }) => ({ c, t, t1 })), { c: 'node --test test/*.test.mjs', t: now - 31e3, t1: now - 29e3 }]
    const got = cg.changedFiles([], now - 200e3, null, r, { shell, others: new Set(['other.md']) })
    assert.deepEqual([...got], ['.claude/settings.json', 'c.json', 'sub/ref/a.md', 'sub/ref/b.md'])   // 고치기 전(11b) : ['sub/ref/a.md', 'sub/ref/b.md'] — node -e 두 형태 누락(heredoc 두 형태는 cd 인자의 디렉터리 언급으로 귀속)
    assert.equal(got.excluded, 1, 'other.md = 병렬 귀속 제외')
    // 시각 없는 명령(문자열·백그라운드) = 시간창 근거 없음 → 인터프리터여도 귀속 안 함(종전 규칙 유지)
    assert.deepEqual([...cg.changedFiles([], now - 200e3, null, r, { shell: ["node -e \"require('fs').writeFileSync(require('path').join('l'+'ate.md'),'1')\""] })], [])
    assert.deepEqual([...cg.changedFiles([], now - 200e3, null, r, { shell: [{ c: 'node - <<EOF\nx\nEOF', t: now - 51e3, t1: NaN }] })], [])
  } finally { fs.rmSync(r, { recursive: true, force: true }) }
})

test('자동 검사 증거(11c) : 하네스 .mjs = node --check·훅 selftest 실행 결과(종료 코드·끝줄, env CODEX_GATE_ACTIVE=1) · 실패 = 종료 코드 ≠0 기록 · 시간 초과 기록 · 하네스 없음 = 없음 / AC-4 = checks.md 근거, 하네스 .md 뿐 = AC-4 없음', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'))
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-chk-')), w = (f, s) => { fs.mkdirSync(path.dirname(path.join(r, f)), { recursive: true }); fs.writeFileSync(path.join(r, f), s) }
  try {
    w('.claude/hooks/h.mjs', "if (process.argv[2] === '--selftest') { console.log('flag=' + process.env.CODEX_GATE_ACTIVE); console.log('selftest ok') }\n")
    w('.claude/hooks/bad.mjs', 'const = 1\n'); w('scripts/s.mjs', 'export const s = 1\n'); w('docs/a.md', 'a')
    const out = cg.checksOf(['.claude/hooks/h.mjs', '.claude/hooks/bad.mjs', 'scripts/s.mjs', 'docs/a.md', '.claude/hooks/gone.mjs'], r)
    assert.match(out, /\$ node --check \.claude\/hooks\/h\.mjs\n종료 코드 : 0\n/)
    assert.match(out, /\$ node --check \.claude\/hooks\/bad\.mjs\n종료 코드 : 1\n끝줄 : .*SyntaxError/)   // 실패 = 종료 코드 ≠0
    assert.match(out, /\$ node --check scripts\/s\.mjs\n종료 코드 : 0/)   // 하네스가 있으면 scope 안 산출 .mjs 도
    assert.match(out, /\$ node \.claude\/hooks\/h\.mjs --selftest\n종료 코드 : 0\n끝줄 : flag=1 ⏎ selftest ok/)   // 재진입 표식 유지
    assert.ok(!out.includes('gone.mjs') && !out.includes('docs/a.md') && !out.includes('bad.mjs --selftest'), '없는 파일·문서·selftest 없는 훅 = 실행 안 함')
    assert.match(cg.checksOf(['.claude/hooks/h.mjs'], r, Date.now() - 1), /종료 코드 : 시간 초과\(실행 안 함/)   // 상한 소진 = 기록하고 계속
    assert.equal(cg.checksOf(['docs/a.md', 'scripts/s.mjs'], r), '', '하네스 없음 = checks.md 없음')
    assert.match(cg.checksOf(['.claude/settings.json'], r), /검사 대상 없음/)   // AC-4 있음(.md 아닌 하네스) + 실행할 검사 없음 = 그 사실을 기록
    assert.equal(cg.checksOf(['.claude/skills/x/SKILL.md', 'scripts/s.mjs'], r), '', '하네스 .md 뿐 = AC-4 없음 = checks.md 없음(D-001 — 기준과 근거 조건 일치)')
    const ac4 = c => c.match(/^- AC-4 .*$/gm) || [], base = { id: 'c4-x-a1b2c3', no: 4, type: 't', agentId: 'a1' }
    assert.deepEqual(ac4(cg.contractOf({ ...base, files: ['.claude/hooks/h.mjs', 'docs/a.md'] })), ['- AC-4 : 하네스 파일 변경 1건(.claude/hooks/h.mjs) — 규칙 정합 / 우회·회귀 없음 / selftest·node --check 근거 = 증거 checks.md'])
    assert.deepEqual(ac4(cg.contractOf({ ...base, files: ['.claude/skills/x/SKILL.md', '.claude/engineering/40. loop/codex_procedure.md', 'docs/a.md'] })), [], '하네스 .md 뿐 = AC-4 없음')
    assert.deepEqual(ac4(cg.refreshContract(cg.contractOf({ ...base, files: ['.claude/hooks/h.mjs'] }), { id: base.id, files: ['.claude/skills/x/SKILL.md'], part: null }, 'HEAD', null)), [], '재분할도 같은 규칙')
  } finally { fs.rmSync(r, { recursive: true, force: true }) }
})

test('c4-build-a73e25 D-001 : 재판정·재분할(keepEvidence)도 checks.md 를 이번 묶음 파일로 다시 만든다 — 없던 증거에 생성 · 하네스가 옮겨지면 옛 묶음 정리·새 묶음 생성 · .md 뿐 묶음 없음 · 총 상한 공유', async () => {
  const fs = (await import('node:fs')).default, os = (await import('node:os')).default
  process.env.CODEX_GATE_STATE ||= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-state-'))
  const cg = await import('../.claude/hooks/codex-gate.mjs')
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-rechk-')), loops = path.join(process.env.CODEX_GATE_STATE, 'loop'), tag = `rechk${process.pid}`, js0 = process.env.CODEX_JS
  const fake = path.join(r, 'fake-codex.mjs'); fs.writeFileSync(fake, 'process.exit(3)\n'); process.env.CODEX_JS = fake   // 안전 : 실제 Codex 호출 없음
  const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s) }
  const ids = ['new', 'p1', 'p2', 'md', 'late'].map(k => `c4-${tag}-${k}`)
  // 원장 = 계약 + 1회차 증거(report.md) + 잠금(--init·--ingest 즉시 실패 → BLOCKED, 증거 준비까지만 실행)
  const ledger = (id, checks) => { const d = path.join(loops, id); w(path.join(d, 'contract.md'), `# 자동 계약 — ${id}\n\n## 완료 기준\n- AC-1 : x\n- AC-2 : y\n- AC-3 : z\n`); w(path.join(d, 'evidence-1', 'report.md'), '보고'); if (checks) w(path.join(d, 'evidence-1', 'checks.md'), checks); w(path.join(d, 'ledger.lock'), '{}'); return path.join(d, 'evidence-1', 'checks.md') }
  const re = (job, chk = {}) => cg.judgeOne({ no: 4, ...job }, { keep: true, chk, type: 't', agentId: 'a1', root: r }, Date.now() + 60e3)
  try {
    w(path.join(r, '.claude/hooks/h.mjs'), 'export const h = 1\n'); w(path.join(r, 'docs/a.md'), 'a'); w(path.join(r, '.claude/skills/x/SKILL.md'), 's')
    // ① 기존 증거에 checks.md 없음(11c 이전 원장) → 재판정이 생성
    const f1 = ledger(ids[0], null)
    assert.equal((await re({ id: ids[0], files: ['.claude/hooks/h.mjs'] })).verdict, 'BLOCKED')
    assert.match(fs.readFileSync(f1, 'utf8'), /\$ node --check \.claude\/hooks\/h\.mjs\n종료 코드 : 0/)   // 고치기 전 : 파일 없음
    // ② 재분할로 하네스가 p1 → p2 로 옮겨짐 : p2(자기 계약 없음 = p1 증거 복사, 옛 checks.md 'OLD' 포함) = 새로 생성, p1 = 옛 checks.md 정리
    const fP1 = ledger(ids[1], 'OLD — 옛 scope 결과'), fP2 = path.join(loops, ids[2], 'evidence-1', 'checks.md')
    await re({ id: ids[2], base: ids[1], src: ids[1], part: [2, 2], files: ['.claude/hooks/h.mjs'] })
    assert.ok(fs.readFileSync(fP2, 'utf8').includes('$ node --check .claude/hooks/h.mjs') && !fs.readFileSync(fP2, 'utf8').includes('OLD'), '새 묶음 = 이번 파일로 다시 만듦')   // 고치기 전 : 복사된 'OLD' 그대로
    await re({ id: ids[1], base: ids[1], part: [1, 2], files: ['docs/a.md'] })
    assert.ok(!fs.existsSync(fP1), '하네스가 빠진 묶음 = 옛 checks.md 지움')   // 고치기 전 : 'OLD' 남음
    // ③ .md 만 있는 묶음(하네스 문서 포함) = checks.md 없음
    const fMd = ledger(ids[3], 'OLD')
    await re({ id: ids[3], files: ['docs/a.md', '.claude/skills/x/SKILL.md'] })
    assert.ok(!fs.existsSync(fMd))
    // ④ 총 상한 하나 공유 : 같은 chk 객체의 상한이 이미 지났으면 다음 묶음은 실행하지 않고 '시간 초과'
    const fL = ledger(ids[4], null)
    await re({ id: ids[4], files: ['.claude/hooks/h.mjs'] }, { end: Date.now() - 1 })
    assert.match(fs.readFileSync(fL, 'utf8'), /종료 코드 : 시간 초과\(실행 안 함/)
  } finally {
    if (js0 === undefined) delete process.env.CODEX_JS; else process.env.CODEX_JS = js0
    fs.rmSync(r, { recursive: true, force: true }); for (const id of ids) fs.rmSync(path.join(loops, id), { recursive: true, force: true })
  }
})
