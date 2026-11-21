// 작업 이력이 쌓일 때마다 통계(work-statistics/)와 내 작업 변경이력(work-statistics/mywork/)을 다시 만드는 Stop 훅 후행 명령
// 실행: settings.json Stop 훅에서 `node work-history-logger.mjs && node work-stats-refresh.mjs` 를 동기로 묶어 호출(로거가 jsonl을 쓴 뒤 실행 보장, SessionEnd 로거와 직렬화) — 본체는 분리 프로세스라 훅은 0.2초에 반환, 수동 즉시 실행 `node .claude/hooks/work-stats-refresh.mjs --now`
// 실패해도 응답을 막지 않음 : 오류는 %TEMP%/work-stats-refresh.err 에만 기록하고 항상 exit 0
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
// 훅으로 호출되면 자신을 분리 프로세스(--now)로 다시 띄우고 즉시 종료 : headless(-p) 세션 종료 시 async 훅 자식이 정리돼 갱신이 누락되던 문제(2026-10-09 검증) 방지
if (!process.argv.includes('--now')) {
  // stdin 은 앞 명령(로거)이 다 읽음 — 로거가 남긴 마지막 Stop 입력을 넘김
  let input = ''
  try { input = fs.readFileSync(path.join(process.env.WORK_HISTORY_STATE_DIR || path.join(ROOT, '.omc', 'state', 'work-history'), 'last-stop.json'), 'utf8') } catch {}
  spawn(process.execPath, [fileURLToPath(import.meta.url), '--now', '--stop'], { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, WSR_HOOK_INPUT: input, WSR_HOOK_AT: String(Date.now()) } }).unref()
  process.exit(0)
}

// 한 턴 늦음 결함(2026-11-22) : Stop 훅 시점엔 마지막 응답 글이 transcript 에 아직 없어 로거가 그 턴을 못 쓰고 다음 턴 Stop 때 씀
// → 그래프가 방금 끝난 턴을 '진행'으로 남김. 분리 프로세스에서 Stop 훅 뒤 기록되는 system.turn_duration 을 기다렸다가 로거를 한 번 더 돌린다
async function settleTurn() {
  let input
  try { input = JSON.parse(process.env.WSR_HOOK_INPUT || '{}') } catch { return }
  const tp = input.transcript_path, since = +process.env.WSR_HOOK_AT - 5_000
  if (input.hook_event_name !== 'Stop' || !tp || !fs.existsSync(tp)) return
  const done = () => {
    const fd = fs.openSync(tp, 'r'), size = fs.fstatSync(fd).size, n = Math.min(size, 65_536), buf = Buffer.alloc(n)
    fs.readSync(fd, buf, 0, n, size - n); fs.closeSync(fd)
    return buf.toString('utf8').split('\n').some(l => {
      if (!l.includes('"turn_duration"')) return false
      try { return Date.parse(JSON.parse(l).timestamp) >= since } catch { return false }
    })
  }
  for (let i = 0; i < 60 && !done(); i++) await sleep(500)   // 최대 30초 대기
  spawnSync(process.execPath, [path.join(ROOT, '.claude/hooks/work-history-logger.mjs')], { cwd: ROOT, input: process.env.WSR_HOOK_INPUT, timeout: 60_000 })
}
if (process.argv.includes('--stop')) await settleTurn()

// 작업별 시간제한(ms) : request-graph 실측 약 90초인데 60초 고정 제한이라 ETIMEDOUT 64건(2026-11-09~11-12, %TEMP%/work-stats-refresh.err) → 그래프 300초 · 나머지 120초
// 겹쳐 실행(Stop 이 90초 안에 또 옴)은 request-graph.mjs 자체 잠금(runOnce : .omc/state/request-graph/run.lock + run.dirty 재실행 예약)이 처리 — 이 훅엔 잠금 없음
const TIMEOUT_MS = { 'scripts/request-graph.mjs': 300_000, default: 120_000 }

const JOBS = [
  ['scripts/work-history-report.mjs', '--period', 'all'],   // 일·주·월·년 통계 + main-dashboard HTML (실측 약 0.8초)
  ['scripts/model-change-dashboard.mjs'],                   // mywork : 요청별 모델·effort 변경이력 (약 0.4초)
  ['scripts/my-claude-model-dashboard.mjs'],                // mywork : 모델 운용 현황 (약 0.6초)
  ['scripts/request-graph.mjs', '--md', '--quiet', '--trigger', process.argv.includes('--stop') ? 'stop' : 'manual'],   // mywork : 요청 처리 흐름 그래프 실데이터판 + 요청별 md(.claude/engineering/50. graph/requests/, gitignore), 실행 기록 트리거 = 훅 경유 stop · 직접 --now 는 manual
]

for (const [script, ...args] of JOBS) {
  const r = spawnSync(process.execPath, [path.join(ROOT, script), ...args], { cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT_MS[script] ?? TIMEOUT_MS.default })
  if (r.status !== 0) fs.appendFileSync(path.join(os.tmpdir(), 'work-stats-refresh.err'), `${new Date().toISOString()} ${script} exit=${r.status} ${(r.stderr || r.error?.message || '').slice(0, 500)}\n`)
}
