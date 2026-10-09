// 요청문을 work-history-core 분류기로 판정해 이 턴의 단계 계획(수집 → 결론 → 산출 → 검수, 단계별 모델·effort)을 Claude 컨텍스트에 한 줄로 넣고, 사용자가 직접 바꿔야 하는 effort만 화면에 안내하는 UserPromptSubmit 훅
// 실행: .claude/settings.json hooks.UserPromptSubmit 에 등록, 자체 점검 `node .claude/hooks/model-advisor.mjs --selftest` (기준서 .claude/skills/anakin-skills/anakins-ClaudeModel-for-Work.md)
// 근거: 훅은 메인 모델·effort를 바꿀 수 없음 → 턴 안의 모델·effort 변경은 단계별 서브에이전트(정의 frontmatter model·effort)로 수행, 메인 /model 전환은 캐시 전체 재작성이라 안내 제외(code.claude.com prompt-caching·sub-agents 2026-10-08 확인)
import { pathToFileURL } from 'node:url'
import { categorize } from '../../scripts/work-history-core.mjs'

const MIN_CONFIDENCE = 0.25
const HIGH = new Set(['FEATURE', 'FIX', 'REFACTOR', 'DOCS', 'DATA'])                                // 산출물·수정 작업 : 메인 effort high
const DECIDE = /결론|판정|최종\s?안|권고안|방식\s?(선정|결정)|아키텍처\s?(설계|결정)|비교\s?평가|어느\s?(쪽|것|방식)/   // 결론 설계 단계 필요
const COLLECT = /전체|전수|집계|통계|모든\s?(파일|장표|슬라이드|테이블)|조사|목록|이력|대조|교차/                       // 대량 수집 단계 필요

