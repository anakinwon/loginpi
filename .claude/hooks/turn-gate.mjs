// Stop 훅 : 종료 승인 줄 기록기(비차단) — 2026-11-10 마스터 '턴 끝 차단 제거, 종료 승인 줄은 기록만'
//   메인 응답 끝 '종료 승인 : <승인|보류> — <근거>' 줄을 .omc/state/codex-gate/approvals.jsonl 에 한 줄 적는다. 판정·차단·stdout 출력 없음, 항상 종료 0
// 실행 : 루트 .claude/settings.json Stop 등록 그대로(수 ms) · 시험 : node .claude/hooks/turn-gate.mjs --selftest + node --test test/turn-gate.test.mjs(spawn 비차단)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
// 생성기가 깨진 구간에도 훅은 종료 0 — 동적 import 실패 시 기록만 건너뜀
let approvalOf = null
try { ({ approvalOf } = await import('../../scripts/request-graph.mjs')) } catch {}
const LOG = () => path.resolve(process.env.CODEX_GATE_STATE || path.join(ROOT, '.omc', 'state'), 'codex-gate', 'approvals.jsonl')

/** 승인 줄이 있으면 { sid, at, kind, why } 한 줄 append 후 반환, 없으면 null */
export function record(input, now = Date.now()) {
  const a = approvalOf?.(input?.last_assistant_message)
  if (!a) return null
  const row = { sid: input?.session_id || '', at: new Date(now).toISOString(), kind: a.kind, why: a.why }
  fs.mkdirSync(path.dirname(LOG()), { recursive: true })
  fs.appendFileSync(LOG(), JSON.stringify(row) + '\n')
  return row
}

function selftest() {
  const assert = (c, m) => { if (!c) { console.error('selftest FAIL :', m); process.exit(1) } }
  const os = process.env.TEMP || process.env.TMPDIR || '/tmp'
  const dir = fs.mkdtempSync(path.join(os, 'turn-gate-'))
  process.env.CODEX_GATE_STATE = dir
  const lines = () => fs.existsSync(LOG()) ? fs.readFileSync(LOG(), 'utf8').split('\n').filter(Boolean).length : 0
  const r = record({ session_id: 's1', last_assistant_message: '끝\n종료 승인 : 승인 — 시험 통과' })
  assert(r && r.kind === '승인' && r.why === '시험 통과' && lines() === 1, '승인 줄 기록')
  assert(record({ last_assistant_message: '종료 승인 : 보류 — 실기기' })?.kind === '보류' && lines() === 2, '보류 줄')
  for (const x of [{ last_assistant_message: '승인 줄 없음' }, null, {}]) record(x)
  assert(lines() === 2, '줄 없음·빈 입력 = +0')
  // 패턴 자신이 걸리지 않게 조립 — 차단 출력 키·묶음 판정 옵션·자식 프로세스 모듈 문자열 0건(spawn 시험은 test/turn-gate.test.mjs)
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8'), bad = ['decis' + 'ion', '--bun' + 'dle', 'child_' + 'process']
  assert(bad.every(b => !src.includes(b)), '소스에 차단·판정·자식 프로세스 흔적 0건')
  fs.rmSync(dir, { recursive: true, force: true })
  console.log('selftest ok')
}

if (process.argv.includes('--selftest')) selftest()
else {
  let raw = ''
  try { raw = fs.readFileSync(0, 'utf8') } catch {}
  try { if (!process.env.CODEX_GATE_ACTIVE) record(JSON.parse(raw)) } catch {}
  process.exit(0)
}
