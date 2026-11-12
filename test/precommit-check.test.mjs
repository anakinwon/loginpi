// precommit-check(커밋 전 결정적 검사) 회귀 시험 : 임시 git 저장소에서 금지 경로·5MB·추가 줄 비밀·Co-Authored-By·--commit·--allow-secret·.vercelignore 빌드 경로 제외
// 비밀 픽스처는 조립('ghp_' + 'A'.repeat(30)) — 이 파일 자체가 검사에 걸리지 않게. 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

// 2026-11-12 a8925662 사고 재현 : .vercelignore 'pitel/'(모든 깊이)이 새 라우트 폴더 …/pitel 을 업로드에서 빼 운영 404
const APP = 'sitemap/schema.pi', PAGE = `${APP}/src/app/[locale]/areas/[areaId]/pitel/page.tsx`, VI = `${APP}/.vercelignore`
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

test('vercelignore : pitel/ = 새 라우트 차단(규칙·줄 출력), /pitel/ = 라우트 통과·앱 루트 pitel/docs 는 빌드 경로 아님 통과', () => {
  const r = repo()
  try {
    r.w(VI, '# 주석\n\npitel/\n'); r.g('add', '-A'); r.g('commit', '-qm', 'vi')
    r.w(PAGE, 'x\n'); r.g('add', '-A')
    let o = r.run([]); assert.equal(o.status, 1, o.stdout)
    assert.match(o.stdout, new RegExp(`✖ vercelignore ${esc(PAGE)} — ${esc(VI)}:3 규칙 'pitel/'`))
    r.w(VI, '/pitel/\n'); r.w(`${APP}/pitel/docs/a.md`, 'x\n'); r.g('add', '-A')
    o = r.run([]); assert.equal(o.status, 0, o.stdout)
  } finally { r.done() }
})

test('vercelignore : .vercelignore 만 스테이징해도 기존 추적 라우트가 걸리면 차단 / ! 부정 = 되살림 통과, 제외된 상위 폴더 안은 ! 무효', () => {
  const r = repo()
  try {
    r.w(VI, '/pitel/\n'); r.w(PAGE, 'x\n'); r.w(`${APP}/README.md`, 'x\n'); r.g('add', '-A'); r.g('commit', '-qm', 'base')
    r.w(VI, 'pitel/\n'); r.g('add', VI)
    let o = r.run([]); assert.equal(o.status, 1, o.stdout); assert.match(o.stdout, new RegExp(`✖ vercelignore ${esc(PAGE)} `))
    r.w(VI, 'pitel/\n!src/**/pitel/\n'); r.g('add', VI)
    o = r.run([]); assert.equal(o.status, 0, o.stdout)
    r.w(VI, 'src/\n!src/app/\n'); r.g('add', VI)   // src/ 가 제외되면 그 안은 ! 로 못 되살림(gitignore 동작)
    o = r.run([]); assert.equal(o.status, 1, o.stdout); assert.match(o.stdout, /규칙 'src\/'/)
  } finally { r.done() }
})

test('vercelignore : 이름 중간 ** 는 / 를 넘지 않음(D-001) — src/foo**/page.tsx 에 src/foopage.tsx 통과·src/foo123/page.tsx 차단', () => {
  const r = repo()
  try {
    r.w(VI, 'src/foo**/page.tsx\n'); r.g('add', '-A'); r.g('commit', '-qm', 'vi')
    r.w(`${APP}/src/foopage.tsx`, 'x\n'); r.g('add', '-A')
    let o = r.run([]); assert.equal(o.status, 0, o.stdout)
    r.w(`${APP}/src/foo123/page.tsx`, 'x\n'); r.g('add', '-A')
    o = r.run([]); assert.equal(o.status, 1, o.stdout); assert.match(o.stdout, new RegExp(`✖ vercelignore ${esc(APP)}/src/foo123/page\\.tsx `))
    assert.doesNotMatch(o.stdout, /src\/foopage\.tsx/)
  } finally { r.done() }
})

test('vercelignore : 문자 클래스·? 는 / 를 넘지 않음(D-002) — src/a[!x]b/page.tsx·src/a?b/page.tsx 에 src/a/b/page.tsx 통과·src/ayb/page.tsx 차단', () => {
  for (const rule of ['src/a[!x]b/page.tsx', 'src/a?b/page.tsx']) {
    const r = repo()
    try {
      r.w(VI, `${rule}\n`); r.g('add', '-A'); r.g('commit', '-qm', 'vi')
      r.w(`${APP}/src/a/b/page.tsx`, 'x\n'); r.g('add', '-A')
      let o = r.run([]); assert.equal(o.status, 0, rule + o.stdout)
      r.w(`${APP}/src/ayb/page.tsx`, 'x\n'); r.g('add', '-A')
      o = r.run([]); assert.equal(o.status, 1, rule + o.stdout); assert.match(o.stdout, new RegExp(`✖ vercelignore ${esc(APP)}/src/ayb/page\\.tsx `))
      assert.doesNotMatch(o.stdout, /src\/a\/b\/page\.tsx/)
    } finally { r.done() }
  }
})

