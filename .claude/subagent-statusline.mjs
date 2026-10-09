// 에이전트 패널 행마다 "[단계] 에이전트 · 모델 · effort · 경과"를 표시하고, 진행 중 단계를 <session_id>.phase.json 에 써서 statusline.sh 의 ▶ 표시에 넘기는 subagentStatusLine 명령
// 실행: .claude/settings.json "subagentStatusLine": { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/subagent-statusline.mjs\"" } ; 자체 점검 `node .claude/subagent-statusline.mjs --selftest`
// 계약: stdin { session_id, tasks[]{ id, agentType, status, startTime, model, effort } } → stdout 행마다 {"id","content"} JSON 한 줄 (code.claude.com/docs/en/statusline "Subagent status lines", 2026-10-09 확인)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const PHASE = { 'anakin_phase-collect': '수집', 'anakin_phase-decide': '결론', 'anakin_phase-verify': '검증', 'anakin_phase-review': '검수', 'anakin_phase-commit': '커밋', 'teamanakin-admin': '승인' }
const STATE_DIR = path.join(process.env.TEMP || os.tmpdir(), 'claude-statusline-skills')   // statusline.sh 의 $sdir 와 같은 폴더

/** 'claude-opus-5-5' → 'Opus 5.5', 'claude-haiku-4-5-20251001' → 'Haiku 4.5', 별칭(opus·sonnet)·미상 값은 그대로 */
export function modelLabel(id) {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(String(id ?? ''))
  if (!m) return id || '-'
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? '.' + m[3] : ''}`
}

const elapsed = start => { const s = Math.max(0, Math.round((Date.now() - new Date(start).getTime()) / 1000)); return Number.isFinite(s) ? (s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`) : '' }

/** 입력 JSON → { rows: 패널 행 덮어쓰기, running: phase.json 내용 } */
export function render(input) {
  const tasks = Array.isArray(input?.tasks) ? input.tasks : []
  const rows = [], running = []
  for (const t of tasks) {
    const phase = PHASE[t.agentType]
    if (!phase) continue                                                    // 팀 밖 에이전트는 기본 렌더링 유지
    const model = modelLabel(t.model), effort = t.effort || null
    rows.push({ id: t.id, content: [`[${phase}] ${t.agentType}`, model, effort, elapsed(t.startTime)].filter(Boolean).join(' · ') })
    if (t.status === 'running') running.push({ phase, agent: t.agentType, model, effort })
  }
  return { rows, running }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain && process.argv[2] === '--selftest') {
  const { default: assert } = await import('node:assert/strict')
  assert.equal(modelLabel('claude-opus-5-5'), 'Opus 5.5')
  assert.equal(modelLabel('claude-fable-5-1'), 'Fable 5.1')
  assert.equal(modelLabel('claude-haiku-4-5-20251001'), 'Haiku 4.5')
  assert.equal(modelLabel('claude-opus-5'), 'Opus 5')
  assert.equal(modelLabel('sonnet'), 'sonnet')
  const r = render({ tasks: [{ id: 'a1', agentType: 'anakin_phase-decide', status: 'running', model: 'claude-fable-5-1', effort: 'high', startTime: Date.now() }, { id: 'b2', agentType: 'Explore', status: 'running' }] })
  assert.equal(r.rows.length, 1); assert.match(r.rows[0].content, /^\[결론\] anakin_phase-decide · Fable 5\.1 · high/)
  assert.equal(JSON.stringify(r.running), '[{"phase":"결론","agent":"anakin_phase-decide","model":"Fable 5.1","effort":"high"}]')   // statusline.sh jq 없을 때 grep 폴백이 이 키 순서·무공백에 의존
  console.log('selftest ok')
} else if (isMain) {
  let raw = ''; for await (const c of process.stdin) raw += c
  let input; try { input = JSON.parse(raw) } catch { process.exit(0) }      // 입력 이상 시 침묵 : 기본 렌더링 유지
  const { rows, running } = render(input)
  if (input.session_id) { try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(path.join(STATE_DIR, `${input.session_id}.phase.json`), JSON.stringify({ running })) } catch {} }
  for (const r of rows) process.stdout.write(JSON.stringify(r) + '\n')
}
