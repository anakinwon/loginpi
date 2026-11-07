#!/usr/bin/env node
/**
 * push-guard — Claude(메인·서브에이전트)의 git push 를 PreToolUse 에서 차단하는 훅.
 * 마스터 결정 2026-11-07 : 커밋 담당이 푸시 금지 지시를 어기고 master(= Vercel 운영 브랜치)에 푸시한 사고 → 실행 자체를 막는다.
 *
 * 실행
 *   훅      : settings.json PreToolUse(matcher Bash|PowerShell|Write|Edit|MultiEdit|NotebookEdit) — stdin JSON
 *   승인    : ! node .claude/hooks/push-guard.mjs --allow [분]   (마스터만, 기본 10분, 1회용 → .omc/state/push-allow.json)
 *   자체시험 : node .claude/hooks/push-guard.mjs --selftest
 *
 * 판정
 *   - 차단 : git push(모든 형태 — -C·-c·--git-dir 전역 옵션, &&·;·|·서브셸·$()·`` ·bash -c·pwsh -Command·cmd /c·eval·heredoc→셸 안),
 *            git subtree/lfs push·send-pack·http-push, alias 로 push 정의, 내부에서 push 하는 스크립트(promote-to-prod.mjs --yes),
 *            실행되는 스크립트 파일 본문의 git push, 승인 파일 쓰기·수정, Bash 명령의 push-allow·--allow
 *   - 허용 : git push --dry-run / -n (원격 변경 없음), promote-to-prod.mjs 미리보기(--yes 없음), push 가 단어로만 들어간 명령
 *   - 유효 승인이 있으면 push 명령 1건 통과 후 즉시 소진(used=true)
 *   - 훅 오류 : push 관련 문자열이 있으면 차단(fail-closed), 없으면 통과
 * ponytail: 셸 문법 근사 해석기 — 변수로 조립한 명령·base64 파이프·Claude 가 만든 임의 인터프리터 경로는 다 못 잡는다.
 *           그런 흔적($변수 서브커맨드·stdin 으로 셸 실행)은 원문에 push 가 있으면 차단 쪽으로 판정. 훅·settings 자체 수정은 막지 않음.
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
const FILE_PUSH_RE = /\bgit\s+(?:-{1,2}\S+\s+)*push\b|['"]git['"]\s*,\s*\[\s*['"]push['"]/

// ---------- 셸 근사 해석기 : 문자열 → 단순 명령 목록 [{ words, stdin }] ----------
function lexInto(s, i, ps, out, sub) {
  let cmd = { words: [], stdin: [] }
  let w = null
  let redir = false
  let hereStr = false
  let depth = 0
  const heres = []
  const endWord = () => {
    if (w === null) return
    if (hereStr) cmd.stdin.push(w)
    else if (!redir) cmd.words.push(w)
    hereStr = redir = false
    w = null
  }
  const endCmd = () => {
    endWord()
    if (cmd.words.length || cmd.stdin.length) out.push(cmd)
    cmd = { words: [], stdin: [] }
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

function scan(src, ctx, ps = false, depth = 0) {
  if (depth > LIMIT.maxDepth) return '명령 중첩 과다(판정 불가)'
  const cmds = []
  lexInto(String(src ?? ''), 0, ps, cmds, false)
  for (const c of cmds) {
    const r = checkCmd(c, ctx, ps, depth)
    if (r) return r
  }
  return null
}

function gitCheck(args, ctx, notFirst) {
  let k = 0
  const cvals = []
  while (k < args.length && args[k].startsWith('-')) {
    if (args[k] === '-c') cvals.push(args[k + 1] ?? '')
    k += GIT_OPT_ARG.has(args[k]) ? 2 : 1
  }
  const sub = (args[k] ?? '').toLowerCase()
  const rest = args.slice(k + 1)
  if (cvals.some((v) => /^alias\./i.test(v) && /push/i.test(v))) return 'git -c alias.*=push'
  if (sub === 'push') {
    // --dry-run·-n 은 원격 ref 를 바꾸지 않으므로 허용(대상·권한 확인용)
    if (rest.some((a) => a === '--dry-run' || /^-[a-z]*n[a-z]*$/i.test(a))) return null
    return 'git push'
  }
  if ((sub === 'subtree' || sub === 'lfs') && rest.includes('push')) return `git ${sub} push`
  if (sub === 'send-pack' || sub === 'http-push') return `git ${sub}`
  if (sub === 'config' && rest.some((a) => /^alias\./i.test(a)) && rest.some((a) => /push/i.test(a))) return 'git alias 로 push 정의'
  // 변수로 조립한 서브커맨드·xargs git 처럼 서브커맨드를 알 수 없으면 원문에 push 가 있을 때 차단(fail-closed)
  if ((sub.includes('$') || (sub === '' && notFirst)) && /push/i.test(ctx.text)) return 'git 서브커맨드 판정 불가 + push 문자열'
  return null
}

function scanFile(p, ctx, kind, depth) {
  if (!p || /promote-to-prod/i.test(p)) return null // promote 는 --yes 규칙으로 따로 판정(미리보기 허용)
  for (const dir of [ctx.cwd, ROOT]) {
    const f = path.resolve(dir, p)
    let st
    try { st = fs.statSync(f) } catch { continue }
    if (!st.isFile() || st.size > LIMIT.maxFileBytes || f === HOOK_FILE) return null // 훅 자신(--selftest)은 push 하지 않음
    const body = fs.readFileSync(f, 'utf8')
    if (kind === 'sh') return scan(body, ctx, false, depth + 1) && `스크립트 ${p} 안의 push`
    if (kind === 'ps') return scan(body, ctx, true, depth + 1) && `스크립트 ${p} 안의 push`
    return FILE_PUSH_RE.test(body) ? `스크립트 ${p} 안의 git push` : null
  }
  return null
}

function checkCmd(c, ctx, ps, depth) {
  const ws = c.words
  if (ws.some((x) => /promote-to-prod/i.test(x)) && ws.includes('--yes')) return 'promote-to-prod --yes(운영 브랜치 push)'
  for (let i = 0; i < ws.length; i++) {
    const b = base(ws[i])
    const rest = ws.slice(i + 1)
    const firstArg = rest.find((a) => !a.startsWith('-'))
    let r = null
    if (b === 'git') r = gitCheck(rest, ctx, i > 0)
    else if (/^\$/.test(ws[i]) && rest[0] === 'push') r = '변수로 조립한 push'
    else if (SHELLS.has(b)) {
      const ci = rest.findIndex((a) => /^-[a-z]*c[a-z]*$/i.test(a))
      if (ci > -1) r = scan(rest[ci + 1], ctx, false, depth + 1)
      else if (firstArg) r = scanFile(firstArg, ctx, 'sh', depth)
      else if (c.stdin.length) r = c.stdin.map((x) => scan(x, ctx, false, depth + 1)).find(Boolean) ?? null
      else if (/push/i.test(ctx.text)) r = '표준입력으로 셸 실행 + push 문자열'
    } else if (PWSH.has(b)) {
      const ci = rest.findIndex((a) => /^-(c|command)$/i.test(a))
      const ei = rest.findIndex((a) => /^-(e|ec|enc|encodedcommand)$/i.test(a))
      const fi = rest.findIndex((a) => /^-(f|file)$/i.test(a))
      if (ci > -1) r = scan(rest.slice(ci + 1).join(' '), ctx, true, depth + 1)
      else if (ei > -1) r = scan(Buffer.from(rest[ei + 1] ?? '', 'base64').toString('utf16le'), ctx, true, depth + 1)
      else if (fi > -1) r = scanFile(rest[fi + 1], ctx, 'ps', depth)
      else if (/push/i.test(ctx.text)) r = '표준입력으로 셸 실행 + push 문자열'
    } else if (b === 'cmd') {
      const ci = rest.findIndex((a) => /^\/[ck]$/i.test(a))
      if (ci > -1) r = scan(rest.slice(ci + 1).join(' '), ctx, false, depth + 1)
    } else if (EVALS.has(b)) r = scan(rest.join(' '), ctx, b !== 'eval', depth + 1)
    else if ((b === 'source' || b === '.') && i === 0) r = scanFile(firstArg, ctx, 'sh', depth)
    else if (INTERP.has(b)) {
      const ei = rest.findIndex((a) => /^(-e|--eval|-p|--print|-c)$/.test(a))
      if (ei > -1) r = FILE_PUSH_RE.test(rest[ei + 1] ?? '') ? `${b} 인라인 코드의 git push` : null
      else if (firstArg) r = scanFile(firstArg, ctx, firstArg.endsWith('.sh') ? 'sh' : 'js', depth)
    }
    if (r) return r
  }
  for (const x of c.stdin) if (c.words.length === 0 && x) { const r = scan(x, ctx, ps, depth + 1); if (r) return r }
  return null
}

// ---------- 승인 파일 ----------
function readAllow(file) {
  try {
    const a = JSON.parse(fs.readFileSync(file, 'utf8'))
    return a && a.used !== true && Date.now() < Date.parse(a.expires_at) ? a : null
  } catch { return null }
}

function writeAllow(file, minutes, now = Date.now()) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const a = { created_at: new Date(now).toISOString(), expires_at: new Date(now + minutes * 60_000).toISOString(), minutes, used: false }
  fs.writeFileSync(file, JSON.stringify(a, null, 2))
  return a
}

// 판정 : { block: 사유|null, consumed: bool }
export function decide(input, allowFile = ALLOW_FILE) {
  const tool = input?.tool_name ?? ''
  const ti = input?.tool_input ?? {}
  const target = String(ti.file_path ?? ti.notebook_path ?? '').replace(/\\/g, '/')
  if (/push-allow\.json$/i.test(target)) return { block: '승인 파일 쓰기·수정 금지(마스터 전용)' }
  if (tool !== 'Bash' && tool !== 'PowerShell') return { block: null }
  const text = String(ti.command ?? '')
  if (/push-allow/i.test(text) || /(^|\s)--allow(?=$|[\s=\d'"])/.test(text)) return { block: '승인 파일·--allow 사용 금지(마스터가 ! 로 직접 실행)' }
  const reason = scan(text, { text, cwd: input.cwd || process.cwd() }, tool === 'PowerShell')
  if (!reason) return { block: null }
  const a = readAllow(allowFile)
  if (!a) return { block: reason }
  fs.writeFileSync(allowFile, JSON.stringify({ ...a, used: true, used_at: new Date().toISOString(), used_cmd: text.slice(0, 300) }, null, 2))
  return { block: null, consumed: true }
}

function blockMsg(reason, cwd) {
  const rel = path.relative(cwd || process.cwd(), HOOK_FILE).replace(/\\/g, '/') || HOOK_FILE
  return [
    `⛔ git push 차단 — 마스터 승인 필요 (${reason})`,
    `  ① 마스터가 \`! node ${rel} --allow 10\` 실행 후 다시 요청(10분 안 push 1건, 1회용)`,
    '  ② 또는 마스터가 `! git push` 직접 실행(! 명령은 훅을 거치지 않음)',
    '  Claude 는 승인 파일을 만들거나 --allow 를 실행할 수 없다. 푸시 상태 보고는 `git status -sb` 원문으로.',
  ].join('\n')
}

// ---------- 자체 시험 ----------
function selftest() {
  const ctx = (command, tool = 'Bash') => ({ tool_name: tool, tool_input: { command }, cwd: ROOT })
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'push-guard-')), 'push-allow.json')
  // 양성 : 이 저장소 세션 기록(~/.claude/projects/...loginpi/*.jsonl)에서 실제 실행된 push 명령 원문 + 요구 형태
  const POS = [
    'git push -q origin HEAD:master 2>&1 | tail -1; git log --oneline -1 origin/master',
    'cd /c/Users/anaki/workspace/loginpi && git fetch -q origin && git log --oneline -1 origin/master && git push origin origin/master:refs/heads/prod/schema 2>&1 | tail -1',
    'git pull --rebase -q origin master 2>&1 | tail -2; git push -q origin master 2>&1 | tail -3; git log --oneline -1 origin/master',
    'cd C:/Users/anaki/workspace/loginpi && git pull --rebase -q && git push -q origin master && git log --oneline -1 && git status -sb | head -1',
    'cd /c/Users/anaki/workspace/loginpi-fix89 && git push origin HEAD:master 2>&1 | tail -2; git rev-parse HEAD',
    'cd /c/Users/anaki/workspace/loginpi && git push -q origin master:prod/schema && git rev-parse origin/prod/schema',
    'cd /c/Users/anaki/workspace/loginpi && git push -q origin master && git push -q origin HEAD:prod/sitemap && git log --oneline -1 origin/prod/sitemap',
    'cd /c/Users/anaki/workspace/loginpi && git status --short sitemap/dbms.pi | head -5; git fetch -q && git merge-base --is-ancestor origin/master HEAD && git push -q origin master && node scripts/promote-to-prod.mjs --app dbms --yes 2>&1 | tail -1',
    'cd /c/Users/anaki/workspace/loginpi && node scripts/promote-to-prod.mjs --app schema --yes 2>&1 | tail -3',
    'node scripts/promote-to-prod.mjs --yes 2>&1 | tail -6',
    'git -C /c/Users/anaki/workspace/loginpi push origin master',
    'git -c core.askpass=x push origin master',
    '(cd sitemap && git push)',
    'bash -c "git push origin master"',
    "sh -lc 'git fetch && git push'",
    'echo ok; $(git push origin master)',
    'git commit -q -F - <<\'EOF\'\nmsg\nEOF\ngit push origin master',
    'bash <<\'EOF\'\ngit push origin master\nEOF',
    'git subtree push --prefix=x origin y',
    'git -c alias.p=push p origin master',
  ]
  const NEG = [
    'git status -sb',
    'git log origin/master..HEAD',
    'git commit -m "push 금지 — 훅이 git push 를 막는다"',
    'git commit -q -F - <<\'EOF\'\n🔧 chore(harness): git push 차단 훅 (원인: 푸시 사고\n\nCo-Authored-By: x\nEOF',
    'git commit -m "$(cat <<\'EOF\'\ngit push 차단 1) 사고\nEOF\n)"',
    'git fetch -q origin',
    'node scripts/model-change-dashboard.mjs',
    'node scripts/promote-to-prod.mjs --app schema',
    'cd /c/Users/anaki/workspace/loginpi && git stash push -u -m "wip"',
    'git push --dry-run origin master',
    'git push -n origin master',
    'grep -rn "git push" scripts | head',
    'git log --grep push --oneline # push 검색',
  ]
  let pass = 0
  const eq = (cond, label) => { if (!cond) throw new Error(`실패 : ${label}`); pass++ }
  for (const c of POS) eq(decide(ctx(c), tmp).block, `양성 ${c}`)
  for (const c of NEG) eq(!decide(ctx(c), tmp).block, `음성 ${c}`)
  eq(decide(ctx('git push origin master', 'PowerShell'), tmp).block, 'PowerShell 양성')
  eq(!decide(ctx('git status; Write-Host push', 'PowerShell'), tmp).block, 'PowerShell 음성')
  // 우회 방지
  eq(decide({ tool_name: 'Write', tool_input: { file_path: path.join(ROOT, '.omc/state/push-allow.json') } }, tmp).block, 'Write 승인 파일')
  eq(decide({ tool_name: 'Edit', tool_input: { file_path: 'C:\\x\\.omc\\state\\push-allow.json' } }, tmp).block, 'Edit 승인 파일')
  eq(decide(ctx('node .claude/hooks/push-guard.mjs --allow 10'), tmp).block, 'Bash --allow')
  eq(decide(ctx('echo {} > .omc/state/push-allow.json'), tmp).block, 'Bash 승인 파일 경로')
  eq(!decide({ tool_name: 'Write', tool_input: { file_path: 'a.md' } }, tmp).block, 'Write 일반 파일')
  eq(!decide(ctx('git commit --allow-empty -m x'), tmp).block, '--allow-empty 는 허용')
  // 승인 시나리오 : 생성 → push 1건 통과·소진 → 다음 push 차단 / 만료 승인 차단
  writeAllow(tmp, 10)
  const r1 = decide(ctx('git push origin master'), tmp)
  eq(!r1.block && r1.consumed, '승인 → 1건 통과')
  eq(JSON.parse(fs.readFileSync(tmp, 'utf8')).used === true, '승인 소진 기록')
  eq(decide(ctx('git push origin master'), tmp).block, '소진 후 차단')
  writeAllow(tmp, 10, Date.now() - 11 * 60_000)
  eq(decide(ctx('git push origin master'), tmp).block, '만료 승인 차단')
  writeAllow(tmp, 10)
  eq(!decide(ctx('git status'), tmp).consumed, '무관 명령은 승인 미소진')
  eq(readAllow(tmp), '무관 명령 뒤 승인 유지')
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true })
  console.log(`selftest 통과 ${pass}건 (양성 ${POS.length + 1} · 음성 ${NEG.length + 1} · 우회 6 · 승인 6)`)
}

// ---------- 진입 ----------
const argv = process.argv.slice(2)
if (argv[0] === '--selftest') {
  selftest()
} else if (argv[0] === '--allow') {
  const n = Number.parseInt(argv[1] ?? '', 10)
  const minutes = Math.min(Math.max(Number.isFinite(n) ? n : LIMIT.defaultMin, 1), LIMIT.maxMin)
  const a = writeAllow(ALLOW_FILE, minutes)
  console.log(`✅ git push 1회 승인 — ${new Date(a.expires_at).toLocaleTimeString('ko-KR')} 까지(${minutes}분), 다음 push 명령 1건에 소진`)
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
    if (r.block) { console.error(blockMsg(r.block, input.cwd)); process.exit(2) }
  } catch (e) {
    if (/push|--allow/i.test(JSON.stringify(input?.tool_input ?? {}))) {
      console.error(blockMsg(`훅 오류 — fail-closed : ${e.message}`, input?.cwd))
      process.exit(2)
    }
  }
  process.exit(0)
}
