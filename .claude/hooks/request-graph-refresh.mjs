// 서브에이전트 시작·종료(SubagentStart·SubagentStop) 때 요청 그래프 실데이터판(work-statistics/mywork/myRequestGraph.html)을 턴 중간에 다시 만드는 훅
// 실행 : settings.json SubagentStart·SubagentStop 에 등록 — 생성기를 분리 프로세스(--delay 800 : 세션 기록 마지막 줄 기록 대기)로 띄우고 즉시 종료
// 2초 안 중복 실행은 잠금 파일(%TEMP%/request-graph-refresh.lock) 시각으로 억제, 실패는 무시하고 항상 exit 0 (Stop 훅 갱신이 턴 끝 상태를 보정)
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const LOCK = path.join(os.tmpdir(), 'request-graph-refresh.lock')
const THROTTLE_MS = 2000

try {
  let recent = false
  try { recent = Date.now() - fs.statSync(LOCK).mtimeMs < THROTTLE_MS } catch { /* 잠금 없음 = 첫 실행 */ }
  if (!recent) {
    fs.writeFileSync(LOCK, String(process.pid))
    spawn(process.execPath, [path.join(ROOT, 'scripts/request-graph.mjs'), '--quiet', '--delay', '800', '--trigger', 'subagent'], { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true }).unref()
  }
} catch { /* 갱신 실패는 응답을 막지 않음 */ }
// 훅 입력(stdin)을 비우고 종료 — 입력이 늦어도 0.3초 안에 반환
process.stdin.on('data', () => {}).on('end', () => process.exit(0)).on('error', () => process.exit(0))
setTimeout(() => process.exit(0), 300)