test('vercelignore : POSIX 클래스(D-003) — src/file[[:digit:]].tsx 에 src/file1.tsx 차단·src/filea.tsx 통과', () => {
  const r = repo()
  try {
    r.w(VI, 'src/file[[:digit:]].tsx\n'); r.g('add', '-A'); r.g('commit', '-qm', 'vi')
    r.w(`${APP}/src/filea.tsx`, 'x\n'); r.g('add', '-A')
    let o = r.run([]); assert.equal(o.status, 0, o.stdout)
    r.w(`${APP}/src/file1.tsx`, 'x\n'); r.g('add', '-A')
    o = r.run([]); assert.equal(o.status, 1, o.stdout); assert.match(o.stdout, new RegExp(`✖ vercelignore ${esc(APP)}/src/file1\\.tsx `))
  } finally { r.done() }
})

// 실제 git 대조 : 하위 폴더마다 .gitignore(규칙) + 실제 파일 → git ls-files --others --ignored(상위 폴더 제외까지 반영)와 매처 판정 비교
// 항목 : (1) 대괄호 POSIX 12종·범위·거꾸로 범위·!/^ 부정·맨 앞 ]·닫히지 않은 [·[:모름:]·':]' 없는 [:  (2) \ 이스케이프  (3) 끝 공백·탭·'\ '  (4) # 주석·\# · \!  (5) **·?·클래스-'/'
// ponytail: Windows 파일명 금지 문자(* ? : \ 등)는 실제 파일을 못 만들어 아래 단위 단정으로 대신
const GIT_CASES = [
  ['src/file[[:digit:]].tsx', ['src/file1.tsx', 'src/filea.tsx']],
  ...['alnum', 'alpha', 'blank', 'cntrl', 'digit', 'graph', 'lower', 'print', 'punct', 'space', 'upper', 'xdigit'].map(n => [`[[:${n}:]]x`, ['ax', 'Zx', '5x', 'fx', '#x', '-x', ']x', 'xx']]),
  ['[[:alpha:][:digit:]_]x', ['ax', '1x', '_x', '-x']], ['[[:bogus:]]x', ['bx', 'ox']], ['[[:x]y', ['xy', '[y', 'zy']], ['[:digit:]x', ['dx', 'ix', '1x']],
  ['[a-c]x', ['bx', 'dx']], ['[c-a]x', ['ax', 'bx', 'cx']], ['[a-]x', ['-x', 'ax', 'bx']], ['[-a]x', ['-x', 'ax']], ['[]a]x', [']x', 'ax', 'bx']], ['[!]a]x', [']x', 'ax', 'bx']],
  ['[^a]x', ['ax', 'bx']], ['[!a-c]x', ['ax', 'dx']], ['[ab', ['a', '[ab', 'ab']], ['a[', ['a[', 'a']], ['[\\]]x', [']x', 'ax']], ['[a\\-c]x', ['-x', 'bx', 'cx']],
  ['a\\[b', ['a[b', 'ab']], ['\\#h', ['#h', 'h']], ['#h', ['#h']], ['\\!n', ['!n', 'n']], ['!n\nn*', ['n', 'nn']], ['ab   ', ['ab']], ['ab\t', ['ab']], ['ab\\ ', ['ab']], ['ab\\', ['ab']],
  ['src/a[!x]b/page.tsx', ['src/a/b/page.tsx', 'src/ayb/page.tsx']], ['src/a?b/page.tsx', ['src/a/b/page.tsx', 'src/ayb/page.tsx']], ['src/a[[:punct:]]b/p', ['src/a/b/p', 'src/a-b/p']],
  ['src/foo**/page.tsx', ['src/foopage.tsx', 'src/foo123/page.tsx']], ['**/**/c', ['c', 'q/w/c']], ['a/**', ['a/x/y', 'ab']], ['x**/', ['x1/f', 'x/f']], ['***/k', ['k', 'q/k']],
  ['pitel/', ['pitel/d/a.md', 'src/app/k/pitel/page.tsx']], ['/pitel/', ['pitel/d/a.md', 'src/app/k/pitel/page.tsx']], ['src/\n!src/app/', ['src/app/page.tsx', 'x.ts']],
]

