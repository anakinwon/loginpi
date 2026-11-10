// 요청문을 work-history-core 분류기로 판정해 이 턴의 단계 계획(수집 → 결론 → 산출 → 검수 → 그래프 분석 → 승인, 파일을 바꾼 서브에이전트 뒤 SubagentStop 훅 Codex 루프 판정, 턴 끝 = 아소카 종료 승인 줄(기록용), 단계별 모델·effort)을 Claude 컨텍스트에 한 줄로 넣고, 사용자가 직접 바꿔야 하는 effort만 화면에 안내하는 UserPromptSubmit 훅
// 실행: .claude/settings.json hooks.UserPromptSubmit 에 등록, 자체 점검 `node .claude/hooks/model-advisor.mjs --selftest` (기준서 .claude/skills/anakin-skills/anakins-ClaudeModel-for-Work.md)
// 근거: 훅은 메인 모델·effort를 바꿀 수 없음 → 턴 안의 모델·effort 변경은 단계별 서브에이전트(정의 frontmatter model·effort)로 수행, 메인 /model 전환은 캐시 전체 재작성이라 안내 제외(code.claude.com prompt-caching·sub-agents 2026-10-08 확인)
import { pathToFileURL } from 'node:url'
import { categorize } from '../../scripts/work-history-core.mjs'

const MIN_CONFIDENCE = 0.25
const HIGH = new Set(['FEATURE', 'FIX', 'REFACTOR', 'DOCS', 'DATA', 'CONFIG'])                      // 산출물·수정·설정 작업 = anakin_phase-build 단계 ; 사용자 /effort high 안내는 유지하되 메인 effort 안내는 재평가 대상 [TBD] (운용 기준서 턴 진행 규칙 5)
const DECIDE = /결론|판정|최종\s?안|권고안|방식\s?(선정|결정)|아키텍처\s?(설계|결정)|비교\s?평가|어느\s?(쪽|것|방식)/   // 결론 설계 단계 필요
const COLLECT = /전체|전수|집계|통계|모든\s?(파일|장표|슬라이드|테이블)|조사|목록|이력|대조|교차/                       // 대량 수집 단계 필요
// Codex 판정(2026-11-09 마스터 "Codex 는 모든 산출 턴 필수" → 2026-11-10 verify 폐지·실행 주체 = SubagentStop 훅 .claude/hooks/codex-gate.mjs)
//   → 2026-11-10 개정 "프롬프트+컨텍스트+그래프+총괄=>제거, 루프 유지+하네스는 루프에 흡수" : 판정 = 파일을 바꾼 에이전트의 c4 원장 하나(하네스 파일 포함), 턴 묶음 판정 폐지
//   절차 정본 .claude/engineering/40. loop/codex_procedure.md 13절 · 상한 5회 · 단계 계획의 Codex 루프 판정 줄 = 훅이 하는 일(메인이 부르는 호출 아님)
const LOOP_RULE = 'Codex 루프 판정(마스터 2026-11-10 "루프 유지 + 하네스는 루프에 흡수") : 파일을 바꾼 서브에이전트가 끝나면 SubagentStop 훅 codex-gate.mjs 가 원장 c4-<주제>-<agentId 앞 6자> 하나로(하네스 파일 포함, 프롬프트 상한을 넘을 때만 -pN) codex-verify.mjs --init → --confirm-real 을 자동 실행하고 결과(종료 0 PASS / 1 FAIL / 2 BLOCKED · 원장 경로)를 다음 도구 호출·요청 때 [CDX 자동 판정] 으로 알린다 — PASS(Y) 전 다음 단계 진행 금지 / FAIL(N) → 그 에이전트에 결함·triage(원장 iter-N.codex.json) 회송, 재실행이 끝나면 훅이 같은 원장 다음 회차 판정(상한 5회) / BLOCKED → 사유 해소 후 재실행(device 는 마스터 점검 항목) ; 파일을 바꾸지 않은 에이전트(collect·decide·review·graph·commit·admin·조회 대행)는 판정 없음 ; 메인·서브에이전트는 직접 실행하지 않는다(재귀 금지)'
// 턴 끝(2026-11-10 개정 "턴 끝 차단 제거, 종료 승인 줄은 기록만") : Stop 훅 turn-gate.mjs = 종료 승인 줄 기록기(비차단)
export const TURN_END = ["종료 승인 → 메인(아소카) (응답 끝 '종료 승인 : <승인|보류> — <근거>' 한 줄 — 기록용 : Stop 훅 turn-gate.mjs는 적기만 하고 막지 않는다)"]
const LOOP_STEP = 'Codex 루프 판정 → SubagentStop 훅 자동(codex-gate.mjs) (파일 변경 시만 : 산출물·하네스 파일 변경 vs 브리프 AC-n·마스터 원문, 원장 c4-<주제>-<agentId 앞 6자>)'

