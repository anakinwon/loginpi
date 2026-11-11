/**
 * request-graph.mjs : 요청 처리 흐름 그래프(마스터 설계 트리 1 ~ 1.2) + 실요청 모니터링 HTML·Obsidian md 노드 생성기 (2026-11-08 마스터 지시)
 * 원천 : work-history jsonl 턴·agent 레코드(loadRows·buildTurns) + Codex 루프 원장 .omc/state/loop/<id>/ledger.json + 턴 중간 = 세션 기록(~/.claude/projects/<프로젝트>/) 꼬리 스캔
 * 실행 : node scripts/request-graph.mjs [--out html] [--days 7] [--md [dir]] [--delay ms] | --design-only [--out html] [--md [dir]]  (실데이터판 = Stop·SubagentStart/Stop 훅 자동 갱신)
 *   [--trigger …] : 훅이 넘기는 호출 출처 — 무시(2026-11-10 실행 기록 runs.jsonl 폐지)
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
  roundsCache: '.omc/state/request-graph/rounds-cache.json',         // 팀원 에이전트 회차 캐시(agent_id → 기록 크기·mtime·회차, gitignore)
  harnessCache: '.omc/state/request-graph/harness-cache.json',
  summaries: '.omc/state/request-graph/summaries',                  // SA-컨텍스트 요약 캐시 <요청 id>.json = { before, after, related, points, by, at } — anakin_phase-graph 가 판독 때 작성(gitignore)
  toolCache: '.omc/state/request-graph/tool-cache.json',            // 하네스 사용 기록 캐시(기록 파일 → 크기·mtime·[시각, 도구명], gitignore — 입력값 없음)       // 산출 실행 하네스 변경 감지 캐시(agent_id → 기록 크기·mtime·결과, gitignore)
  wfCache: '.omc/state/request-graph/workflow-cache.json',           // 워크플로 에이전트 캐시(agent_id → 기록 크기·mtime·시작·끝·모델, gitignore)
  approvals: '.omc/state/codex-gate/approvals.jsonl',                 // Stop 훅 turn-gate.mjs 종료 승인 줄 기록기(비차단, 2026-11-10 개정 — 승인·보류, gitignore) — 과거 '승인 강제 실패' 이력만 1.2 에 읽음
}
/** 과거 턴 묶음 판정 원장 id(c<N>-turn-<세션 6자>-<KST MMDDHHmmss> — Stop 훅 턴 묶음 판정은 2026-11-10 개정으로 폐지) : 집계 제외용(isLoopLedger) */
export const TURN_ID_RE = /-turn-[0-9a-z]{1,6}-\d{10}$/
/** 메인 응답의 종료 승인 줄(2026-11-10 마스터 "총괄검수가 끝나면 반드시 파다완 아소카의 종료 승인") : '종료 승인 : <승인|보류> — <근거>' → { kind, why } | null(마지막 줄 우선) */
export const APPROVAL_RE = /^[ \t>*_-]*종료 승인\s*:\s*(승인|보류)\s*[—–-]+\s*(.+?)\s*$/gm
export const approvalOf = text => { const m = [...String(text || '').matchAll(APPROVAL_RE)].at(-1); return m ? { kind: m[1], why: m[2].replace(/[*_`]+$/g, '').trim().slice(0, 200) } : null }
// ponytail: Stop 훅 실행은 응답 직후(로거·통계 다음)라 턴 창 끝 뒤에 찍힌다 → 창 끝 60초 유예. 그 사이 다음 턴이 시작되면 그 턴 실행도 앞 턴에 잡힐 수 있음(세션 구분 필드 추가 시 해소)
const RUN_GRACE_MS = 60e3
/** BLOCKED 사유 표기 — in-progress = 과거 턴 묶음 판정의 '수정 진행 중' 보류(2026-11-10 폐지 — 과거 원장 표기용) */
export const reasonTxt = r => String(r || '사유 미기록').split(',').map(x => x === 'in-progress' ? '수정 진행 중' : x).join(',')
/**
 * 상태 색(2026-11-08 마스터 : 완료 = 연초록, 진행 = 형광 노랑 + 깜빡임, 주황 = 미수행 점선만)
 * color = 테두리·띠·점, fill = 카드·원 채움, text = 상태 글자(채움 또는 바탕 위 대비 AA 4.5:1 이상 — 시험 test/request-graph.test.mjs), ink = 카드 본문 글자 고정색, dark = 다크 모드 덮어쓰기
 */
export const STATUS_STYLE = {
  done: { label: '완료', color: '#3fa66b', fill: '#dcf5e3', text: '#1e6b40', dark: { color: '#5cc98a', fill: '#1f3d2b', text: '#7fdca4' } },
  // 완료(추정) = 시각 없는 훅 기록만 있는 슬롯(2026-11-09 결함 ③) : 완료와 같은 연초록 채움 + 실선 테두리(2026-11-09 마스터 — 점선 제거, '완료(추정)'·'훅 실행(시각 미기록)' 글자로 구분)
  estimated: { label: '완료(추정)', color: '#3fa66b', fill: '#dcf5e3', text: '#1e6b40', dark: { color: '#5cc98a', fill: '#1f3d2b', text: '#7fdca4' } },
  running: { label: '진행', color: '#c9b800', fill: '#fff200', text: '#1a1a1a', ink: '#1a1a1a', pulse: true },
  error: { label: '오류', color: '#d03b3b', text: '#b42f2f', dark: { text: '#f0705c' } },
  blocked: { label: 'BLOCKED', color: '#8a5cc2', text: '#7446ad', dark: { text: '#b993e6' } },
  missing: { label: '미수행', color: '#eb6834', text: '#a8461a', dash: true, dark: { text: '#f08a5d' } },
  unassigned: { label: '미배정(설계)', color: '#898781', text: '#5f5e5a', dark: { text: '#b0afa9' } },
  notrun: { label: '미실행', color: '#c3c2b7', text: '#5f5e5a', dark: { text: '#a9a8a2' } },
}
export const PAGE_BG = { light: '#fcfcfb', dark: '#1a1a19' }      // 카드 바탕(--surface) — 대비 시험 기준
/**
 * Codex 칸 바탕(2026-11-09 마스터 : 형광 분홍 2단계, 같은 날 미완료 #ffc2ef→#ffd9f4·왼쪽 띠 분홍·미수행 점선) — pending = PASS 아닌 전부(미실행·진행·FAIL·BLOCKED 등) 연분홍, done = PASS 진분홍
 * fill = 박스·원 바탕, ink = 박스 글자(대비 AA 4.5:1 이상), strip = 박스 왼쪽 띠(글자 없음 — 바탕 대비 비텍스트 3:1 이상, 시험 test/request-graph.test.mjs). 다크 모드도 같은 값(마스터 결정). 완료(추정)도 done. 미실행·미수행 = 띠 색 점선 테두리(일반 노드 미수행 점선과 같은 모양), 그 밖의 상태 구분은 테두리(--sc)·상태 글자로 유지
 */
export const CODEX_STYLE = {
  pending: { fill: '#ffd9f4', ink: '#1a1a1a', strip: '#db2777' },
  done: { fill: '#ff4fc8', ink: '#1a1a1a', strip: '#831843' },
}
// 트리 : 노드 폭·열 간격·줄 높이(px, viewBox 단위), 화면 맞춤 배율 하한(글자 약 9px 유지)·상한 / 자유 배치 : 반발력·링크 길이·중심 인력 / 자동 새로고침 간격
//   세로 트리 : wrapW = 형제 한 줄 최대 폭(넘으면 다음 줄로 접음 — SA·CDX 쌍 5개가 한 줄), rowGap = 깊이 사이 세로 간격(흐름 순번 배지 자리)
//   pairGap·pairIndent = 세로 흐름에서 짝 CDX 를 SA 바로 아래 붙이는 간격(화살표가 보이게 28 — 마스터 2026-11-10)·들여쓰기(2026-11-10 마스터 C-11 — CDX = SA 자식 depth + 1, 가로 흐름은 바로 오른쪽 다음 열), chipH = 칸 안 실행·판정 줄 높이
//   termGapS·termGapE = 세로 흐름에서 시작·종료 터미널과 1번 칸·승인 칸 사이 가로 간격(같은 값 — 2026-11-10 마스터 C-15), foot = 세로 흐름 맨 아래 정중앙 칸(승인)
const SIZE = { termW: 96, termH: 32, termGapS: 40, termGapE: 40, foot: '1.2', boxW: 158, colGap: 26, pairGap: 28, pairIndent: 18, chipH: 13, wrapW: 1800, rowGap: 34, lineH: 15, tmH: 13, padY: 6, gapY: 8, minScale: 0.72, maxScale: 1.4, forceMinScale: 0.45, repel: 9000, link: 120, gravity: 0.003, reloadRun: 5000, reloadIdle: 30000, pageSize: 50, days: 7, mdRecent: 30, headCut: 80 }
export const FLOW_COLOR = { done: '#3fa66b', running: '#c9b800', planned: '#898781', example: '#898781', design: '#2a78d6', yes: '#1e6b40', no: '#d03b3b', noold: '#d03b3b' }   // 실행 경로 화살표·화살촉 색(완료 연초록 · 진행 형광 노랑 테두리색 · 대기·예시 회색 · 설계도 파랑 · 검증 Y 뒤 다음 칸 간선 진초록 · 검증 N 되돌림 빨강 점선, 흐림 = 최종 Y 이전 N 이력)
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
/** anakin_phase-verify = 2026-11-10 폐지(Codex 판정은 SubagentStop 훅 .claude/hooks/codex-gate.mjs 자동). 과거 기록의 verify 실행은 화면·집계에서 숨기고 그 판정(원장)은 CDX 칸에만 반영 */
const LEGACY_VERIFY = 'anakin_phase-verify'
/**
 * Codex 루프 판정 비대상 에이전트(2026-11-10 마스터 "프롬프트+컨텍스트+그래프+총괄=>제거, 루프 유지+하네스는 루프에 흡수" — 훅 codex-gate.mjs NO_GATE 와 같은 값, 훅 selftest 가 일치 확인)
 *   이 밖의 실행은 파일을 바꿨을 때만(wrote) c4 원장 하나(c4-<주제>-<agentId 앞 6자>)로 판정 — 하네스 파일도 같은 원장
 */
export const NO_GATE = new Set(['anakin_phase-collect', 'anakin_phase-decide', 'anakin_phase-review', 'anakin_phase-graph', 'anakin_phase-commit', 'teamanakin-admin'])
/** 하네스 경로(훅·settings·에이전트 정의·운용 기준서 + 40. loop 절차) — 산출 실행의 Write·Edit 대상이 여기면 SA-하네스 표식, 판정은 CDX-루프(c4) 원장에 포함(2026-11-10 개정). 하위 앱 .claude/ 도 포함 */
export const HARNESS_RE = /(^|[\\/])\.claude[\\/](hooks|agents|skills|engineering[\\/]40\. loop)[\\/]|(^|[\\/])\.claude[\\/]settings[^\\/]*\.json$/
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
export const ENG_SLOTS = ['1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5']   // 표준 처리 엔지니어링 5단계(10 프롬프트 · 20 컨텍스트 · 30 하네스 · 40 루프 · 50 그래프)

/**
 * 기본 SLOT_MAP(제안 — 2026-11-08) : 슬롯 id → { agents: agent 레코드 type, hooks: 훅 이벤트명, loops: true(턴 시간창 안 Codex 루프, 추정) | [루프 id] }
 * 엔지니어링 슬롯(ENG_SLOTS)은 대응 기록이 하나도 없으면 '미수행'(표준 처리 누락 표시). 항목 없는 슬롯은 '미배정(설계)'
 */
export const SLOT_MAP = {
  // SA 칸 표시·내용(show, 2026-11-10 마스터 C-8·C-9) : prompt·context·graph = 모든 요청 표시, harness = 도구 tool_use·훅 주입 1건 이상, loop = 되돌림(N 1회 이상) 또는 반복 1건 이상(C-13) — 증거 없으면 SA·CDX 쌍을 숨김
  // 프롬프트 = 마스터 요청문 + 메인 브리프(서브에이전트 디스패치 건수)
  '1.1.1': { show: 'prompt' },
  // 컨텍스트 = 그 턴이 읽거나 주입받은 맥락(주입 훅·Read·collect) — 마스터 확정 2026-11-08 "컨텍스트 분석의 담당 : collect"
  '1.1.2': { agents: ['anakin_phase-collect'], show: 'context' },
  // 하네스 = 메인·서브에이전트 tool_use 와 훅 주입 시각순 목록(+ 하네스 파일 변경 HARNESS_RE 표식)
  '1.1.3': { show: 'harness' },
  // 루프 = c4 판정 1회 이상 · 파일 변경 실행 1건 이상 · N 판정 1회 이상(C-13) · 같은 에이전트 종류 2회 이상 · 같은 원장 판정 2회 이상. build 실행 줄은 루프 쌍이 보일 때 이 칸(아니면 2 접수), decide·review·commit·일반 에이전트 = 2 접수, admin = 승인
  '1.1.4': { agents: ['anakin_phase-build'], show: 'loop' },
  // Codex 칸(2026-11-10 개정 — CDX-루프 하나) : 원장 id 접두 c4- = '매핑 연결'. 과거 c1·c2·c3·c5·c6·턴 묶음 원장은 집계 제외(isLoopLedger)
  //   (원장 id 규칙 40. loop/codex_procedure.md 3절). 접두 없는 과거 원장(first-call·loop-docs·loop-cap5) = legacy → Codex4 턴 시간창 추정(기존 동작)
  '1.1.4.1': { codex: 4, legacy: true },
  // 마스터 확정 2026-11-08 "그래프 분석의 담당 서브에이전트 추가" → anakin_phase-graph 신설(.claude/agents/teamAnakin/anakin_phase-graph.md, 산출 턴의 검증 뒤·승인 앞)
  '1.1.5': { agents: ['anakin_phase-graph'], show: 'graph' },   // graph 미실행 = '생성기 자동 갱신(Stop 훅)'
}

const CODEX = { role: '외부 판정자(Codex, read-only)가 상위 분석 결과를 교차 검수', criteria: 'verdict : 모든 기준 met 이고 open·regressed 결함 0 → PASS / 기준 unmet 또는 결함 있음 → FAIL / 입력 결손 등 판정 불가 → BLOCKED', docs: ['40. loop/codex_procedure.md', '60. nodes/codex-judge.md'] }
/**
 * Codex 칸 검수 대상·호출 시점(정본 40. loop/codex_procedure.md 13절 표 · 그래프 정본 50. graph/anakins_graph.md B-6-2) : [검수 대상, 호출 시점]
 *   2026-11-10 개정 — CDX 칸은 CDX-루프(c4) 하나 : 파일을 바꾼 에이전트만 판정, 하네스 파일 변경도 같은 원장(계약 AC-4)
 */
export const CODEX_SLOTS = {
  4: ['파일을 바꾼 에이전트의 산출물(하네스 파일 포함) — 브리프 AC-n 충족 / 하네스 변경 = 규칙 정합·우회·회귀 없음·selftest 근거 / 비밀 없음', '파일 변경 에이전트 종료 때 SubagentStop 훅 자동'],
}
const codexSlot = n => ({ ...CODEX, role: `Codex${n} 검수 대상 : ${CODEX_SLOTS[n][0]} (외부 판정자 Codex read-only 교차 검수)`, criteria: `${CODEX.criteria} · 호출 : ${CODEX_SLOTS[n][1]} · 원장 id 접두 c${n}-` })
/** 마스터 설계 트리 · 라벨 단축 2026-11-09 마스터 지시(서브에이전트N → SA-, CodexN → CDX-) · 2026-11-10 개정 : CDX 칸은 CDX-루프 하나(프롬프트·컨텍스트·하네스·그래프·총괄 CDX 칸 폐지) */
export const SLOTS = [
  { id: '1', parent: null, kind: 'request', label: '마스터 아나킨 요청', role: '요청·needs-input 응답·최종 승인 주체(사람)', criteria: '요청 원문이 정본 — 목표·범위·완료 기준은 아소카가 계약으로 확정', docs: ['60. nodes/마스터.md'] },
  { id: '1.1', parent: '1', kind: 'main', label: '파다완 아소카 접수', role: '요청 접수 → 목표·범위·완료 기준 확정 → 단계 계획대로 전문가 서브에이전트 지명(메인 직접 작업 금지)', criteria: '운영 규칙 0절 — 메인 = 정리·리뷰·승인·회신', docs: ['60. nodes/아소카.md', '10. prompt/anakins_prompt.md'] },
  { id: '1.1.1', parent: '1.1', kind: 'sub', label: 'SA-프롬프트', role: '지시문 한 건의 설계 점검 — 목표·제약·출력 계약', criteria: '10장 지시문 설계 규칙', docs: ['10. prompt/anakins_prompt.md'] },
  { id: '1.1.2', parent: '1.1', kind: 'sub', label: 'SA-컨텍스트', role: '한 턴에 보는 토큰 전체 점검 — 넣을 것·뺄 것·남길 곳', criteria: '20장 컨텍스트 규칙', docs: ['20. context/anakins_context.md'] },
  { id: '1.1.3', parent: '1.1', kind: 'sub', label: 'SA-하네스', role: '모델 바깥 강제 장치 점검 — 훅·권한·에이전트 정의·격리·관측 · 하네스 파일 변경의 Codex 판정 = CDX-루프(c4)에 귀속', criteria: '30장 하네스 규칙', docs: ['30. harnes/anakins_harnes.md'] },
  { id: '1.1.4', parent: '1.1', kind: 'sub', label: 'SA-루프', role: '되돌아가는 엣지 점검 — build → Codex(SubagentStop 훅 자동) → 회송 → 승인', criteria: '40장 A절 완료 기준 · C절 금지와 멈춤', docs: ['40. loop/anakins_loop.md', '40. loop/codex_procedure.md'] },
  { id: '1.1.4.1', parent: '1.1.4', kind: 'codex', label: 'CDX-루프 검수', ...codexSlot(4) },
  { id: '1.1.5', parent: '1.1', kind: 'sub', label: 'SA-그래프', role: '노드·엣지·파일 계약으로 작업 흐름 전체 점검 — 병렬·직렬·합류', criteria: '50장 A절 그래프 설계 체크리스트 10', docs: ['50. graph/anakins_graph.md'] },
  { id: '1.2', parent: '1', kind: 'approve', label: '파다완 아소카 승인', role: '아소카가 직접 종료 승인 — 팀장(teamanakin-admin) 판정은 근거로 함께', criteria: "메인 응답 끝 '종료 승인 : <승인|보류> — <근거>' 줄 = 완료(기록용 — Stop 훅 turn-gate.mjs 는 적기만 하고 막지 않음), 팀장 판정은 근거로 · 팀원이 1명이라도 실행된 턴은 팀장 승인 생략 불가(조회·커밋 단독 턴 제외)", docs: ['60. nodes/아소카.md', '60. nodes/teamanakin-admin.md'] },
]

// ── 순수 함수(시험 대상 — fmtSpan·roundSummary 는 화면 스크립트에도 원문 그대로 인라인되므로 바깥 이름 참조 금지) ──
const sty = k => ({ status: k, statusLabel: STATUS_STYLE[k].label })
/** 엔지니어링 배지 글자 : 'N/5' + 추정 슬롯 수(결함 ③ — 확정·추정 구분) */
export const engTxt = (n, est) => `${n}/5${est ? ` (추정 ${est})` : ''}`
const ms = v => { const t = Date.parse(v); return Number.isNaN(t) ? null : t }
/** 원장 id → Codex 칸 번호(접두 c<N>-, N = 1~6), 접두 없으면 null(과거 원장) */
export const codexNo = id => { const m = /^c([1-6])-/.exec(String(id)); return m ? +m[1] : null }

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
  const rows = ev.map((e, i) => ({ label: e.verdict === 'BLOCKED' ? `${e.iter}회차 BLOCKED` : `${e.iter}회차`, t0: i ? ms(ev[i - 1].at) : start0, t1: ms(e.at), run: false, blocked: e.verdict === 'BLOCKED', verdict: e.verdict, iter: e.iter, reason: e.reason, open: e.open, ...(e.waived ? { waived: e.waived } : {}), state: e.waived ? `PASS(면제) · 면제 ${e.waived.n}건 · ${e.waived.by}` : e.verdict + (e.open != null ? ` · 열린 결함 ${e.open}` : '') }))
  const nextIter = Math.max(0, ...ev.filter(e => e.verdict !== 'BLOCKED').map(e => e.iter)) + 1
  if (loop.running) rows.push({ label: `${nextIter}회차`, iter: nextIter, t0: ev.length ? ms(ev.at(-1).at) : start0 ?? loop.lockAt, t1: null, run: true, verdict: 'RUNNING', state: '진행(ledger.lock)' })
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
    links.push({ turns: [...share.keys()], n: ag.type === LEGACY_VERIFY ? 0 : total, type: ag.type || ag.name })   // 과거 verify = 재전달 상한 제외(원장별 상한)
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
  const rows = n.rounds?.find(g => g.re)?.rows || [n]
  return [...(Math.max(0, ...rows.map(dur)) >= ALERT.longMs ? ['장시간'] : []), ...(errors >= ALERT.errors ? ['오류 다발'] : [])]
}

/** agent 레코드 1건 → 노드. 진행 = 종료 기록 없음 + (턴 진행 중 또는 세션 기록 스캔에서 실행 중) / 완료 = ts_end(도구 오류 수는 라벨에만) / 그 밖 = 오류(종료 기록 없음) */
function agentNode(ag, id, parent, turnRunning, now) {
  const run = !ag.ts_end && (turnRunning || !!ag.live), k = run ? 'running' : ag.ts_end ? 'done' : 'error', base = ag.roundBase || 0
  const rounds = (ag.rounds || []).length >= 2 || base ? [{ name: '재작업 회차(같은 에이전트에 과제 재전달)', re: true, cap: LOOP_CAP, base, rows: ag.rounds.map((r, i) => ({ label: `${base + i + 1}회차`, t0: r.t0, t1: r.t1, run: r.run, state: (r.run ? '진행' : r.t1 != null ? '완료' : '—') + (r.errors ? ` · 도구 오류 ${r.errors}` : '') })) }] : undefined
  const cost = ag.cont ? '비용 — 첫 요청 노드에 합산(지속 에이전트)' : ag.cost_usd != null ? `비용 $${ag.cost_usd.toFixed(2)} (API 환산${ag.roundsTotal > (ag.rounds || []).length ? ' · 이어받은 요청 몫 포함' : ''})` : '비용 — (턴 종료 후 기록)'
  const n = {
    id, parent, label: ag.type || ag.name || '에이전트', slot: null, ...sty(k), errN: ag.errors || 0, ...(ag.agent_id ? { aid: String(ag.agent_id) } : {}), ...(ag.report ? { report: ag.report } : {}), ...(typeof ag.harness === 'boolean' ? { harness: ag.harness } : {}), ...(typeof ag.wrote === 'boolean' ? { wrote: ag.wrote } : {}), t0: ms(ag.ts_start), t1: ag.ts_end ? ms(ag.ts_end) : null, run,
    statusLabel: k === 'error' ? '오류(종료 기록 없음)' : STATUS_STYLE[k].label + (ag.errors ? `(도구 오류 ${ag.errors}회)` : ''),
    lines: [`모델 ${String(ag.model || '-').replace(/^claude-/, '')}`, cost, ...(ag.errors ? [`도구 오류 ${ag.errors}회 기록`] : []), ...(ag.name && ag.name !== ag.type ? [`이름 ${ag.name}`] : []), ...(base ? [`지속 에이전트 이어받음 — 앞 요청 ${base}회차 뒤`] : [])],
    ...(rounds ? { rounds } : {}),
  }
  const alerts = nodeAlerts(n, ag.errors || 0, now)
  return alerts.length ? { ...n, alerts } : n
}

/** 원장 묶음 id : 끝 '-p<N>'(codex-gate 가 프롬프트 상한 초과 때 파일 묶음으로 나눈 원장)을 뗀 기준 id */
export const partBase = id => String(id).replace(/-p\d+$/, '')
/**
 * 원장 묶음 AND(2026-11-10 c4 회송 — "모든 묶음이 PASS 일 때만 그 칸을 Y") : 같은 기준 id 의 '-p<N>' 원장들을 회차(iter)별 1행으로 합친다
 *   회차 행 = 묶음마다 그 회차 마지막 행(판정 우선, 없으면 BLOCKED) → 진행 하나라도 = 진행 / 전부 PASS = PASS / FAIL 하나라도 = FAIL / 그 밖(BLOCKED·일부 판정 없음) = BLOCKED
 *   묶음 원장이 있으면 나뉘기 전 기준 원장(BLOCKED scope-too-broad 로 끝난 것)은 대체된 것으로 보고 뺀다. 입력·출력 [{ id, est?, rows }] — 묶음은 { id: 기준, parts: [id…] }
 */
export function mergeParts(list) {
  const by = new Map()
  for (const x of list) { const b = partBase(x.id); if (b !== x.id) by.set(b, [...(by.get(b) || []), x]) }
  if (!by.size) return list
  const out = list.filter(x => partBase(x.id) === x.id && !by.has(x.id))
  for (const [b, ps] of by) {
    ps.sort((x, y) => x.id.localeCompare(y.id, 'en', { numeric: true }))
    const iters = [...new Set(ps.flatMap(p => p.rows.map(r => r.iter)))].sort((x, y) => x - y)
    const rows = iters.map(it => {
      const fin = ps.map(p => { const rs = p.rows.filter(r => r.iter === it); return rs.filter(r => !r.blocked).at(-1) || rs.at(-1) || null })
      const has = fin.filter(Boolean), v = fin.some(r => r?.run) ? 'RUNNING' : has.length === ps.length && has.every(r => r.verdict === 'PASS') ? 'PASS' : has.some(r => r.verdict === 'FAIL') ? 'FAIL' : 'BLOCKED'
      const t0s = has.map(r => r.t0).filter(t => t != null), t1s = has.map(r => r.t1).filter(t => t != null), open = has.reduce((n, r) => n + (r.open || 0), 0)
      const why = fin.map((r, i) => `${ps[i].id.slice(b.length + 1)} ${r ? (r.run ? '진행' : r.verdict + (r.waived ? '(면제)' : '')) : '판정 없음'}`).join(' · ')
      const wv = v === 'PASS' ? has.filter(r => r.waived).map(r => r.waived) : [], waived = wv.length ? { n: wv.reduce((n, x) => n + x.n, 0), by: [...new Set(wv.map(x => x.by))].join(' · ') } : null
      return { label: v === 'BLOCKED' ? `${it}회차 BLOCKED` : `${it}회차`, iter: it, t0: t0s.length ? Math.min(...t0s) : null, t1: v === 'RUNNING' ? null : t1s.length ? Math.max(...t1s) : null, run: v === 'RUNNING', blocked: v === 'BLOCKED', verdict: v, open, ...(waived ? { waived } : {}), reason: v === 'BLOCKED' ? `묶음 AND — ${why}` : undefined, state: `${v} · 묶음 AND(${why})` }
    })
    out.push({ id: b, parts: ps.map(p => p.id), ...(ps.some(p => p.est) ? { est: true } : {}), rows })
  }
  return out
}

/** 자유 배치 위성 위치(화면 스크립트에 원문 그대로 인라인) : 짝 SA 원 바로 아래 — SA 반지름 + 간격 + 자기 반지름 */
export const matePos = (m, r, gap) => ({ x: m.x, y: m.y + m.r + gap + r })

/** 소요 짧은 글자 : 1분 이상 'Nm', 미만 'Ns' */
const durShort = v => v >= 60e3 ? Math.round(v / 60e3) + 'm' : Math.round(v / 1e3) + 's'
const kstOf = v => new Date(v).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })
/** 회차 행 소요 합(진행 중은 now 까지) */
const rowsDur = (rows, now) => rows.reduce((s, r) => s + (r.t0 != null && (r.run || r.t1 != null) ? (r.run ? now : r.t1) - r.t0 : 0), 0)

/** 요청 원문 정리(C-10 ① — 새 문장 없음) : system-reminder·태그 블록(훅 주입문·명령 메타)·이미지 표기 제거 + 줄바꿈·공백 정리 */
export const cleanPrompt = s => String(s || '').replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ').replace(/<([a-z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi, ' ').replace(/<\/?[a-z][\w-]*(?:\s[^>]*)?\/?>/gi, ' ').replace(/\[Image(?: #?\d+)?\]/gi, ' ').replace(/\s+/g, ' ').trim()
/** 칸 안 프롬프트 줄 : cleanPrompt 를 PROMPT.line 글자씩 최대 n 줄로 자르고 넘치면 마지막 줄 끝 '…' — 각 줄은 원문(정리본)의 부분 문자열 */
export const PROMPT = { line: 26, lines: 3 }
export function clipLines(s, n = PROMPT.lines) {
  const x = cleanPrompt(s), out = []
  for (let i = 0; i < x.length && out.length < n; i += PROMPT.line) out.push(x.slice(i, i + PROMPT.line).trim())
  if (x.length > PROMPT.line * n && out.length) out[out.length - 1] = out.at(-1).slice(0, -1) + '…'
  return out.filter(Boolean)
}
/**
 * 요청 간 맥락(C-10 전후좌우) : 턴마다 t.ctx = { prev(같은 세션 직전 요청 원문), next(다음 요청 원문), overlap(겹친 시간대 다른 요청의 에이전트·워크플로 최대 4) } — 결정적 추출
 */
export function linkContext(turns, now = Date.now()) {
  const txt = t => (t.prompts || []).length ? t.prompts[0].text : t.req_head || ''
  const bySess = {}; for (const t of turns) (bySess[t.session_id] = bySess[t.session_id] || []).push(t)
  for (const xs of Object.values(bySess)) xs.sort((a, b) => ms(a.ts_req) - ms(b.ts_req))
  for (const t of turns) {
    const xs = bySess[t.session_id], i = xs.indexOf(t), a = ms(t.ts_req), b = t.ts_res ? ms(t.ts_res) : now
    const overlap = turns.filter(o => o !== t).flatMap(o => (o.agents_detail || []).filter(ag => (ms(ag.ts_start) ?? Infinity) <= b && (ms(ag.ts_end) ?? now) >= a).map(ag => `${ag.workflow ? 'workflow ' + ag.workflow : shortType(ag.type || ag.name || '에이전트')} (${String(o.session_id || '').slice(0, 8)})`))
    t.ctx = { prev: i > 0 ? txt(xs[i - 1]) : null, next: i >= 0 && i < xs.length - 1 ? txt(xs[i + 1]) : null, overlap: [...new Set(overlap)].slice(0, 4) }
  }
  return turns
}
/** 에이전트 종류 짧은 이름(칸 안 줄) */
export const shortType = type => String(type).replace(/^anakin_phase-/, '').replace(/^teamanakin-/, '')
/** 맥락 주입 훅(additionalContext 를 넣는 이벤트) — SA-컨텍스트 '주입 훅' 건수 */
const INJECT_HOOKS = ['UserPromptSubmit', 'SessionStart', 'SubagentStart', 'PostToolUse']
const hms = v => kstOf(v).slice(11, 19)
/**
 * tool_use 블록 → 표시 이름(입력값은 쓰지 않음 — 비밀 차단, C-9 ②) : mcp__<서버>__<도구> = 'MCP 서버/도구' · Skill = 'Skill <스킬명>' · Agent/Task = 'Agent <subagent_type>' · 그 밖 = 도구명
 *   스킬명·subagent_type 은 이름 형식([\w:.-], 60자)만 남긴다
 */
export function toolName(b) {
  const n = String(b?.name || '?'), id = v => String(v || '').replace(/[^\w:.-]/g, '').slice(0, 60), m = /^mcp__(.+?)__(.+)$/.exec(n)
  return m ? `MCP ${id(m[1])}/${id(m[2])}` : n === 'Skill' ? `Skill ${id(b.input?.skill) || '?'}` : n === 'Agent' || n === 'Task' ? `Agent ${id(b.input?.subagent_type) || 'general-purpose'}` : id(n) || '?'
}
/** 세션·서브에이전트 기록 레코드 → 도구 이벤트 [{ t, name }] : assistant tool_use · attachment 훅 실행('hook <이벤트>') */
export const toolEventsOf = recs => recs.flatMap(j => {
  const t = ms(j?.timestamp); if (t == null) return []
  if (j.type === 'assistant' && Array.isArray(j.message?.content)) return j.message.content.filter(c => c?.type === 'tool_use').map(c => ({ t, name: toolName(c) }))
  return j.type === 'attachment' && j.attachment?.hookEvent ? [{ t, name: 'hook ' + String(j.attachment.hookEvent).replace(/[^\w]/g, '') }] : []
})
/**
 * 도구 이벤트 [{ t, name, who }] → 시각순 묶음(C-9 ② "같은 주체가 같은 도구를 연달아 쓴 경우 한 줄") [{ t0, t1, name, who, k, txt }]
 *   txt = 'HH:MM:SS 도구 [주체]' · 묶음 'HH:MM:SS~HH:MM:SS 도구 ×k [주체]'
 */
export function groupTools(ev) {
  const out = []
  for (const e of [...ev].sort((x, y) => x.t - y.t)) { const g = out.at(-1); if (g && g.name === e.name && g.who === e.who) { g.t1 = e.t; g.k++ } else out.push({ t0: e.t, t1: e.t, name: e.name, who: e.who, k: 1 }) }
  return out.map(g => ({ ...g, txt: `${hms(g.t0)}${g.k > 1 ? '~' + hms(g.t1) : ''} ${g.name}${g.k > 1 ? ' ×' + g.k : ''} [${g.who}]` }))
}

/**
 * SA·접수·승인 칸 안 실행 줄(2026-11-10 마스터 "collect·admin 등의 수행은 각 SA 단계에 포함, 반복·실패 작업도 그 안에서") — 에이전트 type 별 1줄
 *   '<단계> ×n (회송 n-1) · 소요' — n = 실행 회차 합(재전달 회차 포함, 이어받은 회차는 'a~b회차'), 승인 2회 이상 = '[중간 k·최종]'
 *   실패 표식 줄(빨강 ✖ = 종료 기록 없음·도구 오류 / 주황 ⚠ = 장시간) — 판정(Y/N)은 짝 CDX 칸 몫이라 넣지 않음
 *   반환 [{ txt, tone }] — tone : run(진행) · bad(빨강) · warn(주황) · ''(보통)
 */
export function agentChips(kids, now) {
  const by = new Map()
  for (const k of kids) by.set(k.label, [...(by.get(k.label) || []), k])
  return [...by].flatMap(([type, xs]) => {
    const gs = xs.map(x => x.rounds?.find(g => g.re)), rows = xs.flatMap((x, i) => gs[i]?.rows || [x]), n = rows.length, base = Math.min(...gs.map(g => g?.base || 0))
    const rep = xs.some(x => x.approval) ? '' : n > 1 ? ` (${base ? `${base + 1}~${base + n}회차·` : ''}회송 ${n - 1})` : base ? ` (${base + 1}회차)` : ''
    const appr = xs.length > 1 && xs.some(x => x.approval) ? ` [중간 ${xs.length - 1}·최종]` : ''
    const err = xs.reduce((s, x) => s + (x.errN || 0), 0)
    const flags = [...(xs.some(x => x.status === 'error') ? ['✖ 종료 기록 없음'] : []), ...(err ? [`✖ 도구 오류 ${err}`] : []), ...(xs.some(x => (x.alerts || []).includes('장시간')) ? ['⚠ 장시간'] : [])]
    const line = { txt: `${shortType(type)} ×${n}${rep}${appr} · ${durShort(rowsDur(rows, now))}`, tone: xs.some(x => x.run) ? 'run' : '' }
    return flags.length ? [line, { txt: flags.join(' · '), tone: flags.some(f => f.startsWith('✖')) ? 'bad' : 'warn' }] : [line]
  })
}

/**
 * CDX 칸 안 판정 회차 줄(2026-11-10 마스터 "여러 차례 진행된 검수는 CDX 박스 내에서") — 원장이 2개 이상이면 원장별 머리 줄
 *   회차마다 '<k>회 Y|N|BLOCKED|진행 HH:mm · 결함 n|사유' (N = ✖ 빨강, BLOCKED = ⚠ 주황), 끝 줄 '→ k회 만에 완료 · 되돌림 n회'
 */
/** 면제 해소 글자 : 마지막 판정 중 면제 해소가 있으면 ' · Y(면제) — 면제 N건 · 승인자' (PASS 와 구별) */
const waivedTxt = rs => { const w = rs.filter(r => r.waived).map(r => r.waived); return w.length ? ` · Y(면제) — 면제 ${w.reduce((n, x) => n + x.n, 0)}건 · ${[...new Set(w.map(x => x.by))].join(' · ')}` : '' }
export function codexChips(lr) {
  const out = []
  for (const x of lr) {
    if (lr.length > 1 || x.parts) out.push({ txt: `원장 ${x.id}${x.parts ? ` (묶음 ${x.parts.length}개 AND)` : ''}`, tone: 'head' })
    for (const r of x.rows) {
      const v = r.run ? '진행' : r.verdict === 'PASS' ? 'Y' : r.verdict === 'FAIL' ? 'N' : 'BLOCKED', at = r.run ? r.t0 : r.t1
      const why = v === 'N' && r.open ? ` · 결함 ${r.open}` : v === 'BLOCKED' && r.reason ? ` · ${r.reason}` : r.waived ? ` · 면제 ${r.waived.n}건 · ${r.waived.by}` : ''   // 묶음 AND 행의 BLOCKED 사유 = 묶음별 판정
      out.push({ txt: `${v === 'N' ? '✖ ' : v === 'BLOCKED' ? '⚠ ' : ''}${r.iter}회 ${v}${r.waived ? '(면제)' : ''}${at != null ? ' ' + kstOf(at).slice(11, 16) : ''}${why}`, tone: v === 'N' ? 'bad' : v === 'BLOCKED' ? 'warn' : v === '진행' ? 'run' : 'ok' })
    }
    const last = x.rows.filter(r => !r.run).at(-1), fails = x.rows.filter(r => r.verdict === 'FAIL').length
    const end = [...(last?.verdict === 'PASS' ? [`→ ${last.iter}회 만에 완료${last.waived ? '(면제)' : ''}`] : []), ...(fails ? [`되돌림 ${fails}회`] : [])]
    if (end.length) out.push({ txt: end.join(' · '), tone: '' })
  }
  return out
}

/**
 * 턴(buildTurns 결과 또는 세션 기록 스캔의 진행 중 턴) + 원장 루프 → 칸 노드 목록 [{ id, parent, label, slot, status, statusLabel, badge?, lines, t0, t1, run, rounds?, eng?, agents?, chips? }]
 *   2026-11-10 마스터 : 에이전트 실행은 독립 노드가 아니다 — 대응 칸의 agents(상세·md 용)·chips(칸 안 실행 줄)로만 남긴다. verify(폐지) 과거 기록은 숨김
 *   1 = 턴 상태(종료 후에도 실행 중 에이전트가 있으면 진행) · 엔지니어링 N/5 / 1.1 = ts_req ~ 하위 마지막 종료
 *   에이전트 = SLOT_MAP agents 대응 칸, 없으면 1.1(접수), teamanakin-admin = 1.2(승인), 같은 type 2회 이상 = 그 칸 '반복 실행' 회차표
 *   엔지니어링 슬롯 = 대응(에이전트·훅·루프) 중 진행 있으면 진행, 있으면 완료, 없으면 미수행 / Codex 슬롯 = 대응 루프 회차표·칸 안 회차 줄, 상태 = 마지막 판정
 */
/** 집계 대상 원장(2026-11-10 개정) : c4(또는 접두 없는 과거 원장) + 턴 묶음 아님 + 비대상(NO_GATE) 에이전트 원장 아님 — 과거 c1·c2·c3·c5·c6·c*-turn-* 원장은 디스크에 두고 집계만 뺀다 */
export const isLoopLedger = l => { const b = partBase(l.id); return !TURN_ID_RE.test(b) && (codexNo(b) ?? 4) === 4 && !NO_GATE.has(l.agentType) }
export function buildRequestGraph(t, loops = [], { slotMap = SLOT_MAP, now = Date.now(), peers = [] } = {}) {
  loops = loops.filter(isLoopLedger)
  const ts = turnStatus(t), a = ms(t.ts_req), turnRunning = ts.key === 'running'
  // 시작 시각순(2026-11-09 그래프 분석 ① : 로거 ts_start = '+09:00' 지역 시각, 생성기 = 'Z' — 문자열 비교면 회차 번호가 시간순이 아니었음 → 숫자 비교, 시각 없음은 뒤로)
  const tKey = ag => ms(ag.ts_start) ?? Number.MAX_SAFE_INTEGER
  // 과거 verify 는 표시·집계에서만 빼고(agents), 판정 시간창(b·la·lb)에는 넣는다 — 그 실행이 만든 원장이 CDX 칸에 계속 매칭되게(c4-p2 D-001)
  const raw = [...(t.agents_detail || [])], agents = raw.filter(ag => ag.type !== LEGACY_VERIFY).sort((x, y) => tKey(x) - tKey(y))
  const agentRun = ag => !ag.ts_end && (turnRunning || !!ag.live), anyRun = turnRunning || agents.some(agentRun)
  // 시간창 끝 : 진행 중이면 지금 > 응답 시각 > (중단·응답 없음) 마지막 에이전트 종료 시각 또는 요청 시각 — 끝난 턴이 이후 루프를 끌어오지 않게
  const b = anyRun ? now : t.ts_res ? ms(t.ts_res) : Math.max(a, ...raw.map(x => ms(x.ts_end) || 0))
  // 루프 전용 창 : 이전 턴에 시작된 백그라운드 워크플로가 재개 턴에 귀속되면 에이전트가 요청 시각보다 앞서 돌므로 귀속 에이전트 시작·종료까지 넓힌다
  const la = Math.min(a, ...raw.map(x => ms(x.ts_start) ?? a)), lb = Math.max(b, ...raw.map(x => ms(x.ts_end) || 0))
  // 원장별 시간창(2026-11-10 c4-codex-ac436f-p1 D-001·D-002) :
  //   다른 실행 대상 접미(-a<16진 5> 인데 이 요청 귀속 에이전트가 아님) = 요청 창 [a, lb] 만 — 넓힌 창(la, 재개 턴 A6·C-5)은 귀속 에이전트 원장·접미 없는 원장에만
  const mine6 = new Set(raw.map(x => String(x.agent_id || '').slice(0, 6)).filter(Boolean))
  const rowsOf = l => { const id = partBase(l.id); const sfx = /-(a[0-9a-f]{5})$/.exec(id)?.[1]; return loopRounds(l, sfx && !mine6.has(sfx) ? a : la, lb) }
  const nodes = SLOTS.map(s => ({ id: s.id, parent: s.parent, label: s.label, slot: s.id, ...sty('unassigned'), lines: [], t0: null, t1: null, run: false }))
  const byId = Object.fromEntries(nodes.map(n => [n.id, n])), kind = Object.fromEntries(SLOTS.map(s => [s.id, s.kind]))
  // Codex 칸 원장 먼저(루프 반복 판정·짝 표시에 씀)
  const loopsOf = m => {
    if (!m?.loops && !m?.codex) return []
    const how = l => m.codex && codexNo(l.id) === m.codex ? 'map' : m.legacy && codexNo(l.id) == null ? 'est' : Array.isArray(m.loops) && m.loops.includes(l.id) ? 'map' : m.loops === true ? 'est' : null
    return mergeParts(loops.map(l => ({ l, h: how(l) })).filter(x => x.h).map(({ l, h }) => ({ id: l.id, est: h === 'est', rows: rowsOf(l) }))).filter(x => x.rows.length)
  }
  const cl = Object.fromEntries(SLOTS.filter(s => s.kind === 'codex').map(s => [s.id, loopsOf(slotMap[s.id])]))
  // 이어받은 원장(승인 4 · 2026-11-11 — build 가 요청 A 에서 시작해 SendMessage 로 요청 B 까지 이어 처리, 원장은 B 창에만 생겨 A 가 '검증 누락' 오탐) :
  //   이 요청 파일 변경 실행(wrote)의 agentId 앞 6자 = 원장 id 끝 접미인 c4 원장이 이 창엔 판정이 없고 창 뒤(lb 이후)에만 있으면 판정 결과만 CDX-루프·실행 상세에 반영
  //   회차·되돌림·묶음 누적은 원장이 생긴 요청에서만 센다(cl 에 넣지 않음). 창 앞에만 판정이 있는 원장·접미 불일치·파일 변경 없음 = 이어받지 않음(검증 누락 유지)
  const sfxOf = id => /-(a[0-9a-f]{5})$/.exec(partBase(id))?.[1], latest = rs => rs.slice().sort((p, q) => (p.run ? Infinity : p.t1) - (q.run ? Infinity : q.t1)).at(-1)
  const wr6 = new Set(agents.filter(ag => ag.wrote === true).map(ag => String(ag.agent_id || '').slice(0, 6)).filter(Boolean)), have = new Set(cl['1.1.4.1'].map(x => x.id))
  const ssn = peers.filter(p => p.session_id === t.session_id).sort((x, y) => ms(x.ts_req) - ms(y.ts_req))
  const srcOf = r => { const at = (r.run ? r.t0 : r.t1) ?? lb, h = ssn.filter(p => ms(p.ts_req) <= at).at(-1); return h && h !== t && h.turn != null ? `요청 ${h.turn}` : `${kstOf(at).slice(5, 16)} 판정` }
  //   D-002(c4-build-4-a609bd) : 창 안에도 판정이 있는 원장(예 앞 FAIL)도 창 뒤 판정이 있으면 최종 결과(fin)만 이 칸·실행 상세에 반영 — 회차·되돌림은 창 안 행만(각 귀속 요청)
  const aft = mergeParts(loops.filter(l => (codexNo(l.id) ?? 4) === 4 && wr6.has(sfxOf(l.id))).map(l => ({ id: l.id, rows: loopRounds(l, lb + 1, Infinity) })))
    .filter(x => x.rows.length).map(x => ({ ...x, src: srcOf(x.rows[0]), last: latest(x.rows) }))
  const inh = aft.filter(x => !have.has(x.id)), fin = new Map(aft.filter(x => have.has(x.id)).map(x => [x.id, x]))
  const vOf = r => r.run ? 'run' : r.verdict === 'PASS' ? 'Y' : r.verdict === 'FAIL' ? 'N' : 'hold', ihV = new Map(aft.map(x => [sfxOf(x.id), vOf(x.last)]))
  const lastOf = x => fin.get(x.id)?.last ?? latest(x.rows)   // 원장의 최종 행 = 창 뒤 판정 있으면 그것
  // 반복(2026-11-10 마스터 C-8 ③ "어떤 프로세스든 2회 이상 반복되었다면 루프도 반드시") : 같은 에이전트 종류 실행(재전달 회차 포함) 2회 이상 · 같은 원장 판정(BLOCKED·진행 제외) 2회 이상
  const byType = new Map(); for (const ag of agents) { const k = ag.type || ag.name || '에이전트'; byType.set(k, (byType.get(k) || 0) + ((ag.rounds || []).length || 1)) }
  const repAg = [...byType].filter(([, n]) => n >= 2).map(([k, n]) => `${shortType(k)} ×${n}`)
  const repLd = SLOTS.filter(s => s.kind === 'codex').flatMap(s => { const ys = (cl[s.id] || []).map(x => ({ s, x, n: x.rows.filter(r => !r.blocked && !r.run).length })).filter(y => y.n >= 2); return ys.map(y => ({ ...y, txt: `${s.label.replace(/ 검수$/, '')}${ys.length > 1 ? `(${y.x.id})` : ''} ${y.n}회` })) })
  // 되돌림(2026-11-10 마스터 C-13 "어떤 단계 프로세스에든지 되돌림이 있으면 루프가 발생했다는 말이고, 그러면 루프 노드를 표현해야지") : 어느 CDX 칸이든 N 판정 1회 이상 = 루프(반복 2회+ 와 OR, 진행 중 요청도 N 즉시)
  //   글 = '<CDX 칸> N k회(<회차>회차 결함 n …) → 재작업 대기 | 재판정 진행 | <회차>회차 Y | 보류(사유)' — 마지막 기록 기준
  const backs = SLOTS.filter(s => s.kind === 'codex').flatMap(s => { const xs = (cl[s.id] || []).filter(x => x.rows.some(r => r.verdict === 'FAIL')); return xs.map(x => {
    const ns = x.rows.filter(r => r.verdict === 'FAIL'), f = fin.get(x.id), last = f?.last ?? x.rows.at(-1), src = f ? `(${f.src})` : ''
    const next = last.run ? `재판정 진행${src}` : last.verdict === 'PASS' ? `${last.iter}회차 Y${last.waived ? '(면제)' : ''}${src}` : last.verdict === 'FAIL' ? `재작업 대기${src}` : `보류(${reasonTxt(last.reason)})${src}`
    return { s, x, txt: `${s.label.replace(/ 검수$/, '')}${xs.length > 1 ? `(${x.id})` : ''} N ${ns.length}회(${ns.map(r => `${r.iter}회차${r.open != null ? ` 결함 ${r.open}` : ''}`).join(' · ')}) → ${next}` }
  }) })
  // 2026-11-10 개정 : CDX-루프가 유일한 판정 칸 — c4 판정 1회 이상(judged) 또는 파일 변경 실행 1건 이상(target)이면 루프 쌍 표시(1회 Y 로 끝난 산출 턴·판정 누락 턴도 보이게)
  const judged = cl['1.1.4.1'].length > 0, target = agents.some(ag => ag.wrote === true)
  const repeats = [...repAg, ...repLd.map(y => y.txt)], loopOn = repeats.length > 0 || backs.length > 0 || judged || target
  // 에이전트 → 칸 : admin = 승인, SLOT_MAP agents 대응 칸(build 는 루프 쌍이 보일 때만 SA-루프 — 반복 없으면 2 접수), 나머지 = 2 접수(1.1)
  const slotOf = ag => ag.type === ADMIN_TYPE ? '1.2' : Object.keys(slotMap).find(id => kind[id] === 'sub' && (slotMap[id].agents || []).includes(ag.type) && (slotMap[id].show !== 'loop' || loopOn)) || '1.1'
  const all = agents.map((ag, i) => { const p = slotOf(ag); return agentNode(ag, `${p}.a${i + 1}`, p, turnRunning, now) })
  const kidsOf = id => all.filter(n => n.parent === id)
  const hookRecs = t.resources?.hooks || []
  // 하네스 사용(2026-11-10 마스터 C-9 "하나라도 도구를 사용했다면 하네스를 사용한 것") : 메인·서브에이전트 기록의 tool_use + 훅 주입(attachment) — 시각순 목록 = t.toolEvents(loadToolEvents)
  //   기록을 못 읽은 턴(시험·기록 없음)은 work-history 집계(tools·resources.hooks·agents_detail)로 건수만 판단
  const ev = [...(t.toolEvents || [])].sort((x, y) => x.t - y.t), tlog = groupTools(ev)
  const tot = {}; for (const e of ev) { const k = e.name.split(' ')[0]; tot[k] = (tot[k] || 0) + 1 }
  if (!ev.length) { for (const [k, v] of Object.entries(t.tools && typeof t.tools === 'object' ? t.tools : {})) tot[k] = (tot[k] || 0) + (+v || 0); const h = hookRecs.reduce((s, x) => s + (x.n || 1), 0); if (h) tot.hook = h; if (!tot.Agent && agents.length) tot.Agent = agents.length }
  const useN = Object.values(tot).reduce((s, v) => s + v, 0), hz = all.filter(n => n.harness === true)
  const inject = ev.length ? ev.filter(e => INJECT_HOOKS.some(h => e.name === 'hook ' + h)).length : hookRecs.filter(h => INJECT_HOOKS.includes(h.event)).reduce((s, x) => s + (x.n || 1), 0), reads = tot.Read || 0
  // 엔지니어링·분석 슬롯(2026-11-10 마스터 C-8·C-9) : 칸 안 줄(chips) = 실제 내용 요약
  //   프롬프트·컨텍스트·그래프 = 모든 요청 표시 · 하네스 = 도구·훅 사용 1건 이상일 때만 · 루프 = 되돌림 또는 반복 1건 이상일 때만(없으면 미수행 → 쌍 숨김)
  const first = all.filter(n => n.t0 != null).sort((x, y) => x.t0 - y.t0)[0], nb = agents.length
  const prompts = (t.prompts || []).length ? t.prompts : [{ t: a, text: t.req_head || '' }]   // 세션 기록에서 읽은 요청 원문(같은 턴 추가 지시 포함), 없으면 work-history 요청문 앞부분
  for (const s of SLOTS.filter(s => s.kind === 'sub')) {
    const m = slotMap[s.id]; if (!m) continue
    const kids = kidsOf(s.id), ks = spanOf(kids), kRun = kids.some(n => n.run), n = byId[s.id]
    if (m.show === 'prompt') {
      // 2026-11-10 마스터 C-10 "프롬프트를 원본 그대로를 축약" : 요청 원문(같은 턴 추가 지시 포함, 시각순)을 주입문·이미지 표기·system-reminder 제거 + 공백 정리 후 글자 수만 자름(새 문장 없음)
      const ps = prompts.length > 1 ? prompts.flatMap((p, i) => clipLines(p.text).map((x, k) => (k ? '' : `${i + 1}) `) + x)) : clipLines(prompts[0]?.text || '')
      Object.assign(n, sty('done'), { t0: a, t1: first?.t0 ?? a, run: false, chips: [{ txt: `요청 ${prompts.length} · 브리프 ${nb}건`, tone: 'head' }, ...ps.map(txt => ({ txt, tone: '' }))],
        lines: [...prompts.map((p, i) => `요청 원문${prompts.length > 1 ? ` ${i + 1}` : ''} : ${cleanPrompt(p.text)}`), `메인 브리프 디스패치 ${nb}건(이 턴 서브에이전트 실행)`] })
    } else if (m.show === 'context') {
      // C-10 정정 "맥락을 전후좌우 배경지식과 함께 요점 정리" : 전 = 같은 세션 직전 요청 원문 축약(+캐시 before) · 후 = 다음 요청 원문 축약(+캐시 after)
      //   좌우 = 캐시 related, 없으면 주입 훅 이름 + 겹친 시간대 다른 요청의 에이전트·워크플로 · 요점 = 캐시 points, 없으면 collect 보고 첫 줄 — 캐시 없으면 '자동 추출'
      const sm = t.summary, cx = t.ctx || {}, rp = kids.flatMap(k => k.report || []).slice(0, 4)
      // C-12(마스터 2026-11-10 "'전','후','좌우' 타이틀은 제거") : 구획 제목 줄 없이 내용만, 구획 첫 줄에 sep(얇은 구분선) — 순서 전 → 후 → 좌우 → 요점 유지
      const sec = (name, xs) => xs.map((txt, i) => ({ txt, tone: '', ...(i ? {} : { sep: name }) }))
      const injNames = [...new Set((ev.length ? ev.filter(e => e.name.startsWith('hook ')).map(e => e.name.slice(5)) : hookRecs.map(h => h.event)).filter(h => INJECT_HOOKS.includes(h)))]
      const before = [...(cx.prev ? clipLines(cx.prev, 1) : []), ...(sm?.before || [])], after = [...(cx.next ? clipLines(cx.next, 1) : []), ...(sm?.after || [])]
      const related = sm?.related?.length ? sm.related : [...(injNames.length ? [`주입 ${injNames.join('·')}`] : []), ...(cx.overlap || []).map(x => `동시 ${x}`)]
      const points = sm?.points?.length ? sm.points : rp
      Object.assign(n, kids.length ? ks : { t0: a, t1: a, run: false }, kRun ? sty('running') : sty('done'), {
        chips: [{ txt: `출처 : 주입 훅 ${inject} · 읽기 ${reads} · collect ${kids.length}`, tone: 'head' }, ...sec('before', before.length ? before : ['(직전 요청 없음)']), ...sec('after', after.length ? after : ['(다음 요청 없음)']), ...sec('related', related), ...sec('points', points), ...(sm ? [] : [{ txt: '자동 추출(요약 캐시 없음)', tone: 'warn' }])],
        lines: [`맥락 주입 훅 ${inject}건(${INJECT_HOOKS.join('·')}) · 파일 읽기(Read) ${reads}회 · collect ${kids.length}건`, ...(cx.prev ? [`전 : ${cleanPrompt(cx.prev)}`] : []), ...(cx.next ? [`후 : ${cleanPrompt(cx.next)}`] : []), ...(sm ? [`요약 캐시 ${sm.by || '-'} · ${sm.at || '-'}`] : ['요약 캐시 없음 — 좌우·요점 자동 추출'])] })
    }
    else if (m.show === 'harness') {
      if (!useN) { Object.assign(n, sty('missing'), { lines: ['도구 사용·훅 주입 0건 — 쌍 숨김'] }); continue }
      const totTxt = Object.entries(tot).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(' · ')
      Object.assign(n, ev.length ? { t0: ev[0].t, t1: ev.at(-1).t, run: anyRun } : { t0: null, t1: null, run: false, tmNote: '도구 시각 미기록(집계만)' }, anyRun && ev.length ? sty('running') : sty('done'), {
        chips: [{ txt: totTxt, tone: 'head' }, ...(hz.length ? [{ txt: `⚙ 하네스 파일 변경 ${hz.length}건 → CDX-루프 판정`, tone: 'warn' }] : [])], toolLog: tlog,
        lines: [`도구·훅 사용 ${useN}건 — ${totTxt}`, ...(hz.length ? [`하네스 파일 변경(HARNESS_RE) 실행 ${hz.length}건 — ${hz.map(x => x.label).join(' · ')}`, 'Codex 판정은 CDX-루프(c4)에 귀속'] : [])] })
    } else if (m.show === 'loop') {
      if (!loopOn) { Object.assign(n, sty('missing'), { lines: ['판정·파일 변경·반복·되돌림 0건 — 쌍 숨김'] }); continue }
      const lx = cl['1.1.4.1'], jN = lx.reduce((k, x) => k + x.rows.filter(r => !r.run).length, 0), sp = spanOf([...kids, ...lx.flatMap(x => x.rows)]), run = kRun || lx.some(x => x.rows.some(r => r.run))
      Object.assign(n, sp, run ? sty('running') : sty('done'), {
        chips: [...backs.map(y => ({ txt: y.txt, tone: 'bad' })), ...(repeats.length ? [{ txt: repeats.join(' · '), tone: '' }] : []), ...(backs.length || repeats.length ? [] : [{ txt: judged ? `Codex 판정 ${jN}건 — 되돌림 0` : '파일 변경 실행 — 판정 전', tone: '' }])],
        lines: [...backs.map(y => `되돌림 — ${y.txt}`), ...(repeats.length ? [`반복 — ${repeats.join(' · ')}`] : []), ...(backs.length || repeats.length ? [] : [judged ? `Codex 판정 ${jN}건 — 되돌림 0` : '파일 변경 실행 — 판정 전'])] })
    } else if (m.show === 'graph') {
      if (kids.length) Object.assign(n, ks, kRun ? sty('running') : sty('done'), { lines: [`에이전트 ${kids.length}건`] })
      else Object.assign(n, sty('estimated'), { statusLabel: '생성기 자동 갱신(Stop 훅)', tmNote: '생성기 자동 갱신(Stop 훅)', lines: ['graph 에이전트 실행 없음 — 생성기 자동 갱신(Stop 훅·SubagentStart/Stop 훅)'] })
    }
  }
  // CDX-루프(유일한 Codex 칸, 2026-11-10 개정) = 검증 결과 : 원장별 마지막 판정의 AND — 전부 PASS = Y · 하나라도 FAIL = N · 진행 중 원장 = 진행 · 그 밖 = 보류
  //   원장 없음 : 파일 변경 실행 없음 = 판정 대상 없음(숨김) · 있음 + 진행 중 요청 = 검증 대기 · 있음 + 끝난 요청 = 검증 누락(경보)
  //   회차 = 원장 iter 번호(BLOCKED 는 회차 미소모), verdict = { yn, fails } — N 되돌림 화살표 근거(buildPath), chips = 칸 안 회차 줄(codexChips)
  for (const s of SLOTS.filter(s => s.kind === 'codex')) {
    const m = slotMap[s.id]; if (!m?.loops && !m?.codex) continue
    const lr = cl[s.id], ih = s.id === '1.1.4.1' ? inh : [], hzN = all.filter(n => n.harness === true).length, hzLine = hzN ? [`하네스 파일 변경 ${hzN}건 포함(SA-하네스 귀속)`] : []
    if (!lr.length && !ih.length) {
      const st = !target ? { ...sty('notrun'), statusLabel: '판정 대상 없음' } : anyRun ? { status: 'notrun', statusLabel: '검증 대기 — 판정 전', verdict: { yn: null, fails: 0, wait: true } } : { status: 'error', statusLabel: '검증 누락', alerts: ['검증 누락'], verdict: { yn: null, fails: 0, miss: true } }
      Object.assign(byId[s.id], st, { lines: [target ? '파일 변경 실행이 있는데 이 턴 시간창 안 Codex 판정 기록 없음' : '파일 변경 실행 없음 — 판정 대상 없음', ...hzLine] }); continue
    }
    const rows = lr.flatMap(x => x.rows), fails = rows.filter(r => r.verdict === 'FAIL').length
    // 회차 번호(k)는 이 요청에 생긴 원장만 — 이어받은 원장(ih)은 판정 결과(lasts)와 출처 글자(ihTxt)만
    const lasts = [...lr.map(lastOf), ...ih.map(x => x.last)], own = lr.length ? latest(lr.map(lastOf)) : null
    const k = own?.iter, nL = lr.length + ih.length, many = nL > 1, nN = lasts.filter(r => !r.run && r.verdict === 'FAIL').length
    const fl = s.id === '1.1.4.1' ? lr.filter(x => fin.has(x.id)).map(x => fin.get(x.id)) : []
    const ihTxt = fl.map(x => ` · 최종 판정 이어받음(${x.src})`).join('') + ih.map(x => ` · 이어받은 원장(${x.src})`).join('')
    const v = lasts.some(r => r.run) ? { ...sty('running'), statusLabel: (own ? `검증 진행 · ${k}회차 (${k}/${LOOP_CAP})` : '검증 진행') + ihTxt, yn: null }
      : lasts.every(r => r.verdict === 'PASS') ? { status: 'done', statusLabel: (many ? `검증 Y · 원장 ${nL}개 전부 Y` : own ? `검증 Y · ${k}회 만에 완료` : '검증 Y') + ihTxt + waivedTxt(lasts), yn: 'Y', yAt: Math.max(...lasts.map(r => r.t1)) }
        : nN ? { status: 'error', statusLabel: (many ? `검증 N · 원장 ${nN}/${nL} N` : own ? `검증 N · ${k}회차 진행 (${k}/${LOOP_CAP})` : '검증 N') + ihTxt, yn: 'N' }
          : { status: 'blocked', statusLabel: `검증 보류(${reasonTxt(lasts.find(r => r.verdict === 'BLOCKED')?.reason)})${own ? ` · ${k}회차` : ''}` + ihTxt, yn: null }
    // 실행별 원장 대조(2026-11-10 c4-build-loop-only-aef4b3-p3 D-001 — A 원장 PASS 가 B 원장 누락을 Y 로 덮음) : 파일 변경 실행(wrote)마다 자기 접미(-<agentId 앞 6자>) c4 원장이 있어야 함
    //   접미 없는 과거 원장 = 파일 변경 실행이 하나뿐일 때만 그 실행 몫 · agent id 없는 실행 = 대조 불가(건너뜀). 누락 있으면 끝난 요청 = 경보 '검증 누락'(N 은 유지), 진행 중 요청의 Y = 대기
    const sfx = new Set([...lr, ...ih].map(x => /-(a[0-9a-f]{5})$/.exec(x.id)?.[1]).filter(Boolean)), bare = lr.some(x => !/-a[0-9a-f]{5}$/.test(x.id)), wr = agents.filter(ag => ag.wrote === true)
    const unc = wr.filter(ag => { const k = String(ag.agent_id || '').slice(0, 6); return k && !sfx.has(k) && !(bare && wr.length === 1) })
    const uncLine = unc.length ? [`원장 없는 파일 변경 실행 ${unc.length}건 — ${unc.map(ag => `${ag.type || '에이전트'}(${String(ag.agent_id).slice(0, 6)}${ag.wroteEst ? ' · 추정' : ''})`).join(' · ')}`] : []
    let vd = { yn: v.yn, fails, ...(v.yAt != null ? { yAt: v.yAt } : {}) }, missAl = null
    if (unc.length && v.status !== 'running' && v.yn !== 'N') {
      if (anyRun) { if (v.yn === 'Y') { Object.assign(v, { status: 'notrun', statusLabel: '검증 대기 — 판정 전' }); vd = { yn: null, fails, wait: true } } }
      else { Object.assign(v, { status: 'error', statusLabel: '검증 누락' }); vd = { yn: null, fails, miss: true } }
    }
    if (unc.length && !anyRun) missAl = { alerts: ['검증 누락'] }
    Object.assign(byId[s.id], spanOf(rows), { status: v.status, statusLabel: v.statusLabel }, missAl || {}, {
      badge: lr.some(x => x.est) ? EST_BADGE : '매핑 연결', verdict: vd,
      lines: [...lr.map(x => `원장 ${x.id}${x.parts ? ` = 묶음 ${x.parts.join(' · ')} AND(전부 PASS 일 때만 Y)` : ''} · 판정 ${x.rows.length}건`), ...ih.map(x => `이어받은 원장 ${x.id}(${x.src}) — 같은 에이전트(${sfxOf(x.id)})가 뒤 요청에서 이어 처리, 판정 결과만 반영(회차·되돌림은 그 요청에서 집계)`), ...fl.map(x => `최종 판정 ${x.id} ${x.last.iter}회(${x.src}) — 창 뒤 판정, 결과만 반영(뒤 회차·되돌림은 그 요청에서 집계)`), ...uncLine, ...(fails ? [`N 되돌림 ${fails}회 — 검증 대상 ${byId[s.parent].label} 재작업`] : []), ...hzLine],
      rounds: lr.map(x => ({ name: `Codex 판정 ${x.id}`, cap: LOOP_CAP, rows: x.rows })),
      chips: [...codexChips(lr), ...[...fl, ...ih].map(x => { const c = vOf(x.last); return { txt: `${fl.includes(x) ? '최종 판정' : '이어받은 원장'} ${x.id}(${x.src}) ${fl.includes(x) ? `${x.last.iter}회 ` : ''}${c === 'run' ? '진행' : c === 'hold' ? 'BLOCKED' : c}${x.last.waived ? '(면제)' : ''}`, tone: c === 'Y' ? 'ok' : c === 'N' ? 'bad' : c === 'run' ? 'run' : 'warn' } })],
    })
  }
  // 서브에이전트 실행 회차별 Codex 판정(2026-11-09 마스터 "모든 서브에이전트 프로세스는 Codex 승인 OK 후 다음 진행", 정본 40. loop/codex_procedure.md 13절) — 상세·md 글자용(경로는 막지 않음, 2026-11-10)
  //   단위 = 실행 회차(같은 에이전트 재전달 회차 각각). 판정 대상 = 파일을 바꾼 실행(wrote) 또는 자기 접미 c4 원장이 창 안에 있는 실행(2026-11-10 개정), 그 밖 = '판정 대상 아님'
  //   회차의 판정 = c4 원장(접두 없는 과거 원장 포함)의
  //   판정 시각이 [그 회차 종료, 다음 회차 시작) 안인 마지막 판정 — 실행 전 판정·무관 칸 판정은 불인정(c4 iter1 D-001). 판정 없음 = 누락(실행 중·턴 진행 중 마지막이면 대기)
  //   병렬 묶음(c4 iter3 D-003) : 같은 시각(t0 동일) 시작 회차끼리는 서로의 '다음'이 아니고, 각자 판정 창 = [자기 종료, 묶음 뒤 첫 회차(t0 > 묶음 t0) 시작).
  //   대상 연결(c4 iter4 D-004) : 같은 칸이 필요한 실행 2개 이상이 판정 창을 공유하면 원장 id 끝 접미 -<agentId 앞 6자> 가 그 실행인 원장만 인정,
  //     접미 없는 원장은 '검증 보류(대상 불명)'. 대상이 하나뿐인 창 = 칸·시간창 매칭(접미 없어도 인정, 다른 실행 접미 원장은 불인정)
  //   불변식 : 모든 실행 회차는 Y·N·보류·진행·대기·누락·대상 아님 중 하나(루프 뒤 검사). 누락 경보는 CDX-루프 칸에만(실행 단위 경보 없음)
  const judg = mergeParts(loops.map(l => ({ id: l.id, rows: rowsOf(l) }))).flatMap(l => l.rows.map(r => ({ id: l.id, no: codexNo(l.id) ?? 4, t: r.run ? Infinity : r.t1, v: r.run ? 'RUN' : r.verdict }))).sort((x, y) => x.t - y.t)
  const steps = all.flatMap(n => { const g = n.rounds?.find(x => x.re); return (g ? g.rows : [n]).map(r => ({ n, k: g ? r.label : '', t0: r.t0, t1: r.t1, run: !!r.run })) }).sort((x, y) => (x.t0 ?? Infinity) - (y.t0 ?? Infinity))
  const check = { y: 0, miss: 0, viol: 0 }
  const GATE_TXT = { Y: '검증 Y', N: '검증 N', hold: '검증 보류', unk: '검증 보류(대상 불명)', run: '검증 진행', wait: '검증 대기', miss: '검증 누락', na: '판정 대상 아님' }
  // 1차 : 회차별 판정 창 [종료, 다음 회차 시작)·필수 칸. 대상 접미 = agent id 앞 6자(이 턴 실행들의 접미만 '대상 지정' 원장으로 봄)
  //   agent id 형식 = 'a' + 16진(실기록 subagents/agent-a0016aab….jsonl) → 마지막 토막이 /^a[0-9a-f]{5}$/ 인데 이 턴 실행이 아니면 다른 대상 접미(foreign = 불인정)
  const tagOf = new Map(steps.filter(x => x.n.aid).map(x => [x.n.aid.slice(0, 6), x.n])), tag = j => [...tagOf.keys()].find(k => j.id.endsWith('-' + k)) ?? (/-a[0-9a-f]{5}$/.test(j.id) ? 'foreign' : null)
  for (const x of steps) {
    x.nx = x.t0 == null ? undefined : steps.find(y => y.t0 != null && y.t0 > x.t0); x.end = x.nx ? x.nx.t0 : Infinity; x.done = x.run ? null : x.t1 ?? x.t0
    const mine = x.n.aid ? x.n.aid.slice(0, 6) : null
    // 자기 접미 원장 판정(승인 4 형제 — agentId 매칭) = 창 [실행 시작, 같은 실행 다음 회차 시작) : 판정은 SubagentStop 훅 안에서 기록되고 종료 기록은 훅 뒤라 판정 시각 < 종료 시각(실사례 요청 96 PASS .629 < 종료 .673),
    //   병렬로 다른 실행이 먼저 시작해도 자기 판정은 자기 것(실사례 요청 91 ae440b — 다음 실행 시작 전 FAIL 만 잡혀 N 으로 오판). 접미 없는·다른 접미 판정 = 종전 창 [종료, 다음 실행 시작)
    const ownEnd = x.t0 == null ? Infinity : steps.find(y => y.n === x.n && y.t0 != null && y.t0 > x.t0)?.t0 ?? Infinity
    x.inWin = x.done == null ? [] : judg.filter(j => mine && tag(j) === mine ? j.t >= (x.t0 ?? x.done) && j.t < ownEnd : j.t >= x.done && j.t < x.end); x.need = x.n.wrote === true || (mine && x.inWin.some(j => tag(j) === mine)) ? [4] : []
    x.lo = x.done ?? x.t0 ?? -Infinity
  }
  const shared = (x, no) => steps.some(y => y !== x && y.n !== x.n && y.need.includes(no) && y.lo < x.end && x.lo < y.end)   // 같은 칸 필요 + 창 겹침(같은 에이전트 재전달 회차는 순차라 제외)
  for (const x of steps) {
    const n = x.n, mine = n.aid ? n.aid.slice(0, 6) : null
    // 칸별 독립 판정 → AND : 필수 칸마다 그 칸 마지막 판정(대상 규약 적용), 모두 Y 여야 Y. 아니면 N > 보류 > 보류(대상 불명) > 진행 > (판정 없는 칸) 누락·대기 순으로 대표
    const per = x.need.map(no => {
      const w = x.inWin.filter(j => j.no === no), many = shared(x, no), cand = w.filter(j => tag(j) === mine && mine != null || (!many && tag(j) == null))
      // 자기 접미 원장의 창 뒤 판정(승인 4 · D-002) = 창 안 판정이 없거나 자기 원장 판정일 때 그 최종 결과
      const j = cand.at(-1), fv = mine ? ihV.get(mine) : null, iv = fv && (!j || tag(j) === mine) ? fv : null
      return { no, v: iv || (j ? (j.v === 'PASS' ? 'Y' : j.v === 'FAIL' ? 'N' : j.v === 'BLOCKED' ? 'hold' : 'run') : many && w.some(k => tag(k) == null) ? 'unk' : null) }
    })
    const vs = per.map(p => p.v), st = !per.length ? 'na' : vs.every(v => v === 'Y') ? 'Y' : ['N', 'hold', 'unk', 'run'].find(v => vs.includes(v)) || (x.run || (!x.nx && anyRun) ? 'wait' : 'miss')
    const brk = per.length > 1 ? ` (${per.map(p => `c${p.no} ${p.v ? GATE_TXT[p.v].replace('검증 ', '') : (st === 'wait' ? '대기' : '누락')}`).join(' · ')})` : ''
    n.cdx = GATE_TXT[st]; n.lines = [...n.lines, `Codex 판정${x.k ? ' ' + x.k : ''} : ${GATE_TXT[st]}${brk}`]
    check.y += st === 'Y'; check.miss += st === 'miss'; x.st = st
  }
  const stray = steps.filter(x => !GATE_TXT[x.st])
  if (stray.length) throw new Error(`판정 불변식 위반 : 판정 상태 없는 실행 ${stray.map(x => x.n.label).join(', ')}`)
  // 1.2 승인 실행이 2회 이상이면 마지막(시작 시각순) = 최종 승인, 나머지 = 중간 승인(2026-11-09 그래프 분석 ②)
  const admin = kidsOf('1.2')
  if (admin.length >= 2) admin.forEach((n, i) => { n.approval = i === admin.length - 1 ? '최종' : '중간'; n.lines = [`${n.approval} 승인 — 승인 실행 ${admin.length}회 중 ${i + 1}번째`, ...n.lines] })
  // 같은 type 반복 실행 = 그 칸 회차표(병렬 동시 실행도 포함 — 시작 시각순)
  for (const p of nodes) {
    const by = {}; for (const k of kidsOf(p.id)) (by[k.label] = by[k.label] || []).push(k)
    const groups = Object.entries(by).filter(([, xs]) => xs.length >= 2).map(([type, xs]) => ({ name: `${type} 반복 실행`, cap: LOOP_CAP, rows: xs.map((x, i) => ({ label: `${i + 1}회차`, t0: x.t0, t1: x.t1, run: x.run, state: x.statusLabel + (x.approval ? ` · ${x.approval} 승인` : '') })) }))
    if (groups.length) p.rounds = [...(p.rounds || []), ...groups]
  }
  // 1.2 승인(2026-11-10 마스터 "총괄검수가 끝나면 반드시 파다완 아소카의 종료 승인" — 종료 승인 = 아소카 직접) : 메인 응답의 '종료 승인 : <승인|보류> — <근거>' 줄(t.approvals)이 완료 근거
  //   줄 있음 = 완료(마지막 줄 — 시각·승인/보류·근거를 칸 안 줄로) · 없음 + Stop 훅 상한 기록(t.forced) = 오류 '승인 강제 실패' · 없음 + 팀장 실행 중 = 진행 · 그 밖 = 미실행
  //   teamanakin-admin 실행 = 칸 안 줄(아래 agentChips)·상세 줄로 함께 표시(완료 근거 아님)
  const aps = (t.approvals || []).filter(x => x.t >= a).sort((x, y) => x.t - y.t), ap = aps.at(-1), forced = (t.forced || []).at(-1)
  const admLines = admin.length ? [`팀장(teamanakin-admin) 실행 ${admin.length}회${admin.length >= 2 ? ` — 중간 ${admin.length - 1} · 최종 = 마지막 실행` : ''}`] : []
  Object.assign(byId['1.2'], ap
    ? { status: 'done', statusLabel: `종료 승인 ${ap.kind}`, t0: ap.t, t1: ap.t, run: false, chips: aps.map((x, i) => ({ txt: `${i === aps.length - 1 ? '' : '(이전) '}종료 승인 ${kstOf(x.t).slice(11, 16)} ${x.kind} — ${x.why}`, tone: i === aps.length - 1 ? (x.kind === '승인' ? 'ok' : 'warn') : '' })), lines: [`종료 승인 줄 ${aps.length}건 — 마지막 ${kstOf(ap.t).slice(5)} ${ap.kind} : ${ap.why}`, ...admLines] }
    : forced ? { status: 'error', statusLabel: '승인 강제 실패', alerts: ['승인 강제 실패'], t0: ms(forced.at), t1: ms(forced.at), run: false, chips: [{ txt: `✖ 승인 강제 실패 ${kstOf(ms(forced.at)).slice(11, 16)} — ${forced.why || '종료 승인 줄 없음'}`, tone: 'bad' }], lines: [`Stop 훅 연속 차단 상한 도달 — 종료 승인 줄 없이 종료 허용(${forced.why || '사유 미기록'})`, ...admLines] }
      : admin.some(n => n.run) ? { ...spanOf(admin), ...sty('running'), lines: ['종료 승인 줄 대기 — 팀장 실행 중', ...admLines] }
        : { ...sty('notrun'), lines: [`메인 응답에 '종료 승인 : <승인|보류> — <근거>' 줄 없음`, ...admLines] })
  // 1.1 접수 = ts_req ~ 하위(1.1 아래 칸 + 승인 밖 에이전트) 마지막 종료
  const under = id => nodes.filter(n => n.parent === id).flatMap(n => [n, ...under(n.id)])
  const sub = spanOf([...under('1.1'), ...all.filter(n => n.parent !== '1.2')].filter(n => n.t0 != null || n.t1 != null || n.run))
  const turnSt = anyRun ? { status: 'running', statusLabel: turnRunning ? STATUS_STYLE.running.label : '진행(팀원 실행 중)' } : { status: TURN_NODE[ts.key], statusLabel: ts.label }
  const eng = ENG_SLOTS.filter(id => ['done', 'running', 'estimated'].includes(byId[id].status)), est = eng.filter(id => byId[id].status === 'estimated')
  // 누적 회차(결함 ①) : 요청 안 회차표 최대(이어받은 회차는 앞 요청 몫 base 포함) vs 작업 묶음(splitAgentRounds) 전달 수 최대 → 큰 값
  const own = Math.max(0, ...[...nodes, ...all].flatMap(n => (n.rounds || []).filter(g => g.cap).map(g => (g.base || 0) + roundSummary(g.rows, now).n)))
  const cumN = Math.max(own, t.bundle?.n || 0), size = t.bundle?.size || 1
  const level = cumN >= ALERT.cap ? '상한 도달' : cumN >= ALERT.nearCap ? '상한 근접' : null
  const miss = SLOTS.filter(s => s.kind === 'codex' && byId[s.id].alerts).map(s => byId[s.id])   // 검증 누락 칸 = CDX-루프(파일 변경 실행이 있는데 원장 없음)
  const alerts = all.reduce((s, n) => s + (n.alerts || []).length, 0) + miss.length + (level ? 1 : 0) + (byId['1.2'].alerts ? 1 : 0)
  Object.assign(byId['1'], turnSt, {
    t0: a, t1: anyRun ? null : ms(t.ts_res), run: anyRun, agentN: all.length, check, eng: eng.length, engEst: est.length, cum: { n: cumN, size, cap: ALERT.cap, ...(level ? { level } : {}) }, alertN: alerts,
    lines: [`엔지니어링 ${engTxt(eng.length, est.length)} 수행${eng.length ? ` — ${eng.map(id => byId[id].label).join(' · ')}` : ''}`, `묶음 누적 ${cumN}/${ALERT.cap}${size > 1 ? ` — 지속 에이전트(${t.bundle.agents.join(' · ')})로 이어진 요청 ${size}건` : ' — 요청 단위(이어받은 지속 에이전트 없음)'}${level ? ` · ${level}` : ''}`,
      ...(alerts ? [`경보 ${alerts}건 — ${[...all.flatMap(n => (n.alerts || []).map(x => `${n.label} ${x}`)), ...miss.map(n => `${n.label} 검증 누락`), ...(level ? [level] : []), ...(byId['1.2'].alerts ? ['승인 강제 실패'] : [])].join(' · ')}`] : [])],
  })
  Object.assign(byId['1.1'], turnSt, { t0: a, t1: anyRun ? null : sub.t1, run: anyRun })
  // 칸 안 실행 줄 : 에이전트를 그 칸에 묶는다(독립 노드 없음)
  for (const n of nodes) { const k = kidsOf(n.id); if (k.length) Object.assign(n, { agents: k, chips: [...(n.chips || []), ...agentChips(k, now)] }) }   // 칸 자체 요약 먼저, 에이전트 실행 줄 뒤
  // 쌍 단위 표시(2026-11-10 마스터 C-7 "SA 가 없으면 CDX 도 없다") : 프롬프트·컨텍스트·하네스·루프 SA 는 실행 증거가 없으면 그리지 않는다.
  //   CDX 칸(CDX-루프 하나 — 2026-11-10 개정)은 부모 SA 가 숨거나 판정 대상 없음(원장·파일 변경 실행 0건)이면 숨김. 집계(N/5·묶음)는 위에서 끝남 = 표시만 제외
  const drop = new Set(PAIRS.filter(id => IDLE.has(byId[id].status)))
  for (const s of SLOTS) if (kind[s.id] === 'codex' && (drop.has(s.parent) || (IDLE.has(byId[s.parent]?.status) && !byId[s.id].rounds) || (byId[s.id].status === 'notrun' && !byId[s.id].verdict))) drop.add(s.id)
  for (const n of nodes) if (drop.has(n.parent)) drop.add(n.id)   // 자손(nodes = SLOTS 순서라 부모가 먼저)
  const vis = nodes.filter(n => !drop.has(n.id))
  // 위반 수(2026-11-10 마스터 단순화) = 보이는 CDX 칸 중 Y 아닌 칸 수(진행 중 요청의 판정 대기·진행 칸은 아직 판정 전이라 제외)
  //   요약 Y·누락 = 보이는 CDX 칸 상태로 같은 함수(cdxCheck)가 센다(2026-11-10 c5-turn-f7dc16-1110112110 D-001 — 요약 '누락 0'이 실행 회차 집계라 상세 '검증 누락 5칸'과 어긋남)
  Object.assign(check, cdxCheck(vis))
  return serial(vis)
}
/** CDX 칸 집계(요약 머리 · 화면 상태 줄 · md 공통) : y = 검증 Y 칸, miss = 검증 누락 칸(원장 없음 — 진행 중 요청의 판정 전 칸은 '대기'라 제외), wait = 판정 대기·진행 칸, viol = notY(Y 아님·대기 아님) */
export const cdxCheck = vis => { const cx = vis.filter(n => SLOTS.find(s => s.id === n.id)?.kind === 'codex'); return { y: cx.filter(n => n.verdict?.yn === 'Y').length, miss: cx.filter(n => n.statusLabel === '검증 누락').length, wait: cx.filter(n => n.verdict?.wait || n.status === 'running').length, viol: cx.filter(notY).length } }
const IDLE = new Set(['missing', 'notrun', 'unassigned'])   // 실행 흔적 없는 상태
/** 쌍 단위로 숨기는 SA 칸(C-7 ①) — 그래프 쌍은 늘 그림(SLOT_MAP always) */
export const PAIRS = ['1.1.1', '1.1.2', '1.1.3', '1.1.4']
/** 위반으로 세는 CDX 칸 : Codex 칸이고 Y 아님 + 판정 대기·진행 아님(buildRequestGraph 의 check.viol 과 화면·md 의 ⚠ 표시가 같은 정의) */
export const notY = n => SLOTS.find(s => s.id === n.id)?.kind === 'codex' && n.verdict?.yn !== 'Y' && !n.verdict?.wait && n.status !== 'running'
/** 노드 번호(2026-11-09 마스터 "계층 번호 제거, 순서대로 일련번호" · 2026-11-10 C-11 "CDX 는 SA 번호에 딸린 표기") : 보이는 칸 중 CDX 아닌 칸만 SLOTS 순서로 1, 2, 3 …, CDX = 짝 SA 번호 + '-1'(예 3-1) — 표시 전용(no), id·매핑은 그대로 */
export const serial = nodes => { let k = 0; const no = {}; for (const n of nodes) if (n.slot) n.no = no[n.id] = SLOTS.find(s => s.id === n.id)?.kind === 'codex' ? `${no[n.parent] ?? '?'}-1` : ++k; return nodes }
/** 칸에 묶인 에이전트 실행 노드 전부(상세·md·시험용) */
export const agentsOf = nodes => nodes.flatMap(n => n.agents || [])

/**
 * 실행 경로(흐름 화살표) = 표준 처리 순서로 실행된 칸을 끝까지 순차 연결(2026-11-10 마스터 "모든 프로세스가 진행되었다면 연결선이 반드시 순차적으로")
 *   시작(S) → 1 → 1.1 → SLOTS 순서의 SA 칸(실행된 것만 — 미수행·미실행·미배정·기록 이전은 건너뜀) → 그 SA 의 CDX 칸(화면에 보이는 것) → 다음 SA … → 1.2 승인(실행된 경우) → 종료(E)
 *   CDX 가 Y 면 다음 칸으로 'Y' 간선, Y 아님(누락·N·보류)이면 선은 그대로 잇고 CDX 칸에 ⚠ 검증 누락·N 표시만(정지·차단 배지 없음)
 *   진행 중·중단 요청 = 마지막으로 실제 실행된 칸(CDX 는 판정 원장 있음)까지 실선, 그 뒤 표준 칸 → 종료는 예정(점선), 중단은 첫 예정 '중단'
 *   선 모양 = 지나간 선 실선 · 예정 점선, 진행 중 칸으로 들어가는 선 = running. 재작업 회차·Codex 회차는 칸 안 줄(시각순 기록 = pathLog, md '실행 기록(시각순)')
 *   verdicts = 검증 N 되돌림 화살표(CDX → 부모 SA, '되돌림 k회', 최종 Y 면 흐림 noold) — 번호 경로와 별도
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
  const pos = Object.fromEntries(SLOTS.map((s, i) => [s.id, i]))
  // 경로 후보 : SA·승인 = 실행 흔적 있는 칸, CDX = 화면에 보이는 칸(실행된 SA 의 짝 — 누락이어도 지나감). 실제 실행 = CDX 는 판정 원장(rounds) 있음
  //   승인 칸(1.2)은 상태와 관계없이 늘 경로에(2026-11-10 c5-turn-f7dc16-1110112110 D-002 — 미실행이면 마지막 CDX → 종료로 건너뛰던 결함) : 미실행 = 들어가는 선 '⚠ 승인 미실행'
  const cand = SLOTS.filter(s => ['sub', 'codex', 'approve'].includes(s.kind)).map(s => by[s.id]).filter(n => n && (kind[n.id] !== 'sub' || !IDLE.has(n.status)))
  const did = n => kind[n.id] === 'codex' ? !!n.rounds : kind[n.id] === 'approve' ? !IDLE.has(n.status) : true
  const live = !!n1.run || stopped, upto = live ? cand.reduce((k, n, i) => did(n) ? i : k, -1) : cand.length - 1
  const seq = [{ id: 'S' }, { id: '1' }, { id: '1.1' }]
  let y = false
  // 진행 중 요청의 판정 대기 CDX(원장 없음)는 순서대로 지나가되 그 칸으로 들어가는 선만 예정(점선) — 아직 판정 전
  for (const n of cand.slice(0, upto + 1)) { seq.push({ id: n.id, run: n.status === 'running', y, wait: kind[n.id] === 'codex' && !did(n) && !!n.verdict?.wait, miss: kind[n.id] === 'approve' && !did(n) }); y = kind[n.id] === 'codex' && n.verdict?.yn === 'Y' }
  const actual = seq.length
  if (live) {   // 예정 경로 : 마지막 실행 칸 뒤 표준 슬롯 → 종료
    const seen = new Set(seq.map(x => x.id))
    for (const sl of SLOTS.slice(pos[seq.at(-1).id] + 1)) if (['sub', 'codex', 'approve'].includes(sl.kind) && by[sl.id] && !seen.has(sl.id)) seq.push({ id: sl.id, plan: true })
    seq.push({ id: 'E', plan: true })
  } else seq.push({ id: 'E', y })
  const edges = seq.slice(1).map((s, i) => {
    const e = { from: seq[i].id, to: s.id, seq: i + 1, loop: false }
    if (s.miss) return { ...e, state: 'planned', pass: false, label: '⚠ 승인 미실행', warn: true }
    if (s.plan || s.wait) return { ...e, state: 'planned', pass: false, ...(s.plan && stopped && i + 1 === actual ? { label: '중단' } : {}) }
    return { ...e, ...(s.y ? { label: 'Y' } : {}), state: s.run ? 'running' : s.y ? 'yes' : 'done', pass: true }   // 검증 Y → 다음 = 이 간선 하나(별도 화살표 없음)
  })
  // 검증 N 되돌림 화살표(2026-11-09 마스터) : FAIL 이력 → 검증 대상(부모) 점선 + 회수(최종 Y 면 흐리게 noold), 보류 = 없음
  const verdicts = []
  for (const n of nodes) {
    if (kind[n.id] !== 'codex' || !n.verdict?.fails || n.status === 'blocked' || !by[n.parent]) continue
    verdicts.push({ from: n.id, to: n.parent, seq: 'N', loop: true, state: n.verdict.yn === 'Y' ? 'noold' : 'no', pass: true, label: `되돌림 ${n.verdict.fails}회` })
  }
  return { term, edges, verdicts }
}
/**
 * 시각순 실행 기록(칸 안에 묶인 실행 이벤트 보존 — md '실행 기록(시각순)') : 에이전트 시작 · 팀원 재작업 회차 · Codex 회차, 시각 없는 이벤트 제외
 *   [{ id(에이전트 노드 또는 칸), t, run, lab? }] — 회차 라벨 = 재작업 k회차 (k/5)(이어받은 회차는 앞 요청 몫부터) · '<원장> k회차 (k/5)'(BLOCKED 는 회차 미소모)
 */
export function pathLog(nodes) {
  const kind = Object.fromEntries(SLOTS.map(s => [s.id, s.kind])), ev = []
  for (const n of agentsOf(nodes)) {
    const g = (n.rounds || []).find(x => x.re)
    if (g) g.rows.forEach((r, i) => { const k = (g.base || 0) + i + 1; ev.push({ id: n.id, t: r.t0, run: !!r.run, ...(k > 1 ? { lab: `재작업 ${k}회차 (${k}/${LOOP_CAP})` } : {}) }) }); else ev.push({ id: n.id, t: n.t0, run: !!n.run })
  }
  for (const n of nodes) if (kind[n.id] === 'codex' && n.rounds) for (const g of n.rounds) { let k = 0; for (const r of g.rows) { if (!r.blocked) k++; ev.push({ id: n.id, t: r.t0 ?? r.t1, run: !!r.run, lab: `${g.name.replace(/^Codex 판정 /, '')} ${r.label}${r.blocked ? '' : ` (${k}/${LOOP_CAP})`}` }) } }
  return ev.filter(e => e.t != null).sort((a, b) => a.t - b.t)
}

/**
 * 계층 트리 좌표(화면 스크립트에 원문 그대로 인라인 — 바깥 이름 참조 금지). size(n) → { w, h }, 반환 { pos: id → { d, x, y, w, h }, dmax }
 *   isPair(n) = 짝 SA 에 붙일 CDX 칸(2026-11-10 마스터 C-11 "CDX 는 SA 와 같은 Depth 에 두지 말고 한 단계 내려서 가로 시 바로 옆, 상하 시 바로 아래에 쌍으로. 항상")
 *     — CDX 는 SA 의 자식(depth + 1)이고 형제 줄에서 빠져 SA 와 한 덩어리(사이에 다른 노드 없음)
 *   dir 'v'(기본, 위→아래 흐름) = 깊이 → 행 · 형제 → 가로(Z.wrapW 넘으면 줄 접기), 부모 = 자식 블록 위 가운데
 *     짝 CDX = SA 바로 아래(간격 Z.pairGap) + 오른쪽으로 Z.pairIndent 들여쓰기(아웃라인 모양), SA 의 다른 자식은 그 아래
 *   dir 'h'(왼쪽→오른쪽 흐름) = 깊이 → 열 · 형제 → 세로, 짝 CDX = SA 바로 오른쪽 다음 열(같은 위, 간격 Z.colGap), SA 의 다른 자식은 CDX 아래(같은 열)
 */
export function layoutTree(nodes, dir, Z, size, isPair) {
  const kids = {}, pos = {}, mate = {}, gap = Z.pairGap || 0, ind = Z.pairIndent || 0; let dmax = 0
  for (const n of nodes) { if (n.parent && isPair && isPair(n)) mate[n.parent] = n; else (kids[n.parent] = kids[n.parent] || []).push(n) }
  const top = nodes.find(n => !n.parent)
  if (dir === 'h') {
    let y = 0
    const walk = (n, d, reserve) => {
      dmax = Math.max(dmax, d); const ch = kids[n.id] || [], s = size(n), mt = mate[n.id], x = d * (Z.boxW + Z.colGap)
      if (mt) {   // 짝 : SA 위 맞춤 + CDX 다음 열 같은 위, SA 의 다른 자식 = CDX 아래부터
        const m = size(mt), y0 = y; dmax = Math.max(dmax, d + 1)
        pos[n.id] = { d, x, y: y0, w: s.w, h: s.h }; pos[mt.id] = { d: d + 1, x: x + s.w + Z.colGap, y: y0, w: m.w, h: m.h }
        y += Math.max(s.h, m.h) + Z.gapY; ch.forEach(c => walk(c, d + 1, 0)); return
      }
      if (!ch.length) { const R = Math.max(s.h, reserve); pos[n.id] = { d, x, y: y + (R - s.h) / 2, w: s.w, h: s.h }; y += R + (n.slot ? Z.gapY : Z.gapY / 2); return }
      ch.forEach(c => walk(c, d + 1, ch.length === 1 ? Math.max(s.h, reserve) : 0))
      const a = pos[ch[0].id], b = pos[ch[ch.length - 1].id]; pos[n.id] = { d, x, y: (a.y + a.h / 2 + b.y + b.h / 2) / 2 - s.h / 2, w: s.w, h: s.h }
    }
    walk(top, 0, 0)
    return { pos, dmax }
  }
  // 머리 = 칸 + 아래 들여쓴 짝 CDX(있으면) 덩어리
  const head = n => { const s = size(n), m = mate[n.id] && size(mate[n.id]); return { s, m, w: m ? Math.max(s.w, ind + m.w) : s.w, h: m ? s.h + gap + m.h : s.h } }
  const blk = {}
  const measure = (n, d) => {
    dmax = Math.max(dmax, d + (mate[n.id] ? 1 : 0)); const ch = kids[n.id] || [], s = head(n), rows = []
    ch.forEach(c => measure(c, d + 1))
    let row = [], rw = 0
    for (const c of ch) { const bw = blk[c.id].w; if (row.length && rw + Z.colGap + bw > Z.wrapW) { rows.push({ xs: row, w: rw }); row = []; rw = 0 } rw += (row.length ? Z.colGap : 0) + bw; row.push(c) }
    if (row.length) rows.push({ xs: row, w: rw })
    for (const r of rows) r.h = Math.max(...r.xs.map(c => blk[c.id].h))
    const cw = Math.max(0, ...rows.map(r => r.w)), chh = rows.reduce((a, r) => a + r.h, 0) + Z.rowGap * Math.max(0, rows.length - 1)
    blk[n.id] = { s, rows, w: Math.max(s.w, cw), h: s.h + (rows.length ? Z.rowGap + chh : 0) }
  }
  const place = (n, d, x0, y0) => {   // x0 = 블록 왼쪽, y0 = 블록 위
    const b = blk[n.id], hd = b.s, x = x0 + (b.w - hd.w) / 2, mt = mate[n.id]
    pos[n.id] = { d, x, y: y0, w: hd.s.w, h: hd.s.h }
    if (mt) pos[mt.id] = { d: d + 1, x: x + ind, y: y0 + hd.s.h + gap, w: hd.m.w, h: hd.m.h }
    let y = y0 + hd.h + Z.rowGap
    for (const r of b.rows) { let x = x0 + (b.w - r.w) / 2; for (const c of r.xs) { place(c, d + 1, x, y); x += blk[c.id].w + Z.colGap } y += r.h + Z.rowGap }
  }
  // 세로 바닥 칸(2026-11-10 마스터 C-15 "'승인' 하단 정중앙", 세로 모드만) : Z.foot(승인 칸 id)을 루트 형제 줄에서 빼고 그림 맨 아래 · 전체 폭 정중앙에 둔다
  const foot = Z.foot && (kids[top.id] || []).find(n => n.id === Z.foot)
  if (foot) kids[top.id] = kids[top.id].filter(n => n !== foot)
  measure(top, 0); place(top, 0, 0, 0)
  if (foot) { measure(foot, 1); const ps = Object.values(pos), cx = (Math.min(...ps.map(p => p.x)) + Math.max(...ps.map(p => p.x + p.w))) / 2; place(foot, 1, cx - blk[foot.id].w / 2, Math.max(...ps.map(p => p.y + p.h)) + Z.rowGap) }
  return { pos, dmax }
}
/**
 * 시작·종료 터미널 왼쪽 위 좌표(화면 스크립트에 원문 그대로 인라인 — 바깥 이름 참조 금지) → { S: { x, y }, E: { x, y } }
 *   세로(C-15, 세로 모드만) : S = 1번 칸 왼쪽 Z.termGapS · 세로 가운데 맞춤, E = 승인 칸(Z.foot — 맨 아래 정중앙) 왼쪽 Z.termGapE · 세로 가운데 맞춤(승인 칸 없으면 종전 = 맨 아래 루트 가운데 줄)
 *   가로 = 종전 그대로(S 루트 왼쪽 같은 높이 · E 왼쪽 맨 아래)
 */
export function termPos(pos, dir, Z) {
  const r0 = pos['1'], bottom = Math.max(...Object.values(pos).map(p => p.y + p.h)), f = pos[Z.foot], mid = (p, h) => p.y + p.h / 2 - h / 2
  if (dir !== 'v') { const x = -(Z.termW + Z.colGap); return { S: { x, y: mid(r0, Z.termH) }, E: { x, y: bottom - Z.termH } } }
  return { S: { x: r0.x - Z.termGapS - Z.termW, y: mid(r0, Z.termH) }, E: f ? { x: f.x - Z.termGapE - Z.termW, y: mid(f, Z.termH) } : { x: r0.x + r0.w / 2 - Z.termW / 2, y: bottom + Z.rowGap } }
}

/** 설계도판 노드 : 실데이터 없이 슬롯만 */
export const designGraph = () => serial(SLOTS.map(s => ({ id: s.id, parent: s.parent, label: s.label, slot: s.id, status: 'unassigned', statusLabel: '설계', lines: [], t0: null, t1: null, run: false })))

/** Obsidian 안전 파일명 : 금지 문자 \ / : * ? " < > | # ^ [ ] 제거 */
export const safeName = s => String(s).replace(/[\\/:*?"<>|#^[\]\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim()
export const slotFile = s => safeName(`${s.id} ${s.label}`)

// ── 입출력 ────────────────────────────────────────────────────────────────────
/** 열린 결함 상태 — codex-verify.mjs C.liveDefect · codex-gate.mjs liveDefects 와 같은 값(시험이 liveDefects 와 일치 확인) */
export const LIVE_DEFECT = ['open', 'regressed', 'contested']
/**
 * 면제 해소(2026-11-10 팀장 지적 · c4-loadloops-a1b42f D-001 회송) : 원장 마지막 판정이 FAIL 이고 아래 ①② 모두 만족하면 { n, by }, 아니면 null(FAIL 유지)
 *   ① 열린 결함(LIVE_DEFECT — 훅 liveDefects 와 같은 상태, 단 파일 없는 결함도 센다 : 빼면 면제 안 된 결함이 숨어 Y 가 됨) 1건 이상 · 전부 원장 waived
 *   ② met 아닌 기준(unmet·unverifiable)마다 (a) waived 에 그 기준 id 명시 또는 (b) 판정자 evidence 에 면제된 결함 id(D-NNN) 언급
 *      — 래퍼 보충 기준(evidence '래퍼가 채움')은 (b) 불인정, (a) 로만. 근거 확인 불가 = FAIL 유지
 */
const FILLED_BY_WRAPPER = '래퍼가 채움'   // codex-verify.mjs finalize 기준 누락 보충 evidence '판정자 출력에 없음 — 래퍼가 채움'
export function waiverOf(dir, l) {
  const it = (l.iters || []).at(-1); if (it?.verdict !== 'FAIL') return null
  try {
    const out = it.out && fs.existsSync(it.out) ? it.out : path.join(dir, `iter-${it.iter}.codex.json`), w = l.waived || {}, r = JSON.parse(fs.readFileSync(out, 'utf8'))
    const ds = (r.defects || []).filter(d => LIVE_DEFECT.includes(d.status))
    if (!ds.length || !ds.every(d => w[d.id])) return null
    const byDefect = c => !String(c.evidence || '').includes(FILLED_BY_WRAPPER) && (String(c.evidence || '').match(/\bD-\d+\b/g) || []).some(id => w[id])
    // 근거 확인 불가 = FAIL 유지(c4-loadloops-a1b42f 2회차 D-001) : criteria 없음·배열 아님·빈 배열, 원장 계약 기준(criteriaIds)이 결과에 하나라도 없음(형식 이상 포함)
    const cs = r.criteria, ids = l.criteriaIds
    if (!Array.isArray(cs) || !cs.length || (ids !== undefined && (!Array.isArray(ids) || !ids.every(id => cs.some(c => c?.id === id))))) return null
    if (!cs.filter(c => c?.status !== 'met').every(c => w[c?.id] || byDefect(c))) return null
    return { n: ds.length, by: [...new Set(ds.map(d => w[d.id].by).filter(Boolean))].join(' · ') || '승인자 미기록' }
  } catch { return null }   // 결과 파일 없음·깨짐 = 면제 확인 불가 → FAIL 유지
}
export function loadLoops(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).flatMap(id => {
    if (/^bundle-/.test(id)) return []   // 과거 턴 묶음 원장(Codex 호출 몫, 2026-11-10 폐지) — 칸이 아님
    if (fs.existsSync(path.join(dir, id, 'superseded.json'))) return []   // 대체된 원장(codex-gate supersede — scope 재산정으로 이번 판정 계획 밖, 2026-11-10 결함 8) = 집계 제외
    try {
      const l = JSON.parse(fs.readFileSync(path.join(dir, id, 'ledger.json'), 'utf8'))
      // 면제 해소 = 마지막 판정 PASS 로 취급(루프 쌍·N·검증 누락·실행별 판정 모두 Y) + waived 표식(화면 'Y(면제)')
      const wv = waiverOf(path.join(dir, id), l), lastIt = (l.iters || []).at(-1)
      const events = [...(l.iters || []).map(x => ({ iter: x.iter, at: x.at, verdict: x.verdict, open: (x.openDefects || []).length, ...(wv && x === lastIt ? { verdict: 'PASS', waived: wv } : {}) })),
        ...(l.blocked || []).map(x => ({ iter: x.iter, at: x.at, verdict: 'BLOCKED', open: null, reason: x.reason || [...new Set((x.blocked || []).map(b => b.reason))].join(',') }))]
      let lockAt = null; try { lockAt = fs.statSync(path.join(dir, id, 'ledger.lock')).mtimeMs } catch { /* 잠금 없음 = 실행 중 아님 */ }
      let agentType; try { agentType = JSON.parse(fs.readFileSync(path.join(dir, id, 'gate.json'), 'utf8')).agentType } catch { /* gate.json 없음 = 수동 원장 */ }
      return [{ id, startedAt: l.startedAt, running: lockAt != null, lockAt, events: events.filter(e => e.at), agentType }]
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
      const wfCall = recs.some(j => j.type === 'assistant' && ms(j.timestamp) >= p0 && (j.message?.content || []).some(c => c?.type === 'tool_use' && c.name === 'Workflow'))   // 워크플로 귀속(loadWorkflowAgents) 근거
      // 정확 매핑 : Workflow 결과 'Transcript dir … wf_<id>'(로거 wfOf 와 같은 규칙) — 로거가 아직 안 쓴 진행 중 턴용
      const wfIds = [...new Set(recs.filter(j => j.type === 'user' && ms(j.timestamp) >= p0 && Array.isArray(j.message?.content)).flatMap(j => j.message.content.filter(b => b?.type === 'tool_result').map(b => /workflows[\\/]+(wf_[\w-]+)/.exec(typeof b.content === 'string' ? b.content : (b.content || []).map(p => p?.text || '').join('\n'))?.[1]).filter(Boolean)))]
      const t = { key: `${sid}:live`, id: `${sid}:live`, session_id: sid, session: sid.slice(0, 8), turn: '진행', ts_req: new Date(p0).toISOString(), ts_res: null, req_head: textOf(prompt.message.content).trim().slice(0, 200), category: '', agents_detail: [], resources: { hooks }, live: true, wfCall, wfIds }
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
 * 워크플로 에이전트(2026-11-09 결함 — 생성기·로거가 <세션>/subagents/agent-*.jsonl 만 읽고 subagents/workflows/wf_<id>/agent-*.jsonl 을 놓쳐 1.1.4·1.1.5·1.2 미수행 오판정)
 *   귀속 = 워크플로를 시작한 요청 : ① 정확 매핑 — 로거 레코드 wf_exact(Workflow 결과의 wf_<id> 로 연결) 의 턴 또는 진행 중 턴의 t.wfIds(scanLive)
 *          ② 정확 매핑이 없을 때만 시간 추정 — 같은 세션에서 Workflow 도구 호출이 있었던 턴(t.wfCall) 중 그 워크플로 첫 에이전트 시작 이전의 마지막 턴, 없으면 시작 시각이 속한 턴
 *          (2026-11-09 Codex D-001 : 시간 추정이 정확 매핑을 덮어 두 Workflow 호출이 겹치면 뒤 요청으로 옮기던 결함).
 *   근거 : Workflow 도구는 즉시 반환(백그라운드)하고 워크플로 에이전트 meta 에는 toolUseId·name 이 없다(실기록 wf_b23da157-729 meta = agentType·description·workflowPhase 뿐)
 *   → 귀속 단위는 워크플로 1개(에이전트별로 나누지 않음). 정확 매핑(Workflow 도구 결과의 'Transcript dir … wf_<id>')은 로거가 agent 레코드(workflow 필드)에 남긴다.
 *   로거 레코드(workflow 필드)도 같은 규칙으로 한 요청에 모은다(비용 cost_agents_usd 도 함께 이동) — 수정 전에 Workflow 호출을 지난 로거는 정확 매핑이 없어
 *   에이전트별 시작 시각으로 기록해 한 워크플로가 여러 요청에 흩어진다(실사례 wf_b23da157-729 → 요청 3건). 같은 agent_id 는 한 요청에만 — 중복 귀속 금지.
 *   완료 = 워크플로 journal.jsonl 의 그 agentId 'result' 기록 / 없고 최근 LIVE.windowMs 안에 바뀐 기록 = 진행 / 그 밖 = 종료 기록 없음
 *   이미 붙은 레코드(로거·앞 실행)도 매 실행 같은 판정으로 live·ts_end 갱신(D-002) — 단 journal 이 없으면 미완료를 알 수 없어 로거 ts_end 유지
 *   캐시 = agent_id → 기록 크기·mtime 같으면 시작·끝 시각·모델·오류 수 재사용(훅이 서브에이전트 시작·종료마다 부르므로)
 *   반환 = { added(새로 붙임), moved(로거 레코드 이동) }
 */
export function loadWorkflowAgents(turns, sessDir, { cacheFile, now = Date.now() } = {}) {
  let cache = {}; try { cache = cacheFile ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {} } catch { /* 캐시 없음 = 전부 읽기 */ }
  const next = {}, known = new Map(), bySess = {}, recsOf = {}
  for (const t of turns) {
    (bySess[t.session_id] = bySess[t.session_id] || []).push(t)
    for (const ag of t.agents_detail || []) { if (ag.agent_id) known.set(ag.agent_id, ag); if (ag.workflow) (recsOf[`${t.session_id}|${ag.workflow}`] = recsOf[`${t.session_id}|${ag.workflow}`] || []).push({ ag, t }) }
  }
  let added = 0, moved = 0
  for (const [sid, own] of Object.entries(bySess)) {
    const root = sessDir ? path.join(sessDir, sid, 'subagents', 'workflows') : null
    let wfs = []; try { wfs = fs.readdirSync(root).filter(w => /^wf_/.test(w)) } catch { /* 워크플로 폴더 없음 */ }
    for (const k of Object.keys(recsOf)) if (k.startsWith(sid + '|') && !wfs.includes(k.slice(sid.length + 1))) wfs.push(k.slice(sid.length + 1))
    for (const wf of wfs) {
      const dir = root && path.join(root, wf), recs = recsOf[`${sid}|${wf}`] || []
      let done = new Set(), hasJournal = false; try { done = new Set(fs.readFileSync(path.join(dir, 'journal.jsonl'), 'utf8').split('\n').flatMap(l => { try { const j = JSON.parse(l); return j.type === 'result' && j.agentId ? [j.agentId] : [] } catch { return [] } })); hasJournal = true } catch { /* journal 없음 = 완료 기록 없음 */ }
      let files = []; try { files = fs.readdirSync(dir).filter(f => /^agent-.+\.jsonl$/.test(f)) } catch { /* 기록 폴더 없음 = 로거 레코드만 */ }
      const ags = files.flatMap(f => {
        const id = f.slice(6, -6), base = path.join(dir, 'agent-' + id)
        let st; try { st = fs.statSync(base + '.jsonl') } catch { return [] }
        const sig = `${st.size}:${Math.round(st.mtimeMs)}`
        let c = cache[id]
        if (c?.sig !== sig) {
          let meta = {}; try { meta = JSON.parse(fs.readFileSync(base + '.meta.json', 'utf8')) } catch { /* meta 없음 */ }
          const recs = tailJsonl(base + '.jsonl', Infinity), tsv = recs.map(j => ms(j.timestamp)).filter(v => v != null)
          const errors = recs.reduce((s, x) => s + (x.type === 'user' && Array.isArray(x.message?.content) ? x.message.content.filter(b => b?.type === 'tool_result' && b.is_error).length : 0), 0)
          const model = recs.filter(j => j.type === 'assistant' && j.message?.model && !/^</.test(j.message.model)).at(-1)?.message.model || meta.pickedEffortModel || null
          c = { sig, type: meta.customAgentType || meta.agentType || '서브에이전트', name: meta.description || null, model, t0: tsv.length ? Math.min(...tsv) : null, t1: tsv.length ? Math.max(...tsv) : null, errors }
        }
        next[id] = c
        return c.t0 == null ? [] : [{ id, c, fresh: now - st.mtimeMs < LIVE.windowMs }]
      })
      const starts = [...ags.map(x => x.c.t0), ...recs.map(x => ms(x.ag.ts_start))].filter(v => v != null)
      const exact = recs.find(x => x.ag.wf_exact)?.t || own.find(t => t.wfIds?.includes(wf))
      const before = exact || !starts.length ? [] : own.filter(t => ms(t.ts_req) <= Math.min(...starts)).sort((x, y) => ms(y.ts_req) - ms(x.ts_req))
      const home = exact || before.find(t => t.wfCall) || before[0]
      if (!home) continue
      for (const { ag, t } of recs) if (t !== home) {   // 흩어진 로거 레코드를 시작 요청으로(비용 합계도 이동)
        t.agents_detail = t.agents_detail.filter(x => x !== ag); (home.agents_detail = home.agents_detail || []).push(ag)
        const cost = ag.cost_usd || 0; t.cost_agents_usd = (t.cost_agents_usd || 0) - cost; home.cost_agents_usd = (home.cost_agents_usd || 0) + cost; moved++
      }
      for (const { id, c, fresh } of ags) {
        const running = !done.has(id) && fresh, ex = known.get(id), ts_end = done.has(id) ? new Date(c.t1).toISOString() : null
        if (ex) { Object.assign(ex, { live: running, ts_end: done.has(id) || running || hasJournal ? ts_end : ex.ts_end ?? null }); continue }
        ;(home.agents_detail = home.agents_detail || []).push({ agent_id: id, type: c.type, name: c.name, model: c.model, workflow: wf, ts_start: new Date(c.t0).toISOString(), ts_end, cost_usd: null, errors: c.errors, live: running })
        known.set(id, home.agents_detail.at(-1)); added++
      }
    }
  }
  if (cacheFile) try { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(next)) } catch { /* 캐시 저장 실패 = 다음 실행에서 다시 읽음 */ }
  return { added, moved }
}

/**
 * 지난 요청의 팀원 회차 : scanLive 가 못 본(최근 10분 밖) 에이전트 기록에서 agentRounds 로 회차를 읽어 ag.rounds 에 채운다(결함 ①② — 재전달 감지가 진행 중에만 되던 문제)
 *   대상 = meta.taskKind 'in_process_teammate'(SendMessage 로 이어 받을 수 있는 팀원)만. 캐시 = agent_id → 기록 크기·mtime 가 같으면 재사용(첫 실행만 전체 읽기)
 */
/** 서브에이전트 기록 → 하네스 변경 여부 : assistant tool_use(Write·Edit·MultiEdit·NotebookEdit) 대상 경로가 HARNESS_RE 면 true, 아니면 false. Bash 로 쓴 변경은 감지 못 함(기록에 대상 경로 필드가 없음) */
export const harnessTouched = recs => recs.some(j => j?.type === 'assistant' && Array.isArray(j.message?.content) && j.message.content.some(b => b?.type === 'tool_use' && WRITE_TOOLS.has(b.name) && HARNESS_RE.test(String(b.input?.file_path || b.input?.notebook_path || '').replace(/\\/g, '/'))))
/** 파일 변경 실행(폴백) = Write·Edit·MultiEdit·NotebookEdit tool_use 1건 이상 — 본 판단은 codex-gate attributeOf(셸 변경 포함, 아래 loadAgentHarness attribute) */
export const wroteFiles = recs => recs.some(j => j?.type === 'assistant' && Array.isArray(j.message?.content) && j.message.content.some(b => b?.type === 'tool_use' && WRITE_TOOLS.has(b.name)))
/**
 * 판정 대상 실행(NO_GATE 밖)마다 ag.harness = harnessTouched · ag.wrote = 판정 대상 파일 1건 이상. 기록 없음·읽기 실패 = 미설정. 캐시 = agent_id → 기록 크기·mtime 같으면 재사용(판단 규칙 판 v 다르면 다시 읽음)
 *   wrote 판단(2026-11-10 c4-build-loop-only-aef4b3-p3 D-002) = codex-gate attributeOf 주입(훅과 같은 귀속 — Bash·PowerShell 셸 변경 = 기준선 diff ∩ 시간창, 생성물 제외), 미주입 = wroteFiles 폴백
 *   주입 이유 : 생성기가 훅을 정적 import 하면 훅 selftest 의 생성기 동적 import 와 순환 — main 진입 때만 불러 넘긴다
 *   종료 시점 고정(c4-fail-5-aeb16d-p2 D-001) : attribute = 훅 attributionFor — 훅 기록(attrib/<agentId>.json) 우선, 없으면 지금 다시 판단(est = ag.wroteEst 추정 표식)
 *     추정값은 단조 — 한 번 true 면 이후 재계산에서 파일 시각이 바뀌어도 false 로 내리지 않는다
 *     기록 우선(c4-fail-5-aeb16d-p2 iter-2 D-001) : 캐시 키 = 기록 크기·mtime + 훅 기록 mtime(recordAt, 없음 0) — 기록이 생기거나 다시 쓰이면 캐시값(옛 추정 false·옛 기록값)을 버리고 기록을 읽는다
 */
export function loadAgentHarness(turns, sessDir, cacheFile, { attribute, recordAt, ver } = {}) {
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) } catch { /* 캐시 없음 = 전부 읽기 */ }
  const next = {}
  for (const t of turns) for (const ag of t.agents_detail || []) {
    if (!ag.agent_id || !t.session_id || ag.type === LEGACY_VERIFY || NO_GATE.has(ag.type)) continue
    const dir = ag.workflow ? path.join(sessDir, t.session_id, 'subagents', 'workflows', ag.workflow) : path.join(sessDir, t.session_id, 'subagents'), f = path.join(dir, `agent-${ag.agent_id}.jsonl`)
    let st; try { st = fs.statSync(f) } catch { continue }
    // ver = 훅 귀속 규칙 판(RULES_VER) — 바뀌면 옛 캐시(옛 기록값·단조 true)를 이어받지 않음(c4-d-002-a5870f-p2 D-001)
    const v = attribute ? (ver ? `2:${ver}` : 2) : 1, sig = `${st.size}:${Math.round(st.mtimeMs)}`, old = cache[ag.agent_id]
    const judge = recs => { if (!attribute) return { wrote: wroteFiles(recs) }; const r = attribute({ recs, tp: f, mainTp: path.join(sessDir, `${t.session_id}.jsonl`), agentId: ag.agent_id, closed: !!ag.ts_end }); return { wrote: r.files.length > 0, ...(r.est ? { est: true } : {}) } }
    const ra = (attribute && recordAt?.(ag.agent_id)) || 0, same = old?.v === v && typeof old.wrote === 'boolean', reuse = same && old.sig === sig && (old.ra || 0) === ra
    const c = reuse ? old : (recs => { const w = judge(recs); return { v, sig, ra, harness: harnessTouched(recs), wrote: w.wrote || (!!w.est && same && old.wrote === true), ...(w.est ? { est: true } : {}) } })(tailJsonl(f, Infinity))
    next[ag.agent_id] = c; ag.harness = c.harness; ag.wrote = c.wrote; if (c.est) ag.wroteEst = true
  }
  try { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(next)) } catch { /* 캐시 저장 실패 = 다음 실행에서 다시 읽음 */ }
}

/**
 * 하네스 사용 기록(2026-11-10 마스터 C-9) : 턴마다 t.toolEvents = [{ t, name, who }] — 메인 세션 기록의 tool_use·훅 attachment(턴 창 [ts_req, ts_res 또는 지금])
 *   + 그 턴에 귀속된 서브에이전트 기록(최상위·워크플로)의 tool_use·훅(에이전트 구간), who = 'main' 또는 에이전트 종류 짧은 이름(과거 verify 포함 — 도구 사용은 사실)
 *   입력값은 읽지 않는다(toolName = 이름만). 캐시 = 파일 → 기록 크기·mtime 같으면 이벤트 재사용([t, name] 압축)
 */
/** 메인 세션 기록 → 사용자 요청 원문 [{ t, text(2000자) }] : 사람 요청(isRequest) + 작업 중 큐에 넣은 추가 지시(attachment queued_command) */
export const promptsOf = recs => recs.flatMap(j => {
  const t = ms(j?.timestamp); if (t == null) return []
  const q = j.type === 'attachment' && j.attachment?.type === 'queued_command' && typeof j.attachment.prompt === 'string' ? j.attachment.prompt : null
  const x = q ?? (j.type === 'user' && !j.isMeta && !j.isSidechain ? textOf(j.message?.content) : null)
  return x && isRequest(x) ? [{ t, text: String(x).slice(0, 2000) }] : []
})
/** 메인 세션 기록 → 종료 승인 줄 [{ t, kind(승인|보류), why }] : 메인(사이드체인 아님) assistant 글의 '종료 승인 : …' 줄(approvalOf) */
export const approvalsOf = recs => recs.flatMap(j => {
  const t = ms(j?.timestamp); if (t == null || j.type !== 'assistant' || j.isSidechain || !Array.isArray(j.message?.content)) return []
  const x = approvalOf(j.message.content.filter(c => c?.type === 'text').map(c => c.text).join('\n')); return x ? [{ t, ...x }] : []
})
/** 서브에이전트 기록 → 최종 보고(마지막 assistant 글) 첫 3줄(줄당 80자) — SA-컨텍스트 요점 자동 추출용 */
export const reportOf = recs => { const m = recs.filter(j => j?.type === 'assistant' && Array.isArray(j.message?.content) && j.message.content.some(c => c?.type === 'text' && c.text.trim())).at(-1); return m ? m.message.content.filter(c => c?.type === 'text').map(c => c.text).join('\n').split('\n').map(x => x.replace(/[#*`>|]/g, '').trim()).filter(Boolean).slice(0, 3).map(x => x.slice(0, 80)) : [] }
/** 요약 캐시 id = '<세션 id>_<턴 번호>'(Obsidian·Windows 안전 파일명) — 요청 md 머리에도 적어 graph 에이전트가 같은 이름으로 쓴다 */
export const summaryId = t => safeName(`${t.session_id || 'nosession'}_${t.turn ?? 'live'}`).replace(/ /g, '_')
/** 요약 캐시 읽기 : { before, after, related, points } 문자열 배열(항목 120자·각 8개)만, by·at 글자 — 형식 밖이면 없음(자동 추출) */
export function loadSummary(dir, t, redact = x => x) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, summaryId(t) + '.json'), 'utf8')), arr = v => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).slice(0, 8).map(x => redact(x).slice(0, 120)) : []
    return { before: arr(j.before), after: arr(j.after), related: arr(j.related), points: arr(j.points), by: typeof j.by === 'string' ? j.by.slice(0, 40) : '', at: typeof j.at === 'string' ? j.at.slice(0, 30) : '' }
  } catch { return null }
}
export function loadToolEvents(turns, sessDir, cacheFile, now = Date.now()) {
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) } catch { /* 캐시 없음 = 전부 읽기 */ }
  const next = {}
  const evOf = f => {
    let st; try { st = fs.statSync(f) } catch { return [] }
    const sig = `${st.size}:${Math.round(st.mtimeMs)}`
    let c = cache[f]
    if (c?.sig !== sig || !Array.isArray(c.ap)) { const recs = tailJsonl(f, Infinity); c = { sig, ev: toolEventsOf(recs).map(e => [e.t, e.name]), pr: promptsOf(recs).map(p => [p.t, p.text]), rep: reportOf(recs), ap: approvalsOf(recs).map(x => [x.t, x.kind, x.why]) } }
    next[f] = c; return c
  }
  for (const t of turns) {
    if (!t.session_id) continue
    const a = ms(t.ts_req), b = t.ts_res ? ms(t.ts_res) : now, sub = path.join(sessDir, t.session_id, 'subagents')
    const mc = evOf(path.join(sessDir, t.session_id + '.jsonl')), pr = (mc.pr || []).filter(([x]) => x >= a && x <= b)
    if (pr.length) t.prompts = pr.map(([x, text]) => ({ t: x, text }))
    const nextA = Math.min(Infinity, ...turns.filter(u => u !== t && u.session_id === t.session_id && ms(u.ts_req) > a).map(u => ms(u.ts_req)))
    const ap = (mc.ap || []).filter(([x]) => x >= a && x <= b + RUN_GRACE_MS && x < nextA)   // 종료 승인 줄(메인 응답) — 응답 기록 시각이 ts_res 와 몇 초 어긋날 수 있어 유예, 단 같은 세션 다음 요청 시작 전까지(c4-codex-ac436f-p1 D-003)
    if (ap.length) t.approvals = ap.map(([x, kind, why]) => ({ t: x, kind, why }))
    const ev = (mc.ev || []).filter(([x]) => x >= a && x <= b).map(([x, name]) => ({ t: x, name, who: 'main' }))
    for (const ag of t.agents_detail || []) {
      if (!ag.agent_id) continue
      const f = path.join(ag.workflow ? path.join(sub, 'workflows', ag.workflow) : sub, `agent-${ag.agent_id}.jsonl`), a0 = ms(ag.ts_start) ?? -Infinity, b0 = ms(ag.ts_end) ?? now
      const ac = evOf(f); if (ac.rep?.length) ag.report = ac.rep
      ev.push(...(ac.ev || []).filter(([x]) => x >= a0 && x <= b0).map(([x, name]) => ({ t: x, name, who: shortType(ag.type || ag.name || '에이전트') })))
    }
    if (ev.length) t.toolEvents = ev.sort((x, y) => x.t - y.t)
  }
  if (cacheFile) try { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(next)) } catch { /* 캐시 저장 실패 = 다음 실행에서 다시 읽음 */ }
}

