/**
 * request-graph.mjs : 요청 처리 흐름 그래프(마스터 설계 트리 1 ~ 1.2) + 실요청 모니터링 HTML·Obsidian md 노드 생성기 (2026-11-08 마스터 지시)
 * 원천 : work-history jsonl 턴·agent 레코드(loadRows·buildTurns) + Codex 루프 원장 .omc/state/loop/<id>/ledger.json + 턴 중간 = 세션 기록(~/.claude/projects/<프로젝트>/) 꼬리 스캔
 * 실행 : node scripts/request-graph.mjs [--out html] [--days 7] [--md [dir]] [--delay ms] | --design-only [--out html] [--md [dir]]  (실데이터판 = Stop·SubagentStart/Stop 훅 자동 갱신)
 *   [--trigger stop|subagent|manual] : 실행마다 .omc/state/request-graph/runs.jsonl 에 {ts, trigger, mode, md} append(기본 manual, 훅이 넘김) — 1.1.5.2 판정 원천
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRows } from './work-history-stats.mjs'
import { CATEGORIES, makeRedactor } from './work-history-core.mjs'
import { buildTurns, turnStatus, projectRoot } from './work-history-rows.mjs'

const ROOT = projectRoot()
const ENG = path.join(ROOT, '.claude/engineering')                 // Obsidian 볼트 루트 — md 링크는 파일명 기준 [[이름]]
const PATHS = {
  live: 'work-statistics/mywork/myRequestGraph.html',                // 실데이터판(gitignore)
  design: '.claude/engineering/50. graph/myRequestGraph.html',       // 설계도판(커밋 대상 — 요청문·비용 없음)
  flowMd: '.claude/engineering/50. graph/request-flow',              // 설계 슬롯 md(커밋 대상)
  reqMd: '.claude/engineering/50. graph/requests',                   // 요청별 md(실데이터 — gitignore)
  loops: '.omc/state/loop',
  runs: '.omc/state/request-graph/runs.jsonl',                      // 생성기 실행 기록(append-only, gitignore) — 1.1.5.2 판정 원천
  roundsCache: '.omc/state/request-graph/rounds-cache.json',         // 팀원 에이전트 회차 캐시(agent_id → 기록 크기·mtime·회차, gitignore)
}
const RUN_TRIGGERS = ['stop', 'subagent', 'manual']
// ponytail: Stop 훅 실행은 응답 직후(로거·통계 다음)라 턴 창 끝 뒤에 찍힌다 → 창 끝 60초 유예. 그 사이 다음 턴이 시작되면 그 턴 실행도 앞 턴에 잡힐 수 있음(세션 구분 필드 추가 시 해소)
const RUN_GRACE_MS = 60e3
/**
 * 상태 색(2026-11-08 마스터 : 완료 = 연초록, 진행 = 형광 노랑 + 깜빡임, 주황 = 미수행 점선만)
 * color = 테두리·띠·점, fill = 카드·원 채움, text = 상태 글자(채움 또는 바탕 위 대비 AA 4.5:1 이상 — 시험 test/request-graph.test.mjs), ink = 카드 본문 글자 고정색, dark = 다크 모드 덮어쓰기
 */
export const STATUS_STYLE = {
  done: { label: '완료', color: '#3fa66b', fill: '#dcf5e3', text: '#1e6b40', dark: { color: '#5cc98a', fill: '#1f3d2b', text: '#7fdca4' } },
  // 완료(추정) = 시각 없는 훅 기록만 있는 슬롯(2026-11-09 결함 ③) : 완료와 같은 연초록 채움 + 점선 테두리
  estimated: { label: '완료(추정)', color: '#3fa66b', fill: '#dcf5e3', text: '#1e6b40', dash: true, dark: { color: '#5cc98a', fill: '#1f3d2b', text: '#7fdca4' } },
  running: { label: '진행', color: '#c9b800', fill: '#fff200', text: '#1a1a1a', ink: '#1a1a1a', pulse: true },
  error: { label: '오류', color: '#d03b3b', text: '#b42f2f', dark: { text: '#f0705c' } },
  blocked: { label: 'BLOCKED', color: '#8a5cc2', text: '#7446ad', dark: { text: '#b993e6' } },
  missing: { label: '미수행', color: '#eb6834', text: '#a8461a', dash: true, dark: { text: '#f08a5d' } },
  unassigned: { label: '미배정(설계)', color: '#898781', text: '#5f5e5a', dark: { text: '#b0afa9' } },
  notrun: { label: '미실행', color: '#c3c2b7', text: '#5f5e5a', dark: { text: '#a9a8a2' } },
}
export const PAGE_BG = { light: '#fcfcfb', dark: '#1a1a19' }      // 카드 바탕(--surface) — 대비 시험 기준
// 트리 : 노드 폭·열 간격·줄 높이(px, viewBox 단위), 화면 맞춤 배율 하한(글자 약 9px 유지)·상한 / 자유 배치 : 반발력·링크 길이·중심 인력 / 자동 새로고침 간격
const SIZE = { termW: 96, termH: 32, boxW: 158, colGap: 26, lineH: 15, tmH: 13, padY: 6, gapY: 8, minScale: 0.72, maxScale: 1.4, forceMinScale: 0.45, repel: 9000, link: 120, gravity: 0.003, reloadRun: 5000, reloadIdle: 30000, pageSize: 50, days: 7, mdRecent: 30, headCut: 80 }
export const FLOW_COLOR = { done: '#3fa66b', running: '#c9b800', planned: '#898781', example: '#898781', design: '#2a78d6' }   // 실행 경로 화살표·화살촉 색(완료 연초록 · 진행 형광 노랑 테두리색 · 대기·예시 회색 · 설계도 파랑)
export const LOOP_CAP = 5                                            // 루트 CLAUDE.md 작업 수행 원칙 ④ 안전 상한 5회(2026-11-08 마스터 10→5)
/**
 * 경보 규칙(2026-11-09 그래프 분석 결함 ①②) : 실행 노드 한 회차 소요 ≥ longMs = '장시간', 도구 오류 ≥ errors = '오류 다발'
 *   작업 묶음 누적 회차 ≥ nearCap = '상한 근접', ≥ cap = '상한 도달'(빨강 테두리 배지)
 */
export const ALERT = { longMs: 30 * 60e3, errors: 5, nearCap: LOOP_CAP - 1, cap: LOOP_CAP }
const LIVE = { windowMs: 10 * 60e3, tailBytes: 4 * 2 ** 20 }        // 턴 중간 스캔 : 최근 10분 안에 바뀐 세션 기록만, 파일 끝 4MB 만 읽음
const TURN_NODE = { done: 'done', running: 'running', interrupted: 'error', noreply: 'error', superseded: 'notrun' }   // turnStatus 키 → 노드 상태
const VERDICT_NODE = { PASS: 'done', FAIL: 'error', BLOCKED: 'blocked' }
const ADMIN_TYPE = 'teamanakin-admin'                                // 1.2 승인 슬롯의 실행 근거
const EST_BADGE = '시간 기준 연결(추정)'
export const ENG_SLOTS = ['1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5']   // 표준 처리 엔지니어링 5단계(10 프롬프트 · 20 컨텍스트 · 30 하네스 · 40 루프 · 50 그래프)

/**
 * 기본 SLOT_MAP(제안 — 2026-11-08) : 슬롯 id → { agents: agent 레코드 type, hooks: 훅 이벤트명, loops: true(턴 시간창 안 Codex 루프, 추정) | [루프 id] }
 * 엔지니어링 슬롯(ENG_SLOTS)은 대응 기록이 하나도 없으면 '미수행'(표준 처리 누락 표시). 항목 없는 슬롯은 '미배정(설계)'
 */
export const SLOT_MAP = {
  // 근거 30. harnes/anakins_harnes.md 27행 "요청마다 지침 주입 | UserPromptSubmit | model-advisor(단계별 모델 계획)" · 20. context 30행 L1 "UserPromptSubmit model-advisor 단계 계획"
  // 에이전트 대응은 [확인중 : 마스터] — 지시문 설계는 아소카(메인) 몫(10. prompt 0절)이라 기록되는 서브에이전트가 없음
  '1.1.1': { hooks: ['UserPromptSubmit'] },
  // 마스터 확정 2026-11-08 "컨텍스트 분석의 담당 : collect 에 맡김" (참고 10. prompt/anakins_prompt.md 84행 "수집 — 대량 읽기·검색·집계 | anakin_phase-collect")
  '1.1.2': { agents: ['anakin_phase-collect'] },
  // 근거 30. harnes 26행 "작성 직후 경고 | PostToolUse | build-defect-guard" · 28행 "서브에이전트 시작 시 주입 | SubagentStart" · settings.json PreToolUse 가드 4종 — 에이전트 대응 [확인중 : 마스터]
  '1.1.3': { hooks: ['PreToolUse', 'PostToolUse', 'SubagentStart'] },
  // 근거 40. loop/anakins_loop.md 43~46행 역할표 "build 산출·수정 / verify 증거·래퍼 실호출·독립 판정 / Codex 외부 판정자 / decide escalate 때 설계 재검토"
  '1.1.4': { agents: ['anakin_phase-build', 'anakin_phase-verify', 'anakin_phase-decide'], loops: true },
  '1.1.4.1': { loops: true },   // 근거 40. loop 45행 "Codex | 외부 판정자(codex exec -s read-only)" — 원장 .omc/state/loop 를 턴 시간창으로 연결(추정)
  // 마스터 확정 2026-11-08 "그래프 분석의 담당 서브에이전트 추가" → anakin_phase-graph 신설(.claude/agents/teamAnakin/anakin_phase-graph.md, 산출 턴의 검증 뒤·승인 앞)
  '1.1.5': { agents: ['anakin_phase-graph'] },
  // 마스터 확정 2026-11-09 "1.1.5.2 담당은 아소카" — 실행 주체는 생성기(Stop 훅 work-stats-refresh · SubagentStart/Stop 훅 request-graph-refresh · 수동)라
  //   work-history 훅 기록(이벤트명뿐)으로는 구분 불가 → 생성기가 실행마다 남기는 runs.jsonl(PATHS.runs)로 판정 : 창 안 live 실행 있음 = 완료 · 없음 = 미수행 · 로그 첫 기록 이전 턴 = 기록 이전
  '1.1.5.2': { owner: '아소카(메인)', source: 'runs.jsonl' },
}

const CODEX = { role: '외부 판정자(Codex, read-only)가 상위 분석 결과를 교차 검수', criteria: 'verdict : 모든 기준 met 이고 open·regressed 결함 0 → PASS / 기준 unmet 또는 결함 있음 → FAIL / 입력 결손 등 판정 불가 → BLOCKED', docs: ['40. loop/codex_procedure.md', '60. nodes/codex-judge.md'] }
/** 마스터 설계 트리. 원문의 '1.1.5.3.1 Codex6'(현 CDX-총괄 검수)은 번호 오기로 보고 1.1.5.2.1 로 정규화 · 라벨 단축 2026-11-09 마스터 지시(서브에이전트N → SA-, CodexN → CDX-) */
export const SLOTS = [
  { id: '1', parent: null, kind: 'request', label: '마스터 아나킨 요청', role: '요청·needs-input 응답·최종 승인 주체(사람)', criteria: '요청 원문이 정본 — 목표·범위·완료 기준은 아소카가 계약으로 확정', docs: ['60. nodes/마스터.md'] },
  { id: '1.1', parent: '1', kind: 'main', label: '파다완 아소카 접수', role: '요청 접수 → 목표·범위·완료 기준 확정 → 단계 계획대로 전문가 서브에이전트 지명(메인 직접 작업 금지)', criteria: '운영 규칙 0절 — 메인 = 정리·리뷰·승인·회신', docs: ['60. nodes/아소카.md', '10. prompt/anakins_prompt.md'] },
  { id: '1.1.1', parent: '1.1', kind: 'sub', label: 'SA-프롬프트', role: '지시문 한 건의 설계 점검 — 목표·제약·출력 계약', criteria: '10장 지시문 설계 규칙', docs: ['10. prompt/anakins_prompt.md'] },
  { id: '1.1.1.1', parent: '1.1.1', kind: 'codex', label: 'CDX-프롬프트 검수', ...CODEX },
  { id: '1.1.2', parent: '1.1', kind: 'sub', label: 'SA-컨텍스트', role: '한 턴에 보는 토큰 전체 점검 — 넣을 것·뺄 것·남길 곳', criteria: '20장 컨텍스트 규칙', docs: ['20. context/anakins_context.md'] },
  { id: '1.1.2.1', parent: '1.1.2', kind: 'codex', label: 'CDX-컨텍스트 검수', ...CODEX },
  { id: '1.1.3', parent: '1.1', kind: 'sub', label: 'SA-하네스', role: '모델 바깥 강제 장치 점검 — 훅·권한·에이전트 정의·격리·관측', criteria: '30장 하네스 규칙', docs: ['30. harnes/anakins_harnes.md'] },
  { id: '1.1.3.1', parent: '1.1.3', kind: 'codex', label: 'CDX-하네스 검수', ...CODEX },
  { id: '1.1.4', parent: '1.1', kind: 'sub', label: 'SA-루프', role: '되돌아가는 엣지 점검 — build → verify → Codex → 회송 → 승인', criteria: '40장 A절 완료 기준 · C절 금지와 멈춤', docs: ['40. loop/anakins_loop.md', '40. loop/codex_procedure.md'] },
  { id: '1.1.4.1', parent: '1.1.4', kind: 'codex', label: 'CDX-루프 검수', ...CODEX },
  { id: '1.1.5', parent: '1.1', kind: 'sub', label: 'SA-그래프', role: '노드·엣지·파일 계약으로 작업 흐름 전체 점검 — 병렬·직렬·합류', criteria: '50장 A절 그래프 설계 체크리스트 10', docs: ['50. graph/anakins_graph.md'] },
  { id: '1.1.5.1', parent: '1.1.5', kind: 'codex', label: 'CDX-그래프 검수', ...CODEX },
  { id: '1.1.5.2', parent: '1.1.5', kind: 'sub', label: '서브에이전트6 : 요청건을 obsidian 그래프로 생성해 가시적으로 모니터링', role: '요청건을 그래프 페이지·Obsidian md 노드로 생성해 모니터링(scripts/request-graph.mjs)', criteria: '50장 그래프 규칙 — 기록에 있는 사실만 표시, 추정 연결은 배지로 구분', docs: ['50. graph/anakins_graph.md'] },
  { id: '1.1.5.2.1', parent: '1.1.5.2', kind: 'codex', label: 'CDX-총괄 검수', ...CODEX },
  { id: '1.2', parent: '1', kind: 'approve', label: '파다완 아소카 승인', role: '팀장(teamanakin-admin) 판정을 받아 최종 등급 확정·마스터 보고(하향만)', criteria: '팀원이 1명이라도 실행된 턴은 팀장 승인 생략 불가(조회·커밋 단독 턴 제외)', docs: ['60. nodes/아소카.md', '60. nodes/teamanakin-admin.md'] },
]

