/**
 * request-resume : 작업 이력 대시보드의 요청 1건을 # 번호·레코드 id·세션 앞부분으로 찾아 상태(완료·진행 중·중단·대체됨·흡수됨)를 판정하고 재수행 명령을 만든다
 * 기본은 명령만 출력(dry-run), --run 일 때만 요청문을 보여 주고 확인 뒤 Claude Code CLI 실행. 사용법 docs/WORK_HISTORY_RESUME.md
 * 실행 : pnpm work:resume <번호|id|세션앞부분[:턴]> [--mode resume|new] [--print] [--run] [--yes] [--force] [--from ISO시각]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline/promises'
import { spawn } from 'node:child_process'
import { loadRows } from './work-history-stats.mjs'
import { makeRedactor } from './work-history-core.mjs'
import { DEFAULT_FROM, projectRoot, buildTurns, resolveTarget, turnStatus, judgeLiveness, buildCommand, commandText, isInterruptMarker } from './work-history-rows.mjs'

const args = process.argv.slice(2), has = k => args.includes(k), argOf = (k, d) => has(k) ? args[args.indexOf(k) + 1] : d
const target = args.find((a, i) => !a.startsWith('--') && !['--mode', '--from'].includes(args[i - 1]))
if (!target || has('--help')) { console.log('사용 : pnpm work:resume <번호|id|세션앞부분[:턴]> [--mode resume|new] [--print] [--run] [--yes] [--force] [--from ISO시각]'); process.exit(target ? 0 : 2) }
const ROOT = projectRoot()
const LOG_DIR = process.env.WORK_HISTORY_DIR || path.join(ROOT, 'work-history')
const PROJECTS = path.join(os.homedir(), '.claude/projects')
const redact = makeRedactor({ workspaceRoot: ROOT })
const CUT = 600   // 화면 출력 요청문·응답 최대 글자

const turns = buildTurns(loadRows({ root: LOG_DIR }), Date.parse(argOf('--from', DEFAULT_FROM)))
const hit = resolveTarget(turns, target)
if (hit.error) {
  console.error(hit.error)
  for (const t of hit.candidates) console.error(`  ${t.session}:${t.turn}  ${t.ts_req}  ${(t.req_head || '').slice(0, 60)}`)
  process.exit(1)
}
const { turn: t, no } = hit, st = turnStatus(t)

// ── 세션 기록 : 모든 프로젝트 폴더에서 <session_id>.jsonl 찾기(워크트리 세션은 폴더가 다름) ───────────
const sessFile = (() => { try { for (const d of fs.readdirSync(PROJECTS)) { const f = path.join(PROJECTS, d, `${t.session_id}.jsonl`); if (fs.existsSync(f)) return f } } catch { /* 폴더 없음 */ } return null })()
const recs = sessFile ? fs.readFileSync(sessFile, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) : []
const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b?.type === 'text').map(b => b.text).join('\n') : ''
const a = Date.parse(t.ts_req), main = recs.filter(j => !j.isSidechain)
// 중단 표식은 사용자 요청이 아니라 뺀다 — 요청 직전(예 0.3초 앞)에 찍힌 표식을 요청문으로 잡던 문제(a7d862b1:27). 10초 안에서 가장 가까운 메시지
const users = main.filter(j => j.type === 'user' && !j.isMeta && textOf(j.message?.content).trim() && !isInterruptMarker(textOf(j.message.content)))
const near = u => Math.abs(Date.parse(u.timestamp) - a)
const request = users.filter(u => near(u) <= 10e3).sort((x, y) => near(x) - near(y)).map(u => textOf(u.message.content))[0] || t.req_head || ''
const nextUser = users.map(u => Date.parse(u.timestamp)).find(ts => ts > a + 10e3) ?? Infinity
const end = t.ts_res ? Date.parse(t.ts_res) + 1000 : nextUser
const lastText = main.filter(j => j.type === 'assistant' && Date.parse(j.timestamp) >= a && Date.parse(j.timestamp) <= end).map(j => textOf(j.message?.content)).filter(s => s.trim()).at(-1) || ''
const cwd = recs.find(j => j.cwd)?.cwd || ROOT
const laterTurns = turns.filter(x => x.session_id === t.session_id && Date.parse(x.ts_req) > a).length
const live = judgeLiveness({ mtimeMs: sessFile ? fs.statSync(sessFile).mtimeMs : null, laterTurns })

// ── 판정 출력 ───────────────────────────────────────────────────────────────
const kst = s => s ? new Date(s).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }) : '-'
const cut = s => { s = redact(s).trim(); return s.length > CUT ? s.slice(0, CUT) + '…' : s || '-' }
console.log(`# ${no}  ${t.session_id}:${t.turn}  [${st.label}]`)
console.log(`시작 ${kst(t.ts_req)} · 종료 ${t.ts_res ? kst(t.ts_res) : '기록 없음'}`)
console.log(`세션 ${t.session_id} · 작업 폴더 ${redact(cwd)}${fs.existsSync(cwd) ? '' : ' (없음 — 워크트리 삭제 추정)'}`)
console.log(`세션 상태 ${live.text}`)
if (st.key === 'noreply') console.log(`응답 없음 = ${t.absorbed ? '작업 도중 끼어든 다음 메시지에 흡수되고 응답 문장 없이 끝남 → 다음 요청 행에서 결과 확인' : '세션이 턴 도중 끝남(incomplete)'}`)
console.log(`\n[요청문]\n${cut(request)}\n\n[마지막 응답]\n${cut(lastText)}\n`)

if (!st.resumable && !has('--force')) { console.log('완료됨 — 이어서 할 일은 새 요청으로 하세요 (그래도 다시 실행하려면 --force)'); process.exit(0) }

// ── 재수행 명령 ─────────────────────────────────────────────────────────────
const canResume = !!sessFile && fs.existsSync(cwd)
const mode = argOf('--mode', canResume ? 'resume' : 'new')
if (mode !== 'resume' && mode !== 'new') { console.error('--mode 는 resume 또는 new'); process.exit(2) }
if (mode === 'resume' && !canResume) { console.error('같은 세션 이어가기 불가(세션 기록 또는 작업 폴더 없음) — --mode new 사용'); process.exit(1) }
const cmd = buildCommand({ turn: t, mode, cwd: mode === 'resume' ? cwd : ROOT, live: live.live, print: has('--print'), request })
const shown = { ...cmd, args: cmd.args.map((x, i) => i === cmd.args.length - 1 ? redact(x) : x) }   // 화면에는 마스킹한 요청문, 실행은 원문
console.log(`[재수행 명령 — ${mode === 'resume' ? '같은 세션 이어가기' : '새 세션 재실행'}${live.live && mode === 'resume' ? ' · 세션이 살아 있을 수 있어 --fork-session 으로 분기' : ''}]`)
console.log(commandText(shown))
if (!has('--run')) { console.log('\n(dry-run — 실행하려면 --run 추가)'); process.exit(0) }

if (!has('--yes')) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ok = /^y(es)?$/i.test((await rl.question('위 요청을 재수행할까요? (y/N) ')).trim()); rl.close()
  if (!ok) { console.log('취소'); process.exit(0) }
}
spawn(cmd.file, cmd.args, { cwd: cmd.cwd, stdio: 'inherit' }).on('exit', c => process.exit(c ?? 1)).on('error', e => { console.error(`claude 실행 실패 : ${e.message}`); process.exit(1) })