export function loadAgentRounds(turns, sessDir, cacheFile) {
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

// 화면 스크립트 : 함수 원문을 그대로 인라인(바깥 이름 참조 금지 — 필요한 값은 #graphdata JSON, 공용 함수는 fmtSpan·roundSummary·layoutTree 전역)
function client() {
  const D = JSON.parse(document.getElementById('graphdata').textContent)
  const $ = id => document.getElementById(id), NS = 'http://www.w3.org/2000/svg', Z = D.size, NOW = Date.now()
  const SL = Object.fromEntries(D.slots.map(s => [s.id, s]))
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const el = (tag, at, parent) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); if (parent) parent.appendChild(e); return e }
  const H = Object.fromEntries(new URLSearchParams(location.hash.slice(1)))   // 새로고침 뒤 복원 : k 요청 · v 보기 · o 트리 방향(v 세로 기본 · h 가로) · f 실행 경로 · p 쪽 · s 목록 스크롤 · z 확대 영역
  let flowOn = H.f !== '0', view = H.v === 'force' ? 'force' : 'tree', dir = H.o === 'h' ? 'h' : 'v', fitCx = null, cur = null, page = +H.p || 1, raf = 0, byId = {}, root = null, touched = false, drag = null, dragId = null, pan = null, moved = 0, hooks = {}
  const svg = $('svg'), vb = { x: 0, y: 0, w: 1, h: 1 }
  const PH = { full: '시작 MM-DD HH:mm:ss ~ 종료 HH:mm:ss (소요 Xm Ys)', short: 'HH:mm:ss~HH:mm:ss · XmYs' }   // 설계도판 자리표시
  const termTxt = (n, short) => D.design ? (short ? 'HH:mm:ss' : 'MM-DD HH:mm:ss') : n.t0 != null ? new Date(n.t0).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(short ? 11 : 5) : n.statusLabel.startsWith('중단') ? '중단' : n.pend ? '진행 중' : '—'
  const spanTxt = (n, short) => n.term ? (short ? '' : n.statusLabel + ' ') + termTxt(n, short) : D.design ? (short ? PH.short : PH.full) : fmtSpan(n, NOW, short)
  const spanHtml = n => esc(spanTxt(n)).replace('진행 중', '<span class="blink">진행 중</span>')
  const durTxt = v => { const s = Math.round(v / 1000); return Math.floor(s / 60) + 'm ' + (s % 60) + 's' }
  const ttl = n => (n.no ? n.no + '. ' : '') + n.label   // 노드 제목 = 일련번호 + 이름(계층 id 는 data-id 에만)
  const tip = n => ttl(n) + ' — ' + n.statusLabel + '\n' + spanTxt(n)
  const roundsMax = n => Math.max(0, ...(n.rounds || []).filter(g => g.cap).map(g => (g.base || 0) + roundSummary(g.rows, NOW).n))
  const engT = n => n.eng + '/5' + (n.engEst ? ' (추정 ' + n.engEst + ')' : '')
  const statusTxt = n => (n.slot && n.alerts ? '⚠ ' : '') + n.statusLabel + (n.badge ? ' · ' + n.badge : '') + (n.eng != null ? ' · 엔지니어링 ' + engT(n) : '') + (n.check ? ' · 검증 Y ' + n.check.y + ' / 누락 ' + n.check.miss + ' / 위반 ' + n.check.viol : '') + (n.cum ? ' · 묶음 ' + n.cum.n + '/' + n.cum.cap : '') + (n.alertN ? ' · 경보 ' + n.alertN : '') + (n.rounds && n.rounds.some(g => g.cap) && SL[n.slot]?.kind !== 'codex' ? ' · 루프 ' + roundsMax(n) + '/' + n.rounds.find(g => g.cap).cap : '')
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
    const st = new URLSearchParams({ k: cur || '', v: view, o: dir, f: flowOn ? 1 : 0, p: page, s: Math.round($('list').scrollTop) })
    if (touched) st.set('z', [vb.x, vb.y, vb.w, vb.h].map(v => +v.toFixed(1)).join(','))
    try { history.replaceState(null, '', '#' + st) } catch (e) { /* file:// 제한 브라우저 : 복원만 포기 */ }
  }
  function select(k) { cur = k; renderList(); const r = D.requests.find(x => x.key === k); if (!r) return; $('gtitle').textContent = r.head; draw(r); detail(r.nodes[0]); saveHash() }
  function roundsHtml(g) {
    const s = roundSummary(g.rows, NOW), b = g.base || 0, k = b + s.n
    return '<h4>' + esc(g.name) + ' <span class="muted">' + (b ? '묶음 누적 ' : '') + k + (g.cap ? '/' + g.cap : ' — 상한 제외(원장별)') + '</span>' + alertHtml(!g.cap ? [] : k >= D.alert.cap ? ['상한 도달'] : k >= D.alert.nearCap ? ['상한 근접'] : []) + '</h4><table class="rd"><tr><th>회차</th><th>시작 ~ 종료</th><th>상태</th></tr>'
      + g.rows.map(r => '<tr><td>' + esc(r.label) + '</td><td>' + spanHtml(r) + '</td><td>' + esc(r.state || '') + '</td></tr>').join('')
      + '<tr class="sum"><td colspan="3">합계 ' + s.n + '회' + (b ? '(앞 요청 ' + b + '회 이어받음)' : '') + ' · 총 소요 ' + durTxt(s.totalMs) + (g.cap ? ' · 상한 대비 ' + k + '/' + g.cap : '') + '</td></tr></table>'
  }
  function detail(n) {
    const s = SL[n.slot]
    if (!booting && wrapEl.classList.contains('dc')) dtog.classList.add('new')
    $('detail').innerHTML = '<h3>' + esc(ttl(n)) + '</h3><p><span class="badge st-' + esc(n.status) + '">' + esc(n.statusLabel) + '</span>'
      + (n.badge ? ' <span class="badge est">' + esc(n.badge) + '</span>' : '') + (n.approval ? ' <span class="badge' + (n.approval === '최종' ? ' final' : '') + '">' + esc(n.approval) + ' 승인</span>' : '') + (n.eng != null ? ' <span class="badge">엔지니어링 ' + engT(n) + ' 수행</span>' : '') + (n.check ? ' <span class="badge' + (n.check.miss || n.check.viol ? ' alert' : '') + '">검증 Y ' + n.check.y + ' / 누락 ' + n.check.miss + ' / 위반 ' + n.check.viol + '</span>' : '')
      + (n.cum ? ' <span class="badge">묶음 누적 ' + n.cum.n + '/' + n.cum.cap + (n.cum.size > 1 ? ' · 요청 ' + n.cum.size + '건' : '') + '</span>' + alertHtml(n.cum.level ? [n.cum.level] : []) : '') + alertHtml(n.alerts) + '</p>'
      + '<p class="tm">' + spanHtml(n) + '</p>'
      + (s && s.kind === 'codex' && byId[n.parent] ? '<p class="muted">↳ ' + esc(ttl(byId[n.parent])) + ' 의 검수 칸(자식 — 한 단계 아래)</p>' : '') + (Object.values(byId).filter(c => c.parent === n.id && SL[c.slot]?.kind === 'codex').map(c => '<p class="muted">└ 검수 ' + esc(ttl(c)) + ' : ' + esc(c.statusLabel) + '</p>').join(''))   // C-11 : CDX = SA 아래 들여쓴 자식
      + (n.lines.length ? '<ul>' + n.lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>' : '')
      + ((n.chips || []).length ? '<h4>칸 안 표시</h4><ul>' + n.chips.map((c, i) => '<li class="chip ' + esc(c.tone) + (c.sep && i ? ' sep' : '') + '">' + esc(c.txt) + '</li>').join('') + '</ul>' : '')
      + ((n.agents || []).length ? '<h4>실행 에이전트 ' + n.agents.length + '건</h4><ul>' + n.agents.map(a => '<li><b>' + esc((a.approval ? '[' + a.approval + '] ' : '') + a.label) + '</b> — ' + esc(a.statusLabel) + ' · ' + spanHtml(a) + (a.alerts ? alertHtml(a.alerts) : '') + '<br><span class="muted">' + esc(a.lines.join(' · ')) + '</span>' + (a.rounds || []).map(roundsHtml).join('') + '</li>').join('') + '</ul>' : '')
      + ((n.toolLog || []).length ? '<h4>하네스 사용 기록(시각순) ' + n.toolLog.length + '줄</h4><ol class="tl">' + n.toolLog.map(g => '<li>' + esc(g.txt) + '</li>').join('') + '</ol>' : '')
      + (n.rounds || []).map(roundsHtml).join('')
      + (n.term ? '<p class="muted">흐름 터미널 — 시작 = 요청 수신 시각, 종료 = 응답 시각(진행 중이면 아직 없음)</p>' : s ? '<dl><dt>역할</dt><dd>' + esc(s.role) + '</dd><dt>검수 기준</dt><dd>' + esc(s.criteria) + '</dd><dt>정본 문서</dt><dd>' + s.docs.map(d => '<a href="' + esc(d.href) + '">' + esc(d.name) + '</a>').join(' · ') + '</dd></dl>' : '<p class="muted">실행 기록에서 온 노드(설계 슬롯 아님)</p>')
  }

  // ── 보기 공통 : viewBox 화면 맞춤·확대·이동 ──
  const setVB = () => svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h)
  /** 그림 전체를 화면에 맞춤 — 배율은 [minScale, maxScale] 안, 최소 배율에 걸리면 위 기준 + 가로는 왼쪽(세로 트리는 루트 가운데 fitCx, 그림 밖으로는 안 나감) — 나머지는 끌어서 이동 */
  function fit(minScale) {
    if (!root) return
    const b = root.getBBox(), W = svg.clientWidth || 800, H2 = svg.clientHeight || 600, pad = 14, bw = b.width + pad * 2, bh = b.height + pad * 2
    const s = Math.max(minScale, Math.min(W / bw, H2 / bh, Z.maxScale)); vb.w = W / s; vb.h = H2 / s
    const cx = view === 'tree' && fitCx != null ? Math.min(Math.max(fitCx - vb.w / 2, b.x - pad), b.x - pad + bw - vb.w) : b.x - pad
    vb.x = bw <= vb.w ? b.x - pad - (vb.w - bw) / 2 : cx; vb.y = bh <= vb.h ? b.y - pad - (vb.h - bh) / 2 : b.y - pad; setVB()
  }
  const minScale = () => view === 'tree' ? Z.minScale : Z.forceMinScale
  function zoom(k, cx, cy) { if (cx == null) { cx = vb.x + vb.w / 2; cy = vb.y + vb.h / 2 } vb.x = cx - (cx - vb.x) * k; vb.y = cy - (cy - vb.y) * k; vb.w *= k; vb.h *= k; setVB(); touched = true }
  const pt = e => new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse())
  svg.addEventListener('pointerdown', e => {
    const g = e.target.closest('[data-id]'); moved = 0
    if (g) { if (hooks.grab) { drag = hooks.grab(g.dataset.id); dragId = g.dataset.id; svg.setPointerCapture(e.pointerId) } return }
    pan = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, s: vb.w / (svg.clientWidth || 1) }; svg.setPointerCapture(e.pointerId)
  })
  svg.addEventListener('pointermove', e => {
    if (!drag && !pan) return; moved++
    if (drag) { const q = pt(e); drag.x = q.x; drag.y = q.y; hooks.wake() }
    else if (moved > 2) { vb.x = pan.vx - (e.clientX - pan.x) * pan.s; vb.y = pan.vy - (e.clientY - pan.y) * pan.s; setVB(); touched = true }
  })
  svg.addEventListener('pointerup', e => { if (drag && moved < 4) detail(byId[dragId] || drag.n); drag = pan = null; if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId) })
  svg.addEventListener('click', e => { if (view !== 'tree') return; const g = e.target.closest('[data-id]'); if (g) detail(byId[g.dataset.id]) })
  svg.addEventListener('wheel', e => { const hl = e.target.closest('.hlist'); if (hl && hl.scrollHeight > hl.clientHeight) return; e.preventDefault(); const q = pt(e); zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1, q.x, q.y) }, { passive: false })
  document.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => { if (b.dataset.z === 'fit') { touched = false; fit(minScale()) } else zoom(b.dataset.z === 'in' ? 1 / 1.25 : 1.25) }))
  addEventListener('resize', () => { if (!touched) fit(minScale()) })

  // ── 계층 트리 : 칸 카드 = 이름(' : ' 로 2줄) + 상태 + 시간 + 칸 안 줄(실행·판정 chips) + 하네스 사용 목록(스크롤) — 에이전트 실행은 독립 카드 없음(2026-11-10). 좌표는 layoutTree(세로 기본 · 가로, CDX = 짝 SA 옆·아래)
  const nameLines = n => { const s = ttl(n), i = s.indexOf(' : '); return i > 0 ? [s.slice(0, i), s.slice(i + 3)] : [s] }
  const HL = 8   // 하네스 사용 목록 보이는 줄 수(넘으면 스크롤 — 생략 없이 전부 넣음)
  const listH = n => (n.toolLog || []).length ? Math.min(n.toolLog.length, HL) * Z.chipH + 6 : 0
  const sizeOf = n => ({ w: SL[n.slot]?.kind === 'codex' ? Z.boxW - Z.pairIndent : Z.boxW, h: Z.padY * 2 + Z.lineH * (nameLines(n).length + 1) + Z.tmH + (n.chips || []).length * Z.chipH + listH(n) })
  const isPair = n => SL[n.slot]?.kind === 'codex'
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
    const items = path.edges.concat(path.verdicts || []).map(e => {
      const g = el('g', { class: 'fl ' + e.state + (e.loop ? ' loop' : '') + (e.pass ? '' : ' plan') }, gPath)
      el('title', {}, g).textContent = '경로 ' + e.seq + ' : ' + [e.from, e.to].map(id => byId[id] ? ttl(byId[id]) : id).join(' → ') + (e.label ? ' · ' + e.label : '')
      const hit = el('path', { class: 'hit' }, g), v = el('path', { class: 'v', 'marker-end': 'url(#ah-' + e.state + ')' }, g)
      const lg = el('g', { class: 'seqg ' + e.state + (e.pass ? '' : ' plan') }, gLab === gPath ? g : gLab)
      el('circle', { r: 7.5, class: 'sq' }, lg); el('text', { class: 'sqt', 'text-anchor': 'middle', y: 3.5 }, lg).textContent = e.seq
      if (e.label) el('text', { class: 'lpl', x: 10, y: 4 }, lg).textContent = e.label
      return { e, hit, v, lg }
    })
    const selfN = {}; for (const it of items) if (it.e.from === it.e.to) it.j = (selfN[it.e.to] = (selfN[it.e.to] ?? -1) + 1)
    const update = () => items.forEach(({ e, hit, v, lg, j }) => {
      const A = shape(e.from), B = shape(e.to); if (!A || !B) return
      // SA → 짝 CDX = 짧은 직선(휨 0), 되돌이 = 크게 휨, 나머지 = 살짝 휨
      const flat = view === 'tree' && dir === 'v' && (e.from === 'S' || e.to === 'E')   // C-15 : 세로 트리의 시작 → 1 · 승인 → 종료 = 짧은 가로 직선
      const r = curve(A, B, e.loop ? 0.4 : flat || SL[e.to]?.kind === 'codex' && byId[e.to]?.parent === e.from ? 0 : 0.1, j || 0); hit.setAttribute('d', r.d); v.setAttribute('d', r.d); lg.setAttribute('transform', 'translate(' + r.mx + ' ' + r.my + ')')
    })
    update(); return update
  }
  /** 터미널(시작·종료) 노드 객체 — 상세·풍선용 */
  const termNode = (id, path) => { const T = path.term[id] || {}, pend = id === 'E' && !!(T.pending || T.stopped); return { id, term: true, pend, label: id === 'S' ? '시작' : '종료', slot: null, status: D.design ? 'unassigned' : pend ? 'notrun' : 'done', statusLabel: id === 'S' ? '요청 수신' : T.stopped ? '중단(응답 없음)' : pend ? '응답 대기' : '응답', lines: [], t0: T.t0 ?? null, t1: null, run: false } }

  function drawTree(nodes, L, path) {
    const gE = el('g', {}, root), gF = el('g', { class: 'flows' }, root), gN = el('g', {}, root), gL = el('g', {}, root), geo = {}, vert = dir === 'v'
    for (const n of nodes) if (n.parent) {   // 구조선 : 가로 = 부모 오른쪽 → 자식 왼쪽, 세로 = 부모 아래 → 자식 위, SA → 짝 CDX(자식) = 세로 흐름 들여쓰기 브래킷 · 가로 흐름 짧은 직선
      const a = L.pos[n.parent], b = L.pos[n.id]
      if (isPair(n)) { const bx = a.x + Z.pairIndent / 2, by = b.y + Math.min(b.h, 24) / 2; el('path', { d: vert ? 'M' + bx + ' ' + (a.y + a.h) + ' L' + bx + ' ' + by + ' L' + b.x + ' ' + by : 'M' + (a.x + a.w) + ' ' + (a.y + Math.min(a.h, b.h) / 2) + ' L' + b.x + ' ' + (a.y + Math.min(a.h, b.h) / 2), class: 'edge pair' }, gE); continue }   // 세로 = 들여쓰기 브래킷(짧은 수직 + 가로), 가로 = 짧은 직선
      if (vert && n.id === Z.foot) continue   // C-15 : 맨 아래 정중앙 승인 칸 = 구조선 생략(루트에서 내려오는 선이 트리를 가로지름, 연결은 흐름 화살표)
      if (vert) { const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y, my = (y1 + y2) / 2; el('path', { d: 'M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + my + ' ' + x2 + ' ' + my + ' ' + x2 + ' ' + y2, class: 'edge' }, gE) }
      else { const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2; el('path', { d: 'M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2, class: 'edge' }, gE) }
    }
    for (const n of nodes) {
      const p = L.pos[n.id], w = p.w, g = el('g', { class: 'node st-' + n.status + (SL[n.slot]?.kind === 'codex' ? ' k-codex' : ''), transform: 'translate(' + p.x + ' ' + p.y + ')', 'data-id': n.id }, gN)
      el('title', {}, g).textContent = tip(n); geo[n.id] = { cx: p.x + w / 2, cy: p.y + p.h / 2, hw: w / 2, hh: p.h / 2 }
      el('rect', { width: w, height: p.h, rx: 7, class: 'box' }, g); el('rect', { width: 5, height: p.h, rx: 2.5, class: 'strip' }, g)
      const ls = nameLines(n)
      ls.forEach((s, i) => fitText(el('text', { x: 12, y: Z.padY + Z.lineH * (i + 1) - 3, class: i ? 'l1' : 'l1 b' }, g), s, w - 18))
      fitText(el('text', { x: 12, y: Z.padY + Z.lineH * (ls.length + 1) - 3, class: 'l2' }, g), statusTxt(n), w - 18)
      timeText(el('text', { x: 12, y: Z.padY + Z.lineH * (ls.length + 1) + Z.tmH - 3, class: 'tm' }, g), n, w - 18)
      // 칸 안 줄(2026-11-10) : SA·접수·승인 = 에이전트 실행(type 별 ×n·회송·실패 표식), CDX = 판정 회차, 하네스 = 도구 합계 + 시각순 사용 목록(스크롤)
      const y0 = Z.padY + Z.lineH * (ls.length + 1) + Z.tmH
      ;(n.chips || []).forEach((c, i) => { if (c.sep && i) el('line', { x1: 10, x2: w - 8, y1: y0 + Z.chipH * i + 0.5, y2: y0 + Z.chipH * i + 0.5, class: 'chipsep' }, g); fitText(el('text', { x: 12, y: y0 + Z.chipH * (i + 1) - 3, class: 'chip ' + c.tone }, g), c.txt, w - 18) })   // 구획 구분 = 얇은 선(C-12)
      if ((n.toolLog || []).length) {
        const fo = el('foreignObject', { x: 8, y: y0 + Z.chipH * (n.chips || []).length + 2, width: w - 14, height: listH(n) - 4 }, g), d = document.createElement('div')
        d.className = 'hlist'; d.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml'); d.innerHTML = n.toolLog.map(x => '<div>' + esc(x.txt) + '</div>').join(''); fo.appendChild(d)
      }
    }
    const r0 = L.pos['1']; fitCx = vert ? r0.x + r0.w / 2 : null   // 세로 : 화면보다 넓으면 루트 가운데 기준으로 맞춤
    if (path) {   // 터미널(termPos) : 가로 = 시작 루트 왼쪽 · 종료 왼쪽 맨 아래(종전) / 세로 = 시작 1번 칸 왼쪽 · 종료 승인 칸(맨 아래 정중앙) 왼쪽(C-15)
      const tp = termPos(L.pos, dir, Z)
      for (const id of ['S', 'E']) {
        const q = tp[id], n = byId[id] = termNode(id, path), g = el('g', { class: 'node term st-' + n.status + (n.pend ? ' pend' : ''), transform: 'translate(' + q.x + ' ' + q.y + ')', 'data-id': id }, gN)
        el('title', {}, g).textContent = n.label + ' — ' + spanTxt(n); geo[id] = { cx: q.x + Z.termW / 2, cy: q.y + Z.termH / 2, hw: Z.termW / 2, hh: Z.termH / 2 }
        el('rect', { width: Z.termW, height: Z.termH, rx: Z.termH / 2, class: 'box' }, g)
        el('text', { x: Z.termW / 2, y: 13, class: 'l1 b', 'text-anchor': 'middle' }, g).textContent = n.label
        timeText(el('text', { x: Z.termW / 2, y: 26, class: 'tm', 'text-anchor': 'middle' }, g), n)
      }
      flowEdges(path, gF, gL, id => geo[id])
    }
    fit(Z.minScale)
  }

  // ── 자유 배치(그래프 보기) : 반발력(전 쌍) + 엣지 스프링 + 중심 인력, 수렴 중·후 화면 맞춤, 라벨 겹치면 숨김(호버 표시) ──
  // ponytail: 전 쌍 O(n²) — 요청 1건 노드 수십 개 기준, 수백 개를 한 화면에 그릴 때 격자 근사로 교체
  function drawForce(nodes, L, path) {
    const RAN = ['done', 'running', 'error', 'blocked']
    const P = nodes.map(n => { const p = L.pos[n.id]; return { n, d: p.d, x: p.d * 140, y: (p.y + p.h / 2) * 0.8, vx: 0, vy: 0, r: Math.max(6, 15 - 2 * p.d) + (RAN.includes(n.status) ? 2 : 0) } })
    const at = Object.fromEntries(P.map(p => [p.n.id, p])), E = nodes.filter(n => n.parent && !isPair(n)).map(n => [at[n.parent], at[n.id]]), nStruct = E.length
    for (const p of P) if (isPair(p.n) && at[p.n.parent]) p.mate = at[p.n.parent]   // C-11 : 자유 배치에서도 CDX 는 짝 SA 에 붙음(물리 계산 밖, 위치 = matePos)
    const glue = () => { for (const p of P) if (p.mate) { const q = matePos(p.mate, p.r, Z.pairGap); p.x = q.x; p.y = q.y; p.vx = p.vy = 0 } }
    const pairLines = P.filter(p => p.mate).map(p => [p.mate, p])
    if (path) {   // 터미널도 노드로 띄우고, 시작 — 1 · 종료 — 직전 노드는 스프링으로만 잇는다(구조선은 그리지 않음)
      const r0 = at['1'], last = path.edges.filter(e => e.to === 'E').map(e => at[e.from]).find(Boolean) || r0
      for (const id of ['S', 'E']) { const n = byId[id] = termNode(id, path), p = { n, d: -1, x: r0.x - 140, y: id === 'S' ? r0.y : last.y + 60, vx: 0, vy: 0, r: 10 }; P.push(p); at[id] = p }
      E.push([at.S, r0], [last, at.E])
    }
    const gE = el('g', {}, root), gN = el('g', {}, root), gF = el('g', { class: 'flows fv' }, root), lines = [...E.slice(0, nStruct), ...pairLines].map((_, i) => el('line', { class: i < nStruct ? 'edge' : 'edge pair' }, gE))
    for (const p of P) {
      p.g = el('g', { class: 'fnode st-' + p.n.status + (SL[p.n.slot]?.kind === 'codex' ? ' k-codex' : ''), 'data-id': p.n.id }, gN); el('title', {}, p.g).textContent = tip(p.n)
      el('circle', { r: p.r }, p.g); p.t = el('text', { class: 'l1', y: 4 }, p.g); const nm = ttl(p.n); p.t.textContent = nm.length > 22 ? nm.slice(0, 21) + '…' : nm
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
        if (P[i].mate || P[j].mate) continue   // 위성(CDX)은 반발력 계산 밖 — 짝 SA 를 따라감
        const a = P[i], b = P[j], dx = b.x - a.x, dy = b.y - a.y, d2 = Math.max(dx * dx + dy * dy, 40), d = Math.sqrt(d2), f = Z.repel / d2 * alpha
        a.vx -= dx / d * f; a.vy -= dy / d * f; b.vx += dx / d * f; b.vy += dy / d * f
      }
      for (const [a, b] of E) { const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - Z.link) * 0.05 * alpha; a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f }
      let cx = 0; for (const p of P) cx += p.x / P.length
      for (const p of P) { if (p === drag || p.mate) { p.vx = p.vy = 0; continue } p.vx = (p.vx - p.x * Z.gravity * alpha) * 0.6; p.vy = (p.vy - p.y * Z.gravity * alpha) * 0.6; p.x += p.vx; p.y += p.vy }
      glue()
      lines.forEach((ln, i) => { const [a, b] = i < nStruct ? E[i] : pairLines[i - nStruct]; ln.setAttribute('x1', a.x); ln.setAttribute('y1', a.y); ln.setAttribute('x2', b.x); ln.setAttribute('y2', b.y) })
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
    hooks = { grab: id => { touched = true; wake(); return at[id]?.mate || at[id] }, wake }   // CDX 를 끌면 짝 SA 가 같이 움직임
    tick()
  }
  function draw(r) {
    const nodes = r.nodes, path = flowOn ? r.path : null
    cancelAnimationFrame(raf); svg.textContent = ''; touched = false; hooks = {}; drag = pan = null
    svg.classList.toggle('flowon', !!path); if (path) markers()
    byId = Object.fromEntries(nodes.map(n => [n.id, n])); root = el('g', {}, svg)
    // 자유 배치 초기 위치는 가로 트리 좌표(깊이 → x)를 쓴다
    const L = layoutTree(nodes, view === 'tree' ? dir : 'h', Z, sizeOf, isPair)
    if (view === 'tree') drawTree(nodes, L, path); else drawForce(nodes, L, path)
  }
  const dirBtn = $('dir'), setDir = o => { dir = o; dirBtn.textContent = o === 'v' ? '방향 : 세로' : '방향 : 가로'; dirBtn.disabled = view !== 'tree' }
  const setView = v => { view = v; document.querySelectorAll('[data-view]').forEach(x => x.setAttribute('aria-pressed', x.dataset.view === v)); setDir(dir) }
  dirBtn.onclick = () => { setDir(dir === 'v' ? 'h' : 'v'); const r = D.requests.find(x => x.key === cur); if (r) draw(r); saveHash() }
  $('list').addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) select(b.dataset.k) })
  for (const id of ['q', 'fc', 'fd']) $(id).addEventListener('input', () => { page = 1; renderList() })
  $('lprev').onclick = () => { page--; renderList(); saveHash() }; $('lnext').onclick = () => { page++; renderList(); saveHash() }
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
    setView(b.dataset.view); const r = D.requests.find(x => x.key === cur); if (r) draw(r); saveHash()
  }))
  const flowBtn = $('flow'); flowBtn.setAttribute('aria-pressed', flowOn)
  flowBtn.onclick = () => { flowOn = !flowOn; flowBtn.setAttribute('aria-pressed', flowOn); const r = D.requests.find(x => x.key === cur); if (r) draw(r); saveHash() }
  $('theme').onclick = () => { const h = document.documentElement, dark = (h.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark'; h.dataset.theme = dark ? 'light' : 'dark' }
  // 노드 상세 패널 접기 : 상태는 localStorage(자동 새로고침에도 유지), 접힌 채 노드 클릭 = 자동 펼침 없이 토글에 '새 상세' 점
  const wrapEl = document.querySelector('.wrap'), dtog = $('dtog'); let booting = true
  const setFold = (c, save) => {
    const t = c ? '노드 상세 펼치기' : '노드 상세 접기'
    wrapEl.classList.toggle('dc', c); dtog.setAttribute('aria-expanded', !c); dtog.setAttribute('aria-label', t); dtog.title = t; dtog.textContent = c ? '◀' : '▶'
    if (!c) dtog.classList.remove('new')
    if (save) try { localStorage.setItem('rg.detailFold', c ? '1' : '0') } catch (e) { /* 저장 불가 브라우저 : 이번 화면만 */ }
  }
  let fold0 = false; try { fold0 = localStorage.getItem('rg.detailFold') === '1' } catch (e) { /* 읽기 불가 = 펼침 */ }
  setFold(fold0); dtog.onclick = () => setFold(!wrapEl.classList.contains('dc'), true)
  setView(view)
  if (D.requests.length) {
    select((D.requests.find(r => r.key === H.k) || D.requests[0]).key)
    if (H.z) { const z = H.z.split(',').map(Number); if (z.length === 4 && z.every(Number.isFinite)) { vb.x = z[0]; vb.y = z[1]; vb.w = z[2]; vb.h = z[3]; setVB(); touched = true } }
    if (H.s) $('list').scrollTop = +H.s
  } else { renderList(); $('detail').innerHTML = '<p class="muted">범위 안 요청 기록 없음 — 다음 요청부터 자동 기록</p>' }
  booting = false
  // 실데이터판 자동 새로고침 : 진행 중 요청이 있으면 짧게 — 선택·보기·쪽·스크롤·확대는 location.hash 로 보존
  if (D.live) setTimeout(() => { saveHash(); location.reload() }, D.requests.some(r => r.running) ? Z.reloadRun : Z.reloadIdle)
}

/** 상태 색 CSS : 클래스 st-<상태> 에 변수(--sc 테두리·--sf 채움·--st 글자·--si 본문 글자), 다크 덮어쓰기는 테마 선택자 안에 */
function statusCss() {
  const vars = s => `--sc:${s.color};--st:${s.text};${s.fill ? `--sf:${s.fill};` : ''}${s.ink ? `--si:${s.ink};` : ''}`
  const base = Object.entries(STATUS_STYLE).map(([k, s]) => `.st-${k}{${vars(s)}}`).join('')
  const dark = sel => Object.entries(STATUS_STYLE).filter(([, s]) => s.dark).map(([k, s]) => `${sel} .st-${k}{${vars({ ...s, ...s.dark })}}`).join('')
  // Codex 칸 변수(--cf 바탕·--ci 글자·--cs 왼쪽 띠) : 라이트·다크 공통, 완료·완료(추정)는 미완료보다 우선
  const { pending: p, done: d } = CODEX_STYLE
  const codex = `.k-codex{--cf:${p.fill};--ci:${p.ink};--cs:${p.strip}}.k-codex.st-done,.k-codex.st-estimated{--cf:${d.fill};--ci:${d.ink};--cs:${d.strip}}`
  return base + dark(':root[data-theme=dark]') + `@media (prefers-color-scheme: dark){${dark(':root:not([data-theme=light])')}}` + codex
}

export function renderHtml({ design, outDir, requests, meta }) {
  const data = { design: !!design, live: !design, size: SIZE, flow: FLOW_COLOR, alert: ALERT, slots: SLOTS.map(s => ({ id: s.id, kind: s.kind, role: s.role, criteria: s.criteria, docs: s.docs.map(d => docLink(outDir, d)) })), requests }
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
.wrap{display:grid;grid-template-columns:260px minmax(0,1fr) 280px;gap:12px;padding:0 20px 20px}.wrap.dc{grid-template-columns:260px minmax(0,1fr) 40px}@media (max-width:1100px){.wrap,.wrap.dc{grid-template-columns:1fr}}
#dpane{position:relative}.dc #dpane{padding:6px 4px}.dc #detail{display:none}#dtog{float:right;margin:0 0 4px 6px;width:28px;height:28px;padding:0;position:relative}.dc #dtog{float:none;display:block;margin:0 auto}#dtog.new::after{content:"";position:absolute;top:-3px;right:-3px;width:9px;height:9px;border-radius:50%;background:${STATUS_STYLE.error.text};border:2px solid var(--surface)}
.card{background:var(--surface);border:1px solid var(--ring);border-radius:10px;padding:10px 12px;min-width:0}
.ctl{display:grid;gap:6px;margin:0 0 8px}#list{list-style:none;margin:0;padding:0;max-height:70vh;overflow:auto}#list button{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--grid);border-radius:0;background:none;padding:6px 4px}#list button[aria-current]{background:color-mix(in srgb,var(--w) 14%,transparent)}
.rt,.rm{display:block;color:var(--muted);font-size:11.5px}.rh{display:block;word-break:break-all}.lpg{display:flex;gap:6px;align-items:center;margin-top:8px}
.gwrap{height:calc(100vh - 225px);min-height:420px;border:1px solid var(--grid);border-radius:8px;overflow:hidden}#svg{display:block;width:100%;height:100%;touch-action:none;cursor:grab}.gtitle{margin:0 0 6px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ghd{display:flex;gap:8px;align-items:flex-start}.ghd .legend{flex:1}.zc button{min-width:34px;padding:2px 8px}
.edge{fill:none;stroke:var(--axis);stroke-width:1.4}.flowon .edge{stroke-opacity:.35}.node,.fnode{cursor:pointer}
.fl .v{fill:none;stroke-width:2.2}.fl .hit{fill:none;stroke:transparent;stroke-width:12}.flows:not(.fv) .fl{pointer-events:none}.fv .fl .hit{pointer-events:stroke}
${Object.entries(FLOW_COLOR).map(([k, c]) => `.fl.${k} .v{stroke:${c}}.seqg.${k} .sq{fill:${c}}`).join('')}.fl.loop .v{stroke-width:2.6}.fl.no .v,.fl.noold .v{stroke-dasharray:5 4}.fl.noold,.seqg.noold{opacity:.35}
.fl.running .v{stroke-width:3.2;animation:pulse 1.2s ease-in-out infinite}.fl.plan .v{stroke-dasharray:6 5}.seqg.plan{opacity:.45}
.seqg.running .sq{fill:${RUN.fill};stroke:${RUN.color}}.sq{stroke:var(--surface);stroke-width:1.5}.sqt{font-size:9.5px;font-weight:700;fill:#fff}.seqg.running .sqt{fill:${RUN.ink}}.lpl{font-size:10.5px;font-weight:700;fill:var(--ink);paint-order:stroke;stroke:var(--surface);stroke-width:3px}
.fv .seqg{opacity:0}.fv .fl:hover .seqg{opacity:1}.term.pend .box,.fnode.term.pend circle{stroke-dasharray:4 3}
.box{fill:var(--sf,var(--surface));stroke:var(--sc);stroke-width:1.6}.strip{fill:var(--sc)}.st-missing .box{stroke-dasharray:5 3;stroke-width:2}
.l1{font-size:12.5px;fill:var(--si,var(--ink))}.l1.b{font-weight:700}.l2{font-size:11.5px;fill:var(--si,var(--st))}.tm{font-size:10px;fill:var(--si,var(--ink2))}
.fnode circle{fill:var(--sf,var(--sc));stroke:var(--sc);stroke-width:2}.fnode.st-missing circle{fill:var(--surface);stroke-dasharray:3 2}.chip{font-size:10px;fill:var(--si,var(--ink2))}.chip.head,.chip.run{font-weight:700}.chip.bad{fill:${STATUS_STYLE.error.text};font-weight:700}.chip.warn{fill:${STATUS_STYLE.missing.text};font-weight:700}.k-codex .chip{fill:var(--ci)}.st-running .chip{fill:var(--si)}:root[data-theme=dark] .node:not(.k-codex):not(.st-running) .chip.bad{fill:${STATUS_STYLE.error.dark.text}}:root[data-theme=dark] .node:not(.k-codex):not(.st-running) .chip.warn{fill:${STATUS_STYLE.missing.dark.text}}.edge.pair{stroke-width:2;stroke-opacity:.8}.chipsep{stroke:var(--grid);stroke-width:1}#detail li.sep{border-top:1px solid var(--grid);margin-top:3px;padding-top:3px;list-style:none}
.hlist{height:100%;overflow:auto;font:10px/13px ui-monospace,Consolas,monospace;color:var(--ink2);background:var(--surface);border:1px solid var(--grid);border-radius:4px;padding:0 3px}.hlist div{white-space:nowrap}#detail li.chip.bad{color:${STATUS_STYLE.error.text}}#detail li.chip.warn{color:${STATUS_STYLE.missing.text}}#detail ol.tl{font:11px/1.45 ui-monospace,Consolas,monospace;padding-left:28px;max-height:40vh;overflow:auto}
.k-codex .box,.fnode.k-codex circle{fill:var(--cf)}.k-codex .strip{fill:var(--cs)}.k-codex .l1,.k-codex .l2,.k-codex .tm{fill:var(--ci)}.legend i.k-codex{background:var(--cf);border:1.5px solid var(--cs)}.legend i.k-codex.st-notrun{border-style:dashed}
.k-codex.st-notrun .l2{fill:var(--st);font-size:10.5px}.k-codex.st-error .box{stroke-width:2.6}.k-codex.st-notrun .box,.k-codex.st-missing .box{stroke:var(--cs);stroke-dasharray:5 3;stroke-width:2}.fnode.k-codex.st-notrun circle,.fnode.k-codex.st-missing circle{stroke:var(--cs);stroke-dasharray:3 2}
.fnode .l1{font-size:12px;fill:var(--ink2);paint-order:stroke;stroke:var(--page);stroke-width:3px;stroke-linejoin:round}.fnode .l1.hid{opacity:0}.fnode:hover .l1{opacity:1;fill:var(--ink)}
.legend{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:var(--ink2);margin:0 0 8px}.legend i{display:inline-block;width:11px;height:11px;border-radius:6px;margin-right:4px;vertical-align:-1px;background:var(--sf,var(--sc));border:1.5px solid var(--sc)}.legend i.st-missing{border-style:dashed;background:transparent}
.badge{display:inline-block;border:1px solid var(--axis);border-radius:5px;padding:0 6px;font-size:12px}.badge[class*=st-]{color:var(--st);border-color:var(--sc);background:var(--sf,transparent)}.badge.st-missing{border-style:dashed}.badge.alert{color:${STATUS_STYLE.error.text};border:2px solid ${STATUS_STYLE.error.color};font-weight:700}:root[data-theme=dark] .badge.alert{color:${STATUS_STYLE.error.dark.text}}@media (prefers-color-scheme: dark){:root:not([data-theme=light]) .badge.alert{color:${STATUS_STYLE.error.dark.text}}}.est{border-style:dashed;color:var(--o);border-color:var(--o)}.badge.final{border:2px solid var(--w);color:var(--w);font-weight:700}
@keyframes pulse{0%,100%{filter:drop-shadow(0 0 1px ${RUN.fill})}50%{filter:drop-shadow(0 0 8px ${RUN.fill}) drop-shadow(0 0 3px ${RUN.color})}}@keyframes blink{50%{opacity:.2}}@keyframes blinkf{50%{fill-opacity:.15}}
.st-running .box,.fnode.st-running circle,.legend i.st-running,.badge.st-running{animation:pulse 1.2s ease-in-out infinite}.blink{animation:blink 1.2s ease-in-out infinite}tspan.blink{animation-name:blinkf}
@media (prefers-reduced-motion: reduce){.fl.running .v{animation:none;stroke-width:4.5}.st-running .box,.fnode.st-running circle,.legend i.st-running,.badge.st-running,.blink{animation:none}.st-running .box,.fnode.st-running circle{stroke-width:3.5}.legend i.st-running,.badge.st-running{border-width:3px}}
#detail h3{font-size:15px;margin:0 0 6px;word-break:break-all}#detail h4{font-size:13px;margin:12px 0 4px}#detail ul{padding-left:18px;margin:6px 0}#detail dt{color:var(--muted);font-size:12px;margin-top:8px}#detail dd{margin:0}#detail a{color:var(--w)}.tm{font-size:12px;color:var(--ink2)}
.rd{border-collapse:collapse;width:100%;font-size:11.5px}.rd th,.rd td{border-bottom:1px solid var(--grid);padding:2px 4px;text-align:left;vertical-align:top}.rd th{color:var(--muted);font-weight:400}.rd .sum td{font-weight:700;border-bottom:0}.muted{color:var(--muted)}
</style></head><body>
<header><h1>요청 처리 흐름 그래프${design ? ' <small class="muted">설계도</small>' : ''}</h1><span class="sp"></span>
<button type="button" data-view="tree" aria-pressed="true">계층 트리</button><button type="button" data-view="force" aria-pressed="false">자유 배치(그래프 보기)</button><button type="button" id="dir" title="계층 트리 방향 전환 — 세로(위→아래, 기본) / 가로(왼쪽→오른쪽)">방향 : 세로</button><button type="button" id="flow" aria-pressed="true" title="시작 → 실행 순서 → 종료 화살표 켜기/끄기">실행 경로</button><button type="button" id="theme" title="라이트/다크 전환">라이트/다크</button></header>
<p class="meta">${esc(meta)} · ${link}</p>
<div class="wrap">
<aside class="card"><div class="ctl"${design ? ' hidden' : ''}><input id="q" type="search" placeholder="요청문 검색"><select id="fc"><option value="">카테고리 전체</option>${cats.map(c => `<option value="${esc(c)}">${esc(catLabel[c] || c)}</option>`).join('')}</select><select id="fd"><option value="">날짜 전체</option>${dates.map(d => `<option>${esc(d)}</option>`).join('')}</select></div>
<ul id="list"></ul><div class="lpg"${design ? ' hidden' : ''}><button type="button" id="lprev">‹ 이전</button><button type="button" id="lnext">다음 ›</button><span id="lcnt" class="muted"></span></div></aside>
<section class="card"><div class="ghd"><div class="legend">${Object.entries(STATUS_STYLE).map(([k, s]) => `<span><i class="st-${k}"></i>${esc(s.label)}</span>`).join('')}<span><i class="k-codex st-notrun"></i>Codex 미수행(점선)</span><span><i class="k-codex"></i>Codex 미완료(실선)</span><span><i class="k-codex st-done"></i>Codex 완료</span><span><span class="badge est">${EST_BADGE}</span></span></div><span class="zc" role="group" aria-label="확대/축소"><button type="button" data-z="fit" title="그림 전체를 화면에 맞춤">맞춤</button> <button type="button" data-z="in" title="확대">+</button> <button type="button" data-z="out" title="축소">−</button></span></div>
<p id="gtitle" class="gtitle"></p><div class="gwrap"><svg id="svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="요청 처리 흐름 그래프"></svg></div></section>
<aside class="card" id="dpane"><button type="button" id="dtog" aria-controls="detail" aria-expanded="true" aria-label="노드 상세 접기" title="노드 상세 접기">▶</button><div id="detail"></div></aside>
</div>
<script type="application/json" id="graphdata">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script>const fmtSpan = ${fmtSpan}, roundSummary = ${roundSummary}, layoutTree = ${layoutTree}, termPos = ${termPos}, matePos = ${matePos};(${client})()</script></body></html>`
}

export function writeSlotMd(dir) {
  fs.mkdirSync(dir, { recursive: true })
  const no = Object.fromEntries(designGraph().map(n => [n.id, n.no])), lk = s => `[[${slotFile(s)}|${no[s.id]}. ${s.label}]]`   // 파일명(id)은 그대로, 보이는 글자 = 일련번호(CDX = 짝 SA 번호 + '-1')
  const mapTxt = (s) => {
    const m = SLOT_MAP[s.id]
    if (!m) return s.kind === 'approve' ? "메인 응답의 '종료 승인 :' 줄(세션 기록, 기록용 — Stop 훅은 막지 않음) — 과거 Stop 훅 상한 기록 = 승인 강제 실패(이력), teamanakin-admin 실행은 칸 안 줄" : s.kind === 'request' || s.kind === 'main' ? '턴(요청) 기록' : '미배정(설계) — SLOT_MAP 항목 없음'
    const SHOW = { prompt: '늘 표시 — 요청문 1 · 메인 브리프 디스패치 건수', context: '늘 표시 — 주입 훅·파일 읽기(Read) 건수 + collect 실행', harness: '도구 tool_use·훅 주입 1건 이상일 때 표시 — 종류별 합계 + 시각순 사용 목록, 하네스 파일 변경 표식', loop: 'c4 판정 1회 이상 OR 파일 변경 실행 OR 되돌림 OR 반복일 때 표시(2026-11-10 개정 · C-13) — 판정 대상 없으면 CDX-루프 숨김. 칸 = 되돌림 줄(CDX-루프 N k회(<회차>회차 결함 n) → 재작업 대기 | 재판정 진행 | <회차>회차 Y | 보류) + 반복 목록, CDX-루프 = 원장별 마지막 판정 AND(진행 중 요청 = 대기, 끝난 요청에 파일 변경이 있는데 판정 없음 = ⚠ 검증 누락)', graph: "늘 표시 — graph 실행 없으면 '생성기 자동 갱신(Stop 훅)'" }
    const xs = [...(m.show ? [SHOW[m.show]] : []), ...(m.agents || []).map(x => `에이전트 ${x}`), ...(m.hooks || []).map(x => `훅 ${x}`), ...(m.loops ? [m.loops === true ? `Codex 루프(${EST_BADGE})` : `Codex 루프 ${m.loops.join(', ')}`] : []),
      ...(m.codex ? [`Codex 루프 원장 id 접두 \`c${m.codex}-\`(매핑 연결)${m.legacy ? ` + 접두 없는 과거 원장(${EST_BADGE})` : ''}`] : [])]
    return xs.length ? xs.join(' · ') + (PAIRS.includes(s.id) && ['harness', 'loop'].includes(m.show) ? ' — 증거 없으면 SA·CDX 쌍 숨김' : '') : '대응 없음 [확인중 : 마스터] — 늘 미수행'
  }
  for (const s of SLOTS) {
    const kids = SLOTS.filter(x => x.parent === s.id), parent = SLOTS.find(x => x.id === s.parent)
    const body = [`# ${no[s.id]}. ${s.label}`, '', `> 요청 처리 흐름 설계 슬롯 — 생성기 \`scripts/request-graph.mjs --design-only --md\`(손으로 고치지 말 것) · 그래프 규칙 [[anakins_graph]] · 목차 [[00. index]]`, '',
      '| 항목 | 내용 |', '|---|---|', `| 역할 | ${s.role} |`, `| 검수 기준 | ${s.criteria} |`, `| 정본 | ${s.docs.map(d => `[[${path.basename(d, '.md')}]]`).join(' · ')} |`,
      `| 실행 대응(SLOT_MAP) | ${mapTxt(s)} |`, '',
      `**상위** ${parent ? lk(parent) : '없음(시작 노드)'}`, '', `**하위** ${kids.length ? kids.map(lk).join(' · ') : '없음'}`, '']
    fs.writeFileSync(path.join(dir, slotFile(s) + '.md'), body.join('\n'))
  }
  return SLOTS.length
}