/** 요청문 → { user: 화면 안내 | null, plan: 단계 계획 | null } */
export function route(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) return { user: null, plan: null }
  if (/<task-notification>|<teammate-message|^\s*\[SYSTEM NOTIFICATION/.test(prompt)) return { user: null, plan: null }   // 백그라운드 작업 완료 알림 : 사용자 요청 아님(알림 본문의 '결론' 등 단어로 오발화 방지)
  const { category, confidence } = categorize(prompt)
  const produce = confidence >= MIN_CONFIDENCE && HIGH.has(category)
  const decide = DECIDE.test(prompt), collect = COLLECT.test(prompt) && category !== 'GIT'   // '전체 커밋' 등 Git 요청은 수집 단계 불필요
  const stages = []   // [단계 문구 | null, 그 뒤 Codex 루프 판정 | null] — 파일을 바꾸는 build 만 판정 줄, 팀장·조회 단독 판정은 단계 문구만 본다
  if (collect) stages.push(['수집 → Agent(subagent_type: "anakin_phase-collect") [Sonnet·medium] (읽기·검색·집계는 분량과 무관하게 위임, 메인 직접 금지 : 위임 1회 = 3.7만~5.9만 토큰 실측)', null])
  if (decide) stages.push(['결론 → Agent(subagent_type: "anakin_phase-decide") [Fable·high] (생략 불가, 메인은 결과를 받아 정리만)', null])
  if (produce) stages.push(['산출 → Agent(subagent_type: "anakin_phase-build") [Opus·high] (메인은 브리프(완료 기준 AC-n·scope 포함)·리뷰만, 쉬운 수정도 위임 ; 로컬 검사(tsc·lint·test·selftest·node --check)까지 build 가 실행·보고 ; Codex 실호출 금지 — 판정은 훅)', LOOP_STEP])
  if (produce && category === 'DOCS') stages.push(['검수 → Agent(subagent_type: "anakin_phase-review") [Opus·high] (파일로 저장하는 문서·보고서·i18n 메시지면 분량과 무관하게 생략 불가, 대화 답변만이면 생략)', null])
  if (produce) stages.push(['그래프 분석 → Agent(subagent_type: "anakin_phase-graph") [Sonnet·medium] (산출 턴만 : 산출·검수 뒤·팀장 승인 앞, node scripts/request-graph.mjs --md 로 이 요청의 흐름·엔지니어링 N/5·미수행·비정상 판독 — 2026-11-08 마스터 신설)', null])
  if (category === 'GIT' && confidence >= MIN_CONFIDENCE && !produce) stages.push(['커밋·푸시 → Agent(subagent_type: "anakin_phase-commit") [Haiku 4.5] (커밋 묶음·메시지를 정했으면 함께 전달, 커밋은 node scripts/precommit-check.mjs --commit(결정적 검사 — Codex 없음), 충돌·behind·훅 실패는 에이전트가 멈추고 보고)', null])
  if (/팀\s?(구성|운영|재편|재평가)|팀원|재배정|에이전트\s?(성능|재평가|배정)/.test(prompt) && !stages.length) stages.push(['재평가 → Agent(subagent_type: "teamanakin-admin") [Opus·high] (모드 2)', null])
  const queryOnly = !stages.length && category === 'QUERY' && confidence >= MIN_CONFIDENCE   // 조회 단독 턴 : 메인 직접 조회 금지(2026-11-07) → 수집 위임, 팀장 승인 생략(마스터 확정 2026-11-07)
  if (queryOnly) stages.push(['수집 → Agent(subagent_type: "anakin_phase-collect") [Sonnet·medium] (조회 단독 턴 : 메인 직접 조회 금지, 팀장 승인 생략)', null])
  if (!queryOnly && stages.some(([s]) => s && s.includes('anakin_phase-') && !s.includes('anakin_phase-commit'))) stages.push(['취합·승인 → Agent(subagent_type: "teamanakin-admin") [Opus·high] (생략 불가 : 팀원 결과 요약·요청 원문·산출물 경로 전달, 반려 시 anakin_phase-build 재작업 후 재승인 ; 승인 전제 = 루프 판정 PASS(파일을 바꾼 에이전트의 c4 원장 전부 Y, 파일 변경 0건 = 판정 대상 없음) — 원장 누락·N 미해결 = REJECTED, BLOCKED device 는 최대 CONDITIONAL, Claude 대체 판정은 maxGrade CONDITIONAL)', null])
  const steps = stages.flat().filter(Boolean)
  if (!produce && steps.length) steps.push(queryOnly ? '응답 → 메인 (수집 결과 리뷰·정리 후 회신)' : '응답 → 메인 (팀장 판정 첫 줄 포함)')
  if (steps.length) steps.push(TURN_END[0])   // 모든 턴 끝 = 아소카 종료 승인 줄(기록용)
  const plan = steps.length ? `[모델 단계 계획] 이 턴은 다음 호출 순서로 진행 : ${steps.map((x, i) => `${i + 1}) ${x}`).join(' ')} ; ${LOOP_RULE} ; 메인 /model 전환 금지 ; 응답 첫머리에 "수행 단계 : <실제 수행 단계 → 담당>" 한 줄 보고 (기준 : anakins-claudemodel-for-work 스킬)` : `[턴 종료 규칙] ${TURN_END[0]}`   // 단계 계획이 없는 턴도 턴 끝 규칙은 같다
  const user = produce ? `권장 effort high (${category}) : /effort high 입력 (작업 중 입력해도 다음 요청부터 적용, 5.5 계열은 캐시 유지)` : null
  const deep = !/ultrathink/i.test(prompt) && category !== 'GIT' && DEEP_MAIN_RE.test(prompt)   // 실측 : FEATURE 소요 차이 없음(113 vs 109초), QUERY 7배(n=5) → 설계·결정·원인 분석에만
  return { user, plan: [plan, deep ? DEEP_MAIN : null].filter(Boolean).join(' ') || null }
}
export const advise = prompt => route(prompt).user

