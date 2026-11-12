// 커밋 전 결정적 검사(2026-11-10 개정 — 커밋 칸 Codex 판정 대신) : 스테이징 파일의 금지 경로·크기·추가 줄 비밀 패턴 + 커밋 메시지 끝 Co-Authored-By 줄
//   + Vercel 업로드 제외(2026-11-12 추가 — a8925662 운영 404) : sitemap/<앱>/.vercelignore(gitignore 문법, 인덱스 내용)가 빌드 필요 경로를 빼면 차단
//     (앱 파일 스테이징 = 그 파일만, .vercelignore 스테이징 = 그 앱 추적 파일 전체 — 로컬 build·Codex 는 업로드 단계를 못 봐서 여기서 막는다)
// 실행 : node scripts/precommit-check.mjs [--msg <파일|->] | node scripts/precommit-check.mjs --commit < 메시지 (통과 시 같은 메시지로 git commit) [--allow-secret 종류,…]
// 시험 : node --test test/precommit-check.test.mjs — 종료 0 통과 / 1 위반 / 2 사용법·git 오류
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { isSecretPath, scrub } from './codex-verify.mjs'

const C = {
  maxBytes: 5 * 1024 * 1024,
  forbid: /^(work-history|work-statistics)\/|(^|\/)\.claude\/settings\.local\.json$/,
  allowPath: /(^|\/)\.env\.example$/,   // 저장소가 추적하는 예시 파일 — 경로만 허용, 내용은 비밀 검사
  coAuthor: /^Co-Authored-By: .+ <[^<>\s]+@[^<>\s]+>$/,
  // 빌드 필요 경로(앱 기준) 근거 : next build 입력(src·app·pages·public·types·tsconfig·postcss·next.config·middleware·proxy·instrumentation),
  // package.json build 스크립트 입력(scripts/ — cafe validate-locales·seminar copy-mediapipe, i18n.config.json — pi-i18n validate),
  // 런타임 readFile·outputFileTracingIncludes(messages/·validation-key.txt·cafe docs/law/), Vercel 설정(vercel.json)
  buildNeed: /^(src|app|pages|public|messages|types|scripts|docs\/law)\/|^(package\.json|vercel\.json|i18n\.config\.json|validation-key\.txt|tsconfig[^/]*\.json|(next|postcss)\.config\.[cm]?[jt]s|(middleware|proxy|instrumentation[^/]*)\.[cm]?[jt]s)$/,
  vercelCap: 20,   // 앱당 출력 상한(src/ 통째 제외 같은 경우 수백 줄 방지) — 나머지는 '외 N건'
}

const git = (args, cwd, input) => spawnSync('git', args, { cwd, input, encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 2 ** 20 })

/** 메시지 마지막 줄(빈 줄·# 주석 제외)이 Co-Authored-By 형식인지 */
export const coAuthorOk = msg => C.coAuthor.test(String(msg).replace(/\r/g, '').split('\n').filter(l => l.trim() && !l.startsWith('#')).at(-1) || '')

// ── gitignore 매처 = git wildmatch.c(WM_PATHNAME)·dir.c 줄 처리 이식 (D-001~003 — 회차마다 경계 하나씩 잡혀 규칙 전체를 옮김) ──
// POSIX 클래스는 git sane_ctype(ASCII) 기준 — isspace = ' \t\n\r'(\v\f 없음), 대소문자 무시(core.ignorecase)는 Vercel(리눅스)과 같게 미적용
const POSIX = { alnum: 'a-zA-Z0-9', alpha: 'a-zA-Z', blank: ' \\t', cntrl: '\\x00-\\x1f\\x7f', digit: '0-9', graph: '\\x21-\\x7e', lower: 'a-z', print: '\\x20-\\x7e', punct: '\\x21-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\x7e', space: '\\t\\n\\r ', upper: 'A-Z', xdigit: '0-9a-fA-F' }
const u = c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')

/** p[i] = '[' → { re, end } | null(닫히지 않음·모르는 [:이름:]·끝 '\' = wildmatch ABORT_ALL → 규칙 전체 불일치) */
function bracket(p, i) {
  let k = i + 1, neg = false, set = '', prev = null
  if (p[k] === '!' || p[k] === '^') { neg = true; k++ }
  for (let first = true; ; first = false) {
    const c = p[k]
    if (c === undefined) return null
    if (c === ']' && !first) break   // 맨 앞 ']' 는 리터럴
    if (c === '\\') { if (p[k + 1] === undefined) return null; prev = p[k + 1]; set += u(prev); k += 2 }
    else if (c === '-' && prev !== null && p[k + 1] !== undefined && p[k + 1] !== ']') {   // 범위 — 앞 문자는 이미 리터럴로 들어감
      let e = p[++k]
      if (e === '\\') { e = p[++k]; if (e === undefined) return null }
      if (e >= prev) set += `${u(prev)}-${u(e)}`   // 거꾸로 된 범위 = 빈 범위
      prev = null; k++
    } else if (c === '[' && p[k + 1] === ':') {
      const s = k + 2, close = p.indexOf(']', s)
      if (close < 0) return null
      if (close - s - 1 < 0 || p[close - 1] !== ':') { prev = '['; set += u('['); k++; continue }   // ':]' 없음 → '[' 리터럴
      const name = p.slice(s, close - 1)
      if (!Object.hasOwn(POSIX, name)) return null
      set += POSIX[name]; prev = null; k = close + 1
    } else { prev = c; set += u(c); k++ }
  }
  return { re: `(?!/)[${neg ? '^' : ''}${set}]`, end: k + 1 }   // 어떤 클래스도 '/' 는 소비 못 함(WM_PATHNAME)
}

