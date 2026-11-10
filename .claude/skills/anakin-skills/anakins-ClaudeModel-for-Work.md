# 작업 단계별 모델·effort 운용

작성 기준 : loginpi 작업 패턴(Next.js 앱 코드·Supabase SQL·문서·도구, 한국어 요청) ; 근거 : 원 프로젝트 문서 CLAUDE_CODE_MODEL_TUNING.md(이 저장소 미포함, 2026-10-08 요청 257건 실측 + 공식 문서), 2026-10-09 loginpi 이식 ; 과금 구독제 : 기준은 속도·품질·캐시 유지

전제 : 한 턴 안에서도 작업 성격과 진행 상태에 따라 모델·effort가 여러 번 바뀜 ; 메인 세션은 지휘(Opus 5.5 : 지명·정리·리뷰·승인·회신)만 맡고 직접 작업하지 않음(마스터 2026-11-07, 정본 .claude/engineering/10. prompt/anakins_prompt.md 0절), 모든 단계는 그 단계에 맞는 서브에이전트로 넘김

## 누가 턴 안에서 무엇을 바꿀 수 있는가

1. Claude(자율) : 서브에이전트 호출마다 모델 지정(Agent 호출 model 파라미터) ; 서브에이전트 effort는 정의 frontmatter effort 값이 세션 effort를 덮어씀
2. 사용자 : 작업 중 /effort 입력 시 같은 턴의 다음 요청부터 적용(5.5 계열·Fable 5.1은 캐시 유지)
3. 훅 : 변경 불가 ; model-advisor.mjs 가 매 요청 단계 계획 한 줄을 컨텍스트에 넣음([모델 단계 계획] 줄)
4. 메인 /model 전환 : 다음 요청에서 대화 전체를 캐시 없이 재처리 ; 턴 중에는 사용하지 않음, 세션 시작 시점에만

## 단계와 담당