// ── 순수 함수(시험 대상 — fmtSpan·roundSummary 는 화면 스크립트에도 원문 그대로 인라인되므로 바깥 이름 참조 금지) ──
const sty = k => ({ status: k, statusLabel: STATUS_STYLE[k].label })
/** 엔지니어링 배지 글자 : 'N/5' + 추정 슬롯 수(결함 ③ — 확정·추정 구분) */
export const engTxt = (n, est) => `${n}/5${est ? ` (추정 ${est})` : ''}`
const ms = v => { const t = Date.parse(v); return Number.isNaN(t) ? null : t }

/** 노드 시간 쌍 → 글자. full : '시작 MM-DD HH:mm:ss ~ 종료 HH:mm:ss (소요 Xm Ys)', short(트리 카드) : 'HH:mm:ss~HH:mm:ss · XmYs'. 진행 중 = 종료 칸 '진행 중' + now 까지 경과, 값 없음 = '—' */
export function fmtSpan(n, now, short) {
  if (n.tmNote && n.t0 == null) return n.tmNote   // 완료(추정) 슬롯 : 시각 대신 사유
  const kst = v => new Date(v).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })
  const a = n.t0 != null ? kst(n.t0) : null, b = n.t1 != null ? kst(n.t1) : null
  const end = n.run ? '진행 중' : b ? (short || (a && a.slice(0, 10) === b.slice(0, 10)) ? b.slice(11) : b.slice(5)) : '—'
  const s = a && (n.run || b) ? Math.max(0, Math.round(((n.run ? now : n.t1) - n.t0) / 1000)) : null
  const d = s == null ? '' : Math.floor(s / 60) + 'm' + (short ? '' : ' ') + (s % 60) + 's'
  return short ? (a ? a.slice(11) : '—') + '~' + end + (d ? ' · ' + d : '') : '시작 ' + (a ? a.slice(5) : '—') + ' ~ 종료 ' + end + (d ? ' (소요 ' + d + ')' : '')
}
/** 회차 행 → { n(회차 수, BLOCKED 제외 — 회차 번호를 소모하지 않음), totalMs(진행 중은 now 까지) } */
export function roundSummary(rows, now) {
  let n = 0, totalMs = 0
  for (const r of rows) { if (!r.blocked) n++; if (r.t0 != null && (r.run || r.t1 != null)) totalMs += (r.run ? now : r.t1) - r.t0 }
  return { n, totalMs }
}
/**
 * Codex 루프 원장 → 턴 시간창 [a, b] 안의 회차 행(시간순). 원장 iters[]·blocked[] 에는 판정 기록 시각 at 만 있다(codex-verify.mjs 1356행 const at = new Date() — 판정 직후)
 * → 회차 시작 = 직전 판정 at, 첫 회차는 ledger.startedAt(--init 시각). ledger.lock 이 있으면 다음 회차 '진행' 행 추가(시작 = 마지막 at 또는 startedAt)
 */
export function loopRounds(loop, a, b) {
  const ev = [...loop.events].sort((x, y) => ms(x.at) - ms(y.at)), start0 = loop.startedAt ? ms(loop.startedAt) : null
  const rows = ev.map((e, i) => ({ label: e.verdict === 'BLOCKED' ? `${e.iter}회차 BLOCKED` : `${e.iter}회차`, t0: i ? ms(ev[i - 1].at) : start0, t1: ms(e.at), run: false, blocked: e.verdict === 'BLOCKED', verdict: e.verdict, state: e.verdict + (e.open != null ? ` · 열린 결함 ${e.open}` : '') }))
  if (loop.running) rows.push({ label: `${Math.max(0, ...ev.filter(e => e.verdict !== 'BLOCKED').map(e => e.iter)) + 1}회차`, t0: ev.length ? ms(ev.at(-1).at) : start0 ?? loop.lockAt, t1: null, run: true, verdict: 'RUNNING', state: '진행(ledger.lock)' })
  return rows.filter(r => r.run ? b >= (r.t0 ?? 0) : r.t1 >= a && r.t1 <= b)
}
/** 노드 묶음 → 시간 쌍 : 최소 시작 ~ 최대 종료, 하나라도 진행 중이면 진행 */
const spanOf = xs => {
  const t0s = xs.map(x => x.t0).filter(v => v != null), t1s = xs.map(x => x.t1).filter(v => v != null), run = xs.some(x => x.run)
  return { t0: t0s.length ? Math.min(...t0s) : null, t1: run || !t1s.length ? null : Math.max(...t1s), run }
}

/**
 * 서브에이전트 기록(jsonl 레코드 배열) → 과제 전달 회차 [{ t0, t1, run, errors }] (2026-11-09 결함 ①② — 생성기 전체가 이 한 함수로 재전달을 감지)
 *   전달 = type 'user' 이고 글이 시스템 알림이 아닌 기록. 근거(실기록 2026-11-08 세션 7d5698d5 의 팀원 build-graph) : 메인 SendMessage 재전달은
 *   서브에이전트 기록에 type 'user' · content 문자열 '<teammate-message teammate_id="team-lead" summary=…>' 로 1줄씩 남고(9회), 마스터가 팀원 창에 직접 쓴 글도 같은 형태(1회).
 *   도구 결과(content 배열의 tool_result)·'<system-reminder>' 메타 글은 전달이 아님. 회차 끝 = 그 구간 마지막 assistant stop_reason 'end_turn'
 *   errors = 구간 안 tool_result.is_error 수. alive=false(오래 안 바뀐 기록)면 끝 기록 없는 마지막 회차도 진행으로 보지 않음(종료 기록 없음)
 */
export function agentRounds(recs, { alive = true } = {}) {
  const isStart = j => j.type === 'user' && !/^\s*<system-reminder>/.test(textOf(j.message?.content) ?? '<system-reminder>')
  const ended = j => j?.type === 'assistant' && j.message?.stop_reason === 'end_turn'
  const starts = recs.map((j, i) => [j, i]).filter(([j]) => isStart(j))
  const lastMsg = recs.filter(j => j.type === 'user' || j.type === 'assistant').at(-1)   // 끝 판정은 대화 기록만(뒤따르는 훅·요청 메타 기록 제외)
  return starts.map(([j, i], k) => {
    const last = k === starts.length - 1, seg = recs.slice(i, last ? recs.length : starts[k + 1][1]), fin = seg.filter(ended).at(-1)
    const errors = seg.reduce((s, x) => s + (x.type === 'user' && Array.isArray(x.message?.content) ? x.message.content.filter(b => b?.type === 'tool_result' && b.is_error).length : 0), 0)
    return { t0: ms(j.timestamp), t1: fin && (!last || ended(lastMsg)) ? ms(fin.timestamp) : null, run: alive && last && !ended(lastMsg), errors }
  })
}

/**
 * 작업 묶음(2026-11-09 결함 ①) : work-history agent 레코드는 첫 디스패치 턴 1곳에만 귀속된다(work-history-logger.mjs scanSubagents 의 st.agentTurn 고정)
 *   → 지속 에이전트(SendMessage 로 이어 받은 팀원)가 다음 요청에서 재전달받은 회차도 첫 턴 노드 하나에 몰린다(실사례 build 1건 78분).
 *   회차 시작 시각이 속한 같은 세션 턴(ts_req ≤ t0 인 마지막 턴)으로 회차를 나눈다 : 귀속 턴 = 자기 몫만(시각·오류 재계산), 다른 턴 = 이어받음 항목(cont) 추가,
 *   roundBase = 앞 턴들 회차 수(라벨 누적 번호). 회차가 2개 이상 턴에 걸친 에이전트로 이어진 턴들 = 한 묶음(합집합)
 *   t.bundle = { size(묶음 요청 수), n(묶음 안 에이전트별 전달 수 최대), agents } 를 붙인다. 첫 회차가 귀속 턴 밖이면 나누지 않음(귀속 판단을 지어내지 않음)
 */
export function splitAgentRounds(turns) {
  const bySess = {}, parent = new Map()
  for (const t of turns) (bySess[t.session_id] = bySess[t.session_id] || []).push(t)
  for (const xs of Object.values(bySess)) xs.sort((a, b) => ms(a.ts_req) - ms(b.ts_req))
  const find = t => { while (parent.get(t) !== t) t = parent.get(t); return t }
  const iso = v => v == null ? null : new Date(v).toISOString(), links = []
  for (const t of turns) for (const ag of [...(t.agents_detail || [])]) {
    if (ag.cont || !(ag.rounds || []).length) continue
    const xs = bySess[t.session_id] || [], share = new Map()
    for (const r of ag.rounds) { const o = xs.filter(x => ms(x.ts_req) <= r.t0).at(-1) || t; if (!share.has(o)) share.set(o, []); share.get(o).push(r) }
    if (share.size < 2 || share.keys().next().value !== t) continue
    let base = 0; const total = ag.rounds.length
    for (const [o, rs] of share) {
      const t1s = rs.map(r => r.t1).filter(v => v != null), part = { rounds: rs, roundBase: base, roundsTotal: total, live: rs.some(r => r.run), ts_start: iso(rs[0].t0), ts_end: rs.at(-1).run || !t1s.length ? null : iso(Math.max(...t1s)), errors: rs.reduce((s, r) => s + (r.errors || 0), 0) }
      if (o === t) Object.assign(ag, part); else (o.agents_detail = o.agents_detail || []).push({ ...ag, ...part, cont: true, cost_usd: null })
      base += rs.length
    }
    links.push({ turns: [...share.keys()], n: total, type: ag.type || ag.name })
  }
  for (const l of links) for (const t of l.turns) if (!parent.has(t)) parent.set(t, t)
  for (const l of links) for (const t of l.turns.slice(1)) parent.set(find(t), find(l.turns[0]))
  const groups = new Map()
  for (const l of links) { const r = find(l.turns[0]), g = groups.get(r) || { turns: new Set(), n: 0, agents: new Set() }; l.turns.forEach(x => g.turns.add(x)); g.n = Math.max(g.n, l.n); g.agents.add(l.type); groups.set(r, g) }
  for (const g of groups.values()) for (const t of g.turns) t.bundle = { size: g.turns.size, n: g.n, agents: [...g.agents] }
  return turns
}

/** 실행 노드 경보 : 한 회차(회차 없으면 노드 전체) 최장 소요 ≥ ALERT.longMs → '장시간', 도구 오류 ≥ ALERT.errors → '오류 다발' */
export function nodeAlerts(n, errors, now) {
  const dur = r => r.t0 == null ? 0 : (r.run ? now : r.t1 ?? r.t0) - r.t0
  const rows = n.rounds?.find(g => g.name.startsWith('재작업'))?.rows || [n]
  return [...(Math.max(0, ...rows.map(dur)) >= ALERT.longMs ? ['장시간'] : []), ...(errors >= ALERT.errors ? ['오류 다발'] : [])]
}

/** agent 레코드 1건 → 노드. 진행 = 종료 기록 없음 + (턴 진행 중 또는 세션 기록 스캔에서 실행 중) / 완료 = ts_end(도구 오류 수는 라벨에만) / 그 밖 = 오류(종료 기록 없음) */
function agentNode(ag, id, parent, turnRunning, now) {
  const run = !ag.ts_end && (turnRunning || !!ag.live), k = run ? 'running' : ag.ts_end ? 'done' : 'error', base = ag.roundBase || 0
  const rounds = (ag.rounds || []).length >= 2 || base ? [{ name: '재작업 회차(같은 에이전트에 과제 재전달)', cap: LOOP_CAP, base, rows: ag.rounds.map((r, i) => ({ label: `${base + i + 1}회차`, t0: r.t0, t1: r.t1, run: r.run, state: (r.run ? '진행' : r.t1 != null ? '완료' : '—') + (r.errors ? ` · 도구 오류 ${r.errors}` : '') })) }] : undefined
  const cost = ag.cont ? '비용 — 첫 요청 노드에 합산(지속 에이전트)' : ag.cost_usd != null ? `비용 $${ag.cost_usd.toFixed(2)} (API 환산${ag.roundsTotal > (ag.rounds || []).length ? ' · 이어받은 요청 몫 포함' : ''})` : '비용 — (턴 종료 후 기록)'
  const n = {
    id, parent, label: ag.type || ag.name || '에이전트', slot: null, ...sty(k), t0: ms(ag.ts_start), t1: ag.ts_end ? ms(ag.ts_end) : null, run,
    statusLabel: k === 'error' ? '오류(종료 기록 없음)' : STATUS_STYLE[k].label + (ag.errors ? `(도구 오류 ${ag.errors}회)` : ''),
    lines: [`모델 ${String(ag.model || '-').replace(/^claude-/, '')}`, cost, ...(ag.errors ? [`도구 오류 ${ag.errors}회 기록`] : []), ...(ag.name && ag.name !== ag.type ? [`이름 ${ag.name}`] : []), ...(base ? [`지속 에이전트 이어받음 — 앞 요청 ${base}회차 뒤`] : [])],
    ...(rounds ? { rounds } : {}),
  }
  const alerts = nodeAlerts(n, ag.errors || 0, now)
  return alerts.length ? { ...n, alerts } : n
}