test('vercelignore : 매처 = 실제 git 판정과 전수 일치(규칙 × 경로) + 파일로 못 만드는 이스케이프 단위 단정', async () => {
  const { parseIgnore, ignoredBy } = await import(pathToFileURL(CLI).href)
  const r = repo()
  try {
    r.g('config', 'core.ignorecase', 'false')
    GIT_CASES.forEach(([rule, files], k) => { r.w(`t${k}/.gitignore`, rule + '\n'); for (const f of files) r.w(`t${k}/${f}`, 'x') })
    const ign = new Set(r.g('ls-files', '-z', '--others', '--ignored', '--exclude-standard').stdout.split('\0').filter(Boolean))
    const bad = []
    GIT_CASES.forEach(([rule, files], k) => { const rs = parseIgnore(rule); for (const f of files) if (ign.has(`t${k}/${f}`) !== !!ignoredBy(rs, f)) bad.push(`${JSON.stringify(rule)} ${f} git=${ign.has(`t${k}/${f}`)}`) })
    assert.deepEqual(bad, [])
    assert.ok(ign.has(`t0/src/file1.tsx`) && ign.size > 40, `git 판정 ${ign.size}건`)   // 대조가 실제로 돌았는지
  } finally { r.done() }
  const hit = (rule, f) => !!ignoredBy(parseIgnore(rule), f)
  assert.ok(hit('a\\*b', 'a*b') && !hit('a\\*b', 'axb'))          // \* = 리터럴 별표
  assert.ok(hit('a\\?b', 'a?b') && !hit('a\\?b', 'axb'))          // \? = 리터럴 물음표
  assert.ok(hit('ab\\ ', 'ab ') && !hit('ab\\ ', 'ab'))           // 끝 '\ ' 보존
  assert.ok(hit('ab \\ ', 'ab  ') && hit('ab  ', 'ab'))           // 끝 공백만 제거
  assert.ok(hit('[[:space:]]x', ' x') && !hit('[[:space:]]x', '\vx'))   // git isspace 에 \v 없음
  assert.ok(hit('﻿ab\r\n', 'ab'))                              // BOM·CRLF
  // D-004 : 와일드카드는 '/' 외 모든 문자(줄바꿈·CR·탭) 소비 — Windows 는 줄바꿈 파일명을 못 만들어 git 대조 대신 리눅스 git 의미(wildmatch 는 '/' 만 제외)로 단정
  for (const ch of ['\n', '\r', '\t']) {
    for (const [rule, f] of [['src/**/page.tsx', `src/a${ch}b/page.tsx`], ['src/**', `src/a${ch}b`], ['**/p', `a${ch}b/p`], ['p', `a${ch}b/p`], ['a*b', `a${ch}b`],
      ['a?b', `a${ch}b`], ['a[!x]b', `a${ch}b`], ['a[^x]b', `a${ch}b`], ['a[[:cntrl:]]b', `a${ch}b`], ['a[[:space:]]b', `a${ch}b`],['pitel/', `x${ch}y/pitel/q.ts`]]) assert.ok(hit(rule, f), JSON.stringify([rule, f]))
    assert.ok(!hit('a?b', `a${ch}${ch}b`) && !hit('a[!x]b', 'axb'))   // 개수·부정은 그대로
  }
  assert.ok(!hit('a*b', 'a/b') && !hit('a?b', 'a/b') && !hit('a[!x]b', 'a/b'))   // '/' 는 여전히 제외
  // D-005 : 앵커 = 문자열 절대 시작·끝 — 끝 줄바꿈이 붙은 경로는 리터럴·* 끝 규칙과 다른 이름, 와일드카드 끝 규칙은 줄바꿈도 이름의 일부로 소비
  for (const t of ['\n', '\r', '\r\n']) {
    assert.ok(!hit('src/page.tsx', `src/page.tsx${t}`) && !hit('src/*.tsx', `src/page.tsx${t}`) && !hit('src/**/page.tsx', `src/a/page.tsx${t}`), JSON.stringify(t))
    assert.ok(!hit('src/page.tsx', `${t}src/page.tsx`) && !hit('/pitel/', `${t}pitel/a`), JSON.stringify(t))   // 시작 앵커 고정
  }
  assert.ok(hit('src/page.tsx', 'src/page.tsx') && hit('src/*', 'src/a\n') && hit('src/**', 'src/a/b\n'))
  assert.ok(parseIgnore('a\nb*').every(x => !x.re.flags.includes('m')))   // m 플래그 없음
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