1. 수집(대량 읽기·검색·집계·이력 통계·전수 대조) : anakin_phase-collect = Sonnet · effort medium, 읽기 전용, 기존 스크립트 우선 ; 읽기·검색·집계는 분량과 무관하게 위임, 메인 직접 금지(원 환경 실측 위임 1회 = 3.7만~5.9만 토큰 실측 : 비용은 마스터 지시로 감수)
2. 결론(결론·판정·방식 선정·아키텍처 결정 초안) : anakin_phase-decide = Fable · effort high, 읽기 전용, 강력추천/추천 표기
3. 산출(앱 코드·SQL·문서·도구·대시보드·설정 작성과 수정) : anakin_phase-build = Opus · effort high, 쓰기 가능, tsc·단위 테스트·selftest·node --check 와 라우트·src/ 변경이면 pnpm build 관문까지 실행(2026-11-10 검증 단계 폐지로 이관) ; 쉬운 수정도 위임
4. 검증 단계 에이전트 : 2026-11-10 마스터 결정으로 폐지("Codex 목적이 검수인데 클로드가 검수를 또 하는 의도가 뭘까 … 삭제 바람") — 실행 확인(타입 체크·lint·build·테스트·자체 점검)은 산출(3) 이 함께, Codex 판정은 4-2 훅
4-1. Codex 루프 판정(모든 산출 턴 필수, 마스터 결정 2026-11-09 · 2026-11-10 개정 "프롬프트+컨텍스트+그래프+총괄=>제거, 루프 유지+하네스는 루프에 흡수") : 실행 주체 = SubagentStop 훅 .claude/hooks/codex-gate.mjs — 파일을 바꾼 에이전트가 끝날 때 원장 c4-<주제>-<agentId 앞 6자> 하나(하네스 파일도 같은 원장, 계약 AC-4 · 프롬프트 상한을 넘을 때만 -pN 묶음)를 자동 계약(마스터 요청 원문 + 브리프)·증거로 --init → node scripts/codex-verify.mjs --confirm-real(절차 정본 .claude/engineering/40. loop/codex_procedure.md 13절) ; 종료 0 PASS → 다음 단계 / 1 FAIL → 결함을 그 에이전트에 회송(재실행 끝나면 같은 원장 다음 회차, 상한 5) / 2 BLOCKED → 사유 해소 후 재실행 ; 승인 전제 = 루프 판정 PASS, 등급 상한 = 결과 maxGrade
4-2. 판정 비대상(2026-11-10 개정 — 개정 전 "모든 서브에이전트 결과 판정"은 폐지) : collect·decide·review·graph·commit·teamanakin-admin(훅 NO_GATE)과 파일 변경 0건 실행은 판정하지 않는다 — 결과는 [CDX 자동 판정](종료 코드·원장 경로)으로 메인의 다음 도구 호출·요청 때 알림 ; 메인은 PASS 전 다음 단계로 가지 않고, FAIL 은 그 에이전트에 회송, 메인·서브에이전트는 판정을 직접 실행하지 않는다
4-3. Codex 비용·시간(2026-11-10 개정) : Codex 호출 수 = 파일을 바꾼 에이전트 수(+ -pN 묶음 수) + FAIL 회송 — 산출 턴 기본(build 1회) 1회, 조회·결론·커밋 단독 턴 0회 ; 1회마다 export 약 5~7초 + Codex 판정(첫 실호출 36초), 훅 timeout 600초
4-4. 턴 끝 = 아소카 종료 승인 줄(기록용, 2026-11-10 개정 "턴 끝 차단 제거, 종료 승인 줄은 기록만") : 메인은 응답 마지막 줄에 `종료 승인 : <승인|보류> — <근거>` 를 쓴다(팀장 승인은 있으면 근거) — Stop 훅 `.claude/hooks/turn-gate.mjs` 는 이 줄을 `.omc/state/codex-gate/approvals.jsonl` 에 적기만 하고 막지 않는다(턴 묶음 판정 폐지)
5. 검수(문서·i18n·사용자 표시 텍스트 산출물의 요구·규칙 대조) : anakin_phase-review = Opus · high, 읽기 전용, DOCS 작업 ; 파일로 저장하는 문서·보고서·i18n 메시지면 분량과 무관하게 생략 불가
5-1. 그래프 분석(산출 턴만, 산출·검수 뒤·팀장 승인 앞 : 이 요청의 흐름·엔지니어링 N/5·미수행 슬롯·비정상 흐름 판독 + SA-컨텍스트 요약 캐시 작성) : anakin_phase-graph = Sonnet · medium, 읽기 전용 + 생성기 node scripts/request-graph.mjs --md 실행·요약 캐시(.omc/state/request-graph/summaries/) 쓰기만 ; 조회·커밋·결론 단독 턴 제외(비용) (2026-11-08 마스터 신설) ; 결과는 팀장 승인(7)으로
6. 응답(정리·회신) : 메인, effort medium 기본값 ; 조회는 수집 단계, 설정 변경은 산출 단계, 커밋은 6-1 로 위임
6-1. 커밋·푸시(분류 GIT) : anakin_phase-commit = Haiku 4.5(effort 미지원), 저장소 git 규칙(.claude/rules/git-rules.md) 고정 수행, 커밋은 node scripts/precommit-check.mjs --commit(결정적 검사 — 금지 경로·5MB·추가 줄 비밀·Co-Authored-By, Codex 없음), src/ 변경은 pnpm build 통과 확인 후에만, 충돌·behind·훅 실패는 멈추고 보고 ; Haiku 5.5는 원 환경 2.1.293에서 400 오류(별칭·전체 ID·서브에이전트 모두, 2026-10-08) [확인중 : 2.1.295 재시험] ; 4.5 실호출 [확인중 : loginpi 첫 커밋 턴]
7. 취합·검토·승인(팀장) : teamanakin-admin = Opus · high ; 팀원(anakin_phase-*)이 1명 이상 실행된 턴은 생략 불가 마지막 단계(커밋 단독 턴은 제외 : 푸시 후 반려는 되돌릴 수 없고 commit 이 자체 중단 규칙을 가짐 ; 조회 단독 턴(수집 → 응답)도 제외 — 마스터 확정 2026-11-07), 승인·조건부 승인·반려 판정 ; 반려 시 anakin_phase-build 재작업 후 재승인 ; 승인 전제 = 루프 판정 PASS(4-1 — 파일을 바꾼 에이전트의 c4 원장 전부 Y, 원장 누락·N 미해결·device 외 BLOCKED = REJECTED, BLOCKED device = 최대 CONDITIONAL, 파일 변경 0건 = 판정 대상 없음), 등급 상한 = 결과 maxGrade(codex 판정 APPROVED 가능, claude-substitute 대체 판정 최대 CONDITIONAL — scripts/codex-verify.mjs 상수 maxGrade) ; 2026-10-22 정기 재평가(재배정안)도 담당

## 팀원별 주·보조 모델과 도구 (teamAnakin, 2026-10-08)

모델은 고정값이 아님 : 정의 파일 model 은 주 모델(기본값), 보조 모델은 메인이 Agent 호출 model 파라미터로 그 호출에만 지정(결정 순서 : 호출 model > 정의 model > CLAUDE_CODE_SUBAGENT_MODEL > 메인 ; 출처 code.claude.com/docs/en/sub-agents "Choose a model", 2026-10-08 확인, v2.1.251 이상 : 그 이전은 환경변수가 1순위) ; 정의 파일은 주 모델만 유지