const ROLE_NODE = new Set(['collect', 'decide', 'build', 'verify', 'review', 'commit', 'graph'])   // 60. nodes/ 카드가 있는 단계
const roleLink = type => { const m = /^anakin_phase-(\w+)$/.exec(type || ''); return m && ROLE_NODE.has(m[1]) ? ` [[${m[1]}]]` : type === ADMIN_TYPE ? ` [[${ADMIN_TYPE}]]` : '' }

export function writeRequestMd(dir, items, now) {
  fs.mkdirSync(dir, { recursive: true })
  const keep = new Set()
  for (const r of items) {
    const f = safeName(`${r.when.replace(':', '')} ${r.sid} ${r.head.slice(0, 40)}`) + '.md'; keep.add(f)
    const agents = agentsOf(r.nodes), by = id => r.nodes.find(n => n.id === id) || agents.find(n => n.id === id), ttl = n => (n.no ? n.no + '. ' : '') + n.label
    const lk = s => by(s.id) ? `[[${slotFile(s)}|${ttl(by(s.id))}]]` : `[[${slotFile(s)}|${s.label}]] (숨김)`   // 하네스·루프 쌍은 증거 없으면 숨김(C-8)
    const rounds = [...r.nodes, ...agentsOf(r.nodes)].filter(n => n.rounds).flatMap(n => n.rounds.map(g => ({ n, g }))), log = pathLog(r.nodes), tl = r.nodes.find(n => n.toolLog)?.toolLog || []
    const body = [`# ${r.head}`, '', `> 요청 노드(실데이터 — gitignore) · 생성기 \`scripts/request-graph.mjs --md\` · ${r.when} · ${r.catLabel || '-'} · 상태 ${r.statusLabel} · 엔지니어링 ${engTxt(by('1').eng, by('1').engEst)} 수행${by('1').check ? ` · 검증 Y ${by('1').check.y} / 누락 ${by('1').check.miss} / 위반 ${by('1').check.viol}` : ''} · 묶음 누적 ${by('1').cum.n}/${by('1').cum.cap}${r.alert ? ` · ⚠ ${r.alert}` : ''}`, '',
      ...by('1').lines.slice(1).map(l => `- ${l}`), `- 요약 캐시 id \`${r.sumId || '-'}\` (\`${PATHS.summaries}/<id>.json\` — anakin_phase-graph 작성)`, '',
      '## 요청 원문', '', ...(by('1.1.1')?.lines || []).filter(l => l.startsWith('요청 원문')).map(l => `- ${l}`), '',
      `${fmtSpan(by('1'), now)}`, '',
      `흐름 : ${lk(SLOTS[0])} → ${lk(SLOTS[1])} → ${lk(SLOTS.at(-1))}`, '',
      '## 엔지니어링 5단계', '', ...ENG_SLOTS.map(id => { const n = by(id), s = SLOTS.find(x => x.id === id); const cs = SLOTS.find(x => x.parent === id && x.kind === 'codex'), c = cs && by(cs.id), line = (k, x, pre) => `${pre}- ${lk(k)} — ${x.statusLabel}${(x.chips || []).length ? ` · ${x.chips.map(q => q.txt).join(' · ')}` : ''} · ${fmtSpan(x, now)}`
        return n ? [line(s, n, ''), ...(c ? [line(cs, c, '  ')] : [])].join('\n') : `- ${lk(s)} — 증거 없음(쌍 숨김)` }), '',   // CDX = SA 아래 들여쓴 자식(C-11)
      '## 실행 에이전트(시간순)', '', ...(agents.length ? agents.map(n => `- ${n.approval ? `[${n.approval}] ` : ''}${n.label}${roleLink(n.label)} — ${ttl(by(n.parent))} 칸 · ${n.statusLabel}${n.alerts ? ` · ⚠ ${n.alerts.join(' · ')}` : ''} · ${fmtSpan(n, now)} · ${n.lines.join(' · ')}`) : ['- 없음(메인 단독 턴)']), '',
      `## 승인(${ttl(by('1.2'))}) : ${by('1.2').statusLabel}`, '',
      // 실행 경로 = 화면 게이트 경로와 같은 순서·같은 정지 지점(buildPath), 시각순 이벤트는 아래 '실행 기록(시각순)'
      '## 실행 경로', '', ((r.path?.edges || []).map(e => `(${e.seq}) ${e.to === 'E' ? '종료' : by(e.to) ? ttl(by(e.to)) : e.to}${e.label ? ` [${e.label}]` : ''}${e.state === 'running' ? ' (진행 중)' : e.state === 'planned' ? ' (예정)' : ''}`).join(' → ') || '-'), '',
      ...(r.nodes.filter(notY).length ? [`- ⚠ Y 아닌 CDX 칸 ${r.nodes.filter(notY).length} : ${r.nodes.filter(notY).map(n => `${ttl(n)}(${n.statusLabel})`).join(' · ')}`, ''] : []),
      '## 하네스 사용 기록(시각순)', '', ...(tl.length ? tl.map(g => `- ${g.txt}`) : ['- 기록 없음(세션 기록 미확인)']), '',
      '## 실행 기록(시각순)', '', ...(log.length ? log.map(e => `- ${new Date(e.t).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(11)} ${by(e.id) ? ttl(by(e.id)) : e.id}${e.lab ? ` [${e.lab}]` : ''}${e.run ? ' (진행 중)' : ''}`) : ['- 없음']), '',
      ...rounds.flatMap(({ n, g }) => { const s = roundSummary(g.rows, now); return [`## 회차 — ${ttl(n)} · ${g.name} (${g.base ? `묶음 누적 ${g.base + s.n}` : s.n}${g.cap ? '/' + g.cap : ' — 상한 제외(원장별)'})`, '', ...g.rows.map(x => `- ${x.label} : ${fmtSpan(x, now)} · ${x.state || ''}`), `- 합계 ${s.n}회 · 총 소요 ${Math.floor(s.totalMs / 60e3)}m ${Math.round(s.totalMs / 1e3) % 60}s`, ''] })]
    fs.writeFileSync(path.join(dir, f), body.join('\n'))
  }
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.md') && !keep.has(f)) fs.unlinkSync(path.join(dir, f))   // 최근 N건만 유지(생성기 산출 폴더)
  return items.length
}

