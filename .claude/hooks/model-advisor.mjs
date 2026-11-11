// 요청문을 work-history-core 분류기로 판정해 이 턴의 단계 계획(소규모 산출 = 메인 직접, 다파일·30분+·병렬 = anakin_phase-build, 대량 수집만 collect, 결론 decide 선택, 고위험(인증·결제·SQL·env·배포)만 teamanakin-admin 승인)을 짧게 Claude 컨텍스트에 넣고, 사용자가 직접 바꿔야 하는 effort만 화면에 안내하는 UserPromptSubmit 훅 — 계획이 비면 아무것도 주입하지 않는다
// 실행: .claude/settings.json hooks.UserPromptSubmit 에 등록, 자체 점검 `node .claude/hooks/model-advisor.mjs --selftest` (기준서 .claude/skills/anakin-skills/anakins-ClaudeModel-for-Work.md)
// 근거: 훅은 메인 모델·effort를 바꿀 수 없음 → 턴 안의 모델·effort 변경은 단계별 서브에이전트(정의 frontmatter model·effort)로 수행, 메인 /model 전환은 캐시 전체 재작성이라 안내 제외(code.claude.com prompt-caching·sub-agents 2026-10-08 확인)
//   2026-11-12 마스터 "1번부터 5번까지 모두 지금 적용" : 강제 위임 뒤 요청당 비용·p90 급증 → 소규모 메인 직접·admin 고위험만·graph·간소 절차·종료 승인 줄 삭제
import { pathToFileURL } from 'node:url'
import { categorize } from '../../scripts/work-history-core.mjs'

const MIN_CONFIDENCE = 0.25
const HIGH = new Set(['FEATURE', 'FIX', 'REFACTOR', 'DOCS', 'DATA', 'CONFIG'])                      // 산출물·수정·설정 작업 = 산출 단계
const DECIDE = /결론|판정|최종\s?안|권고안|방식\s?(선정|결정)|아키텍처\s?(설계|결정)|비교\s?평가|어느\s?(쪽|것|방식)/   // 결론 설계 단계 필요
const COLLECT = /전체|전수|집계|통계|모든\s?(파일|장표|슬라이드|테이블)|조사|목록|이력|대조|교차/                       // 대량 수집 단계 필요
// 고위험 = 팀장 승인 대상 : 옛 간소 절차 ① 제외 경로 단어(인증·결제·SQL·env) + 배포
const HIGH_RISK = /인증|로그인|세션|결제|구독|환불|지갑|마이그레이션|환경\s?변수|배포|\bsql\b|\.sql|\benv\b|\.env|auth|session|login|oauth|payment|pymnt|subscri|refund|wallet|a2u|pi-pay|pi-reward|deploy|promote/i
const LOOP_RULE = 'build 등 서브에이전트가 파일을 바꾸면 SubagentStop 훅이 c4 판정 자동 실행 — FAIL 은 실제 결함만 회송, 상한 5회'