1. anakin_phase-collect(수집) : 주 Sonnet·medium / 보조 Opus·medium ; 보조 조건 : 결과 첫 줄 미확인 건수가 요청 항목의 과반, 같은 턴 재수집, Sonnet 오류 ; 스킬·MCP 없음
2. anakin_phase-decide(결론) : 주 Fable·high / 보조 Opus·high ; 보조 조건 : API 종량제 사용자, fable 호출 오류, 재평가에서 Fable 재작업률이 Opus 이상 ; 스킬·MCP 없음(외부 SDK 근거는 공식 문서 확인)
3. (폐지 2026-11-10) 실행 검증 에이전트 — 실행 확인은 anakin_phase-build, Codex 판정은 SubagentStop 훅(4-2)
4. anakin_phase-review(문서 검수) : 주 Opus·high / 보조 Fable·high ; 보조 조건 : Opus 검수 통과 문서에 사용자 결함 지적 발생 시 다음 동종 문서부터 ; 스킬 humanizer(AI 문장 패턴 대조) ; MCP 없음
5. teamanakin-admin(팀장 : 취합·검토·승인, 정기 재평가) : 주 Opus·high / 보조 없음 ; 스킬·MCP 없음(점검 명령·대시보드 스크립트 2종)
6. anakin_phase-commit(커밋·푸시) : 주 Haiku 4.5(전체 ID) / 보조 없음 ; 스킬·MCP 없음
7. anakin_phase-build(산출, 2026-11-07 신설) : 주 Opus·high / 보조 [TBD : 재평가 후] ; 스킬은 필요 시 Skill 도구, MCP 없음
8. anakin_phase-graph(그래프 분석, 2026-11-08 신설) : 주 Sonnet·medium / 보조 [TBD : 재평가 후] ; 스킬·MCP 없음(생성기 scripts/request-graph.mjs)

- 스킬 사전 주입(skills: 필드)은 전원 미사용 : 위임 1회 사용량은 도구를 쓰지 않는 짧은 응답도 37,024~58,675 토큰(2026-10-08 원 환경 서브에이전트 완료 알림 usage 실측)이고 주입 본문이 여기에 더해짐, 600단어 이하 후보(karpathy-guidelines·verification-before-completion)는 CLAUDE.md 작업 원칙·정의 본문과 중복
- 스킬은 정의 본문에 "필요 시 Skill 도구로 호출" 문구로 지정(서브에이전트는 이 기준서를 읽지 않음)
- 플러그인 : 팀원 전원 플러그인 경유 도구 없음 ; MCP는 프로젝트 .mcp.json 등록분(playwright) ; 스킬 humanizer 는 프로젝트 .claude/skills/humanizer
- haiku 하향 보조는 미사용(별칭 400 오류) ; 예외는 commit 의 전체 ID Haiku 4.5 한정

## ultrathink 자동 부착 (2026-10-08)

- ultrathink는 effort 값을 바꾸지 않고 컨텍스트 지시만 더함(code.claude.com model-config "Use ultrathink", 2026-10-08 확인)
- 원 환경 실측(요청 257건, 2026-10-08) : 조회·운영 요청에서 Opus 5.5·Fable 5.1 모두 1차 수용률 상승 없이 소요 약 2배·재작업률 상승, 산출 요청은 수용률 차이 없음(Opus 5.5 n=6·7)
- 자동 부착 대상 : anakin_phase-decide(결론) 한정, SubagentStart 훅(.claude/hooks/model-advisor.mjs)이 깊은 추론 지시를 주입 ; 메인 세션·다른 팀원에는 부착하지 않음, 사용자가 직접 입력한 ultrathink는 그대로 유지

## 턴 진행 규칙

1. 요청을 받으면 [모델 단계 계획] 줄이 있으면 그 순서를 따르고, 없으면 위 단계 정의로 직접 판정
2. 진행 중 단계 성격이 바뀌면(예 : 산출 중 근거 부족 발견 → 수집, 비교 결과 결론 필요 → 결론) 그 시점에 해당 서브에이전트 호출 ; 계획에 없던 단계도 추가함
3. 서브에이전트 결과는 요약만 받고, 산출물 파일 작성은 anakin_phase-build 가 수행 ; 메인은 리뷰 목적으로만 산출물을 읽음
4. 단계가 한 개여도 작업이면 서브에이전트에 맡김(마스터 2026-11-07 : 쉬운 작업도 예외 없음) ; 응답만 있는 턴(설명·회신)은 메인
5. 산출 effort 는 anakin_phase-build 정의(high)가 정함 ; 훅의 /effort high 안내는 메인 effort 안내로 남아 있음 [TBD : 필요 여부 재평가]
6. 결론 단계 비중이 큰 작업이 세션 첫 요청이면 세션 자체를 claude --model fable 로 시작하는 선택지도 안내