/** 패턴 본문 → 정규식 본문 | null (s 플래그로 컴파일 — '.' 도 줄바꿈·CR 을 소비, D-004 : 모든 와일드카드 = '/' 외 모든 문자) — '**' 는 앞이 시작·'/' 이고 뒤가 끝·'/' 일 때만 '/' 를 넘음(그 밖 별표·'?'·클래스는 '/' 제외), '\x' = 리터럴 x */
function glob(p) {
  let out = '', i = 0
  while (i < p.length) {
    const c = p[i]
    if (c === '\\') { if (i + 1 >= p.length) return null; out += u(p[i + 1]); i += 2 }
    else if (c === '?') { out += '[^/]'; i++ }
    else if (c === '[') { const b = bracket(p, i); if (!b) return null; out += b.re; i = b.end }
    else if (c === '*') {
      let j = i; while (p[j] === '*') j++
      const wide = j - i >= 2 && (i === 0 || p[i - 1] === '/')
      if (wide && p[j] === '/') { out += '(?:.*/)?'; j++ }   // '**/' = 0개 이상 폴더
      else if (wide && (j === p.length || (p[j] === '\\' && p[j + 1] === '/'))) out += '.*'
      else out += '[^/]*'
      i = j
    } else { out += u(c); i++ }
  }
  return out
}

/** dir.c trim_trailing_spaces — 끝 공백(' ' 만, 탭 아님) 제거, '\ ' 는 보존, 끝 '\' 면 그대로 */
function trimSpaces(s) {
  let last = -1
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ' ') { if (last < 0) last = i }
    else if (s[i] === '\\') { if (++i >= s.length) return s; last = -1 }
    else last = -1
  }
  return last < 0 ? s : s.slice(0, last)
}

/** .vercelignore 본문 → 규칙 [{ re, neg, dirOnly, src, line }] — BOM·줄 끝 CR 제거, 맨 앞 '#' 주석('\#' 리터럴), '!' 부정('\!' 리터럴),
 *  끝 / = 폴더, 앞·중간 / = 루트 고정, / 없음 = 모든 깊이(이름 일치) */
export function parseIgnore(text) {
  const rules = []
  String(text).replace(/^﻿/, '').split('\n').forEach((raw, i) => {
    raw = raw.replace(/\r$/, '')
    if (!raw || raw.startsWith('#')) return
    let p = trimSpaces(raw)
    if (!p) return
    const neg = p.startsWith('!'); if (neg) p = p.slice(1)
    const dirOnly = p.endsWith('/'); if (dirOnly) p = p.slice(0, -1)
    if (!p) return
    const anchored = p.includes('/'); if (p.startsWith('/')) p = p.slice(1)
    const g = glob(p)
    // 앵커(D-005) : m 플래그 없음 → '^' = 문자열 시작 고정, 끝은 '$' 대신 명시형 절대 끝 '(?![\s\S])'(끝 줄바꿈 앞 일치 해석 여지 제거)
    rules.push({ re: g == null ? /(?!)/ : new RegExp(`^${anchored ? '' : '(?:.*/)?'}${g}(?![\\s\\S])`, 's'), neg, dirOnly, src: raw.trim(), line: i + 1 })
  })
  return rules
}

/** 앱 기준 경로가 제외되면 그 규칙, 아니면 null — 상위 폴더부터 판정(마지막 일치 우선, 제외된 폴더 안은 ! 로 되살릴 수 없음 = gitignore 동작) */
export function ignoredBy(rules, rel) {
  const parts = rel.split('/')
  for (let i = 1; i <= parts.length; i++) {
    const sub = parts.slice(0, i).join('/'), isDir = i < parts.length
    let hit = null
    for (const r of rules) if ((!r.dirOnly || isDir) && r.re.test(sub)) hit = r.neg ? null : r
    if (hit) return hit
  }
  return null
}