/**
 * 생성기 실행 기록(runs.jsonl) → 1.1.5.2 슬롯 상태. 창 = [a, b + RUN_GRACE_MS], live 실행만 셈(설계도판 재생성은 요청 모니터링이 아님)
 *   창 안 실행 있음 = 완료(진행 중 턴이면 진행) / 없음 + 턴 시작이 로그 첫 기록 이전 = 기록 이전(미수행으로 세지 않음) / 그 밖 = 미수행
 */
function runSlot(runs, a, b, running, owner) {
  const rs = runs.map(r => ({ ...r, t: ms(r.ts) })).filter(r => r.t != null).sort((x, y) => x.t - y.t)
  const win = rs.filter(r => r.mode === 'live' && r.t >= a && r.t <= b + RUN_GRACE_MS), who = `담당 ${owner} — 생성기 실행 기록 runs.jsonl 기준`
  if (win.length) {
    const last = win.at(-1), by = {}; for (const r of win) by[r.trigger] = (by[r.trigger] || 0) + 1
    const kst = new Date(last.t).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(5)
    return { ...sty(running ? 'running' : 'done'), lines: [who, `생성기 실행 ${win.length}회(${Object.entries(by).map(([k, n]) => `${k} ${n}`).join(' · ')})`, `마지막 실행 ${kst} · 트리거 ${last.trigger}`] }
  }
  if (!rs.length || a < rs[0].t) return { ...sty('unassigned'), statusLabel: '기록 이전', lines: [who, '실행 기록 시작 이전 턴 — 판정 안 함(미수행으로 세지 않음)'] }
  return { ...sty('missing'), lines: [who, '이 턴 시간창 안 생성기 실행 기록 없음'] }
}

/**
 * 턴(buildTurns 결과 또는 세션 기록 스캔의 진행 중 턴) + 원장 루프 → 노드 목록 [{ id, parent, label, slot, status, statusLabel, badge?, lines, t0, t1, run, rounds?, eng? }]
 *   1 = 턴 상태(종료 후에도 실행 중 에이전트가 있으면 진행) · 엔지니어링 N/5 / 1.1 = ts_req ~ 하위 노드 마지막 종료
 *   에이전트 = SLOT_MAP agents 대응 슬롯 아래, 없으면 1.1 아래(teamanakin-admin = 1.2 아래), 같은 type 2회 이상 = 부모에 '반복 실행' 회차표
 *   엔지니어링 슬롯 = 대응(에이전트·훅·루프) 중 진행 있으면 진행, 있으면 완료, 없으면 미수행 / Codex 슬롯 = 대응 루프 회차표, 상태 = 마지막 판정
 */
export function buildRequestGraph(t, loops = [], { slotMap = SLOT_MAP, now = Date.now(), runs = [] } = {}) {
  const ts = turnStatus(t), a = ms(t.ts_req), turnRunning = ts.key === 'running'
  const agents = [...(t.agents_detail || [])].sort((x, y) => String(x.ts_start || '').localeCompare(String(y.ts_start || '')))
  const agentRun = ag => !ag.ts_end && (turnRunning || !!ag.live), anyRun = turnRunning || agents.some(agentRun)
  // 시간창 끝 : 진행 중이면 지금 > 응답 시각 > (중단·응답 없음) 마지막 에이전트 종료 시각 또는 요청 시각 — 끝난 턴이 이후 루프를 끌어오지 않게
  const b = anyRun ? now : t.ts_res ? ms(t.ts_res) : Math.max(a, ...agents.map(x => ms(x.ts_end) || 0))
  // 루프 전용 창 : 이전 턴에 시작된 백그라운드 워크플로가 재개 턴에 귀속되면 에이전트가 요청 시각보다 앞서 돌므로 귀속 에이전트 시작·종료까지 넓힌다
  const la = Math.min(a, ...agents.map(x => ms(x.ts_start) ?? a)), lb = Math.max(b, ...agents.map(x => ms(x.ts_end) || 0))
  const nodes = SLOTS.map(s => ({ id: s.id, parent: s.parent, label: s.label, slot: s.id, ...sty('unassigned'), lines: [], t0: null, t1: null, run: false }))
  const byId = Object.fromEntries(nodes.map(n => [n.id, n])), kind = Object.fromEntries(SLOTS.map(s => [s.id, s.kind]))
  const slotOf = ag => ag.type === ADMIN_TYPE ? '1.2' : Object.keys(slotMap).find(id => kind[id] === 'sub' && (slotMap[id].agents || []).includes(ag.type)) || '1.1'
  const added = agents.map((ag, i) => { const p = slotOf(ag); return agentNode(ag, `${p}.a${i + 1}`, p, turnRunning, now) })
  nodes.push(...added)
  const hookRecs = t.resources?.hooks || [], hooks = new Set(hookRecs.flatMap(h => [h.event, h.name]).filter(Boolean))
  const loopsOf = m => {
    if (!m?.loops) return []
    return loops.filter(l => m.loops === true || m.loops.includes(l.id)).map(l => ({ id: l.id, rows: loopRounds(l, la, lb) })).filter(x => x.rows.length)
  }
  // 엔지니어링·분석 슬롯
  for (const s of SLOTS.filter(s => s.kind === 'sub')) {
    const m = slotMap[s.id]; if (!m) continue
    if (m.source === 'runs.jsonl') { Object.assign(byId[s.id], runSlot(runs, a, b, anyRun, m.owner)); continue }
    const kids = added.filter(n => n.parent === s.id), hk = (m.hooks || []).filter(h => hooks.has(h)), lr = loopsOf(m)
    const want = [...(m.agents || []).map(x => `에이전트 ${x}`), ...(m.hooks || []).map(x => `훅 ${x}`), ...(m.loops ? ['Codex 루프'] : [])]
    if (!kids.length && !hk.length && !lr.length) { Object.assign(byId[s.id], sty('missing'), { lines: [want.length ? `대응 ${want.join(' · ')} — 이 턴 기록 없음` : '대응 기록 없음 — SLOT_MAP 대응 [확인중 : 마스터]'] }); continue }
    // 훅 시각(결함 ③) : work-history 훅 기록은 { name, event, n } 뿐(work-history-logger.mjs bump(st.res.hooks) — 시각 필드 없음) → 훅만 있으면 '완료(추정)'.
    //   턴 중간 스캔(scanLive)의 진행 중 턴은 세션 기록 attachment.timestamp 로 t0·t1 을 채우므로 그때는 확정
    const hkT = hookRecs.filter(h => hk.includes(h.event) && h.t0 != null).map(h => ({ t0: h.t0, t1: h.t1 ?? h.t0, run: false }))
    if (!kids.length && !lr.length && !hkT.length) { Object.assign(byId[s.id], sty('estimated'), { tmNote: '훅 실행(시각 미기록)', lines: [`훅 ${hk.join(' · ')} 실행 — 시각 미기록(work-history 훅 기록은 이벤트명·횟수뿐)`] }); continue }
    const sp = spanOf([...kids, ...lr.flatMap(x => x.rows), ...hkT])
    Object.assign(byId[s.id], sp, sp.run ? sty('running') : sty('done'), { lines: [...(kids.length ? [`에이전트 ${kids.length}건`] : []), ...(hk.length ? [`훅 ${hk.join(' · ')} 실행${hkT.length ? '' : '(시각 기록 없음)'}`] : []), ...(lr.length ? [`Codex 루프 ${lr.map(x => x.id).join(' · ')}`] : [])] })
  }
  // Codex 슬롯
  for (const s of SLOTS.filter(s => s.kind === 'codex')) {
    const m = slotMap[s.id]; if (!m?.loops) continue
    const lr = loopsOf(m)
    if (!lr.length) { Object.assign(byId[s.id], sty('notrun'), { statusLabel: '루프 기록 없음', lines: ['이 턴 시간창 안 Codex 판정 기록 없음'] }); continue }
    const rows = lr.flatMap(x => x.rows), last = rows.slice().sort((x, y) => (x.run ? Infinity : x.t1) - (y.run ? Infinity : y.t1)).at(-1)
    Object.assign(byId[s.id], spanOf(rows), last.run ? sty('running') : { status: VERDICT_NODE[last.verdict] || 'error', statusLabel: last.verdict }, {
      badge: m.loops === true ? EST_BADGE : '매핑 연결', lines: lr.map(x => `루프 ${x.id} · 창 안 회차 ${x.rows.length}행`),
      rounds: lr.map(x => ({ name: `Codex 루프 ${x.id}`, cap: LOOP_CAP, rows: x.rows })),
    })
  }
  // 같은 type 반복 실행 = 부모 노드 회차표(병렬 동시 실행도 포함 — 시작 시각순)
  for (const p of nodes.filter(n => n.slot)) {
    const by = {}; for (const k of added.filter(n => n.parent === p.id)) (by[k.label] = by[k.label] || []).push(k)
    const groups = Object.entries(by).filter(([, xs]) => xs.length >= 2).map(([type, xs]) => ({ name: `${type} 반복 실행`, cap: LOOP_CAP, rows: xs.map((x, i) => ({ label: `${i + 1}회차`, t0: x.t0, t1: x.t1, run: x.run, state: x.statusLabel })) }))
    if (groups.length) p.rounds = [...(p.rounds || []), ...groups]
  }
  // 1.2 승인
  const admin = added.filter(n => n.parent === '1.2')
  Object.assign(byId['1.2'], admin.length ? { ...spanOf(admin), ...(admin.some(n => n.run) ? sty('running') : { status: 'done', statusLabel: '실행됨' }), lines: ['판정 기록 없음 — APPROVED 등 판정 문자열은 work-history 에 없음'] } : { ...sty('notrun'), lines: ['이 턴에 teamanakin-admin 실행 기록 없음'] })
  // 1.1 접수 = ts_req ~ 하위(1.1 아래 전부) 마지막 종료
  const under = id => nodes.filter(n => n.parent === id).flatMap(n => [n, ...under(n.id)])
  const sub = spanOf(under('1.1').filter(n => n.t0 != null || n.t1 != null || n.run))
  const turnSt = anyRun ? { status: 'running', statusLabel: turnRunning ? STATUS_STYLE.running.label : '진행(팀원 실행 중)' } : { status: TURN_NODE[ts.key], statusLabel: ts.label }
  const eng = ENG_SLOTS.filter(id => ['done', 'running', 'estimated'].includes(byId[id].status)), est = eng.filter(id => byId[id].status === 'estimated')
  // 누적 회차(결함 ①) : 요청 안 회차표 최대(이어받은 회차는 앞 요청 몫 base 포함) vs 작업 묶음(splitAgentRounds) 전달 수 최대 → 큰 값
  const own = Math.max(0, ...nodes.flatMap(n => (n.rounds || []).map(g => (g.base || 0) + roundSummary(g.rows, now).n)))
  const cumN = Math.max(own, t.bundle?.n || 0), size = t.bundle?.size || 1
  const level = cumN >= ALERT.cap ? '상한 도달' : cumN >= ALERT.nearCap ? '상한 근접' : null
  const alerts = added.reduce((s, n) => s + (n.alerts || []).length, 0) + (level ? 1 : 0)
  Object.assign(byId['1'], turnSt, {
    t0: a, t1: anyRun ? null : ms(t.ts_res), run: anyRun, eng: eng.length, engEst: est.length, cum: { n: cumN, size, cap: ALERT.cap, ...(level ? { level } : {}) }, alertN: alerts,
    lines: [`엔지니어링 ${engTxt(eng.length, est.length)} 수행${eng.length ? ` — ${eng.join(' · ')}` : ''}`, `묶음 누적 ${cumN}/${ALERT.cap}${size > 1 ? ` — 지속 에이전트(${t.bundle.agents.join(' · ')})로 이어진 요청 ${size}건` : ' — 요청 단위(이어받은 지속 에이전트 없음)'}${level ? ` · ${level}` : ''}`,
      ...(alerts ? [`경보 ${alerts}건 — ${[...added.flatMap(n => (n.alerts || []).map(x => `${n.label} ${x}`)), ...(level ? [level] : [])].join(' · ')}`] : [])],
  })
  Object.assign(byId['1.1'], turnSt, { t0: a, t1: anyRun ? null : sub.t1, run: anyRun })
  return nodes
}

/**
 * 실행 경로(흐름 화살표, 2026-11-08 마스터 "시작과 종료까지 진행되는 모든 노드를 화살표로 계속 연결")
 *   시작(S) → 1 → 1.1 → 실행 이벤트(에이전트 시작 · 팀원 재작업 회차 · Codex 회차)를 시작 시각순 → 종료(E)
 *   슬롯 경유 : 이벤트가 속한 슬롯(에이전트 부모 = 엔지니어링 슬롯·1.2, Codex 슬롯 부모 = 분석 슬롯)에 처음 들어갈 때 1회만 거친다(집계 노드 — 이벤트 중복 금지)
 *   되돌이 : 이미 지난 노드로 다시 가는 화살표 = loop, 라벨 'k회차 (k/5)' / 같은 type 에이전트의 k번째 실행도 'k회차' (노드 복제 없음 — 회차표와 같은 수)
 *   선 모양 = 통과 여부(2026-11-08 마스터 : 지나간 선 실선 · 아직 안 지나간 선 점선), 색 = 상태 — pass true 실선 / false 점선
 *   상태 : 진행 중 이벤트로 들어가는 화살표 = running(이미 지나감 → 실선), 그 밖 지나간 화살표 = done
 *   예정(planned, 점선) : 진행 중·중단 요청은 마지막 실행 지점 뒤로 아직 안 지난 표준 경로(SLOTS 순서의 분석·Codex 슬롯 → 1.2 → 종료)를 잇는다. 이미 지난 노드는 넣지 않음. 중단이면 첫 예정 화살표에 '중단'
 *   시각 기록이 없는 대응(훅만 있는 슬롯 1.1.1·1.1.3)은 경로에 넣지 않는다(순서를 지어내지 않음)
 * 설계도판 = 표준 처리 경로(SLOTS 순서) + Codex FAIL 회송 예시 되돌이 1개
 */