## 출력 형식 : 턴 첫머리 한 줄

수행 단계 : <실제 수행한 단계 → 담당(모델·effort)> | 팀장 판정 : <APPROVED·CONDITIONAL·REJECTED 또는 "팀원 미실행"> | 사용자 입력 : <명령 또는 "변경 없음"> ; 계획과 다르게 수행한 단계는 사유 한 마디

## 따르지 않는 요청

- haiku 전환 : 원 환경 2.1.293에서 haiku 별칭 400 오류(2026-10-08 재현, [확인중 : 2.1.295 재시험]) ; 수집 단계는 Sonnet 사용
- effort low : 커밋 규칙·문서 표기 규칙(브랜드·i18n) 준수 위험 ; medium 사용
- 턴 중 /model 왕복 : 캐시 재작성 2회 ; 단계 서브에이전트로 대체
- 세션 중간 fast mode : 대화 전체 1회 미캐시 과금 ; 세션 시작 직후 /fast 만, headroom 경유 가용성 [확인중]

## 고정 사실

- 기본 모델 opus = Opus 5.5, 기본 effort medium (settings "model": "opus")
- 원 환경 실측(2026-10-08) : Opus 5.5 생성 속도 144 tok/s·1차 수용률 95.2%, Fable 5.1 85 tok/s·90.9%
- 서브에이전트 모델 결정 순서 : Agent 호출 model > 정의 model: > CLAUDE_CODE_SUBAGENT_MODEL > 메인 ; 정의 effort는 CLAUDE_CODE_EFFORT_LEVEL 환경변수를 덮어쓰지 못함(loginpi PC 미설정)
- 상태 표시 : 메인 상태줄에 메인 모델·💪effort와 진행 중 단계(▶ 단계 모델·effort)가 2초 주기로 갱신, 에이전트 패널 행마다 [단계] 에이전트 · 실제 모델 · effort · 경과 표시(.claude/subagent-statusline.mjs) ; 사용자에게 단계 전환을 따로 알릴 필요 없음
- 정의 파일(teamAnakin) : .claude/agents/teamAnakin/ 의 anakin_phase-collect·anakin_phase-decide·anakin_phase-review·anakin_phase-commit·anakin_phase-build·anakin_phase-graph·teamAnakin_admin(name teamanakin-admin)

## 재평가

2026-10-22 node scripts/my-claude-model-dashboard.mjs 재생성 후 모델 × effort 확인 ; Opus 5.5 high FEATURE 20건 이상에서 재작업률이 Fable 5.1 FEATURE 기준을 넘으면 산출 단계 FEATURE도 anakin_phase-decide 경유로 변경

## 공유·설치 (이 저장소 공동작업자 기준)

1. 저장소를 받으면 스킬·단계 에이전트·훅·상태줄이 함께 동작 : .claude/skills/anakin-skills/, .claude/agents/teamAnakin/, .claude/hooks/model-advisor.mjs, .claude/subagent-statusline.mjs, .claude/statusline.sh, .claude/settings.json(UserPromptSubmit·SubagentStart 훅, statusLine refreshInterval, subagentStatusLine)
2. 전제 : Claude Code 2.1.293 이상(loginpi 2.1.295 확인)(subagentStatusLine의 agentType), Node.js, Git Bash(statusline.sh), 단계 판정 정규식은 한국어 요청 기준
3. 팀 에이전트 8종(팀장 + 단계 7종)은 저장소에 포함(.claude/agents/teamAnakin/)
4. 비용 고지 : phase-decide는 Fable 고정 ; Fable 단가는 Opus 5.5의 2.5배(입력 10 대 4, 출력 50 대 20 USD/MTok ; docs.claude.com pricing 2026-10-06·08 확인, scripts/work-history-core.mjs PRICING) : API 종량제 사용자는 결론 단계마다 비용 증가, 원하지 않으면 anakin_phase-decide.md 의 model 을 opus 로 변경 ; 구독제 사용 한도 영향은 [확인중 : 공식 문서]
5. 대시보드 2종은 수동 실행(Stop 훅 미등록) : node scripts/my-claude-model-dashboard.mjs · node scripts/model-change-dashboard.mjs → work-statistics/mywork/(gitignore)
6. 저장소 밖 공개(플러그인·공개 저장소)는 미실시 : 개인 실측치·환경 의존 항목 분리 후 별도 결정