/** 스테이징 파일 → .vercelignore 위반 [{ rule, file, detail }] — git check-ignore 는 저장소 .gitignore·info/exclude 와 섞이므로 쓰지 않고 자체 매처 */
export function vercelViolations({ cwd = process.cwd(), files }) {
  const v = [], list = f => git(['ls-files', '-z', '--', f], cwd).stdout.split('\0').filter(Boolean)
  for (const vi of list('sitemap').filter(f => /^sitemap\/[^/]+\/\.vercelignore$/.test(f))) {
    const app = vi.slice(0, -'/.vercelignore'.length), pre = app + '/'
    const cand = files.includes(vi) ? list(pre) : files.filter(f => f.startsWith(pre))
    if (!cand.length) continue
    const rules = parseIgnore(git(['show', `:${vi}`], cwd).stdout), hits = []
    for (const f of cand) {
      const rel = f.slice(pre.length), r = C.buildNeed.test(rel) && ignoredBy(rules, rel)
      if (r) hits.push({ rule: 'vercelignore', file: f, detail: `${vi}:${r.line} 규칙 '${r.src}' 이 빌드 필요 경로를 Vercel 업로드에서 제외(운영 404·빌드 실패)` })
    }
    v.push(...hits.slice(0, C.vercelCap))
    if (hits.length > C.vercelCap) v.push({ rule: 'vercelignore', file: app, detail: `외 ${hits.length - C.vercelCap}건` })
  }
  return v
}

/** 검사 → { files, violations: [{ rule, file, detail }], allowed: [종류] } | { error } */
export function check({ cwd = process.cwd(), msg = null, allowSecret = [] } = {}) {
  const ls = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], cwd)
  if (ls.status !== 0) return { error: (ls.stderr || 'git diff 실패').trim() }
  const files = ls.stdout.split('\0').filter(Boolean), v = [], allowed = new Set()
  if (!files.length) v.push({ rule: 'empty', file: '-', detail: '스테이징 0건' })
  for (const f of files) {
    if ((isSecretPath(f) && !C.allowPath.test(f)) || C.forbid.test(f)) { v.push({ rule: 'path', file: f, detail: '커밋 금지 경로' }); continue }
    const size = +git(['cat-file', '-s', `:${f}`], cwd).stdout.trim()
    if (size > C.maxBytes) v.push({ rule: 'size', file: f, detail: `${size} 바이트 > ${C.maxBytes}` })
    // ponytail: 추가 줄만 검사 — 기존 줄의 비밀은 못 잡음, 전수 검사는 --all 이 필요해질 때
    const d = git(['diff', '--cached', '-U0', '--no-color', '--', `:(literal)${f}`], cwd).stdout
    if (/^Binary files /m.test(d)) continue
    // 머리 줄(+++ b/…)은 첫 @@ 앞에만 있다 — hunk 안의 '+' 줄은 내용이 '++' 로 시작해도 전부 추가 줄
    const body = d.split('\n'), h = body.findIndex(l => l.startsWith('@@'))
    const added = (h < 0 ? [] : body.slice(h)).filter(l => l.startsWith('+')).map(l => l.slice(1)).join('\n')
    const kinds = Object.entries(scrub(added).hits), bad = kinds.filter(([k]) => !allowSecret.includes(k))
    for (const [k] of kinds) if (allowSecret.includes(k)) allowed.add(k)
    if (bad.length) v.push({ rule: 'secret', file: f, detail: bad.map(([k, n]) => `${k} ${n}건`).join(', ') })   // 값은 출력하지 않음
  }
  if (files.length) v.push(...vercelViolations({ cwd, files }))
  if (msg != null && !coAuthorOk(msg)) v.push({ rule: 'message', file: '-', detail: '메시지 끝 줄이 Co-Authored-By: <이름> <메일> 형식이 아님' })
  return { files, violations: v, allowed: [...allowed] }
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href
if (isMain) {
  const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); return i < 0 ? null : a[i + 1] ?? '' }
  const commit = a.includes('--commit'), msgArg = opt('--msg'), allowSecret = (opt('--allow-secret') || '').split(',').map(x => x.trim()).filter(Boolean)
  if (a.some(x => x.startsWith('--') && !['--commit', '--msg', '--allow-secret'].includes(x)) || (commit && msgArg != null)) { console.error('사용법 : precommit-check.mjs [--msg <파일|->] | --commit < 메시지 [--allow-secret 종류,…]'); process.exit(2) }
  let msg = null
  try { msg = commit || msgArg === '-' ? fs.readFileSync(0, 'utf8') : msgArg != null ? fs.readFileSync(msgArg, 'utf8') : null } catch (e) { console.error(`메시지 읽기 실패 : ${e.message}`); process.exit(2) }
  const r = check({ msg, allowSecret })
  if (r.error) { console.error(`git 오류 : ${r.error}`); process.exit(2) }
  for (const k of r.allowed) console.log(`ALLOW secret ${k} (--allow-secret)`)
  if (r.violations.length) { for (const x of r.violations) console.log(`✖ ${x.rule} ${x.file} — ${x.detail}`); process.exit(1) }
  console.log(`✔ precommit-check 통과 — 스테이징 ${r.files.length}건`)
  if (commit) { const c = git(['commit', '-q', '-F', '-'], process.cwd(), msg); process.stdout.write(c.stdout || ''); process.stderr.write(c.stderr || ''); process.exit(c.status === 0 ? 0 : 2) }
}
