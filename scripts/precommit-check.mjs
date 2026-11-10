// 커밋 전 결정적 검사(2026-11-10 개정 — 커밋 칸 Codex 판정 대신) : 스테이징 파일의 금지 경로·크기·추가 줄 비밀 패턴 + 커밋 메시지 끝 Co-Authored-By 줄
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
}

const git = (args, cwd, input) => spawnSync('git', args, { cwd, input, encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 2 ** 20 })

/** 메시지 마지막 줄(빈 줄·# 주석 제외)이 Co-Authored-By 형식인지 */
export const coAuthorOk = msg => C.coAuthor.test(String(msg).replace(/\r/g, '').split('\n').filter(l => l.trim() && !l.startsWith('#')).at(-1) || '')

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
