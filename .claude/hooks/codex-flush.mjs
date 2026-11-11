// PostToolUse·UserPromptSubmit 얇은 진입(2026-11-11 P1) : 쌓인 Codex 판정 결과(pending *.json)가 있을 때만 codex-gate.mjs 를 불러 `--flush` 와 바이트 같은 출력
//   없으면 무거운 import(codex-verify 등) 없이 종료 0. 훅 프로세스(CODEX_GATE_ACTIVE)·서브에이전트 안 호출(입력 agent_id) = 침묵. 실행 : node .claude/hooks/codex-flush.mjs < 훅 입력
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
try {
  let raw = ''; for await (const c of process.stdin) raw += c
  let input = {}; try { input = JSON.parse(raw) } catch { /* 깨진 입력 = 빈 입력(codex-gate readStdin 과 같음) */ }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const pending = path.join(path.resolve(process.env.CODEX_GATE_STATE || path.join(root, '.omc', 'state')), 'codex-gate', 'pending')   // codex-gate stateOf().pending 과 같은 계산(import 하지 않음)
  if (!process.env.CODEX_GATE_ACTIVE && !input.agent_id && fs.readdirSync(pending).some(f => f.endsWith('.json'))) { const o = (await import('./codex-gate.mjs')).flushOut(input); if (o) process.stdout.write(o) }
} catch { /* pending 폴더 없음·실패 = 침묵(세션 안 막음) */ }
process.exit(0)