export function buildPath(nodes, { design = false } = {}) {
  const by = Object.fromEntries(nodes.map(n => [n.id, n])), n1 = by['1'], kind = Object.fromEntries(SLOTS.map(s => [s.id, s.kind]))
  if (design) {
    const seq = ['S', ...SLOTS.map(s => s.id), 'E']
    const edges = seq.slice(1).map((to, i) => ({ from: seq[i], to, seq: i + 1, loop: false, state: 'design', pass: false }))   // 실제 진행이 없으므로 전부 점선
    edges.push({ from: '1.1.4.1', to: '1.1.4', seq: '↺', loop: true, state: 'example', pass: false, label: `FAIL 시 회송 · 상한 ${LOOP_CAP}회` })
    return { term: { S: {}, E: {} }, edges }
  }
  const stopped = !n1.run && n1.status === 'error'   // 중단·응답 없음
  const term = { S: { t0: n1.t0 }, E: { t0: n1.run || stopped ? null : n1.t1, pending: !!n1.run, stopped } }
  const ev = []
  for (const n of nodes) {
    if (!n.slot) {
      const g = (n.rounds || []).find(x => x.name.startsWith('재작업'))
      if (g) g.rows.forEach((r, i) => { const k = (g.base || 0) + i + 1; ev.push({ id: n.id, t: r.t0, run: !!r.run, ...(k > 1 ? { lab: `재작업 ${k}회차 (${k}/${LOOP_CAP})` } : {}) }) }); else ev.push({ id: n.id, t: n.t0, run: !!n.run })   // 이어받은 회차는 앞 요청 몫(base)부터 번호
    } else if (kind[n.id] === 'codex' && n.rounds) for (const g of n.rounds) { let k = 0; for (const r of g.rows) { if (!r.blocked) k++; ev.push({ id: n.id, t: r.t0 ?? r.t1, run: !!r.run, lab: `${g.name.replace(/^Codex 루프 /, '')} ${r.label}${r.blocked ? '' : ` (${k}/${LOOP_CAP})`}` }) } }   // 회차 라벨 = 그 루프 안 회차(루프가 여러 개여도 섞지 않음)
  }
  const seq = [{ id: 'S' }, { id: '1' }, { id: '1.1' }], entered = new Set(['1', '1.1'])
  for (const e of ev.filter(e => e.t != null).sort((a, b) => a.t - b.t)) {
    const host = by[e.id].parent
    if (host && !entered.has(host)) { entered.add(host); seq.push({ id: host }) }
    seq.push(e)
  }
  const actual = seq.length
  if (n1.run || stopped) {   // 예정 경로 : 아직 안 지난 표준 슬롯 → 1.2 → 종료
    const seen = new Set(seq.map(x => x.id))
    for (const sl of SLOTS) if ((sl.kind === 'sub' || sl.kind === 'codex' || sl.kind === 'approve') && !seen.has(sl.id)) seq.push({ id: sl.id, plan: true })
    seq.push({ id: 'E', plan: true })
  } else seq.push({ id: 'E' })
  const visits = {}, typeN = {}
  const edges = seq.slice(1).map((s, i) => {
    const to = s.id, v = (visits[to] = (visits[to] || 0) + 1), n = by[to]
    let label = s.lab
    if (label) { /* 이벤트가 회차 라벨을 가짐 */ } else if (v > 1) label = `${v}회차 (${v}/${LOOP_CAP})`
    else if (n && !n.slot) { const k = (typeN[n.label] = (typeN[n.label] || 0) + 1); if (k > 1) label = `${n.label.replace(/^anakin_phase-/, '')} ${k}회차 (${k}/${LOOP_CAP})` }
    if (s.plan) return { from: seq[i].id, to, seq: i + 1, loop: false, state: 'planned', pass: false, ...(stopped && i + 1 === actual ? { label: '중단' } : {}) }
    return { from: seq[i].id, to, seq: i + 1, loop: v > 1, ...(label ? { label } : {}), state: s.run ? 'running' : 'done', pass: true }
  })
  return { term, edges }
}

/** 설계도판 노드 : 실데이터 없이 슬롯만 */
export const designGraph = () => SLOTS.map(s => ({ id: s.id, parent: s.parent, label: s.label, slot: s.id, status: 'unassigned', statusLabel: '설계', lines: [], t0: null, t1: null, run: false }))

/** Obsidian 안전 파일명 : 금지 문자 \ / : * ? " < > | # ^ [ ] 제거 */
export const safeName = s => String(s).replace(/[\\/:*?"<>|#^[\]\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim()
export const slotFile = s => safeName(`${s.id} ${s.label}`)

// ── 입출력 ────────────────────────────────────────────────────────────────────
function loadLoops(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).flatMap(id => {
    try {
      const l = JSON.parse(fs.readFileSync(path.join(dir, id, 'ledger.json'), 'utf8'))
      const events = [...(l.iters || []).map(x => ({ iter: x.iter, at: x.at, verdict: x.verdict, open: (x.openDefects || []).length })),
        ...(l.blocked || []).map(x => ({ iter: x.iter, at: x.at, verdict: 'BLOCKED', open: null }))]
      let lockAt = null; try { lockAt = fs.statSync(path.join(dir, id, 'ledger.lock')).mtimeMs } catch { /* 잠금 없음 = 실행 중 아님 */ }
      return [{ id, startedAt: l.startedAt, running: lockAt != null, lockAt, events: events.filter(e => e.at) }]
    } catch { return [] }   // 원장 없음·깨짐 : 그 루프는 건너뜀
  })
}

/** jsonl 끝 bytes 만 읽어 파싱(세션 기록은 수십 MB — 턴 중간 갱신이 가볍게) */
function tailJsonl(f, bytes = LIVE.tailBytes) {
  try {
    const fd = fs.openSync(f, 'r'), size = fs.fstatSync(fd).size, start = Math.max(0, size - bytes), buf = Buffer.alloc(size - start)
    fs.readSync(fd, buf, 0, buf.length, start); fs.closeSync(fd)
    const lines = buf.toString('utf8').split('\n'); if (start > 0) lines.shift()
    return lines.flatMap(l => { try { return l ? [JSON.parse(l)] : [] } catch { return [] } })
  } catch { return [] }
}
const textOf = c => typeof c === 'string' ? c : Array.isArray(c) && !c.some(b => b?.type === 'tool_result') ? c.filter(b => b?.type === 'text').map(b => b.text).join('\n') : null
/** 사용자 요청인지 — work-history-logger.mjs classifyPrompt 의 REQUEST 판정과 같은 제외 목록 */
const isRequest = t => { t = String(t || '').trim(); return !!t && !/^(<local-command-caveat>|<system-reminder>|<command-args>|<command-name>|<local-command-stdout>|<task-notification>|<teammate-message|<agent-message|Another Claude session sent a message:|\[Request interrupted by user)/.test(t) }

/**
 * 턴 중간 스캔 : work-history 는 Stop 때 기록되므로, 최근 LIVE.windowMs 안에 바뀐 세션 기록에서
 *   ① 아직 기록되지 않은 요청(마지막 사용자 요청 시각 > 그 세션의 기록된 마지막 ts_req) → 진행 중 턴 추가
 *   ② <sid>/subagents/*.jsonl 에서 실행 중(마지막 대화 기록이 end_turn 아님)·막 끝난 에이전트 → 기록된 레코드에 회차 전체를 붙이거나, 없으면 첫 회차가 속한 턴에 추가
 *   회차 = agentRounds(과제 전달마다 1행 — 팀원에게 재작업을 다시 보낸 경우), 요청별 분배·작업 묶음은 splitAgentRounds
 * turns 를 직접 고치고(에이전트 추가), 새 진행 중 턴 목록을 반환
 */
export function scanLive(turns, { sessDir, now = Date.now() } = {}) {
  if (!sessDir || !fs.existsSync(sessDir)) return []
  const fresh = f => { try { return now - fs.statSync(f).mtimeMs < LIVE.windowMs } catch { return false } }
  const out = []
  // 대상 세션 = 메인 기록이 최근에 바뀐 세션 + (메인은 응답을 끝내고 기다리는 중이어도) 서브에이전트 기록이 최근에 바뀐 세션
  const subOf = sid => path.join(sessDir, sid, 'subagents')
  const sids = fs.readdirSync(sessDir).filter(f => f.endsWith('.jsonl')).map(f => path.basename(f, '.jsonl'))
    .filter(sid => fresh(path.join(sessDir, sid + '.jsonl')) || (fs.existsSync(subOf(sid)) && fs.readdirSync(subOf(sid)).some(x => x.endsWith('.jsonl') && fresh(path.join(subOf(sid), x)))))
  for (const sid of sids) {
    const f = path.join(sessDir, sid + '.jsonl'), recs = fresh(f) ? tailJsonl(f) : []
    const logged = Math.max(0, ...turns.filter(t => t.session_id === sid).map(t => ms(t.ts_req) || 0))
    const prompt = recs.filter(j => j.type === 'user' && !j.isMeta && !j.isSidechain && isRequest(textOf(j.message?.content))).at(-1)
    const own = turns.filter(t => t.session_id === sid)
    if (prompt && ms(prompt.timestamp) > logged + 2000) {
      const p0 = ms(prompt.timestamp)
      const hk = {}   // 훅 이벤트 → 첫·마지막 attachment 시각(결함 ③ : 진행 중 턴은 훅 시각이 있으므로 '완료' 확정)
      for (const j of recs) { const e = j.type === 'attachment' && j.attachment?.hookEvent, v = ms(j.timestamp); if (e && v != null && v >= p0) hk[e] = { t0: Math.min(hk[e]?.t0 ?? v, v), t1: Math.max(hk[e]?.t1 ?? v, v) } }
      const hooks = Object.entries(hk).map(([e, x]) => ({ name: e, event: e, ...x }))
      const t = { key: `${sid}:live`, id: `${sid}:live`, session_id: sid, session: sid.slice(0, 8), turn: '진행', ts_req: new Date(p0).toISOString(), ts_res: null, req_head: textOf(prompt.message.content).trim().slice(0, 200), category: '', agents_detail: [], resources: { hooks }, live: true }
      out.push(t); own.push(t)
    }
    const subDir = path.join(sessDir, sid, 'subagents')
    if (!fs.existsSync(subDir)) continue
    for (const sf of fs.readdirSync(subDir).filter(x => x.endsWith('.jsonl')).map(x => path.join(subDir, x)).filter(fresh)) {
      // ponytail: 최근에 바뀐 기록은 전체 읽기(회차 전체가 있어야 요청 간 누적 번호가 맞음, 파일당 수 MB) — 느려지면 회차 캐시(loadAgentRounds)에 바이트 오프셋 증분 추가
      const rs = tailJsonl(sf, Infinity), rounds = agentRounds(rs)
      if (!rounds.length) continue
      let meta = {}; try { meta = JSON.parse(fs.readFileSync(sf.replace(/\.jsonl$/, '.meta.json'), 'utf8')) } catch { /* meta 없음 */ }
      const id = path.basename(sf, '.jsonl').replace(/^agent-/, ''), running = rounds.some(r => r.run)
      const model = rs.filter(j => j.type === 'assistant' && j.message?.model && !/^</.test(j.message.model)).at(-1)?.message.model || meta.model
      const live = { live: running, rounds, ...(running ? { ts_end: null } : {}) }
      // 이미 기록된 레코드(첫 디스패치 턴 귀속)에 회차 전체를 붙이고, 없으면 첫 회차가 속한 턴에 추가 — 요청별 분배는 splitAgentRounds
      const ex = own.flatMap(t => t.agents_detail || []).find(x => x.agent_id === id)
      if (ex) { Object.assign(ex, live); continue }
      const target = own.filter(t => ms(t.ts_req) <= rounds[0].t0).sort((x, y) => ms(y.ts_req) - ms(x.ts_req))[0]
      if (!target) continue
      const t1s = rounds.map(r => r.t1).filter(v => v != null)
      ;(target.agents_detail = target.agents_detail || []).push({ agent_id: id, type: meta.customAgentType || meta.spawnedAgentType || meta.agentType || '서브에이전트', name: meta.name, model, ts_start: new Date(rounds[0].t0).toISOString(), ts_end: running || !t1s.length ? null : new Date(Math.max(...t1s)).toISOString(), cost_usd: null, errors: rounds.reduce((s, r) => s + r.errors, 0), ...live })
    }
  }
  return out
}

/**
 * 지난 요청의 팀원 회차 : scanLive 가 못 본(최근 10분 밖) 에이전트 기록에서 agentRounds 로 회차를 읽어 ag.rounds 에 채운다(결함 ①② — 재전달 감지가 진행 중에만 되던 문제)
 *   대상 = meta.taskKind 'in_process_teammate'(SendMessage 로 이어 받을 수 있는 팀원)만. 캐시 = agent_id → 기록 크기·mtime 가 같으면 재사용(첫 실행만 전체 읽기)
 */
function loadAgentRounds(turns, sessDir, cacheFile) {
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) } catch { /* 캐시 없음 = 전부 읽기 */ }
  const next = {}
  for (const t of turns) for (const ag of t.agents_detail || []) {
    if (ag.rounds || !ag.agent_id || !t.session_id) continue
    const base = path.join(sessDir, t.session_id, 'subagents', 'agent-' + ag.agent_id)
    let st; try { st = fs.statSync(base + '.jsonl') } catch { continue }
    const sig = `${st.size}:${Math.round(st.mtimeMs)}`
    let c = cache[ag.agent_id]
    if (c?.sig !== sig) {
      let meta = {}; try { meta = JSON.parse(fs.readFileSync(base + '.meta.json', 'utf8')) } catch { /* meta 없음 = 팀원 아님으로 봄 */ }
      c = { sig, rounds: meta.taskKind === 'in_process_teammate' ? agentRounds(tailJsonl(base + '.jsonl', Infinity), { alive: false }) : [] }
    }
    next[ag.agent_id] = c
    if (c.rounds.length) ag.rounds = c.rounds
  }
  try { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(next)) } catch { /* 캐시 저장 실패 = 다음 실행에서 다시 읽음 */ }
}

