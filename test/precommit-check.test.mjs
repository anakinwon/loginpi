// precommit-check(커밋 전 결정적 검사) 회귀 시험 : 임시 git 저장소에서 금지 경로·5MB·추가 줄 비밀·Co-Authored-By·--commit·--allow-secret
// 비밀 픽스처는 조립('ghp_' + 'A'.repeat(30)) — 이 파일 자체가 검사에 걸리지 않게. 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'precommit-check.mjs')
const TOKEN = 'ghp_' + 'A'.repeat(30), CO = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

function repo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pcc-')), g = (...a) => spawnSync('git', a, { cwd: d, encoding: 'utf8' })
  g('init', '-q'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't'); g('config', 'core.autocrlf', 'false')
  const w = (f, s) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), s) }
  w('base.md', 'base\n'); g('add', '-A'); g('commit', '-qm', 'base')
  const run = (args, input = '') => spawnSync(process.execPath, [CLI, ...args], { cwd: d, input, encoding: 'utf8' })
  return { d, g, w, run, done: () => fs.rmSync(d, { recursive: true, force: true }) }
}

test('금지 경로 : .env.local·voice/·work-history/·.omc/ = 위반, .env.example 경로 = 허용', () => {
  const r = repo()
  try {
    for (const f of ['.env.local', 'voice/x.md', 'work-history/a.log', '.omc/x']) r.w(f, 'x\n')
    r.w('.env.example', 'PI_API_KEY=\n'); r.g('add', '-f', '-A')
    const o = r.run([])
    assert.equal(o.status, 1, o.stdout + o.stderr)
    for (const f of ['.env.local', 'voice/x.md', 'work-history/a.log', '.omc/x']) assert.match(o.stdout, new RegExp(`✖ path ${f.replace(/\./g, '\\.')} `), f)
    assert.doesNotMatch(o.stdout, /\.env\.example/)
  } finally { r.done() }
})

test('비밀 패턴 : 추가 줄 토큰 = secret 위반(값 미출력), 기존 줄 비밀 + 무관한 추가 = 통과, --allow-secret 은 비밀만 면제', () => {
  const r = repo()
  try {
    r.w('a.md', `token ${TOKEN}\n`); r.g('add', 'a.md')
    let o = r.run([]); assert.equal(o.status, 1); assert.match(o.stdout, /✖ secret a\.md — github-token 1건/); assert.ok(!o.stdout.includes(TOKEN) && !o.stderr.includes(TOKEN))
    o = r.run(['--allow-secret', 'github-token']); assert.equal(o.status, 0, o.stdout); assert.match(o.stdout, /ALLOW secret github-token/)
    r.g('commit', '-qm', 'old secret')   // 기존 줄의 비밀(검사 한계 — ponytail)
    r.w('a.md', `token ${TOKEN}\n무관한 추가\n`); r.g('add', 'a.md')
    o = r.run([]); assert.equal(o.status, 0, o.stdout)
    // 면제는 3번(비밀)만 : 금지 경로·메시지 규칙은 그대로
    r.w('.env.local', 'x\n'); r.g('add', '-f', '.env.local')
    o = r.run(['--allow-secret', 'github-token']); assert.equal(o.status, 1); assert.match(o.stdout, /✖ path \.env\.local/)
  } finally { r.done() }
})

test('비밀 패턴 : 내용이 ++ 로 시작하는 추가 줄(diff 상 +++) 도 검사 — 파일 머리 줄로 오인 금지', () => {
  const r = repo()
  try {
    r.w('b.md', `++ ${TOKEN}\n`); r.g('add', 'b.md')
    const o = r.run([]); assert.equal(o.status, 1, o.stdout); assert.match(o.stdout, /✖ secret b\.md — github-token 1건/)
    r.g('commit', '-qm', 'b')
    r.w('b.md', `++ ${TOKEN}\n++${TOKEN}\n`); r.g('add', 'b.md')   // 수정 파일(머리 줄 --- a/ · +++ b/ 있음)도 같은 판정
    assert.match(r.run([]).stdout, /✖ secret b\.md — github-token 1건/)
  } finally { r.done() }
})

test('크기 5MB 초과 = 위반 · 스테이징 0건 = 위반', () => {
  const r = repo()
  try {
    assert.match(r.run([]).stdout, /✖ empty - — 스테이징 0건/)
    r.w('big.bin', Buffer.alloc(5 * 1024 * 1024 + 1)); r.g('add', 'big.bin')
    const o = r.run([]); assert.equal(o.status, 1); assert.match(o.stdout, /✖ size big\.bin — 5242881 바이트/)
  } finally { r.done() }
})

test('메시지 : 끝 줄 Co-Authored-By 없음 = 위반, 있음 = 통과(CRLF·# 주석 무시) / --commit = 통과 시 커밋 1건·위반 시 0건', () => {
  const r = repo()
  try {
    r.w('a.md', 'ok\n'); r.g('add', 'a.md')
    assert.equal(r.run(['--msg', '-'], '요약 — 상세\n').status, 1)
    assert.equal(r.run(['--msg', '-'], `요약 — 상세\r\n\r\n${CO}\r\n# 주석\n`).status, 0)
    const n = () => +r.g('rev-list', '--count', 'HEAD').stdout.trim()
    let o = r.run(['--commit'], '요약만\n'); assert.equal(o.status, 1); assert.equal(n(), 1)
    o = r.run(['--commit'], `한국어 요약 — 상세\n\n${CO}\n`); assert.equal(o.status, 0, o.stdout + o.stderr); assert.equal(n(), 2)
    assert.equal(r.g('log', '-1', '--format=%s').stdout.trim(), '한국어 요약 — 상세')
    assert.equal(r.run(['--bogus']).status, 2)   // 사용법 오류
  } finally { r.done() }
})