/** 요청문 → { user: 화면 안내 | null, plan: 단계 계획 | null } */
export function route(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) return { user: null, plan: null }
  if (/<task-notification>|<teammate-message|^\s*\[SYSTEM NOTIFICATION/.test(prompt)) return { user: null, plan: null }   // 백그라운드 작업 완료 알림 : 사용자 요청 아님(알림 본문의 '결론' 등 단어로 오발화 방지)
  const { category, confidence } = categorize(prompt)
  const produce = confidence >= MIN_CONFIDENCE && HIGH.has(category)
  const decide = DECIDE.test(prompt), collect = COLLECT.test(prompt) && category !== 'GIT'   // '전체 커밋' 등 Git 요청은 수집 단계 불필요
  const steps = []
  if (collect) steps.push('수집 → Agent(subagent_type: "anakin_phase-collect") [Sonnet·medium] (파일 본문 10개 이상 읽기·로그 전수 대조면 위임, 명령 몇 번으로 끝나는 목록·집계는 메인 직접 : 위임 1회 = 3.7만~5.9만 토큰 실측)')
  if (decide) steps.push('결론 → Agent(subagent_type: "anakin_phase-decide") [Fable·high] (생략 불가, 메인은 결과를 받아 정리만)')
  if (produce) steps.push('산출 → 메인 [effort high 권장]', '검증 → Agent(subagent_type: "anakin_phase-verify") [Sonnet·medium] (테스트 묶음(pnpm test·pnpm build 등)·렌더 검수·명령 여러 번이 필요한 검증이면 위임, 명령 1회로 끝나면 메인 직접 ; 실패 시 메인 수정 후 재검증)')
  if (produce && category === 'DOCS') steps.push('검수 → Agent(subagent_type: "anakin_phase-review") [Opus·high] (파일로 저장하는 문서·보고서·i18n 메시지면 분량과 무관하게 생략 불가, 대화 답변만이면 생략)')
  if (category === 'GIT' && confidence >= MIN_CONFIDENCE && !produce) steps.push('커밋·푸시 → Agent(subagent_type: "anakin_phase-commit") [Haiku 4.5] (커밋 묶음·메시지를 정했으면 함께 전달, 충돌·behind·훅 실패는 에이전트가 멈추고 보고)')
  if (/팀\s?(구성|운영|재편|재평가)|팀원|재배정|에이전트\s?(성능|재평가|배정)/.test(prompt) && !steps.length) steps.push('재평가 → Agent(subagent_type: "teamanakin-admin") [Opus·high] (모드 2)')
  if (steps.some(x => x.includes('anakin_phase-') && !x.includes('anakin_phase-commit'))) steps.push('취합·승인 → Agent(subagent_type: "teamanakin-admin") [Opus·high] (생략 불가 : 팀원 결과 요약·요청 원문·산출물 경로 전달, 반려 시 메인 수정 후 재승인)')
  if (!produce && steps.length) steps.push('응답 → 메인 (팀장 판정 첫 줄 포함)')
  const plan = steps.length ? `[모델 단계 계획] 이 턴은 다음 호출 순서로 진행 : ${steps.map((x, i) => `${i + 1}) ${x}`).join(' ')} ; 메인 /model 전환 금지 ; 응답 첫머리에 "수행 단계 : <실제 수행 단계 → 담당>" 한 줄 보고 (기준 : anakins-claudemodel-for-work 스킬)` : null
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
  assert.match(route('대시보드 만들어 줘').plan, /1\) 산출 → 메인.*2\) 검증 → Agent\(subagent_type: "anakin_phase-verify"\).*3\) 취합·승인 → Agent\(subagent_type: "teamanakin-admin"\)/)   // 산출 → 검증 → 팀장 승인
  assert.match(route('복제 방식 최종 결론 설계해 줘').plan, /subagent_type: "anakin_phase-decide"\) \[Fable·high\] \(생략 불가/)
  assert.match(route('work-history 전체 통계 집계해서 장표로 작성해 줘').plan, /anakin_phase-collect.*산출 → 메인.*검증 → Agent\(subagent_type: "anakin_phase-verify"\)/)
  assert.match(route('회의 결과를 전체 이력과 대조해서 문서로 요약해 줘').plan, /anakin_phase-verify.*검수 → Agent\(subagent_type: "anakin_phase-review"\) \[Opus·high\]/)
  assert.deepEqual(route('git status 보여 줘'), { user: null, plan: null })                       // 기본값과 같으면 침묵
  assert.match(route('복제 방식 최종 결론 설계해 줘').plan, /anakin_phase-decide.*취합·승인 → Agent\(subagent_type: "teamanakin-admin"\).*응답 → 메인/)
  assert.match(route('대시보드 만들어 줘').plan, /anakin_phase-verify.*취합·승인 → Agent\(subagent_type: "teamanakin-admin"\)/)
  assert.match(route('팀원 구성 어떻게 되어 있어?').plan, /teamanakin-admin.*모드 2/)
  assert.match(route('전체 변경사항 커밋하고 푸시해 줘').plan, /anakin_phase-commit.*\[Haiku 4\.5\]/); assert.doesNotMatch(route('전체 변경사항 커밋하고 푸시해 줘').plan, /teamanakin-admin/)   // 커밋 단독 턴은 팀장 제외 : 푸시 후 반려는 되돌릴 수 없음
  assert.equal(route('커밋해 줘 ultrathink').user, null)                                         // ultrathink 사용 여부는 안내하지 않음(실요청 36% 발화 : 잡음)
  assert.deepEqual(route('[SYSTEM NOTIFICATION - NOT USER INPUT] <task-notification><result>결론 초안</result></task-notification>'), { user: null, plan: null })
  assert.equal(deepFor('anakin_phase-decide'), DEEP); assert.equal(deepFor('anakin_phase-collect'), null)
  assert.deepEqual(route(''), { user: null, plan: null }); assert.deepEqual(route(undefined), { user: null, plan: null })
  assert.match(route('결제 실패 근본 원인 분석해 줘').plan, /ultrathink 자동 선별/)
  assert.match(route('DB 동기화 방식 결정해 줘').plan, /ultrathink 자동 선별/)
  assert.doesNotMatch(route('결론 설계해 줘 ultrathink').plan, /ultrathink 자동 선별/)   // 사용자가 직접 쓴 경우 중복 주입 안 함
  assert.equal(route('git status 보여 줘').plan, null)
  assert.doesNotMatch(route('대시보드 만들어 줘').plan, /ultrathink 자동 선별/)
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