function main(attr = {}) {
  const args = process.argv.slice(2), has = k => args.includes(k)
  const argOf = (k, d) => { const i = args.indexOf(k); const v = args[i + 1]; return i < 0 ? undefined : v && !v.startsWith('--') ? v : d }
  const delay = +argOf('--delay', 0) || 0   // 훅 직후 실행 : 세션 기록 마지막 줄이 디스크에 쓰일 시간
  if (delay > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(delay, 5000))
  const design = has('--design-only')
  const out = path.resolve(ROOT, argOf('--out', '') || (design ? PATHS.design : PATHS.live)), outDir = path.dirname(out)
  const mdDir = has('--md') ? path.resolve(ROOT, argOf('--md', design ? PATHS.flowMd : PATHS.reqMd)) : null
  let requests, msg
  if (design) {
    requests = [{ key: 'design', when: '설계도', head: '설계도 — 요청 1건의 처리 흐름(마스터 설계 트리)', meta: '', nodes: designGraph() }].map(r => ({ ...r, path: buildPath(r.nodes, { design: true }) }))
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(out, renderHtml({ design, outDir, requests, meta: '설계도판 — 실데이터(요청문·비용·시각) 없음, 시간은 형식 자리표시. 실요청 모니터링판은 work-statistics/mywork/myRequestGraph.html(gitignore, 턴 종료·서브에이전트 시작/종료 때 자동 갱신 + 화면 자동 새로고침). 노드를 누르면 역할·검수 기준·정본 문서. 노드 번호 = 처리 순서 일련번호 1~' + SLOTS.length + '(실행 경로 순번은 원 배지).' }))
    msg = `${path.relative(ROOT, out)} : 설계도 1건, 노드 ${SLOTS.length}개`
    if (mdDir) msg += ` · 슬롯 md ${writeSlotMd(mdDir)}개 → ${path.relative(ROOT, mdDir)}`
  } else {
    const now = Date.now(), days = Math.max(1, +argOf('--days', SIZE.days) || SIZE.days), fromMs = now - days * 864e5
    const redact = makeRedactor({ workspaceRoot: ROOT }), loops = loadLoops(path.join(ROOT, PATHS.loops)), catLabel = Object.fromEntries(CATEGORIES.map(c => [c.key, c.label]))
    const rows = loadRows({ from: new Date(fromMs - 864e5).toISOString().slice(0, 10) }), turns = buildTurns(rows, fromMs)
    // Workflow 도구를 부른 턴 표시(part 2 이후 호출도 포함 — buildTurns 는 첫 part 의 tools 만 유지) → loadWorkflowAgents 귀속 근거
    const wfTurn = new Set(rows.filter(r => r.tools?.Workflow).map(r => `${r.session_id}:${r.turn}`))
    for (const t of turns) if (wfTurn.has(`${t.session_id}:${t.turn}`)) t.wfCall = true
    const sessDir = path.join(process.env.TOOLDASH_HOME || os.homedir(), '.claude/projects', (process.env.TOOLDASH_PROJECT || ROOT).replace(/[^A-Za-z0-9]/g, '-'))   // Claude Code 프로젝트 폴더 규칙(model-change-dashboard 와 같음)
    let liveTurns = []
    try { liveTurns = scanLive(turns, { sessDir, now }) } catch (e) { if (!has('--quiet')) console.error(`턴 중간 스캔 건너뜀 : ${e.message}`) }
    const all = [...liveTurns, ...turns].sort((x, y) => ms(y.ts_req) - ms(x.ts_req))
    try { loadWorkflowAgents(all, sessDir, { cacheFile: path.join(ROOT, PATHS.wfCache), now }) } catch (e) { if (!has('--quiet')) console.error(`워크플로 에이전트 읽기 건너뜀 : ${e.message}`) }
    try { loadAgentRounds(all, sessDir, path.join(ROOT, PATHS.roundsCache)) } catch (e) { if (!has('--quiet')) console.error(`팀원 회차 읽기 건너뜀 : ${e.message}`) }
    try { loadAgentHarness(all, sessDir, path.join(ROOT, PATHS.harnessCache), attr) } catch (e) { if (!has('--quiet')) console.error(`하네스 변경 감지 건너뜀 : ${e.message}`) }
    try { loadToolEvents(all, sessDir, path.join(ROOT, PATHS.toolCache), now) } catch (e) { if (!has('--quiet')) console.error(`하네스 사용 기록 건너뜀 : ${e.message}`) }
    // 요청 원문·보고·요약 캐시는 화면·md 에 실리므로 비밀값 마스킹(redact) 후 사용, 요약 캐시 = 문자열 배열 필드만
    for (const t of all) {
      if (t.prompts) t.prompts = t.prompts.map(p => ({ ...p, text: redact(p.text) }))
      if (t.req_head) t.req_head = redact(t.req_head)
      for (const ag of t.agents_detail || []) if (ag.report) ag.report = ag.report.map(x => redact(x))
      t.summary = loadSummary(path.join(ROOT, PATHS.summaries), t, redact)
    }
    // 승인 강제 실패(Stop 훅 turn-gate 연속 차단 상한) : 같은 세션·턴 창 안 기록을 붙인다(종료 승인 줄 자체는 loadToolEvents 가 세션 기록에서 읽음)
    let apv = []; try { apv = fs.readFileSync(path.join(ROOT, PATHS.approvals), 'utf8').split('\n').flatMap(l => { try { const j = l ? JSON.parse(l) : null; return j?.kind === '강제 실패' ? [j] : [] } catch { return [] } }) } catch { /* 기록 없음 */ }
    for (const t of all) { const a = ms(t.ts_req), b = t.ts_res ? ms(t.ts_res) : now, xs = apv.filter(x => x.sid === t.session_id && ms(x.at) >= a && ms(x.at) <= b + RUN_GRACE_MS); if (xs.length) t.forced = xs }
    linkContext(all, now)
    splitAgentRounds(all)
    requests = all.map(t => {
      const nodes = buildRequestGraph(t, loops, { now, peers: all }), n1 = nodes[0], ag = n1.agentN, p = buildPath(nodes), ck = n1.check, when = new Date(ms(t.ts_req)).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16)
      const cost = t.live ? null : (t.cost_usd || 0) + (t.cost_agents_usd || 0)
      const head = redact(t.req_head || '').replace(/<\/?[a-z_-]+(?:\s[^>]*)?>/gi, '').trim().slice(0, SIZE.headCut) || '(요청문 없음)'
      return { sumId: summaryId(t), key: t.key, sid: `${t.session || ''}-${t.turn ?? ''}`, date: when.slice(0, 10), when, head, cat: t.category || '', catLabel: catLabel[t.category] || t.category || (t.live ? '진행 중(기록 전)' : ''), st: n1.status, statusLabel: n1.statusLabel, running: n1.run, path: p, meta: `에이전트 ${ag} · ${cost == null ? '$—' : '$' + cost.toFixed(2)} · 엔지니어링 ${engTxt(n1.eng, n1.engEst)} · 검증 Y ${ck.y} / 누락 ${ck.miss} / 위반 ${ck.viol} · 묶음 ${n1.cum.n}/${n1.cum.cap} ·`, alert: n1.alertN ? `경보 ${n1.alertN}${n1.cum.level ? ' · ' + n1.cum.level : ''}` : '', nodes }
    })
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(out, renderHtml({ design, outDir, requests, meta: `최근 ${days}일 요청 ${requests.length}건(진행 중 ${requests.filter(r => r.running).length}) · 갱신 ${new Date(now).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })} (턴 종료·서브에이전트 시작/종료 때 재생성, 화면은 진행 중 있으면 ${SIZE.reloadRun / 1e3}초·없으면 ${SIZE.reloadIdle / 1e3}초마다 새로고침) · 비용은 API 단가 환산(청구액 아님, 진행 중 턴은 종료 후 기록) · 점선 배지 = 턴 시간창 기준 추정 연결 · 경로·비밀값 마스킹` }))
    msg = `${path.relative(ROOT, out)} : 요청 ${requests.length}건(진행 중 ${requests.filter(r => r.running).length}), 노드 ${requests.reduce((s, r) => s + r.nodes.length, 0)}개, 루프 원장 ${loops.length}개`
    if (mdDir) msg += ` · 요청 md ${writeRequestMd(mdDir, requests.slice(0, SIZE.mdRecent), now)}건 → ${path.relative(ROOT, mdDir)}`
  }
  if (!has('--quiet')) console.log(msg)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // 변경 귀속 = 훅과 같은 함수(D-002) — 불러오기 실패 시 Write·Edit 폴백(생성은 계속)
  let attr = {}; try { const cg = await import('../.claude/hooks/codex-gate.mjs'); attr = { attribute: cg.attributionFor, recordAt: cg.attribAt, ver: cg.RULES_VER } } catch (e) { console.error(`변경 귀속 함수 불러오기 실패(Write·Edit 폴백) : ${e.message}`) }
  main(attr)
}
