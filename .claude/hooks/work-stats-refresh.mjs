// 작업 이력이 쌓일 때마다 통계(work-statistics/)와 내 작업 변경이력(work-statistics/mywork/)을 다시 만드는 Stop 훅 후행 명령
// 실행: settings.json Stop 훅에서 `node work-history-logger.mjs && node work-stats-refresh.mjs` 를 동기로 묶어 호출(로거가 jsonl을 쓴 뒤 실행 보장, SessionEnd 로거와 직렬화) — 본체는 분리 프로세스라 훅은 0.2초에 반환, 수동 즉시 실행 `node .claude/hooks/work-stats-refresh.mjs --now`
// 실패해도 응답을 막지 않음 : 오류는 %TEMP%/work-stats-refresh.err 에만 기록하고 항상 exit 0
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
// 훅으로 호출되면 자신을 분리 프로세스(--now)로 다시 띄우고 즉시 종료 : headless(-p) 세션 종료 시 async 훅 자식이 정리돼 갱신이 누락되던 문제(2026-10-09 검증) 방지
if (!process.argv.includes('--now')) {
  spawn(process.execPath, [fileURLToPath(import.meta.url), '--now'], { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true }).unref()
  process.exit(0)
}

const JOBS = [
  ['scripts/work-history-report.mjs', '--period', 'all'],   // 일·주·월·년 통계 + main-dashboard HTML (실측 약 0.8초)
  ['scripts/model-change-dashboard.mjs'],                   // mywork : 요청별 모델·effort 변경이력 (약 0.4초)
  ['scripts/my-claude-model-dashboard.mjs'],                // mywork : 모델 운용 현황 (약 0.6초)
]

for (const [script, ...args] of JOBS) {
  const r = spawnSync(process.execPath, [path.join(ROOT, script), ...args], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 })
  if (r.status !== 0) fs.appendFileSync(path.join(os.tmpdir(), 'work-stats-refresh.err'), `${new Date().toISOString()} ${script} exit=${r.status} ${(r.stderr || r.error?.message || '').slice(0, 500)}\n`)
}