const docLink = (outDir, d) => ({ name: path.basename(d, '.md'), href: encodeURI(path.relative(outDir, path.join(ENG, d)).replace(/\\/g, '/')) })
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// 화면 스크립트 : 함수 원문을 그대로 인라인(바깥 이름 참조 금지 — 필요한 값은 #graphdata JSON, 공용 함수는 fmtSpan·roundSummary 전역)
function client() {
  const D = JSON.parse(document.getElementById('graphdata').textContent)
  const $ = id => document.getElementById(id), NS = 'http://www.w3.org/2000/svg', Z = D.size, NOW = Date.now()
  const SL = Object.fromEntries(D.slots.map(s => [s.id, s]))
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const el = (tag, at, parent) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); if (parent) parent.appendChild(e); return e }
  const H = Object.fromEntries(new URLSearchParams(location.hash.slice(1)))   // 새로고침 뒤 복원 : k 요청 · v 보기 · f 실행 경로 · p 쪽 · s 목록 스크롤 · z 확대 영역
  let flowOn = H.f !== '0', view = H.v === 'force' ? 'force' : 'tree', cur = null, page = +H.p || 1, raf = 0, byId = {}, root = null, touched = false, drag = null, pan = null, moved = 0, hooks = {}
  const svg = $('svg'), vb = { x: 0, y: 0, w: 1, h: 1 }
  const PH = { full: '시작 MM-DD HH:mm:ss ~ 종료 HH:mm:ss (소요 Xm Ys)', short: 'HH:mm:ss~HH:mm:ss · XmYs' }   // 설계도판 자리표시
  const termTxt = (n, short) => D.design ? (short ? 'HH:mm:ss' : 'MM-DD HH:mm:ss') : n.t0 != null ? new Date(n.t0).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(short ? 11 : 5) : n.statusLabel.startsWith('중단') ? '중단' : n.pend ? '진행 중' : '—'
  const spanTxt = (n, short) => n.term ? (short ? '' : n.statusLabel + ' ') + termTxt(n, short) : D.design ? (short ? PH.short : PH.full) : fmtSpan(n, NOW, short)
  const spanHtml = n => esc(spanTxt(n)).replace('진행 중', '<span class="blink">진행 중</span>')
  const durTxt = v => { const s = Math.round(v / 1000); return Math.floor(s / 60) + 'm ' + (s % 60) + 's' }
  const tip = n => (n.slot ? n.id + ' ' : '') + n.label + ' — ' + n.statusLabel + '\n' + spanTxt(n)
  const roundsMax = n => Math.max(0, ...(n.rounds || []).map(g => (g.base || 0) + roundSummary(g.rows, NOW).n))
  const engT = n => n.eng + '/5' + (n.engEst ? ' (추정 ' + n.engEst + ')' : '')
  const statusTxt = n => n.statusLabel + (n.badge ? ' · ' + n.badge : '') + (n.eng != null ? ' · 엔지니어링 ' + engT(n) : '') + (n.cum ? ' · 묶음 ' + n.cum.n + '/' + n.cum.cap : '') + (n.alertN ? ' · 경보 ' + n.alertN : '') + (n.rounds ? ' · 루프 ' + roundsMax(n) + '/' + n.rounds[0].cap : '')
  const alertHtml = xs => (xs || []).map(x => ' <span class="badge alert">' + esc(x) + '</span>').join('')

  function filtered() {
    const q = $('q').value.trim().toLowerCase(), c = $('fc').value, d = $('fd').value
    return D.requests.filter(r => (!q || r.head.toLowerCase().includes(q)) && (!c || r.cat === c) && (!d || r.date === d))
  }
  function renderList() {
    const xs = filtered(), pages = Math.max(1, Math.ceil(xs.length / Z.pageSize)); page = Math.min(Math.max(1, page), pages)
    $('list').innerHTML = xs.slice((page - 1) * Z.pageSize, page * Z.pageSize).map(r => '<li><button type="button" data-k="' + esc(r.key) + '"' + (r.key === cur ? ' aria-current="true"' : '') + '>'
      + '<span class="rt">' + esc(r.when) + (r.catLabel ? ' · ' + esc(r.catLabel) : '') + '</span><span class="rh">' + esc(r.head) + '</span>'
      + (r.meta ? '<span class="rm">' + esc(r.meta) + (r.st ? ' <span class="badge st-' + esc(r.st) + '">' + esc(r.statusLabel) + '</span>' : '') + (r.alert ? alertHtml([r.alert]) : '') + '</span>' : '') + '</button></li>').join('') || '<li class="muted">조회 결과 없음</li>'
    $('lcnt').textContent = xs.length + '건' + (pages > 1 ? ' · ' + page + '/' + pages + '쪽' : '')
    $('lprev').disabled = page <= 1; $('lnext').disabled = page >= pages
  }
  function saveHash() {
    const st = new URLSearchParams({ k: cur || '', v: view, f: flowOn ? 1 : 0, p: page, s: Math.round($('list').scrollTop) })
    if (touched) st.set('z', [vb.x, vb.y, vb.w, vb.h].map(v => +v.toFixed(1)).join(','))
    try { history.replaceState(null, '', '#' + st) } catch (e) { /* file:// 제한 브라우저 : 복원만 포기 */ }
  }
  function select(k) { cur = k; renderList(); const r = D.requests.find(x => x.key === k); if (!r) return; $('gtitle').textContent = r.head; draw(r); detail(r.nodes[0]); saveHash() }
  function roundsHtml(g) {
    const s = roundSummary(g.rows, NOW), b = g.base || 0, k = b + s.n
    return '<h4>' + esc(g.name) + ' <span class="muted">' + (b ? '묶음 누적 ' : '') + k + '/' + g.cap + '</span>' + alertHtml(k >= D.alert.cap ? ['상한 도달'] : k >= D.alert.nearCap ? ['상한 근접'] : []) + '</h4><table class="rd"><tr><th>회차</th><th>시작 ~ 종료</th><th>상태</th></tr>'
      + g.rows.map(r => '<tr><td>' + esc(r.label) + '</td><td>' + spanHtml(r) + '</td><td>' + esc(r.state || '') + '</td></tr>').join('')
      + '<tr class="sum"><td colspan="3">합계 ' + s.n + '회' + (b ? '(앞 요청 ' + b + '회 이어받음)' : '') + ' · 총 소요 ' + durTxt(s.totalMs) + ' · 상한 대비 ' + k + '/' + g.cap + '</td></tr></table>'
  }
  function detail(n) {
    const s = SL[n.slot]
    $('detail').innerHTML = '<h3>' + esc((n.slot ? n.id + ' ' : '') + n.label) + '</h3><p><span class="badge st-' + esc(n.status) + '">' + esc(n.statusLabel) + '</span>'
      + (n.badge ? ' <span class="badge est">' + esc(n.badge) + '</span>' : '') + (n.eng != null ? ' <span class="badge">엔지니어링 ' + engT(n) + ' 수행</span>' : '')
      + (n.cum ? ' <span class="badge">묶음 누적 ' + n.cum.n + '/' + n.cum.cap + (n.cum.size > 1 ? ' · 요청 ' + n.cum.size + '건' : '') + '</span>' + alertHtml(n.cum.level ? [n.cum.level] : []) : '') + alertHtml(n.alerts) + '</p>'
      + '<p class="tm">' + spanHtml(n) + '</p>'
      + (n.lines.length ? '<ul>' + n.lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>' : '')
      + (n.rounds || []).map(roundsHtml).join('')
      + (n.term ? '<p class="muted">흐름 터미널 — 시작 = 요청 수신 시각, 종료 = 응답 시각(진행 중이면 아직 없음)</p>' : s ? '<dl><dt>역할</dt><dd>' + esc(s.role) + '</dd><dt>검수 기준</dt><dd>' + esc(s.criteria) + '</dd><dt>정본 문서</dt><dd>' + s.docs.map(d => '<a href="' + esc(d.href) + '">' + esc(d.name) + '</a>').join(' · ') + '</dd></dl>' : '<p class="muted">실행 기록에서 온 노드(설계 슬롯 아님)</p>')
  }

  // ── 보기 공통 : viewBox 화면 맞춤·확대·이동 ──
  const setVB = () => svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h)
  /** 그림 전체를 화면에 맞춤 — 배율은 [minScale, maxScale] 안, 최소 배율에 걸리면 왼쪽 위 기준(나머지는 끌어서 이동) */
  function fit(minScale) {
    if (!root) return
    const b = root.getBBox(), W = svg.clientWidth || 800, H2 = svg.clientHeight || 600, pad = 14, bw = b.width + pad * 2, bh = b.height + pad * 2
    const s = Math.max(minScale, Math.min(W / bw, H2 / bh, Z.maxScale)); vb.w = W / s; vb.h = H2 / s
    vb.x = bw <= vb.w ? b.x - pad - (vb.w - bw) / 2 : b.x - pad; vb.y = bh <= vb.h ? b.y - pad - (vb.h - bh) / 2 : b.y - pad; setVB()
  }
  const minScale = () => view === 'tree' ? Z.minScale : Z.forceMinScale
  function zoom(k, cx, cy) { if (cx == null) { cx = vb.x + vb.w / 2; cy = vb.y + vb.h / 2 } vb.x = cx - (cx - vb.x) * k; vb.y = cy - (cy - vb.y) * k; vb.w *= k; vb.h *= k; setVB(); touched = true }
  const pt = e => new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse())
  svg.addEventListener('pointerdown', e => {
    const g = e.target.closest('[data-id]'); moved = 0
    if (g) { if (hooks.grab) { drag = hooks.grab(g.dataset.id); svg.setPointerCapture(e.pointerId) } return }
    pan = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, s: vb.w / (svg.clientWidth || 1) }; svg.setPointerCapture(e.pointerId)
  })
  svg.addEventListener('pointermove', e => {
    if (!drag && !pan) return; moved++
    if (drag) { const q = pt(e); drag.x = q.x; drag.y = q.y; hooks.wake() }
    else if (moved > 2) { vb.x = pan.vx - (e.clientX - pan.x) * pan.s; vb.y = pan.vy - (e.clientY - pan.y) * pan.s; setVB(); touched = true }
  })
  svg.addEventListener('pointerup', e => { if (drag && moved < 4) detail(drag.n); drag = pan = null; if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId) })
  svg.addEventListener('click', e => { if (view !== 'tree') return; const g = e.target.closest('[data-id]'); if (g) detail(byId[g.dataset.id]) })
  svg.addEventListener('wheel', e => { e.preventDefault(); const q = pt(e); zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1, q.x, q.y) }, { passive: false })
  document.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => { if (b.dataset.z === 'fit') { touched = false; fit(minScale()) } else zoom(b.dataset.z === 'in' ? 1 / 1.25 : 1.25) }))
  addEventListener('resize', () => { if (!touched) fit(minScale()) })

  // ── 계층 트리 : 슬롯 카드 = 이름(' : ' 로 2줄) + 상태 + 시간, 실행 에이전트 = 한 줄 넓은 카드(이름 + 시간, 상태 = 색) — 잎 노드라 오른쪽 열이 비어 있음
  //    자식 묶음 가운데에 부모, 외길 사슬은 가장 높은 노드만큼 자리 확보
  const nameLines = n => { const s = (n.slot ? n.id + ' ' : '') + n.label, i = s.indexOf(' : '); return i > 0 ? [s.slice(0, i), s.slice(i + 3)] : [s] }
  const hOf = n => n.slot ? Z.padY * 2 + Z.lineH * (nameLines(n).length + 1) + Z.tmH : Z.padY * 2 + Z.lineH
  function layout(nodes) {
    const kids = {}, pos = {}; let y = 0, dmax = 0
    for (const n of nodes) (kids[n.parent] = kids[n.parent] || []).push(n)
    const walk = (n, d, reserve) => {
      dmax = Math.max(dmax, d); const ch = kids[n.id] || [], h = hOf(n)
      if (!ch.length) { const R = Math.max(h, reserve); pos[n.id] = { d, y: y + (R - h) / 2, h }; y += R + (n.slot ? Z.gapY : Z.gapY / 2); return }   // 에이전트 줄은 촘촘히
      ch.forEach(c => walk(c, d + 1, ch.length === 1 ? Math.max(h, reserve) : 0))
      const a = pos[ch[0].id], b = pos[ch[ch.length - 1].id]; pos[n.id] = { d, y: (a.y + a.h / 2 + b.y + b.h / 2) / 2 - h / 2, h }
    }
    walk(nodes.find(n => !n.parent), 0, 0)
    return { pos, dmax }
  }
  /** 글자가 max 폭을 넘으면 실제 측정으로 잘라 … */
  function fitText(t, s, max) {
    t.textContent = s; if (t.getComputedTextLength() <= max) return t
    let lo = 0, hi = s.length
    while (lo < hi) { const m = (lo + hi + 1) >> 1; t.textContent = s.slice(0, m) + '…'; if (t.getComputedTextLength() <= max) lo = m; else hi = m - 1 }
    t.textContent = s.slice(0, lo) + '…'; return t
  }
  /** 시간 글자(짧은 형식) — '진행 중'은 깜빡이는 tspan, 넘치면 글자 축소 → 그래도 넘치면 소요 생략(상세·풍선에는 전체) */
  function timeText(t, n, max) {
    const put = s => { t.textContent = ''; s.split('진행 중').forEach((p, i) => { if (i) el('tspan', { class: 'blink' }, t).textContent = '진행 중'; if (p) t.appendChild(document.createTextNode(p)) }) }
    const s = spanTxt(n, true); put(s)
    if (max && t.getComputedTextLength() > max) { t.setAttribute('font-size', 9); if (t.getComputedTextLength() > max) put(s.replace(/ · [^ ]+$/, '')) }
    return t
  }
  // ── 실행 경로(흐름 화살표) 공통 : 노드 경계에서 끝나는 2차 곡선 + 화살촉 marker, 되돌이는 크게 휨, 같은 노드 반복은 오른쪽 고리 ──
  const exitPt = (G, C) => { const dx = C.x - G.cx, dy = C.y - G.cy, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, t = (G.r != null ? G.r : Math.min(ux ? G.hw / Math.abs(ux) : 1e9, uy ? G.hh / Math.abs(uy) : 1e9)) + 2; return { x: G.cx + ux * t, y: G.cy + uy * t } }
  /** k = 휨 정도, j = 같은 노드 고리의 몇 번째인지(고리를 겹치지 않게 키우고 라벨을 세로로 쌓음) */
  function curve(A, B, k, j) {
    if (A.cx === B.cx && A.cy === B.cy) { const x = A.cx + (A.r != null ? A.r : A.hw), y = A.cy, w = 40 + 18 * j, h = 30 + 8 * j; return { d: 'M' + x + ' ' + (y - 6) + ' C' + (x + w) + ' ' + (y - h) + ' ' + (x + w) + ' ' + (y + h) + ' ' + (x + 3) + ' ' + (y + 7), mx: x + w * 0.75, my: y - 18 + 14 * j } }
    const dx = B.cx - A.cx, dy = B.cy - A.cy, C = { x: (A.cx + B.cx) / 2 - dy * k, y: (A.cy + B.cy) / 2 + dx * k }, p0 = exitPt(A, C), p1 = exitPt(B, C)
    return { d: 'M' + p0.x + ' ' + p0.y + ' Q' + C.x + ' ' + C.y + ' ' + p1.x + ' ' + p1.y, mx: 0.25 * p0.x + 0.5 * C.x + 0.25 * p1.x, my: 0.25 * p0.y + 0.5 * C.y + 0.25 * p1.y }
  }
  function markers() {
    const defs = el('defs', {}, svg)
    for (const [k, c] of Object.entries(D.flow)) { const m = el('marker', { id: 'ah-' + k, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 9, markerHeight: 9, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' }, defs); el('path', { d: 'M0,0L10,5L0,10z', fill: c }, m) }
  }
  /** 흐름 화살표를 그리고 위치 갱신 함수를 돌려준다(자유 배치는 매 틱 호출). gLab 이 gPath 와 같으면 순번은 화살표 그룹 안(호버 표시) */
  function flowEdges(path, gPath, gLab, shape) {
    const items = path.edges.map(e => {
      const g = el('g', { class: 'fl ' + e.state + (e.loop ? ' loop' : '') + (e.pass ? '' : ' plan') }, gPath)
      el('title', {}, g).textContent = e.seq + '. ' + e.from + ' → ' + e.to + (e.label ? ' · ' + e.label : '')
      const hit = el('path', { class: 'hit' }, g), v = el('path', { class: 'v', 'marker-end': 'url(#ah-' + e.state + ')' }, g)
      const lg = el('g', { class: 'seqg ' + e.state + (e.pass ? '' : ' plan') }, gLab === gPath ? g : gLab)
      el('circle', { r: 7.5, class: 'sq' }, lg); el('text', { class: 'sqt', 'text-anchor': 'middle', y: 3.5 }, lg).textContent = e.seq
      if (e.label) el('text', { class: 'lpl', x: 10, y: 4 }, lg).textContent = e.label
      return { e, hit, v, lg }
    })
    const selfN = {}; for (const it of items) if (it.e.from === it.e.to) it.j = (selfN[it.e.to] = (selfN[it.e.to] ?? -1) + 1)
    const update = () => items.forEach(({ e, hit, v, lg, j }) => {
      const A = shape(e.from), B = shape(e.to); if (!A || !B) return
      const r = curve(A, B, e.loop ? 0.4 : 0.1, j || 0); hit.setAttribute('d', r.d); v.setAttribute('d', r.d); lg.setAttribute('transform', 'translate(' + r.mx + ' ' + r.my + ')')
    })
    update(); return update
  }
  /** 터미널(시작·종료) 노드 객체 — 상세·풍선용 */
  const termNode = (id, path) => { const T = path.term[id] || {}, pend = id === 'E' && !!(T.pending || T.stopped); return { id, term: true, pend, label: id === 'S' ? '시작' : '종료', slot: null, status: D.design ? 'unassigned' : pend ? 'notrun' : 'done', statusLabel: id === 'S' ? '요청 수신' : T.stopped ? '중단(응답 없음)' : pend ? '응답 대기' : '응답', lines: [], t0: T.t0 ?? null, t1: null, run: false } }

  function drawTree(nodes, L, path) {
    const X = d => d * (Z.boxW + Z.colGap), gE = el('g', {}, root), gF = el('g', { class: 'flows' }, root), gN = el('g', {}, root), gL = el('g', {}, root), geo = {}
    for (const n of nodes) if (n.parent) {
      const a = L.pos[n.parent], b = L.pos[n.id], x1 = X(a.d) + Z.boxW, y1 = a.y + a.h / 2, x2 = X(b.d), y2 = b.y + b.h / 2, mx = (x1 + x2) / 2
      el('path', { d: 'M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2, class: 'edge' }, gE)
    }
    for (const n of nodes) {
      const p = L.pos[n.id], w = n.slot ? Z.boxW : Z.boxW * 2 + Z.colGap, g = el('g', { class: 'node st-' + n.status, transform: 'translate(' + X(p.d) + ' ' + p.y + ')', 'data-id': n.id }, gN)
      el('title', {}, g).textContent = tip(n); geo[n.id] = { cx: X(p.d) + w / 2, cy: p.y + p.h / 2, hw: w / 2, hh: p.h / 2 }
      el('rect', { width: w, height: p.h, rx: 7, class: 'box' }, g); el('rect', { width: 5, height: p.h, rx: 2.5, class: 'strip' }, g)
      if (!n.slot) {
        const tm = timeText(el('text', { x: w - 8, y: Z.padY + Z.lineH - 3, class: 'tm', 'text-anchor': 'end' }, g), n)
        fitText(el('text', { x: 12, y: Z.padY + Z.lineH - 3, class: 'l1' }, g), (n.alerts ? '⚠ ' : '') + n.label + (n.rounds ? ' · ' + roundsMax(n) + '회차' : '') + (n.alerts ? ' · ' + n.alerts.join(' · ') : ''), w - 30 - tm.getComputedTextLength())
        continue
      }
      const ls = nameLines(n)
      ls.forEach((s, i) => fitText(el('text', { x: 12, y: Z.padY + Z.lineH * (i + 1) - 3, class: i ? 'l1' : 'l1 b' }, g), s, Z.boxW - 18))
      fitText(el('text', { x: 12, y: Z.padY + Z.lineH * (ls.length + 1) - 3, class: 'l2' }, g), statusTxt(n), Z.boxW - 18)
      timeText(el('text', { x: 12, y: Z.padY + Z.lineH * (ls.length + 1) + Z.tmH - 3, class: 'tm' }, g), n, Z.boxW - 18)
    }
    if (path) {   // 터미널 : 시작 = 루트 왼쪽, 종료 = 왼쪽 맨 아래
      const r0 = L.pos['1'], bottom = Math.max(...Object.values(L.pos).map(p => p.y + p.h)), tx = -(Z.termW + Z.colGap)
      const tp = { S: r0.y + r0.h / 2 - Z.termH / 2, E: bottom - Z.termH }
      for (const id of ['S', 'E']) {
        const n = byId[id] = termNode(id, path), g = el('g', { class: 'node term st-' + n.status + (n.pend ? ' pend' : ''), transform: 'translate(' + tx + ' ' + tp[id] + ')', 'data-id': id }, gN)
        el('title', {}, g).textContent = n.label + ' — ' + spanTxt(n); geo[id] = { cx: tx + Z.termW / 2, cy: tp[id] + Z.termH / 2, hw: Z.termW / 2, hh: Z.termH / 2 }
        el('rect', { width: Z.termW, height: Z.termH, rx: Z.termH / 2, class: 'box' }, g)
        el('text', { x: Z.termW / 2, y: 13, class: 'l1 b', 'text-anchor': 'middle' }, g).textContent = n.label
        timeText(el('text', { x: Z.termW / 2, y: 26, class: 'tm', 'text-anchor': 'middle' }, g), n)
      }
      flowEdges(path, gF, gL, id => geo[id])
    }
    fit(Z.minScale)
  }

  // ── 자유 배치(Obsidian 스타일) : 반발력(전 쌍) + 엣지 스프링 + 중심 인력, 수렴 중·후 화면 맞춤, 라벨 겹치면 숨김(호버 표시) ──
  // ponytail: 전 쌍 O(n²) — 요청 1건 노드 수십 개 기준, 수백 개를 한 화면에 그릴 때 격자 근사로 교체
  function drawForce(nodes, L, path) {
    const RAN = ['done', 'running', 'error', 'blocked']
    const P = nodes.map(n => { const p = L.pos[n.id]; return { n, d: p.d, x: p.d * 140, y: (p.y + p.h / 2) * 0.8, vx: 0, vy: 0, r: Math.max(6, 15 - 2 * p.d) + (RAN.includes(n.status) ? 2 : 0) } })
    const at = Object.fromEntries(P.map(p => [p.n.id, p])), E = nodes.filter(n => n.parent).map(n => [at[n.parent], at[n.id]]), nStruct = E.length
    if (path) {   // 터미널도 노드로 띄우고, 시작 — 1 · 종료 — 직전 노드는 스프링으로만 잇는다(구조선은 그리지 않음)
      const r0 = at['1'], last = path.edges.filter(e => e.to === 'E').map(e => at[e.from]).find(Boolean) || r0
      for (const id of ['S', 'E']) { const n = byId[id] = termNode(id, path), p = { n, d: -1, x: r0.x - 140, y: id === 'S' ? r0.y : last.y + 60, vx: 0, vy: 0, r: 10 }; P.push(p); at[id] = p }
      E.push([at.S, r0], [last, at.E])
    }
    const gE = el('g', {}, root), gN = el('g', {}, root), gF = el('g', { class: 'flows fv' }, root), lines = E.slice(0, nStruct).map(() => el('line', { class: 'edge' }, gE))
    for (const p of P) {
      p.g = el('g', { class: 'fnode st-' + p.n.status, 'data-id': p.n.id }, gN); el('title', {}, p.g).textContent = tip(p.n)
      el('circle', { r: p.r }, p.g); p.t = el('text', { class: 'l1', y: 4 }, p.g); p.t.textContent = p.n.label.length > 22 ? p.n.label.slice(0, 21) + '…' : p.n.label
      if (p.n.term) { p.g.classList.add('term'); if (p.n.pend) p.g.classList.add('pend') }
    }
    const updFlow = path ? flowEdges(path, gF, gF, id => at[id] && { cx: at[id].x, cy: at[id].y, r: at[id].r }) : () => {}
    /** 얕은 노드 라벨부터 놓고, 앞서 놓은 라벨·다른 노드 원과 겹치면 숨김 */
    function declutter() {
      const shown = [], hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
      for (const p of P.slice().sort((a, b) => a.d - b.d)) {
        p.t.classList.remove('hid'); const b = p.t.getBBox(), box = { x: p.x + b.x - 2, y: p.y + b.y, w: b.width + 4, h: b.height }
        if (shown.some(o => hit(o, box)) || P.some(q => q !== p && hit({ x: q.x - q.r, y: q.y - q.r, w: q.r * 2, h: q.r * 2 }, box))) p.t.classList.add('hid'); else shown.push(box)
      }
    }
    let alpha = 1, n = 0
    const tick = () => {
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
        const a = P[i], b = P[j], dx = b.x - a.x, dy = b.y - a.y, d2 = Math.max(dx * dx + dy * dy, 40), d = Math.sqrt(d2), f = Z.repel / d2 * alpha
        a.vx -= dx / d * f; a.vy -= dy / d * f; b.vx += dx / d * f; b.vy += dy / d * f
      }
      for (const [a, b] of E) { const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - Z.link) * 0.05 * alpha; a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f }
      let cx = 0; for (const p of P) cx += p.x / P.length
      for (const p of P) { if (p === drag) { p.vx = p.vy = 0; continue } p.vx = (p.vx - p.x * Z.gravity * alpha) * 0.6; p.vy = (p.vy - p.y * Z.gravity * alpha) * 0.6; p.x += p.vx; p.y += p.vy }
      lines.forEach((ln, i) => { const [a, b] = E[i]; ln.setAttribute('x1', a.x); ln.setAttribute('y1', a.y); ln.setAttribute('x2', b.x); ln.setAttribute('y2', b.y) })
      for (const p of P) {   // 라벨은 중심 반대쪽(바깥)으로
        const out = p.x >= cx; p.t.setAttribute('x', out ? p.r + 4 : -(p.r + 4)); p.t.setAttribute('text-anchor', out ? 'start' : 'end')
        p.g.setAttribute('transform', 'translate(' + p.x + ' ' + p.y + ')')
      }
      updFlow()
      alpha *= 0.985; n++
      const done = alpha <= 0.02 && !drag
      if (n % 15 === 0 || done) { declutter(); if (!touched) fit(Z.forceMinScale) }
      if (!done) raf = requestAnimationFrame(tick)
    }
    const wake = () => { if (alpha <= 0.02) { alpha = 0.3; raf = requestAnimationFrame(tick) } else alpha = Math.max(alpha, 0.3) }
    hooks = { grab: id => { touched = true; wake(); return at[id] }, wake }
    tick()
  }
  function draw(r) {
    const nodes = r.nodes, path = flowOn ? r.path : null
    cancelAnimationFrame(raf); svg.textContent = ''; touched = false; hooks = {}; drag = pan = null
    svg.classList.toggle('flowon', !!path); if (path) markers()
    byId = Object.fromEntries(nodes.map(n => [n.id, n])); root = el('g', {}, svg)
    const L = layout(nodes)
    if (view === 'tree') drawTree(nodes, L, path); else drawForce(nodes, L, path)
  }
  const setView = v => { view = v; document.querySelectorAll('[data-view]').forEach(x => x.setAttribute('aria-pressed', x.dataset.view === v)) }
  $('list').addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) select(b.dataset.k) })
  for (const id of ['q', 'fc', 'fd']) $(id).addEventListener('input', () => { page = 1; renderList() })
  $('lprev').onclick = () => { page--; renderList(); saveHash() }; $('lnext').onclick = () => { page++; renderList(); saveHash() }
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
    setView(b.dataset.view); const r = D.requests.find(x => x.key === cur); if (r) draw(r); saveHash()
  }))
  const flowBtn = $('flow'); flowBtn.setAttribute('aria-pressed', flowOn)
  flowBtn.onclick = () => { flowOn = !flowOn; flowBtn.setAttribute('aria-pressed', flowOn); const r = D.requests.find(x => x.key === cur); if (r) draw(r); saveHash() }
  $('theme').onclick = () => { const h = document.documentElement, dark = (h.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark'; h.dataset.theme = dark ? 'light' : 'dark' }
  setView(view)
  if (D.requests.length) {
    select((D.requests.find(r => r.key === H.k) || D.requests[0]).key)
    if (H.z) { const z = H.z.split(',').map(Number); if (z.length === 4 && z.every(Number.isFinite)) { vb.x = z[0]; vb.y = z[1]; vb.w = z[2]; vb.h = z[3]; setVB(); touched = true } }
    if (H.s) $('list').scrollTop = +H.s
  } else { renderList(); $('detail').innerHTML = '<p class="muted">범위 안 요청 기록 없음 — 다음 요청부터 자동 기록</p>' }
  // 실데이터판 자동 새로고침 : 진행 중 요청이 있으면 짧게 — 선택·보기·쪽·스크롤·확대는 location.hash 로 보존
  if (D.live) setTimeout(() => { saveHash(); location.reload() }, D.requests.some(r => r.running) ? Z.reloadRun : Z.reloadIdle)
}

/** 상태 색 CSS : 클래스 st-<상태> 에 변수(--sc 테두리·--sf 채움·--st 글자·--si 본문 글자), 다크 덮어쓰기는 테마 선택자 안에 */
function statusCss() {
  const vars = s => `--sc:${s.color};--st:${s.text};${s.fill ? `--sf:${s.fill};` : ''}${s.ink ? `--si:${s.ink};` : ''}`
  const base = Object.entries(STATUS_STYLE).map(([k, s]) => `.st-${k}{${vars(s)}}`).join('')
  const dark = sel => Object.entries(STATUS_STYLE).filter(([, s]) => s.dark).map(([k, s]) => `${sel} .st-${k}{${vars({ ...s, ...s.dark })}}`).join('')
  return base + dark(':root[data-theme=dark]') + `@media (prefers-color-scheme: dark){${dark(':root:not([data-theme=light])')}}`
}

export function renderHtml({ design, outDir, requests, meta }) {
  const data = { design: !!design, live: !design, size: SIZE, flow: FLOW_COLOR, alert: ALERT, slots: SLOTS.map(s => ({ id: s.id, role: s.role, criteria: s.criteria, docs: s.docs.map(d => docLink(outDir, d)) })), requests }
  const cats = [...new Set(requests.map(r => r.cat).filter(Boolean))], dates = [...new Set(requests.map(r => r.date).filter(Boolean))]
  const catLabel = Object.fromEntries(CATEGORIES.map(c => [c.key, c.label]))
  const DARK = '--surface:#1a1a19;--page:#0d0d0d;--ink:#fff;--ink2:#c3c2b7;--muted:#898781;--grid:#2c2c2a;--axis:#383835;--w:#3987e5;--o:#d95926;--ring:rgba(255,255,255,.10);color-scheme:dark'
  const RUN = STATUS_STYLE.running
  // 다른 판 링크(2026-11-09 마스터) : 출력 위치 기준 상대경로 — 실데이터판은 gitignore 라 다른 PC 에선 생성 전까지 없음
  const other = path.relative(outDir, path.join(ROOT, design ? PATHS.live : PATHS.design)).replace(/\\/g, '/')
  const link = design ? `<a href="${esc(encodeURI(other))}">실시간 모니터링판 열기</a> <span class="muted">(로컬 생성 후 열림)</span>` : `<a href="${esc(encodeURI(other))}">설계도판 열기</a>`
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>요청 처리 흐름 그래프${design ? ' — 설계도' : ''}</title>
<style>
:root{color-scheme:light;--surface:${PAGE_BG.light};--page:#f9f9f7;--ink:#0b0b0b;--ink2:#52514e;--muted:#898781;--grid:#e1e0d9;--axis:#c3c2b7;--w:#2a78d6;--o:#eb6834;--ring:rgba(11,11,11,.10)}
:root[data-theme=dark]{${DARK}}@media (prefers-color-scheme: dark){:root:not([data-theme=light]){${DARK}}}
${statusCss()}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:13.5px/1.5 "Nanum Gothic","Malgun Gothic",system-ui,sans-serif}
header{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:14px 20px 6px}h1{font-size:19px;margin:0}.meta{color:var(--ink2);font-size:12.5px;margin:0 20px 10px}.meta a{color:var(--w);font-weight:700}.sp{flex:1}
button,input,select{font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--axis);border-radius:6px;padding:3px 9px}button{cursor:pointer}button[aria-pressed=true]{background:var(--w);border-color:var(--w);color:#fff}button:disabled{opacity:.4;cursor:default}
.wrap{display:grid;grid-template-columns:260px minmax(0,1fr) 280px;gap:12px;padding:0 20px 20px}@media (max-width:1100px){.wrap{grid-template-columns:1fr}}
.card{background:var(--surface);border:1px solid var(--ring);border-radius:10px;padding:10px 12px;min-width:0}
.ctl{display:grid;gap:6px;margin:0 0 8px}#list{list-style:none;margin:0;padding:0;max-height:70vh;overflow:auto}#list button{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--grid);border-radius:0;background:none;padding:6px 4px}#list button[aria-current]{background:color-mix(in srgb,var(--w) 14%,transparent)}
.rt,.rm{display:block;color:var(--muted);font-size:11.5px}.rh{display:block;word-break:break-all}.lpg{display:flex;gap:6px;align-items:center;margin-top:8px}
.gwrap{height:calc(100vh - 225px);min-height:420px;border:1px solid var(--grid);border-radius:8px;overflow:hidden}#svg{display:block;width:100%;height:100%;touch-action:none;cursor:grab}.gtitle{margin:0 0 6px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ghd{display:flex;gap:8px;align-items:flex-start}.ghd .legend{flex:1}.zc button{min-width:34px;padding:2px 8px}
.edge{fill:none;stroke:var(--axis);stroke-width:1.4}.flowon .edge{stroke-opacity:.35}.node,.fnode{cursor:pointer}
.fl .v{fill:none;stroke-width:2.2}.fl .hit{fill:none;stroke:transparent;stroke-width:12}.flows:not(.fv) .fl{pointer-events:none}.fv .fl .hit{pointer-events:stroke}
${Object.entries(FLOW_COLOR).map(([k, c]) => `.fl.${k} .v{stroke:${c}}.seqg.${k} .sq{fill:${c}}`).join('')}.fl.loop .v{stroke-width:2.6}
.fl.running .v{stroke-width:3.2;animation:pulse 1.2s ease-in-out infinite}.fl.plan .v{stroke-dasharray:6 5}.seqg.plan{opacity:.45}
.seqg.running .sq{fill:${RUN.fill};stroke:${RUN.color}}.sq{stroke:var(--surface);stroke-width:1.5}.sqt{font-size:9.5px;font-weight:700;fill:#fff}.seqg.running .sqt{fill:${RUN.ink}}.lpl{font-size:10.5px;font-weight:700;fill:var(--ink);paint-order:stroke;stroke:var(--surface);stroke-width:3px}
.fv .seqg{opacity:0}.fv .fl:hover .seqg{opacity:1}.term.pend .box,.fnode.term.pend circle{stroke-dasharray:4 3}.fleg{color:var(--ink2)}.fleg .fr{color:${RUN.color};text-shadow:0 0 4px ${RUN.fill}}
.box{fill:var(--sf,var(--surface));stroke:var(--sc);stroke-width:1.6}.strip{fill:var(--sc)}.st-missing .box,.st-estimated .box{stroke-dasharray:5 3;stroke-width:2}
.l1{font-size:12.5px;fill:var(--si,var(--ink))}.l1.b{font-weight:700}.l2{font-size:11.5px;fill:var(--si,var(--st))}.tm{font-size:10px;fill:var(--si,var(--ink2))}
.fnode circle{fill:var(--sf,var(--sc));stroke:var(--sc);stroke-width:2}.fnode.st-missing circle{fill:var(--surface);stroke-dasharray:3 2}.fnode.st-estimated circle{stroke-dasharray:3 2}
.fnode .l1{font-size:12px;fill:var(--ink2);paint-order:stroke;stroke:var(--page);stroke-width:3px;stroke-linejoin:round}.fnode .l1.hid{opacity:0}.fnode:hover .l1{opacity:1;fill:var(--ink)}
.legend{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:var(--ink2);margin:0 0 8px}.legend i{display:inline-block;width:11px;height:11px;border-radius:6px;margin-right:4px;vertical-align:-1px;background:var(--sf,var(--sc));border:1.5px solid var(--sc)}.legend i.st-missing{border-style:dashed;background:transparent}.legend i.st-estimated{border-style:dashed}
.badge{display:inline-block;border:1px solid var(--axis);border-radius:5px;padding:0 6px;font-size:12px}.badge[class*=st-]{color:var(--st);border-color:var(--sc);background:var(--sf,transparent)}.badge.st-missing,.badge.st-estimated{border-style:dashed}.badge.alert{color:${STATUS_STYLE.error.text};border:2px solid ${STATUS_STYLE.error.color};font-weight:700}:root[data-theme=dark] .badge.alert{color:${STATUS_STYLE.error.dark.text}}@media (prefers-color-scheme: dark){:root:not([data-theme=light]) .badge.alert{color:${STATUS_STYLE.error.dark.text}}}.est{border-style:dashed;color:var(--o);border-color:var(--o)}
@keyframes pulse{0%,100%{filter:drop-shadow(0 0 1px ${RUN.fill})}50%{filter:drop-shadow(0 0 8px ${RUN.fill}) drop-shadow(0 0 3px ${RUN.color})}}@keyframes blink{50%{opacity:.2}}@keyframes blinkf{50%{fill-opacity:.15}}
.st-running .box,.fnode.st-running circle,.legend i.st-running,.badge.st-running{animation:pulse 1.2s ease-in-out infinite}.blink{animation:blink 1.2s ease-in-out infinite}tspan.blink{animation-name:blinkf}
@media (prefers-reduced-motion: reduce){.fl.running .v{animation:none;stroke-width:4.5}.st-running .box,.fnode.st-running circle,.legend i.st-running,.badge.st-running,.blink{animation:none}.st-running .box,.fnode.st-running circle{stroke-width:3.5}.legend i.st-running,.badge.st-running{border-width:3px}}
#detail h3{font-size:15px;margin:0 0 6px;word-break:break-all}#detail h4{font-size:13px;margin:12px 0 4px}#detail ul{padding-left:18px;margin:6px 0}#detail dt{color:var(--muted);font-size:12px;margin-top:8px}#detail dd{margin:0}#detail a{color:var(--w)}.tm{font-size:12px;color:var(--ink2)}
.rd{border-collapse:collapse;width:100%;font-size:11.5px}.rd th,.rd td{border-bottom:1px solid var(--grid);padding:2px 4px;text-align:left;vertical-align:top}.rd th{color:var(--muted);font-weight:400}.rd .sum td{font-weight:700;border-bottom:0}.muted{color:var(--muted)}
</style></head><body>
<header><h1>요청 처리 흐름 그래프${design ? ' <small class="muted">설계도</small>' : ''}</h1><span class="sp"></span>
<button type="button" data-view="tree" aria-pressed="true">계층 트리</button><button type="button" data-view="force" aria-pressed="false">자유 배치(Obsidian 스타일)</button><button type="button" id="flow" aria-pressed="true" title="시작 → 실행 순서 → 종료 화살표 켜기/끄기">실행 경로</button><button type="button" id="theme" title="라이트/다크 전환">라이트/다크</button></header>
<p class="meta">${esc(meta)} · ${link}</p>
<div class="wrap">
<aside class="card"><div class="ctl"${design ? ' hidden' : ''}><input id="q" type="search" placeholder="요청문 검색"><select id="fc"><option value="">카테고리 전체</option>${cats.map(c => `<option value="${esc(c)}">${esc(catLabel[c] || c)}</option>`).join('')}</select><select id="fd"><option value="">날짜 전체</option>${dates.map(d => `<option>${esc(d)}</option>`).join('')}</select></div>
<ul id="list"></ul><div class="lpg"${design ? ' hidden' : ''}><button type="button" id="lprev">‹ 이전</button><button type="button" id="lnext">다음 ›</button><span id="lcnt" class="muted"></span></div></aside>
<section class="card"><div class="ghd"><div class="legend">${Object.entries(STATUS_STYLE).map(([k, s]) => `<span><i class="st-${k}"></i>${esc(s.label)}</span>`).join('')}<span><span class="badge est">${EST_BADGE}</span></span><span class="fleg"><b style="color:${FLOW_COLOR.done}">—</b> 지나감(실선) · <b style="color:${FLOW_COLOR.planned}">- -</b> 예정(점선) · <b class="fr">—</b> 진행 중 노드로 진입 · 되돌이 = k회차</span></div><span class="zc" role="group" aria-label="확대/축소"><button type="button" data-z="fit" title="그림 전체를 화면에 맞춤">맞춤</button> <button type="button" data-z="in" title="확대">+</button> <button type="button" data-z="out" title="축소">−</button></span></div>
<p id="gtitle" class="gtitle"></p><div class="gwrap"><svg id="svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="요청 처리 흐름 그래프"></svg></div></section>
<aside class="card" id="detail"></aside>
</div>
<script type="application/json" id="graphdata">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script>const fmtSpan = ${fmtSpan}, roundSummary = ${roundSummary};(${client})()</script></body></html>`
}

function writeSlotMd(dir) {
  fs.mkdirSync(dir, { recursive: true })
  const mapTxt = (s) => {
    const m = SLOT_MAP[s.id]
    if (!m) return s.kind === 'approve' ? 'teamanakin-admin 실행 기록' : s.kind === 'request' || s.kind === 'main' ? '턴(요청) 기록' : '미배정(설계) — SLOT_MAP 항목 없음'
    if (m.source === 'runs.jsonl') return `담당 ${m.owner} — 생성기 실행 기록 runs.jsonl 기준(\`${PATHS.runs}\`, 마스터 확정 2026-11-09) : 턴 창 안 실행 있으면 완료 · 없으면 미수행 · 로그 첫 기록 이전 턴 = 기록 이전`
    const xs = [...(m.agents || []).map(x => `에이전트 ${x}`), ...(m.hooks || []).map(x => `훅 ${x}`), ...(m.loops ? [m.loops === true ? `Codex 루프(${EST_BADGE})` : `Codex 루프 ${m.loops.join(', ')}`] : [])]
    return xs.length ? xs.join(' · ') + (ENG_SLOTS.includes(s.id) ? ' — 기록 없으면 미수행' : '') : '대응 없음 [확인중 : 마스터] — 늘 미수행'
  }
  for (const s of SLOTS) {
    const kids = SLOTS.filter(x => x.parent === s.id), parent = SLOTS.find(x => x.id === s.parent)
    const body = [`# ${s.id} ${s.label}`, '', `> 요청 처리 흐름 설계 슬롯 — 생성기 \`scripts/request-graph.mjs --design-only --md\`(손으로 고치지 말 것) · 그래프 규칙 [[anakins_graph]] · 목차 [[00. index]]`, '',
      '| 항목 | 내용 |', '|---|---|', `| 역할 | ${s.role} |`, `| 검수 기준 | ${s.criteria} |`, `| 정본 | ${s.docs.map(d => `[[${path.basename(d, '.md')}]]`).join(' · ')} |`,
      `| 실행 대응(SLOT_MAP) | ${mapTxt(s)} |`, '',
      `**상위** ${parent ? `[[${slotFile(parent)}]]` : '없음(시작 노드)'}`, '', `**하위** ${kids.length ? kids.map(k => `[[${slotFile(k)}]]`).join(' · ') : '없음'}`, '']
    fs.writeFileSync(path.join(dir, slotFile(s) + '.md'), body.join('\n'))
  }
  return SLOTS.length
}

const ROLE_NODE = new Set(['collect', 'decide', 'build', 'verify', 'review', 'commit', 'graph'])   // 60. nodes/ 카드가 있는 단계
const roleLink = type => { const m = /^anakin_phase-(\w+)$/.exec(type || ''); return m && ROLE_NODE.has(m[1]) ? ` [[${m[1]}]]` : type === ADMIN_TYPE ? ` [[${ADMIN_TYPE}]]` : '' }

function writeRequestMd(dir, items, now) {
  fs.mkdirSync(dir, { recursive: true })
  const keep = new Set()
  for (const r of items) {
    const f = safeName(`${r.when.replace(':', '')} ${r.sid} ${r.head.slice(0, 40)}`) + '.md'; keep.add(f)
    const agents = r.nodes.filter(n => !n.slot), by = id => r.nodes.find(n => n.id === id)
    const rounds = r.nodes.filter(n => n.rounds).flatMap(n => n.rounds.map(g => ({ n, g })))
    const body = [`# ${r.head}`, '', `> 요청 노드(실데이터 — gitignore) · 생성기 \`scripts/request-graph.mjs --md\` · ${r.when} · ${r.catLabel || '-'} · 상태 ${r.statusLabel} · 엔지니어링 ${engTxt(by('1').eng, by('1').engEst)} 수행 · 묶음 누적 ${by('1').cum.n}/${by('1').cum.cap}${r.alert ? ` · ⚠ ${r.alert}` : ''}`, '',
      ...by('1').lines.slice(1).map(l => `- ${l}`), '',
      `${fmtSpan(by('1'), now)}`, '',
      `흐름 : [[${slotFile(SLOTS[0])}]] → [[${slotFile(SLOTS[1])}]] → [[${slotFile(SLOTS.at(-1))}]]`, '',
      '## 엔지니어링 5단계', '', ...ENG_SLOTS.map(id => { const n = by(id), s = SLOTS.find(x => x.id === id); return `- [[${slotFile(s)}]] — ${n.statusLabel} · ${fmtSpan(n, now)}` }), '',
      '## 실행 에이전트(시간순)', '', ...(agents.length ? agents.map(n => `- ${n.label}${roleLink(n.label)} — ${n.statusLabel}${n.alerts ? ` · ⚠ ${n.alerts.join(' · ')}` : ''} · ${fmtSpan(n, now)} · ${n.lines.join(' · ')}`) : ['- 없음(메인 단독 턴)']), '',
      `## 승인(1.2) : ${by('1.2').statusLabel}`, '',
      '## 실행 경로', '', (r.path?.edges || []).map(e => `${e.seq}. ${e.to === 'E' ? '종료' : (by(e.to)?.slot ? e.to + ' ' : '') + (by(e.to)?.label || e.to)}${e.label ? ` [${e.label}]` : ''}${e.state === 'running' ? ' (진행 중)' : e.state === 'planned' ? ' (예정)' : ''}`).join(' → ') || '-', '',
      ...rounds.flatMap(({ n, g }) => { const s = roundSummary(g.rows, now); return [`## 회차 — ${n.slot ? n.id + ' ' : ''}${n.label} · ${g.name} (${g.base ? `묶음 누적 ${g.base + s.n}` : s.n}/${g.cap})`, '', ...g.rows.map(x => `- ${x.label} : ${fmtSpan(x, now)} · ${x.state || ''}`), `- 합계 ${s.n}회 · 총 소요 ${Math.floor(s.totalMs / 60e3)}m ${Math.round(s.totalMs / 1e3) % 60}s`, ''] })]
    fs.writeFileSync(path.join(dir, f), body.join('\n'))
  }
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.md') && !keep.has(f)) fs.unlinkSync(path.join(dir, f))   // 최근 N건만 유지(생성기 산출 폴더)
  return items.length
}

function main() {
  const args = process.argv.slice(2), has = k => args.includes(k)
  const argOf = (k, d) => { const i = args.indexOf(k); const v = args[i + 1]; return i < 0 ? undefined : v && !v.startsWith('--') ? v : d }
  const delay = +argOf('--delay', 0) || 0   // 훅 직후 실행 : 세션 기록 마지막 줄이 디스크에 쓰일 시간
  if (delay > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(delay, 5000))
  const design = has('--design-only')
  const out = path.resolve(ROOT, argOf('--out', '') || (design ? PATHS.design : PATHS.live)), outDir = path.dirname(out)
  const mdDir = has('--md') ? path.resolve(ROOT, argOf('--md', design ? PATHS.flowMd : PATHS.reqMd)) : null
  // 실행 기록 append(요청문·비용 없음) — 그리기 전에 남겨 이번 실행이 진행 중 턴의 1.1.5.2 에 바로 잡힌다. 실패는 그래프 생성을 막지 않음
  const runsFile = path.join(ROOT, PATHS.runs), trigger = RUN_TRIGGERS.includes(argOf('--trigger')) ? argOf('--trigger') : 'manual'
  try { fs.mkdirSync(path.dirname(runsFile), { recursive: true }); fs.appendFileSync(runsFile, JSON.stringify({ ts: new Date().toISOString(), trigger, mode: design ? 'design' : 'live', md: !!mdDir }) + '\n') } catch (e) { if (!has('--quiet')) console.error(`실행 기록 건너뜀 : ${e.message}`) }
  let requests, msg
  if (design) {
    requests = [{ key: 'design', when: '설계도', head: '설계도 — 요청 1건의 처리 흐름(마스터 설계 트리)', meta: '', nodes: designGraph() }].map(r => ({ ...r, path: buildPath(r.nodes, { design: true }) }))
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(out, renderHtml({ design, outDir, requests, meta: '설계도판 — 실데이터(요청문·비용·시각) 없음, 시간은 형식 자리표시. 실요청 모니터링판은 work-statistics/mywork/myRequestGraph.html(gitignore, 턴 종료·서브에이전트 시작/종료 때 자동 갱신 + 화면 자동 새로고침). 노드를 누르면 역할·검수 기준·정본 문서. 원문 1.1.5.3.1 은 번호 오기로 보고 1.1.5.2.1 로 정규화.' }))
    msg = `${path.relative(ROOT, out)} : 설계도 1건, 노드 ${SLOTS.length}개`
    if (mdDir) msg += ` · 슬롯 md ${writeSlotMd(mdDir)}개 → ${path.relative(ROOT, mdDir)}`
  } else {
    const now = Date.now(), days = Math.max(1, +argOf('--days', SIZE.days) || SIZE.days), fromMs = now - days * 864e5
    const redact = makeRedactor({ workspaceRoot: ROOT }), loops = loadLoops(path.join(ROOT, PATHS.loops)), catLabel = Object.fromEntries(CATEGORIES.map(c => [c.key, c.label]))
    const turns = buildTurns(loadRows({ from: new Date(fromMs - 864e5).toISOString().slice(0, 10) }), fromMs)
    const sessDir = path.join(process.env.TOOLDASH_HOME || os.homedir(), '.claude/projects', (process.env.TOOLDASH_PROJECT || ROOT).replace(/[^A-Za-z0-9]/g, '-'))   // Claude Code 프로젝트 폴더 규칙(model-change-dashboard 와 같음)
    let liveTurns = []
    try { liveTurns = scanLive(turns, { sessDir, now }) } catch (e) { if (!has('--quiet')) console.error(`턴 중간 스캔 건너뜀 : ${e.message}`) }
    const all = [...liveTurns, ...turns].sort((x, y) => ms(y.ts_req) - ms(x.ts_req))
    try { loadAgentRounds(all, sessDir, path.join(ROOT, PATHS.roundsCache)) } catch (e) { if (!has('--quiet')) console.error(`팀원 회차 읽기 건너뜀 : ${e.message}`) }
    splitAgentRounds(all)
    // ponytail: 실행 기록 전체 읽기(줄당 약 80바이트) — 수 MB 넘으면 기간 회전 추가
    let runs = []; try { runs = fs.readFileSync(runsFile, 'utf8').split('\n').flatMap(l => { try { return l ? [JSON.parse(l)] : [] } catch { return [] } }) } catch { /* 기록 없음 = 전 턴 '기록 이전' */ }
    requests = all.map(t => {
      const nodes = buildRequestGraph(t, loops, { now, runs }), n1 = nodes[0], ag = nodes.filter(n => !n.slot).length, when = new Date(ms(t.ts_req)).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16)
      const cost = t.live ? null : (t.cost_usd || 0) + (t.cost_agents_usd || 0)
      const head = redact(t.req_head || '').replace(/<\/?[a-z_-]+(?:\s[^>]*)?>/gi, '').trim().slice(0, SIZE.headCut) || '(요청문 없음)'
      return { key: t.key, sid: `${t.session || ''}-${t.turn ?? ''}`, date: when.slice(0, 10), when, head, cat: t.category || '', catLabel: catLabel[t.category] || t.category || (t.live ? '진행 중(기록 전)' : ''), st: n1.status, statusLabel: n1.statusLabel, running: n1.run, path: buildPath(nodes), meta: `에이전트 ${ag} · ${cost == null ? '$—' : '$' + cost.toFixed(2)} · 엔지니어링 ${engTxt(n1.eng, n1.engEst)} · 묶음 ${n1.cum.n}/${n1.cum.cap} ·`, alert: n1.alertN ? `경보 ${n1.alertN}${n1.cum.level ? ' · ' + n1.cum.level : ''}` : '', nodes }
    })
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(out, renderHtml({ design, outDir, requests, meta: `최근 ${days}일 요청 ${requests.length}건(진행 중 ${requests.filter(r => r.running).length}) · 갱신 ${new Date(now).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })} (턴 종료·서브에이전트 시작/종료 때 재생성, 화면은 진행 중 있으면 ${SIZE.reloadRun / 1e3}초·없으면 ${SIZE.reloadIdle / 1e3}초마다 새로고침) · 비용은 API 단가 환산(청구액 아님, 진행 중 턴은 종료 후 기록) · 점선 배지 = 턴 시간창 기준 추정 연결 · 경로·비밀값 마스킹` }))
    msg = `${path.relative(ROOT, out)} : 요청 ${requests.length}건(진행 중 ${requests.filter(r => r.running).length}), 노드 ${requests.reduce((s, r) => s + r.nodes.length, 0)}개, 루프 원장 ${loops.length}개`
    if (mdDir) msg += ` · 요청 md ${writeRequestMd(mdDir, requests.slice(0, SIZE.mdRecent), now)}건 → ${path.relative(ROOT, mdDir)}`
  }
  if (!has('--quiet')) console.log(msg)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