// 깊은 추론 지시 자동 부착(SubagentStart) : ultrathink는 effort 값을 바꾸지 않고 컨텍스트 지시만 더함(code.claude.com model-config "Use ultrathink", 2026-10-08 확인)
// 실측(요청 257건) : 조회·운영 요청에 ultrathink 사용 시 Opus 5.5·Fable 5.1 모두 수용률 상승 없이 소요 약 2배·재작업률 상승 → 결론 단계(anakin_phase-decide)에만 부착
export const DEEP = '[깊은 추론 지시 : ultrathink 자동 부착] 결론 단계 : 대안을 빠짐없이 비교하고, 결론마다 반론과 뒤집히는 조건을 검토한 뒤 결론을 쓴다'
// 메인 세션 자동 선별(UserPromptSubmit) : 사용자가 ultrathink를 쓰지 않아도 설계·결정·원인 분석 요청이면 같은 성격의 컨텍스트 지시를 주입(2026-10-09 마스터 지시)
const DEEP_MAIN_RE = /결론|판정|설계|아키텍처|방식\s?(선정|결정)|비교\s?평가|트레이드\s?오프|근본\s?원인|원인\s?(분석|파악|추적)|장애|디버그|디버깅|왜\s?(안|실패)/
export const DEEP_MAIN = '[깊은 추론 지시 : ultrathink 자동 선별] 설계·결정·원인 분석 요청 : 대안과 엣지 케이스를 빠짐없이 검토하고, 결론마다 반론과 뒤집히는 조건을 따진 뒤 행동한다'
export const deepFor = agentType => agentType === 'anakin_phase-decide' ? DEEP : null   // 대시보드(my-claude-model-dashboard.mjs) 발화율 계산용

