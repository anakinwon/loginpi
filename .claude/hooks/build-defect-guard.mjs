#!/usr/bin/env node
// build-defect-guard — 구축 결함 재발 방지 R-P1·P3·P4·P6 자동 검사(정본 : 루트 CLAUDE.md 'R-P0~P6', 사례 sitemap/schema.pi/docs/TROUBLESHOOT.md TS-01)
//  훅 모드(PostToolUse Write|Edit|MultiEdit) : 이번에 쓴 코드 조각만 검사해 경고(additionalContext) — 차단하지 않음, 기존 코드 소음 없음
//  CLI 모드 : node .claude/hooks/build-defect-guard.mjs --scan <디렉터리…>  → 위반 목록, 있으면 exit 1 / --selftest → 자체 시험
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const CODE_RE = /\.(ts|tsx|js|mjs)$/
const SKIP_DIR = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage', 'test', '__tests__'])
// 원격 왕복이 생기는 호출 — 헬퍼(await loadLogical() 등) 직렬도 실제 결함이었음(TS-01 P1)
const DB_CALL = process.env.BDG_NARROW ? /\.from\(|\.rpc\(|\bfetch\(/ : /await\s+[\w$.]+\(|\.from\(|\.rpc\(|\bfetch\(/
const LOCAL_CALL = /await\s+(parse\w*|req\w*|request\.\w+|params|props\.params|ctx\.params|cookies|headers)\b/ // 요청 파싱 — 원격 아님
const DECL =/^(\s*)(?:const|let)\s+(\{[^=]*\}|\[[^=]*\]|[\w$]+)\s*=\s*await\b/

// 선언에서 바인딩 이름 추출 : { data: user, error } → user·error, [a, b] → a·b
function names(pat) {
  if (!/^[{[]/.test(pat)) return [pat]
  return pat.slice(1, -1).split(',').map((s) => s.split(':').pop().split('=')[0].replace(/\.\.\./, '').trim()).filter((s) => /^[\w$]+$/.test(s))
}

// 문장 범위 : 시작 줄 들여쓰기보다 깊은 줄(체인 이어짐)까지
function block(lines, i) {
  const ind = lines[i].match(/^\s*/)[0].length
  let j = i + 1
  while (j < lines.length && lines[j].trim() && lines[j].match(/^\s*/)[0].length > ind) j++
  return { text: lines.slice(i, j).join('\n'), end: j }
}

export function scan(src, file = '') {
  const out = []
  const lines = src.split('\n')
  const add = (p, i, msg) => out.push({ p, line: i + 1, msg, file })
  // R-P1 : 연달아 있는 await 선언 둘이 모두 원격 호출이고 뒤가 앞 결과를 안 쓰면 직렬
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(DECL)
    if (!m) continue
    const a = block(lines, i)
    if (!DB_CALL.test(a.text) || LOCAL_CALL.test(lines[i])) continue
    let k = a.end
    while (k < lines.length && (!lines[k].trim() || /^\s*\/\//.test(lines[k]))) k++
    const m2 = k < lines.length && lines[k].match(DECL)
    if (!m2 || m2[1].length !== m[1].length) continue
    const b = block(lines, k)
    if (!DB_CALL.test(b.text) || LOCAL_CALL.test(lines[k])) continue
    const used = names(m[2]).some((n) => new RegExp(`\\b${n.replace(/\$/g, '\\$')}\\b`).test(b.text.replace(DECL, '')))
    if (!used) add('R-P1', k, '앞 await 결과를 쓰지 않는 원격 조회가 직렬 — Promise.all 검토')
  }
  lines.forEach((l, i) => {
    // R-P3 : 전체 칼럼·정확 건수
    if (/\.select\(\s*['"`]\*['"`]/.test(l)) add('R-P3', i, "select('*') — 쓰는 칼럼만 조회")
    if (/count:\s*['"`]exact['"`]/.test(l)) add('R-P3', i, "count:'exact' — 화면이 건수를 쓸 때만")
    // R-P4 : 외부 HTTP 에 타임아웃 없음
    if (/\bfetch\(\s*[`'"]https?:/.test(l)) {
      const call = lines.slice(i, i + 6).join('\n')
      if (!/signal\s*:|AbortSignal|timeout/i.test(call)) add('R-P4', i, '외부 fetch 에 타임아웃(signal: AbortSignal.timeout) 없음')
    }
  })
  // R-P6 : dev 전용 호출·라우트에 운영 가드 없음(파일 단위)
  const devRoute = /[\\/]api[\\/]dev[\\/]/.test(file)
  if ((devRoute || /['"`]\/api\/dev\//.test(src)) && !/NODE_ENV|VERCEL_ENV/.test(src)) {
    const i = Math.max(0, lines.findIndex((l) => /\/api\/dev\//.test(l)))
    add('R-P6', i, 'dev 전용 코드에 운영 가드(NODE_ENV·VERCEL_ENV) 없음')
  }
  return out
}

function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    if (SKIP_DIR.has(n)) continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (CODE_RE.test(n) && !/\.test\.|\.spec\./.test(n)) acc.push(p)
  }
  return acc
}

function selftest() {
  const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1) } }
  const ser = "  const { data: a } = await sb.from('x').select('id')\n  const { data: b } = await sb\n    .from('y')\n    .select('id')\n"
  assert(scan(ser).some((v) => v.p === 'R-P1'), '직렬 탐지')
  const dep = "  const { data: a } = await sb.from('x').select('id')\n  const { data: b } = await sb.from('y').select('id').eq('x', a.id)\n"
  assert(!scan(dep).some((v) => v.p === 'R-P1'), '의존 조회는 통과')
  assert(scan("q.select('*')").some((v) => v.p === 'R-P3'), "select('*')")
  assert(scan("await fetch('https://a.b')").some((v) => v.p === 'R-P4'), '타임아웃 없음')
  assert(!scan("await fetch('https://a.b', { signal: AbortSignal.timeout(2000) })").some((v) => v.p === 'R-P4'), '타임아웃 있음 통과')
  assert(scan("useEffect(() => { fetch('/api/dev/user') })").some((v) => v.p === 'R-P6'), 'dev 가드 없음')
  assert(!scan("if (process.env.NODE_ENV === 'production') return\nfetch('/api/dev/user')").some((v) => v.p === 'R-P6'), 'dev 가드 있음 통과')
  assert(scan('export async function GET() { return 1 }', 'C:\\app\\api\\dev\\x\\route.ts').some((v) => v.p === 'R-P6'), '백슬래시 dev 경로')
  console.log('selftest OK')
}

const argv = process.argv.slice(2)
if (argv[0] === '--selftest') selftest()
else if (argv[0] === '--scan') {
  const root = process.cwd()
  const all = argv.slice(1).flatMap((d) => walk(d)).flatMap((f) => scan(readFileSync(f, 'utf8'), relative(root, f)))
  const cnt = {}
  for (const v of all) {
    cnt[v.p] = (cnt[v.p] ?? 0) + 1
    console.log(`${v.p}\t${v.file}:${v.line}\t${v.msg}`)
  }
  console.log(`합계 ${all.length}`, JSON.stringify(cnt))
  process.exit(all.length ? 1 : 0)
} else {
  // 훅 모드 : 이번에 쓴 조각만 검사(P6 은 파일 전체로 가드 여부 판정)
  let raw = ''
  process.stdin.setEncoding('utf8')
  for await (const c of process.stdin) raw += c
  let inp
  try { inp = JSON.parse(raw) } catch { process.exit(0) }
  const ti = inp.tool_input ?? {}
  const file = ti.file_path ?? ''
  if (!CODE_RE.test(file) || /[\\/](node_modules|test|\.claude)[\\/]/.test(file)) process.exit(0)
  const frag = ti.content ?? ti.new_string ?? (ti.edits ?? []).map((e) => e.new_string).join('\n')
  let whole = ''
  try { whole = readFileSync(file, 'utf8') } catch {}
  const v = scan(frag, file).filter((x) => x.p !== 'R-P6').concat(scan(whole, file).filter((x) => x.p === 'R-P6' && /[\\/]api[\\/]dev[\\/]/.test(frag + file)))
  if (!v.length) process.exit(0)
  const msg = `[build-defect-guard] 루트 CLAUDE.md R-P0~P6 위반 의심 ${v.length}건(${file}) — 고치거나 의도면 이유를 보고에 남길 것:\n` + v.map((x) => `- ${x.p} 조각 ${x.line}행 : ${x.msg}`).join('\n')
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } }))
}
