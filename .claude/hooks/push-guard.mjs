#!/usr/bin/env node
/**
 * push-guard — Claude(메인·서브에이전트)의 git push 를 PreToolUse 에서 차단하는 훅.
 * 마스터 결정 2026-11-07 : 커밋 담당이 푸시 금지 지시를 어기고 master(= Vercel 운영 브랜치)에 푸시한 사고 → 실행 자체를 막는다.
 *
 * 실행
 *   훅      : settings.json PreToolUse(matcher Bash|PowerShell|Write|Edit|MultiEdit|NotebookEdit) — stdin JSON
 *   승인    : ! node .claude/hooks/push-guard.mjs --allow [분] [원격] [브랜치]   (마스터만, 기본 10분, 1회용 → .omc/state/push-allow.json,
 *             원격·브랜치를 주면 그 대상 push 만 통과)
 *   자체시험 : node .claude/hooks/push-guard.mjs --selftest
 *
 * 판정
 *   - 차단 : git push(모든 형태 — -C·-c·--git-dir 전역 옵션, &&·;·|·서브셸·$()·`` ·bash -c·pwsh -Command·cmd /c·eval·heredoc→셸 안),
 *            git subtree/lfs push·send-pack·http-push, alias 로 push 정의, 내부에서 push 하는 스크립트(promote-to-prod.mjs --yes),
 *            실행되는 스크립트 파일 본문의 git push, promote-to-prod 인자에 확장($·백틱)
 *   - 승인으로도 못 푸는 차단(hard) : push-guard 실행(--selftest·node --check 외), 명령 단어·리다이렉트 대상에 push-allo
 *            (Windows 별칭 끝 점·공백·::$DATA·8.3 이름 정규화, .omc/state/* glob, .omc 경로의 ~숫자 — echo 인자·git -m 값 제외),
 *            인라인 코드 속 승인 파일 경로, .omc + 변수 확장, Write·Edit 대상 승인 파일
 *   - 허용 : git push --dry-run / -n(값 받는 옵션의 값·`--` 뒤는 면제 근거 아님), 정확한 경로 scripts/promote-to-prod.mjs 미리보기,
 *            커밋 메시지·heredoc·echo 속 단순 문자열 --allow, push 가 단어로만 들어간 명령
 *   - 유효 승인이 있으면 push 1건짜리 명령만 통과 후 즉시 소진(used=true) — 한 명령에 push 2건 이상이면 승인이 있어도 차단
 *   - 훅 오류·검사 불가(프리로드·경로 해석 불가·stdin 셸) : 원문에 push 단서가 있으면 차단(fail-closed), 없으면 통과
 * 범위 : 실수 방지 장치(마스터 판정 2026-11-07). 의도적 우회 — 외부에 정의한 alias·config, .git/hooks·core.hooksPath,
 *        이 훅·settings 수정, 변수로 조립한 경로 — 는 범위 밖. Claude 가 마스터의 git 자격으로 push 하므로 서버 측 브랜치 보호로도
 *        구분 불가, 승인 파일 HMAC 비밀도 같은 OS 사용자라 Claude 가 읽을 수 있어 실익 없음.
 * ponytail: 셸 문법 근사 해석기 — 변수로 조립한 명령·base64 파이프·임의 인터프리터 경로는 다 못 잡는다(위 fail-closed 로 일부 보완).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOK_FILE = fileURLToPath(import.meta.url)
const ROOT = path.resolve(path.dirname(HOOK_FILE), '..', '..')
const ALLOW_FILE = path.join(ROOT, '.omc', 'state', 'push-allow.json')
const LIMIT = { defaultMin: 10, maxMin: 60, maxDepth: 8, maxFileBytes: 1_000_000 }
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])
const PWSH = new Set(['pwsh', 'powershell'])
const INTERP = new Set(['node', 'python', 'python3', 'py', 'perl', 'ruby', 'deno', 'bun', 'tsx'])
const EVALS = new Set(['eval', 'iex', 'invoke-expression'])
const GIT_OPT_ARG = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix'])
const PUSH_OPT_ARG = new Set(['--push-option', '--repo', '--receive-pack', '--exec']) // 값을 다음 단어로 받는 push 옵션
const PUSH_CLUE = /\bgit\b[^\n]{0,80}\bpush\b|promote-to-prod|send-pack/i // 검사 불가 실행에서 차단으로 기우는 단서(같은 줄 git … push)
const PROMOTE_FILE = path.join(ROOT, 'scripts', 'promote-to-prod.mjs')
const FILE_PUSH_RE = /\bgit\s+(?:-{1,2}\S+\s+)*push\b|['"]git['"]\s*,\s*\[\s*['"]push['"]/

// ---------- 셸 근사 해석기 : 문자열 → 단순 명령 목록 [{ words, stdin, redirs }] ----------
function lexInto(s, i, ps, out, sub) {
  let cmd = { words: [], stdin: [], redirs: [] }
  let w = null
  let redir = false
  let hereStr = false
  let depth = 0
  const heres = []
  const endWord = () => {
    if (w === null) return
    if (hereStr) cmd.stdin.push(w)
    else if (redir) cmd.redirs.push(w)
    else cmd.words.push(w)
    hereStr = redir = false
    w = null
  }
  const endCmd = () => {
    endWord()
    if (cmd.words.length || cmd.stdin.length || cmd.redirs.length) out.push(cmd)
    cmd = { words: [], stdin: [], redirs: [] }
  }
  const readHeredocs = () => {
    for (const h of heres) {
      const body = []
      while (i < s.length) {
        let e = s.indexOf('\n', i)
        if (e < 0) e = s.length
        const line = s.slice(i, e).replace(/\r$/, '')
        i = e + 1
        if (line.replace(/^\t+/, '') === h.delim) break
        body.push(line)
      }
      h.cmd.stdin.push(body.join('\n'))
    }
    heres.length = 0
  }
  const backtick = (j) => {
    const e = s.indexOf('`', j)
    const end = e < 0 ? s.length : e
    lexInto(s.slice(j, end), 0, ps, out, false)
    return end + 1
  }
  const dq = (j) => {
    let buf = ''
    while (j < s.length && s[j] !== '"') {
      if (!ps && s[j] === '\\' && '"\\$`\n'.includes(s[j + 1])) { buf += s[j + 1]; j += 2; continue }
      if (ps && s[j] === '`') { buf += s[j + 1] ?? ''; j += 2; continue }
      if (s[j] === '$' && s[j + 1] === '(') { j = lexInto(s, j + 2, ps, out, true); buf += '$()'; continue }
      if (!ps && s[j] === '`') { j = backtick(j + 1); buf += '``'; continue }
      buf += s[j++]
    }
    w = (w ?? '') + buf
    return j + 1
  }

  while (i < s.length) {
    const c = s[i]
    if (c === (ps ? '`' : '\\')) {
      if (s[i + 1] === '\n') { i += 2; continue }
      w = (w ?? '') + (s[i + 1] ?? '')
      i += 2
      continue
    }
    if (c === "'") {
      const e = s.indexOf("'", i + 1)
      const end = e < 0 ? s.length : e
      w = (w ?? '') + s.slice(i + 1, end)
      i = end + 1
      continue
    }
    if (c === '"') { i = dq(i + 1); continue }
    if (c === '$' && s[i + 1] === '(') { i = lexInto(s, i + 2, ps, out, true); w = (w ?? '') + '$()'; continue }
    if (c === '$' && s[i + 1] === '{') {
      const e = s.indexOf('}', i)
      const end = e < 0 ? s.length : e + 1
      w = (w ?? '') + s.slice(i, end)
      i = end
      continue
    }
    if (!ps && c === '`') { i = backtick(i + 1); w = (w ?? '') + '``'; continue }
    if (c === '#' && w === null) {
      const e = s.indexOf('\n', i)
      i = e < 0 ? s.length : e
      continue
    }
    if (!ps && c === '<' && s[i + 1] === '<') {
      endWord()
      if (s[i + 2] === '<') { hereStr = true; i += 3; continue }
      i += 2
      if (s[i] === '-') i++
      while (s[i] === ' ' || s[i] === '\t') i++
      let d = ''
      while (i < s.length && !/[\s;&|<>()]/.test(s[i])) {
        if (!/['"\\]/.test(s[i])) d += s[i]
        i++
      }
      heres.push({ delim: d, cmd })
      continue
    }
    if (c === '>' || c === '<') {
      if (w !== null && /^\d+$/.test(w)) w = null // 2>&1 의 fd 번호는 인자가 아님
      endWord()
      i++
      while (s[i] === '>' || s[i] === '&' || s[i] === '|') i++
      redir = true
      continue
    }
    if (c === '\n') {
      endCmd()
      i++
      if (heres.length) readHeredocs()
      continue
    }
    if (c === ';' || c === '&' || c === '|') { endCmd(); i++; continue }
    if (c === '(') { endCmd(); depth++; i++; continue }
    if (c === ')') {
      endCmd()
      i++
      if (sub && depth === 0) return i
      if (depth > 0) depth--
      continue
    }
    if ((c === '{' || c === '}') && w === null) { endCmd(); i++; continue }
    if (c === ' ' || c === '\t' || c === '\r') { endWord(); i++; continue }
    w = (w ?? '') + c
    i++
  }
  endCmd()
  return i
}

const base = (x) => x.replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/\.(exe|cmd|bat)$/, '')
const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b)
const isGuard = (x) => /^push-guard(\.mjs)?$/.test(base(x))
const expanded = (x) => /[$`]/.test(x) // 변수·명령 치환이 남은 단어(값을 알 수 없음)
const toFsPath = (p) => p.replace(/\\/g, '/').replace(/^\/([a-z])\//i, '$1:/') // Git Bash /c/… → c:/…
// 승인 파일(.omc/state/push-allow.json)을 가리킬 수 있는 단어 — Windows 별칭(끝 점·공백, ::$DATA·:stream, 8.3 이름)도 정규화 후 비교.
// 커밋 메시지(-m 값)·echo 인자는 checkCmd 가 빼고 넘긴다(heredoc 본문은 애초에 단어가 아님)
const pointsToAllow = (x) => {
  const seg = x.replace(/\\/g, '/').split('/')
  const last = seg.pop()
  const p = [...seg, /^[a-z]:$/i.test(last) ? last : last.replace(/:.*$/, '').replace(/[. ]+$/, '')].join('/')
  if (/push-allo|push-a~\d/i.test(p)) return true
  if (/(^|\/)\.omc\/(state\/)?[^/]*[*?[]/i.test(p)) return true
  return /(^|\/)\.?omc[^/]*\//i.test(p) && /~\d/.test(p)
}
const ECHOS = new Set(['echo', 'printf', 'write-host', 'write-output'])
// 판정에서 뺄 단어 : echo 류 인자, git 명령의 -m/--message 값(커밋 메시지)
function pathWords(ws) {
  if (ECHOS.has(base(ws[0] ?? ''))) return []
  if (!ws.some((x) => base(x) === 'git')) return ws
  return ws.filter((x, i) => !/^(-m|--message)$/.test(ws[i - 1] ?? '') && !/^--message=/.test(x))
}

// 판정 결과 = finding 배열. { reason, hard?: 승인으로도 못 푸는 차단, target?: { remote, refs } }
function scan(src, ctx, ps = false, depth = 0) {
  if (depth > LIMIT.maxDepth) return [{ reason: '명령 중첩 과다(판정 불가)' }]
  const cmds = []
  lexInto(String(src ?? ''), 0, ps, cmds, false)
  const found = []
  let cur = ctx
  for (const c of cmds) {
    if (/^(cd|set-location|pushd)$/i.test(c.words[0] ?? '') && c.words[1] && !expanded(c.words[1])) {
      cur = { ...cur, cwd: path.resolve(cur.cwd, toFsPath(c.words[1])) }
      continue
    }
    found.push(...checkCmd(c, cur, ps, depth))
  }
  return found
}

// 판정할 수 없는 실행 — 원문에 push 단서가 있을 때만 차단(fail-closed)
const uncheckable = (why, ctx) => (PUSH_CLUE.test(ctx.text) ? [{ reason: `${why} — 검사 불가 + push 단서` }] : [])

function gitCheck(args, ctx, notFirst) {
  let k = 0
  const cvals = []
  while (k < args.length && args[k].startsWith('-')) {
    if (args[k] === '-c') cvals.push(args[k + 1] ?? '')
    k += GIT_OPT_ARG.has(args[k]) ? 2 : 1
  }
  const sub = (args[k] ?? '').toLowerCase()
  const rest = args.slice(k + 1)
  if (cvals.some((v) => /^alias\./i.test(v) && /push/i.test(v))) return [{ reason: 'git -c alias.*=push' }]
  if (sub === 'push') {
    // --dry-run·-n 은 원격 ref 를 바꾸지 않으므로 허용 — 값 받는 옵션의 값·`--` 뒤 위치 인자는 면제 근거가 아니다
    const pos = []
    let dry = false
    for (let j = 0; j < rest.length; j++) {
      const a = rest[j]
      if (a === '--') { pos.push(...rest.slice(j + 1)); break }
      if (a === '--dry-run') { dry = true; continue }
      if (PUSH_OPT_ARG.has(a)) { j++; continue }
      if (a.startsWith('--')) continue
      if (/^-./.test(a)) {
        for (let q = 1; q < a.length; q++) {
          if (a[q] === 'o') { if (q === a.length - 1) j++; break } // -o 값 : 묶음 나머지 또는 다음 단어
          if (a[q] === 'n') dry = true
        }
        continue
      }
      pos.push(a)
    }
    return dry ? [] : [{ reason: 'git push', target: { remote: pos[0] ?? null, refs: pos.slice(1) } }]
  }
  if ((sub === 'subtree' || sub === 'lfs') && rest.includes('push')) return [{ reason: `git ${sub} push` }]
  if (sub === 'send-pack' || sub === 'http-push') return [{ reason: `git ${sub}` }]
  if (sub === 'config' && rest.some((a) => /^alias\./i.test(a)) && rest.some((a) => /push/i.test(a))) return [{ reason: 'git alias 로 push 정의' }]
  // 변수로 조립한 서브커맨드·xargs git 처럼 서브커맨드를 알 수 없으면
  if (expanded(sub) || (sub === '' && notFirst)) return uncheckable('git 서브커맨드', ctx)
  return []
}

// 실행되는 스크립트 파일 본문 검사. promote 면제는 정확한 경로 ${ROOT}/scripts/promote-to-prod.mjs 만(--yes 는 단어 규칙이 판정)
function scanFile(p, ctx, kind, depth) {
  if (!p || expanded(p)) return uncheckable('스크립트 경로 해석 불가', ctx)
  for (const dir of [ctx.cwd, ROOT]) {
    const f = path.resolve(dir, toFsPath(p))
    let st
    try { st = fs.statSync(f) } catch { continue }
    if (same(f, HOOK_FILE) || same(f, PROMOTE_FILE)) return []
    if (!st.isFile() || st.size > LIMIT.maxFileBytes) return uncheckable(`스크립트 ${p} 읽기 불가`, ctx)
    const body = fs.readFileSync(f, 'utf8')
    if (kind === 'sh' || kind === 'ps') return scan(body, ctx, kind === 'ps', depth + 1).map((x) => ({ ...x, reason: `스크립트 ${p} 안의 ${x.reason}` }))
    return FILE_PUSH_RE.test(body) ? [{ reason: `스크립트 ${p} 안의 git push` }] : []
  }
  return uncheckable(`스크립트 ${p} 없음`, ctx)
}

const GUARD_EXEC = { reason: 'push-guard 실행(--selftest 외 마스터 전용)', hard: true }

function interpCheck(b, rest, ctx, depth, stdin = []) {
  if (b === 'node' && rest[0] === '--check') return [] // 문법 검사만(실행 안 함)
  let j = 0
  let preload = false
  let code = null
  for (; j < rest.length; j++) {
    const a = rest[j]
    if (/^(-r|--require|--import|--loader|--experimental-loader)$/.test(a)) { preload = true; j++; continue }
    if (/^--(require|import|loader|experimental-loader)=/.test(a)) { preload = true; continue }
    if (/^(-e|--eval|-p|--print|-c)$/.test(a)) { code = rest[j + 1] ?? ''; break }
    if (a === '-') { code = stdin.join('\n'); break } // 표준입력(heredoc) 코드
    if (a === '-m') return uncheckable(`${b} -m 모듈`, ctx)
    if (!a.startsWith('-')) break
  }
  if (code !== null) {
    if (/push-allo/i.test(code)) return [{ reason: `${b} 인라인 코드의 승인 파일 경로`, hard: true }]
    return FILE_PUSH_RE.test(code) ? [{ reason: `${b} 인라인 코드의 git push` }] : []
  }
  const script = rest[j]
  if (script && isGuard(script)) return rest[j + 1] === '--selftest' && rest.length === j + 2 ? [] : [GUARD_EXEC]
  if (preload) return uncheckable(`${b} 프리로드(-r/--import)`, ctx)
  if (!script && stdin.length) return interpCheck(b, ['-'], ctx, depth, stdin)
  if (!script) return uncheckable(`${b} 표준입력 실행`, ctx)
  return scanFile(script, ctx, script.endsWith('.sh') ? 'sh' : 'js', depth)
}

function checkCmd(c, ctx, ps, depth) {
  const ws = c.words
  const found = []
  const all = [...pathWords(ws), ...c.redirs]
  if (all.some(pointsToAllow)) found.push({ reason: '승인 파일 경로 접근(마스터 전용)', hard: true })
  // 싼 방어 : 확장으로 경로를 위장한 .omc 접근(값을 알 수 없음)
  else if (all.some((x) => /[$`]|%\w+%/.test(x)) && all.some((x) => /\.omc/i.test(x))) found.push({ reason: '.omc 경로 + 변수 확장(판정 불가)', hard: true })
  if (ws.some((x) => !/\s/.test(x) && /promote-to-prod/i.test(x))) { // 경로형 단어만(인라인 코드·메시지 속 언급 제외)
    if (ws.some(expanded)) found.push({ reason: 'promote-to-prod 인자 확장 — --yes 판정 불가' })
    else if (ws.includes('--yes')) found.push({ reason: 'promote-to-prod --yes(운영 브랜치 push)' })
  }
  for (let i = 0; i < ws.length; i++) {
    const b = base(ws[i])
    const rest = ws.slice(i + 1)
    const firstArg = rest.find((a) => !a.startsWith('-'))
    if (b === 'git') found.push(...gitCheck(rest, ctx, i > 0))
    else if (i === 0 && isGuard(ws[0])) found.push(...(rest.length === 1 && rest[0] === '--selftest' ? [] : [GUARD_EXEC]))
    else if (expanded(ws[i]) && rest[0] === 'push') found.push({ reason: '변수로 조립한 push' })
    else if (SHELLS.has(b)) {
      const ci = rest.findIndex((a) => /^-[a-z]*c[a-z]*$/i.test(a))
      if (ci > -1) found.push(...scan(rest[ci + 1], ctx, false, depth + 1))
      else if (firstArg) found.push(...scanFile(firstArg, ctx, 'sh', depth))
      else if (c.stdin.length) for (const x of c.stdin) found.push(...scan(x, ctx, false, depth + 1))
      else found.push(...uncheckable('표준입력으로 셸 실행', ctx))
    } else if (PWSH.has(b)) {
      const ci = rest.findIndex((a) => /^-(c|command)$/i.test(a))
      const ei = rest.findIndex((a) => /^-(e|ec|enc|encodedcommand)$/i.test(a))
      const fi = rest.findIndex((a) => /^-(f|file)$/i.test(a))
      if (ci > -1) found.push(...scan(rest.slice(ci + 1).join(' '), ctx, true, depth + 1))
      else if (ei > -1) found.push(...scan(Buffer.from(rest[ei + 1] ?? '', 'base64').toString('utf16le'), ctx, true, depth + 1))
      else if (fi > -1) found.push(...scanFile(rest[fi + 1], ctx, 'ps', depth))
      else found.push(...uncheckable('표준입력으로 셸 실행', ctx))
    } else if (b === 'cmd') {
      const ci = rest.findIndex((a) => /^\/[ck]$/i.test(a))
      if (ci > -1) found.push(...scan(rest.slice(ci + 1).join(' '), ctx, false, depth + 1))
    } else if (EVALS.has(b)) found.push(...scan(rest.join(' '), ctx, b !== 'eval', depth + 1))
    else if ((b === 'source' || b === '.') && i === 0) found.push(...scanFile(firstArg, ctx, 'sh', depth))
    else if (INTERP.has(b)) { found.push(...interpCheck(b, rest, ctx, depth, c.stdin)); break } // 인터프리터 뒤 단어는 스크립트 인자
    if (found.length) break
  }
  if (ws.length === 0) for (const x of c.stdin) if (x) found.push(...scan(x, ctx, ps, depth + 1))
  return found
}

// ---------- 승인 파일 ----------
function readAllow(file) {
  try {
    const a = JSON.parse(fs.readFileSync(file, 'utf8'))
    return a && a.used !== true && Date.now() < Date.parse(a.expires_at) ? a : null
  } catch { return null }
}

function writeAllow(file, minutes, now = Date.now(), target = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const a = {
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + minutes * 60_000).toISOString(),
    minutes,
    remote: target.remote ?? null,
    branch: target.branch ?? null,
    used: false,
  }
  fs.writeFileSync(file, JSON.stringify(a, null, 2))
  return a
}

// 승인 대상(원격·브랜치) 고정 시 : git push 의 원격과 모든 refspec 도착 브랜치가 일치해야 통과
function matchTarget(t, a) {
  if (!a.remote && !a.branch) return true
  if (!t) return false
  if (a.remote && t.remote !== a.remote) return false
  if (!a.branch) return true
  const dst = (r) => r.split(':').pop().replace(/^\+/, '').replace(/^refs\/heads\//, '')
  return t.refs.length > 0 && t.refs.every((r) => dst(r) === a.branch)
}

// 판정 : { block: 사유|null, consumed?: bool }
export function decide(input, allowFile = ALLOW_FILE) {
  const tool = input?.tool_name ?? ''
  const ti = input?.tool_input ?? {}
  const target = String(ti.file_path ?? ti.notebook_path ?? '').replace(/\\/g, '/')
  if (/push-allo[^/]*$/i.test(target)) return { block: '승인 파일 쓰기·수정 금지(마스터 전용)', hard: true }
  if (tool !== 'Bash' && tool !== 'PowerShell') return { block: null }
  const text = String(ti.command ?? '')
  const found = scan(text, { text, cwd: input.cwd || process.cwd() }, tool === 'PowerShell')
  if (!found.length) return { block: null }
  const hard = found.find((f) => f.hard)
  if (hard) return { block: hard.reason, hard: true }
  if (found.length > 1) return { block: `push ${found.length}건(${found.map((f) => f.reason).join(', ')}) — 승인은 명령 1건에 push 1건만` }
  const a = readAllow(allowFile)
  if (!a) return { block: found[0].reason }
  if (!matchTarget(found[0].target, a)) return { block: `${found[0].reason} — 승인 대상(${a.remote ?? '*'} ${a.branch ?? '*'})과 불일치` }
  fs.writeFileSync(allowFile, JSON.stringify({ ...a, used: true, used_at: new Date().toISOString(), used_cmd: text.slice(0, 300) }, null, 2))
  return { block: null, consumed: true }
}

function blockMsg(reason, cwd, hard) {
  const rel = path.relative(cwd || process.cwd(), HOOK_FILE).replace(/\\/g, '/') || HOOK_FILE
  if (hard) return `⛔ push-guard 차단 — ${reason}\n  승인 파일·승인 명령은 마스터 전용(! 로 직접 실행). Claude 는 만들거나 고칠 수 없다.`
  return [
    `⛔ git push 차단 — 마스터 승인 필요 (${reason})`,
    `  ① 마스터가 \`! node ${rel} --allow 10 [원격] [브랜치]\` 실행 후 다시 요청(10분 안 push 1건, 1회용)`,
    '  ② 또는 마스터가 `! git push` 직접 실행(! 명령은 훅을 거치지 않음)',
    '  Claude 는 승인 파일을 만들거나 --allow 를 실행할 수 없다. 푸시 상태 보고는 `git status -sb` 원문으로.',
  ].join('\n')
}

// ---------- 자체 시험 ----------
function selftest() {
  const ctx = (command, tool = 'Bash') => ({ tool_name: tool, tool_input: { command }, cwd: ROOT })
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'push-guard-'))
  const tmp = path.join(dir, 'allow.json')
  fs.copyFileSync(PROMOTE_FILE, path.join(dir, 'promote-to-prod.mjs'))
  const P = 'p' + 'ush' // 이 파일 본문이 FILE_PUSH_RE 에 걸리지 않게(시험 문자열만)
  const G = `git ${P}`
  // 양성 : 이 저장소 세션 기록(~/.claude/projects/...loginpi/*.jsonl)에서 실제 실행된 push 명령 원문 + 요구 형태
  const POS = [
    `${G} -q origin HEAD:master 2>&1 | tail -1; git log --oneline -1 origin/master`,
    `cd /c/Users/anaki/workspace/loginpi && git fetch -q origin && git log --oneline -1 origin/master && ${G} origin origin/master:refs/heads/prod/schema 2>&1 | tail -1`,
    `git pull --rebase -q origin master 2>&1 | tail -2; ${G} -q origin master 2>&1 | tail -3; git log --oneline -1 origin/master`,
    `cd C:/Users/anaki/workspace/loginpi && git pull --rebase -q && ${G} -q origin master && git log --oneline -1 && git status -sb | head -1`,
    `cd /c/Users/anaki/workspace/loginpi-fix89 && ${G} origin HEAD:master 2>&1 | tail -2; git rev-parse HEAD`,
    `cd /c/Users/anaki/workspace/loginpi && ${G} -q origin master:prod/schema && git rev-parse origin/prod/schema`,
    `cd /c/Users/anaki/workspace/loginpi && ${G} -q origin master && ${G} -q origin HEAD:prod/sitemap && git log --oneline -1 origin/prod/sitemap`,
    `cd /c/Users/anaki/workspace/loginpi && git status --short sitemap/dbms.pi | head -5; git fetch -q && git merge-base --is-ancestor origin/master HEAD && ${G} -q origin master && node scripts/promote-to-prod.mjs --app dbms --yes 2>&1 | tail -1`,
    'cd /c/Users/anaki/workspace/loginpi && node scripts/promote-to-prod.mjs --app schema --yes 2>&1 | tail -3',
    'node scripts/promote-to-prod.mjs --yes 2>&1 | tail -6',
    `git -C /c/Users/anaki/workspace/loginpi ${P} origin master`,
    `git -c core.askpass=x ${P} origin master`,
    `(cd sitemap && ${G})`,
    `bash -c "${G} origin master"`,
    `sh -lc 'git fetch && ${G}'`,
    `echo ok; $(${G} origin master)`,
    `git commit -q -F - <<'EOF'\nmsg\nEOF\n${G} origin master`,
    `bash <<'EOF'\n${G} origin master\nEOF`,
    `git subtree ${P} --prefix=x origin y`,
    `git -c alias.p=${P} p origin master`,
    // 보안 검토 재현 : #3 dry-run 위장
    `${G} -o n origin master`,
    `${G} -on origin master`,
    `${G} --repo -n origin`,
    `${G} --push-option -n origin master`,
    `${G} origin master -- -n`,
    // #4 promote 경로·프리로드 위장, #2 인자 확장
    `node ${path.join(dir, 'promote-to-prod.mjs').replace(/\\/g, '/')} --app schema`,
    'node -r ./x.cjs scripts/promote-to-prod.mjs --app schema',
    'node --import ./x.mjs scripts/promote-to-prod.mjs',
    'node scripts/promote-to-prod.mjs --app schema $FLAG',
    'node scripts/promote-to-prod.mjs $(echo --yes)',
    'Y=--yes; node scripts/promote-to-prod.mjs --app schema "$Y"',
    // 표준입력 코드·검사 불가 스크립트 + push 단서
    `python - <<'EOF'\nimport os; os.system('${G} origin master')\nEOF`,
    `node "$S/p.mjs" && echo "${G} 완료"`,
  ]
  const NEG = [
    'git status -sb',
    'git log origin/master..HEAD',
    `git commit -m "${P} 금지 — 훅이 ${G} 를 막는다"`,
    `git commit -q -F - <<'EOF'\n🔧 chore(harness): ${G} 차단 훅 (원인: 푸시 사고\n\nCo-Authored-By: x\nEOF`,
    `git commit -m "$(cat <<'EOF'\n${G} 차단 1) 사고\nEOF\n)"`,
    'git fetch -q origin',
    'node scripts/model-change-dashboard.mjs',
    'node scripts/promote-to-prod.mjs --app schema',
    'cd /c/Users/anaki/workspace/loginpi && node scripts/promote-to-prod.mjs',
    `cd /c/Users/anaki/workspace/loginpi && git stash ${P} -u -m "wip"`,
    `${G} --dry-run origin master`,
    `${G} -n origin master`,
    `${G} -qn origin master`,
    `${G} -o ci.skip -n origin master`,
    `grep -rn "${G}" scripts | head`,
    `git log --grep ${P} --oneline # ${P} 검색`,
    // #1 단순 문자열 --allow 는 통과
    'git commit -m "승인은 마스터가 --allow 10 으로 연다"',
    `git commit -q -F - <<'EOF'\n해제 : node .claude/hooks/push-guard.mjs --allow 10 · .omc/state/push-allow.json\nEOF`,
    'echo "--allow 10"',
    'git commit --allow-empty -m x',
    'node .claude/hooks/push-guard.mjs --selftest',
    'node --check .claude/hooks/push-guard.mjs',
    // 실기록 재생 오탐 회귀(2026-11-07) : 프로브 단어·heredoc 코드의 배열 push·같은 명령에서 만든 스크립트·fd 번호
    'echo push-allow-probe',
    `python - scripts/x.ts <<'EOF'\nrows.${P}(1)\nEOF`,
    `cat > "$TEMP/g.js" <<'EOF'\nrows.${P}(1)\nEOF\nnode "$TEMP/g.js"`,
    'node --check .claude/hooks/push-guard.mjs && node .claude/hooks/push-guard.mjs --selftest 2>&1 | tail -3',
  ]
  // 승인으로도 못 푸는 차단(hard)
  const HARD = [
    'node .claude/hooks/push-guard.mjs --allow 10',
    'node .claude/hooks/push-guard.mjs',
    'node .claude/hooks/push-guard.mjs --selftest --allow',
    'node $WORKSPACE_ROOT/loginpi/.claude/hooks/push-guard.mjs --allow 5',
    'cd .claude/hooks && ./push-guard.mjs --allow',
    'echo {} > .omc/state/push-allow.json',
    'cp /tmp/a.json .omc/state/push-allo*',
    'cp /tmp/a.json ".omc/state/push-allow.json"',
    'cat a | tee .omc/state/*',
    `node -e "require('fs').writeFileSync('.omc/state/push-allow.json','{}')"`,
    `python -c "open('.omc/state/push-allow.json','w').write('{}')"`,
    'F=push-al; echo {} > ".omc/state/${F}low.json"',
    // Windows 경로 별칭 4종 : 끝 점·끝 공백·대체 스트림·8.3 짧은 이름
    'cp /tmp/a.json .omc/state/push-allow.json.',
    'cp /tmp/a.json ".omc/state/push-allow.json "',
    'cp /tmp/a.json .omc/state/push-allow.json::$DATA',
    'cp /tmp/a.json .omc/state/PUSH-A~1.JSO',
    'cp /tmp/a.json .omc/STATE~1/x.json',
    'grep -n push-allow .claude/hooks/x.mjs',
  ]
  let pass = 0
  const eq = (cond, label) => { if (!cond) throw new Error(`실패 : ${label}`); pass++ }
  for (const c of POS) eq(decide(ctx(c), tmp).block, `양성 ${c}`)
  for (const c of NEG) eq(!decide(ctx(c), tmp).block, `음성 ${c}`)
  for (const c of HARD) eq(decide(ctx(c), tmp).hard, `우회 ${c}`)
  eq(decide(ctx(`${G} origin master`, 'PowerShell'), tmp).block, 'PowerShell 양성')
  eq(!decide(ctx(`git status; Write-Host ${P}`, 'PowerShell'), tmp).block, 'PowerShell 음성')
  eq(decide({ tool_name: 'Write', tool_input: { file_path: path.join(ROOT, '.omc/state/push-allow.json') } }, tmp).hard, 'Write 승인 파일')
  eq(decide({ tool_name: 'Edit', tool_input: { file_path: 'C:\\x\\.omc\\state\\push-allow.json' } }, tmp).hard, 'Edit 승인 파일')
  eq(!decide({ tool_name: 'Write', tool_input: { file_path: 'a.md' } }, tmp).block, 'Write 일반 파일')
  // 승인 : 생성 → 1건 통과·소진 → 다음 차단 / 만료 / 무관 명령 미소진 / 2건 명령 차단·미소진(#6) / 대상 고정(#6) / hard 는 승인 무관
  writeAllow(tmp, 10)
  const r1 = decide(ctx(`${G} origin master`), tmp)
  eq(!r1.block && r1.consumed, '승인 → 1건 통과')
  eq(JSON.parse(fs.readFileSync(tmp, 'utf8')).used === true, '승인 소진 기록')
  eq(decide(ctx(`${G} origin master`), tmp).block, '소진 후 차단')
  writeAllow(tmp, 10, Date.now() - 11 * 60_000)
  eq(decide(ctx(`${G} origin master`), tmp).block, '만료 승인 차단')
  writeAllow(tmp, 10)
  eq(!decide(ctx('git status'), tmp).consumed, '무관 명령은 승인 미소진')
  eq(decide(ctx(`${G} -q origin master && ${G} -q origin master:prod/schema`), tmp).block, '2건 명령은 승인 있어도 차단')
  eq(decide(ctx('node .claude/hooks/push-guard.mjs --allow 10'), tmp).block, 'hard 는 승인 있어도 차단')
  eq(readAllow(tmp), '차단된 명령 뒤 승인 유지')
  writeAllow(tmp, 10, Date.now(), { remote: 'origin', branch: 'master' })
  eq(decide(ctx(`${G} origin master:prod/schema`), tmp).block, '대상 불일치 차단')
  eq(decide(ctx('node scripts/promote-to-prod.mjs --yes'), tmp).block, '대상 고정 시 promote 차단')
  eq(decide(ctx(`${G} upstream master`), tmp).block, '원격 불일치 차단')
  eq(!decide(ctx(`${G} -q origin HEAD:master`), tmp).block, '대상 일치 통과')
  fs.rmSync(dir, { recursive: true, force: true })
  console.log(`selftest 통과 ${pass}건 (양성 ${POS.length + 1} · 음성 ${NEG.length + 2} · 우회 ${HARD.length + 2} · 승인 ${pass - POS.length - NEG.length - HARD.length - 5})`)
}

// ---------- 진입 ----------
const argv = process.argv.slice(2)
if (argv[0] === '--selftest') {
  selftest()
} else if (argv[0] === '--allow') {
  const hasMin = /^\d+$/.test(argv[1] ?? '')
  const n = hasMin ? Number.parseInt(argv[1], 10) : LIMIT.defaultMin
  const [remote, branch] = argv.slice(hasMin ? 2 : 1)
  const minutes = Math.min(Math.max(n, 1), LIMIT.maxMin)
  const a = writeAllow(ALLOW_FILE, minutes, Date.now(), { remote, branch })
  const tgt = remote ? ` · 대상 ${remote}${branch ? ` ${branch}` : ''}` : ''
  console.log(`✅ git push 1회 승인 — ${new Date(a.expires_at).toLocaleTimeString('ko-KR')} 까지(${minutes}분${tgt}), 다음 push 명령 1건에 소진`)
} else {
  let raw = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) raw += chunk
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    if (/push|--allow/i.test(raw)) { console.error(blockMsg('훅 입력 해석 실패 — fail-closed')); process.exit(2) }
    process.exit(0)
  }
  try {
    const r = decide(input)
    if (r.block) { console.error(blockMsg(r.block, input.cwd, r.hard)); process.exit(2) }
  } catch (e) {
    if (/push|--allow/i.test(JSON.stringify(input?.tool_input ?? {}))) {
      console.error(blockMsg(`훅 오류 — fail-closed : ${e.message}`, input?.cwd))
      process.exit(2)
    }
  }
  process.exit(0)
}