const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href   // 대시보드 등에서 import 시 훅 본체(stdin 대기) 미실행
if (isMain && process.argv[2] === '--selftest') {
  const assert = (await import('node:assert/strict')).default
  assert.match(route('대시보드 만들어 줘').user, /high \(FEATURE\)/)
  // 2026-11-10 개정 : 산출 턴 = 산출 → Codex 루프 판정(훅) → 그래프 분석 → 취합·승인 → 종료 승인(기록용)
  assert.match(route('대시보드 만들어 줘').plan, /1\) 산출 → .*2\) Codex 루프 판정 → SubagentStop 훅 자동.*3\) 그래프 분석 → .*4\) 취합·승인 → .*5\) 종료 승인 → 메인/)
  assert.match(route('복제 방식 최종 결론 설계해 줘').plan, /subagent_type: "anakin_phase-decide"\) \[Fable·high\] \(생략 불가/)
  assert.match(route('work-history 전체 통계 집계해서 장표로 작성해 줘').plan, /1\) 수집 → Agent\(subagent_type: "anakin_phase-collect"\).*2\) 산출 → Agent\(subagent_type: "anakin_phase-build"\).*3\) Codex 루프 판정 → /)
  assert.match(route('회의 결과를 전체 이력과 대조해서 문서로 요약해 줘').plan, /anakin_phase-build.*Codex 루프 판정 → .*검수 → Agent\(subagent_type: "anakin_phase-review"\) \[Opus·high\]/)
  assert.equal(route('git status 보여 줘').user, null); assert.match(route('git status 보여 줘').plan, /anakin_phase-collect/)   // 조회도 위임(2026-11-07), effort 안내는 침묵
  assert.match(route('복제 방식 최종 결론 설계해 줘').plan, /anakin_phase-decide.*취합·승인 → Agent\(subagent_type: "teamanakin-admin"\).*응답 → 메인/)
  assert.match(route('팀원 구성 어떻게 되어 있어?').plan, /teamanakin-admin.*모드 2/)
  assert.match(route('전체 변경사항 커밋하고 푸시해 줘').plan, /anakin_phase-commit.*\[Haiku 4\.5\].*precommit-check/); assert.doesNotMatch(route('전체 변경사항 커밋하고 푸시해 줘').plan, /teamanakin-admin/)   // 커밋 단독 턴은 팀장 제외, 커밋 = 결정적 검사 래퍼
  assert.equal(route('커밋해 줘 ultrathink').user, null)                                         // ultrathink 사용 여부는 안내하지 않음(실요청 36% 발화 : 잡음)
  assert.deepEqual(route('[SYSTEM NOTIFICATION - NOT USER INPUT] <task-notification><result>결론 초안</result></task-notification>'), { user: null, plan: null })
  assert.equal(deepFor('anakin_phase-decide'), DEEP); assert.equal(deepFor('anakin_phase-collect'), null)
  assert.deepEqual(route(''), { user: null, plan: null }); assert.deepEqual(route(undefined), { user: null, plan: null })
  assert.match(route('결제 실패 근본 원인 분석해 줘').plan, /ultrathink 자동 선별/)
  assert.match(route('DB 동기화 방식 결정해 줘').plan, /ultrathink 자동 선별/)
  assert.doesNotMatch(route('결론 설계해 줘 ultrathink').plan, /ultrathink 자동 선별/)   // 사용자가 직접 쓴 경우 중복 주입 안 함
  assert.doesNotMatch(route('대시보드 만들어 줘').plan, /ultrathink 자동 선별/)
  assert.match(route('지금 sitemap 상태가 어때?').plan, /1\) 수집 → Agent\(subagent_type: "anakin_phase-collect"\).*2\) 응답 → 메인.*3\) 종료 승인 → 메인/); assert.doesNotMatch(route('지금 sitemap 상태가 어때?').plan, /teamanakin-admin/)   // 조회 단독 턴
  assert.match(route('환경변수 설정해 줘').plan, /산출 → Agent\(subagent_type: "anakin_phase-build"\)/)   // CONFIG = build
  assert.doesNotMatch(route('대시보드 만들어 줘').plan, /산출 → 메인|메인 직접|메인 수정/)   // 2026-11-07 마스터 : 메인 직접 작업 금지
  const ALL = ['대시보드 만들어 줘', '환경변수 설정해 줘', '결제 버그 고쳐 줘', '회의 결과를 전체 이력과 대조해서 문서로 요약해 줘', '지금 sitemap 상태가 어때?', 'git status 보여 줘', '전체 변경사항 커밋하고 푸시해 줘', '복제 방식 최종 결론 설계해 줘', '팀원 구성 어떻게 되어 있어?', 'work-history 전체 통계 집계해서 장표로 작성해 줘', '안녕']
  for (const p of ALL) {
    const pl = route(p).plan
    assert.doesNotMatch(pl, /_phase-ver|검증·Codex 판정/, p)   // verify 폐지(2026-11-10)
    assert.doesNotMatch(pl, /CDX 검수 c\d|턴 묶음 판정|칸별 판정 상태 표/, p)   // 2026-11-10 개정 : c1·c2·c3·c5·c6 칸·턴 묶음 판정·칸별 상태 표 폐지
    assert.ok(!/Codex 루프 판정 → Agent\(/.test(pl), p)   // 판정 줄 = 훅(에이전트 호출 아님)
    assert.ok(pl.lastIndexOf('종료 승인 → 메인') > Math.max(pl.lastIndexOf('응답 → 메인'), pl.lastIndexOf('Codex 루프 판정 →')), `${p} : 종료 승인이 마지막 단계`)
    assert.match(pl, /종료 승인 → 메인\(아소카\) \(응답 끝 '종료 승인 : <승인\|보류> — <근거>' 한 줄 — 기록용 : Stop 훅 turn-gate\.mjs는 적기만 하고 막지 않는다\)/, p)
  }
  // 파일을 바꾸는 build 뒤에만 Codex 루프 판정 줄 — 조회·커밋·결론·재평가 턴은 없음
  for (const p of ['지금 sitemap 상태가 어때?', 'git status 보여 줘', '전체 변경사항 커밋하고 푸시해 줘', '복제 방식 최종 결론 설계해 줘', '팀원 구성 어떻게 되어 있어?']) assert.doesNotMatch(route(p).plan, /\d\) Codex 루프 판정 → /, p)
  for (const p of ['대시보드 만들어 줘', '환경변수 설정해 줘', '결제 버그 고쳐 줘', '회의 결과를 전체 이력과 대조해서 문서로 요약해 줘']) {
    const pl = route(p).plan
    assert.match(pl, /산출 → Agent\(subagent_type: "anakin_phase-build"\) \[Opus·high\] \(.*?Codex 실호출 금지 — 판정은 훅\) \d\) Codex 루프 판정 → SubagentStop 훅 자동\(codex-gate\.mjs\) \(파일 변경 시만 : 산출물·하네스 파일 변경 vs 브리프 AC-n·마스터 원문, 원장 c4-<주제>-<agentId 앞 6자>\)/, p)
    assert.match(pl, /anakin_phase-graph.*취합·승인 → Agent\(subagent_type: "teamanakin-admin"\) \[Opus·high\] \([^)]*승인 전제 = 루프 판정 PASS\(파일을 바꾼 에이전트의 c4 원장 전부 Y, 파일 변경 0건 = 판정 대상 없음\) — 원장 누락·N 미해결 = REJECTED, BLOCKED device 는 최대 CONDITIONAL/, p)
    assert.match(pl, /Codex 루프 판정\(마스터 2026-11-10 .*SubagentStop 훅 codex-gate\.mjs 가 원장 c4-<주제>-<agentId 앞 6자> 하나로\(하네스 파일 포함.*--init → --confirm-real 을 자동 실행.*PASS\(Y\) 전 다음 단계 진행 금지 \/ FAIL\(N\) → 그 에이전트에 .*회송.*상한 5회.*판정 없음.*직접 실행하지 않는다\(재귀 금지\)/, p)
  }
  assert.match(route('전체 변경사항 커밋하고 푸시해 줘').plan, /1\) 커밋·푸시 → .*2\) 응답 → 메인 .*3\) 종료 승인 → 메인/)
  assert.match(route('복제 방식 최종 결론 설계해 줘').plan, /1\) 결론 → .*2\) 취합·승인 → .*3\) 응답 → 메인 .*4\) 종료 승인/)
  assert.match(route('팀원 구성 어떻게 되어 있어?').plan, /1\) 재평가 → .*2\) 응답 → 메인/); assert.doesNotMatch(route('팀원 구성 어떻게 되어 있어?').plan, /취합·승인/)
  assert.match(route('회의 결과를 전체 이력과 대조해서 문서로 요약해 줘').plan, /anakin_phase-review.*anakin_phase-graph.*teamanakin-admin/)   // 검수가 있어도 그래프는 승인 바로 앞
  assert.doesNotMatch(route('지금 sitemap 상태가 어때?').plan, /anakin_phase-graph/); assert.doesNotMatch(route('전체 변경사항 커밋하고 푸시해 줘').plan, /anakin_phase-graph/); assert.doesNotMatch(route('복제 방식 최종 결론 설계해 줘').plan, /anakin_phase-graph/)   // 조회·커밋·결론 단독 턴 제외(비용)
  assert.match(route('안녕').plan, /^\[턴 종료 규칙\] 종료 승인 → 메인/)
  console.log('selftest ok')
} else if (isMain) {
  let raw = ''
  for await (const c of process.stdin) raw += c
  let r = { user: null, plan: null }, input = {}
  try { input = JSON.parse(raw) } catch { /* 비정상 입력 : 침묵, 프롬프트 차단 금지 */ }
  if (input.hook_event_name === 'SubagentStart') {
    const d = deepFor(input.agent_type)
    if (d) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: d } }))
    process.exit(0)
  }
  try { r = route(input.prompt) } catch { /* 분류 실패 : 침묵 */ }
  const out = {}
  if (r.user) out.systemMessage = r.user
  if (r.plan) out.hookSpecificOutput = { hookEventName: 'UserPromptSubmit', additionalContext: r.plan }
  if (Object.keys(out).length) process.stdout.write(JSON.stringify(out))
}