/** 요청문 → { user: 화면 안내 | null, plan: 단계 계획 | null } */
export function route(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) return { user: null, plan: null }
  if (/<task-notification>|<teammate-message|^\s*\[SYSTEM NOTIFICATION/.test(prompt)) return { user: null, plan: null }   // 백그라운드 작업 완료 알림 : 사용자 요청 아님(알림 본문의 '결론' 등 단어로 오발화 방지)
  const { category, confidence } = categorize(prompt)
  const sure = confidence >= MIN_CONFIDENCE
  const produce = sure && HIGH.has(category)
  const decide = DECIDE.test(prompt), collect = COLLECT.test(prompt) && category !== 'GIT'   // '전체 커밋' 등 Git 요청은 수집 단계 불필요
  const steps = []
  if (collect) steps.push('수집 → anakin_phase-collect [Sonnet·medium] (대량 수집만, 단건 조회는 메인 직접)')
  if (decide) steps.push('결론 → anakin_phase-decide [Fable·high] (선택 : 대안 비교가 클 때)')
  if (produce) steps.push('산출 → 메인 직접(파일 1~3개·인증/결제/페이지 라우트/SQL/env 아님) ; 다파일·30분+·병렬 독립 작업은 anakin_phase-build [Opus·high] 위임')
  if (category === 'GIT' && sure && !produce) steps.push('커밋 → 메인 직접(node scripts/precommit-check.mjs --commit 통과 후 커밋, anakin_phase-commit 은 선택)')
  if (/팀\s?(구성|운영|재편|재평가)|팀원|재배정|에이전트\s?(성능|재평가|배정)/.test(prompt) && !steps.length) steps.push('재평가 → teamanakin-admin [Opus·high] (모드 2)')
  if ((produce || decide) && HIGH_RISK.test(prompt)) steps.push('승인 → teamanakin-admin [Opus·high] (고위험 : 인증·결제·SQL·env·배포 — 전제 c4 PASS)')
  const plan = steps.length ? `[모델 단계 계획] ${steps.map((x, i) => `${i + 1}) ${x}`).join(' ')}${produce ? ` ; ${LOOP_RULE}` : ''} ; 메인 /model 전환 금지` : null
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
  // 2026-11-12 : 소규모 산출 = 메인 직접, 큰 일만 build 위임
  assert.match(route('대시보드 만들어 줘').plan, /^\[모델 단계 계획\] 1\) 산출 → 메인 직접\(파일 1~3개.*anakin_phase-build \[Opus·high\] 위임 ; build 등 서브에이전트가 파일을 바꾸면 SubagentStop 훅이 c4 판정 자동 실행 — FAIL 은 실제 결함만 회송, 상한 5회 ; 메인 \/model 전환 금지$/)
  assert.match(route('복제 방식 최종 결론 설계해 줘').plan, /1\) 결론 → anakin_phase-decide \[Fable·high\] \(선택 : 대안 비교가 클 때\)/)
  assert.match(route('work-history 전체 통계 집계해서 장표로 작성해 줘').plan, /1\) 수집 → anakin_phase-collect.*2\) 산출 → 메인 직접/)
  // 조회 단독 턴 = 메인 직접 : 계획 없음(주입 0)
  for (const p of ['지금 sitemap 상태가 어때?', 'git status 보여 줘', '안녕']) assert.deepEqual(route(p), { user: null, plan: null }, p)
  assert.match(route('팀원 구성 어떻게 되어 있어?').plan, /1\) 재평가 → teamanakin-admin.*모드 2/)
  assert.match(route('전체 변경사항 커밋하고 푸시해 줘').plan, /1\) 커밋 → 메인 직접\(node scripts\/precommit-check\.mjs --commit.*anakin_phase-commit 은 선택\)/)
  // 팀장 승인 = 고위험만
  for (const p of ['결제 버그 고쳐 줘', '환경변수 설정해 줘', '로그인 화면 문구 고쳐 줘', 'Pi auth 세션 만료 버그 수정해 줘']) assert.match(route(p).plan, /\d\) 승인 → teamanakin-admin \[Opus·high\] \(고위험/, p)
  for (const p of ['대시보드 만들어 줘', 'README 오타 고쳐 줘', '회의 결과를 전체 이력과 대조해서 문서로 요약해 줘', '복제 방식 최종 결론 설계해 줘', '전체 변경사항 커밋하고 푸시해 줘', '팀원 구성 어떻게 되어 있어?']) assert.doesNotMatch(route(p).plan, /승인 → /, p)
  assert.equal(route('결제 내역 보여 줘').plan, null)   // 고위험 단어여도 조회 단독은 주입 없음
  assert.equal(route('커밋해 줘 ultrathink').user, null)                                         // ultrathink 사용 여부는 안내하지 않음(실요청 36% 발화 : 잡음)
  assert.deepEqual(route('[SYSTEM NOTIFICATION - NOT USER INPUT] <task-notification><result>결론 초안</result></task-notification>'), { user: null, plan: null })
  assert.equal(deepFor('anakin_phase-decide'), DEEP); assert.equal(deepFor('anakin_phase-collect'), null)
  assert.deepEqual(route(''), { user: null, plan: null }); assert.deepEqual(route(undefined), { user: null, plan: null })
  assert.match(route('결제 실패 근본 원인 분석해 줘').plan, /ultrathink 자동 선별/)
  assert.match(route('DB 동기화 방식 결정해 줘').plan, /ultrathink 자동 선별/)
  assert.doesNotMatch(route('결론 설계해 줘 ultrathink').plan, /ultrathink 자동 선별/)   // 사용자가 직접 쓴 경우 중복 주입 안 함
  assert.doesNotMatch(route('대시보드 만들어 줘').plan, /ultrathink 자동 선별/)
  // 삭제된 단계·규칙은 어떤 요청에도 나오지 않고, 주입 길이는 개정 전(산출 턴 2,856자)의 1/3 이하
  const ALL = ['대시보드 만들어 줘', '환경변수 설정해 줘', '결제 버그 고쳐 줘', '회의 결과를 전체 이력과 대조해서 문서로 요약해 줘', '전체 변경사항 커밋하고 푸시해 줘', '복제 방식 최종 결론 설계해 줘', '팀원 구성 어떻게 되어 있어?', 'work-history 전체 통계 집계해서 장표로 작성해 줘']
  for (const p of ALL) {
    const pl = route(p).plan
    assert.doesNotMatch(pl, /phase-graph|그래프 분석|간소 절차|종료 승인|턴 종료 규칙|생략 불가|_phase-ver|턴 묶음 판정/, p)
    assert.ok(pl.replace(DEEP_MAIN, '').length <= 952, `${p} : ${pl.length}자`)
  }
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
