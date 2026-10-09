# 등록 스킬·플러그인 목적별 분류

> 작성일: 2026-09-10 / 기준: 이 PC에 등록된 스킬 163개 + 스킬 형태가 아닌 플러그인·MCP·CLI 도구 9종
> 분류 원칙: 항목마다 **대표 목적 1개**에만 배정(중복 계산 없음), 관련 목적은 비고에 표기
> 출처 표기: 전역=`~/.claude/skills` / 커맨드=`~/.claude/commands/sc` / 내장=Claude Code 기본 / 플러그인=`claude plugin` 설치 / 프로젝트=`.claude/skills`
> 보유 목록·활용 실적 정본: 같은 폴더 `skill_목록.md`, 선정 절차: `~/.claude/rules/skill-routing.md`
> 2차 검토(2026-09-10): 문서 검수 외부 도구 3종(pandoc·LibreOffice·Poppler), 누락 에이전트 6종, 스킬 라우팅 운영 장치 추가 : 170 → 176 항목

## 0. 분류 요약

| # | 목적 분류 | 항목 수 | 핵심 항목 | 이 프로젝트(DR ISP·DA) 관련도 |
|---:|---|---:|---|---|
| 1 | 토큰·컨텍스트 절감(토큰 튜닝) | 11 | Headroom, ponytail, graphify, smart-explore, sc:index-repo | 중 : 긴 세션·대형 덱 작업 시 효과 |
| 2 | 모델 라우팅·비용·API | 8 | OmniRoute 5종, claude-api | 하 : 인프라 성격 |
| 3 | 기억·맥락 유지(세션 간 메모리) | 20 | recall/remember/lesson, claude-mem 코어, agentmemory | 상 : 규칙·판정 이력 누적 필수 |
| 4 | 업무 요약·이력 보고 | 13 | recap, handoff, session-history, timeline-report, weekly-digests, standup | 상 : 주간 보고·인수인계 |
| 5 | 디자인·시각화 | 20 | theme-factory, frontend-design, design-taste-frontend, awesome-design-md, image-to-code, dataviz, artifact-design | 상 : 장표 그림·차트 |
| 6 | 문서·장표 제작 | 18 | pptx, docx, xlsx, pdf, humanizer, doc-coauthoring, 검수 도구(pandoc·soffice·pdftoppm) | 최상 : 핵심 산출물 |
| 7 | 웹 아티팩트·앱 개발·브라우저 | 12 | web-artifacts-builder, web-design-guidelines, webapp-testing, agent-browser, claude-in-chrome, playwright MCP | 중 : 대시보드·검수 페이지 |
| 8 | 계획·요구분석·설계 | 13 | brainstorming, writing-plans, make-plan, sc:workflow, sc:design | 상 : 목표모델 설계 |
| 9 | 실행·오케스트레이션·자동 반복 | 15 | subagent-driven-development, do, sc:task, loop, schedule | 중 |
| 10 | 코드 품질·리뷰·검증 | 13 | code-review, verification-before-completion, TDD, ponytail-review, sc:test | 중 : 생성 도구(js)·SQL 검증 |
| 11 | 디버깅·문제 해결 | 4 | systematic-debugging, sc:troubleshoot | 중 |
| 12 | 코드베이스 이해·온보딩·설명 | 14 | understand 9종, learn-codebase, pathfinder, sc:explain | 중 |
| 13 | Git·릴리스·이슈 관리 | 6 | commit-context, sc:git, version-bump, oh-my-issues | 중 |
| 14 | 환경 설정·스킬 관리(메타) | 18 | update-config, find-skills, claude-code-setup, task-observer, writing-skills, 스킬 라우팅 운영 장치 | 중 |
| 15 | 조사·리서치·미디어 | 11 | sc:research, watch, deep-research | 상 : 고시·GTS·벤더 자료 조사 |
| 16 | DB 조사(Tibero) | 1 | tibero MCP (전용 스킬 없음) | 최상 : 공백 영역 |
| | **합계** | **191** | | |

---

## 1. 토큰·컨텍스트 절감 (토큰 튜닝)

| 항목 | 출처 | 용도 | 비고 |
|---|---|---|---|
| Headroom (플러그인 + `headroom` CLI 0.37.0) | 플러그인 headroom-marketplace / pipx | 도구 출력·로그·대화 이력을 로컬 프록시에서 압축해 LLM 전송 토큰 절감 | 프록시 연결(init/wrap) 보류 상태, 훅만 등록 |
| ponytail:ponytail | 플러그인 ponytail | 최소·최단 코드 강제(YAGNI) → 생성 코드·설명 토큰 절감 | SessionStart 훅으로 매 세션 자동 적용 |
| graphify (전역 스킬 + `graphify` CLI 0.9.65) | pipx graphifyy / `graphify install --platform claude` | 코드·문서를 tree-sitter 지식 그래프(graphify-out/)로 만들어 Grep·Glob 대신 그래프 조회로 파일 탐색 토큰 절감 | 2026-09-21 설치, 그래프 미생성·프로젝트 훅(PreToolUse) 미등록 — `/graphify .`와 `graphify install --project` 는 프로젝트별 결정 |
| ponytail:ponytail-review | 플러그인 ponytail | diff에서 과잉 설계 삭제 대상 지적 | 코드 품질과 겹침 |
| ponytail:ponytail-audit | 플러그인 ponytail | 저장소 전체 과잉 설계 감사 보고 | |
| ponytail:ponytail-debt | 플러그인 ponytail | `ponytail:` 주석을 부채 대장으로 수확 | |
| ponytail:ponytail-gain | 플러그인 ponytail | ponytail 절감 효과 점수판 표시 | |
| ponytail:ponytail-help | 플러그인 ponytail | ponytail 모드·명령 요약 카드 | |
| claude-mem:smart-explore | 플러그인 claude-mem | tree-sitter AST 기반 구조 검색으로 파일 전체 읽기 대체 | 코드 이해와 겹침 |
| sc:index-repo | 커맨드 | 저장소 인덱스로 컨텍스트 94% 절감(58K→3K) | |
| simplify | 내장 | 변경 코드의 재사용·단순화 정리 | 코드 품질과 겹침 |

## 2. 모델 라우팅·비용·API

| 항목 | 출처 | 용도 | 비고 |
|---|---|---|---|
| OmniRoute (`omniroute` CLI 3.8.51) | npm 전역 | 352개 프로바이더 통합 게이트웨이, 자동 폴백·로드밸런싱 | 서버 미기동, Claude Code 연결 안 함 |
| cli-setup | 전역 | OmniRoute 초기 설정·환경변수·자동시작 | |
| cli-providers | 전역 | 프로바이더 추가·테스트·키 순환·지표 | |
| cli-routing | 전역 | 라우팅 콤보 생성·폴백 체인·전략 테스트 | |
| cli-models | 전역 | 모델 카탈로그·별칭 조회 | |
| omni-combos-routing | 전역 | REST API로 19종 라우팅 전략 관리 | |
| claude-api | 내장 | Claude 모델 ID·가격·파라미터·캐싱 참조 | document-skills·example-skills에 동일 스킬 2벌 더 있음 |
| sc:select-tool | 커맨드 | 복잡도 점수로 MCP 도구 선택 | |

## 3. 기억·맥락 유지 (세션 간 메모리)

| 항목 | 출처 | 용도 | 비고 |
|---|---|---|---|
| Claude Code 자동 메모리 | 내장 | `MEMORY.md` 색인 + 파일 단위 기억(규칙·프로젝트·참조) | 현재 주력, 기록 15건 |
| agentmemory MCP (`@agentmemory/mcp`, localhost:3111) | MCP | 관찰 자동 수집·하이브리드 검색 서버 | recall/remember 계열의 백엔드 |
| recall | 전역 | 과거 관찰·세션·교훈 검색 | |
| remember | 전역 | 통찰·결정 장기 저장 | |
| lesson | 전역 | 정정 사항을 신뢰도 가중 교훈으로 저장 | 규칙 강화 이력에 적합 |
| forget | 전역 | 특정 관찰 확인 후 삭제 | |
| memory-discipline | 전역 | 작업 전 recall·결정 시 save 루프 | |
| agentmemory-agents | 전역 | 에이전트별 connect 설정 방법 | 문서형 |
| agentmemory-architecture | 전역 | 저장 모델·엔진 구조 설명 | 문서형 |
| agentmemory-config | 전역 | 환경변수·포트·기능 플래그 | 문서형 |
| agentmemory-hooks | 전역 | 자동 수집 훅 동작·디버깅 | 문서형 |
| agentmemory-mcp-tools | 전역 | MCP 도구 전체 맵 | 문서형 |
| agentmemory-rest-api | 전역 | HTTP REST API 표면 | 문서형 |
| claude-mem 플러그인 (훅 5종 + Bun 워커 127.0.0.1:37777 + MCP) | 플러그인 thedotmack | 매 도구 호출·턴 종료를 관찰로 저장, 2번째 세션부터 자동 주입 | 2026-09-10 설치, agentmemory와 역할 중복 |
| claude-mem:mem-search | 플러그인 claude-mem | 세션 간 기억 DB 자연어 검색 | |
| claude-mem:knowledge-agent | 플러그인 claude-mem | 관찰 기록으로 지식베이스 구축·질의 | |
| claude-mem:how-it-works | 플러그인 claude-mem | claude-mem 동작 원리 설명 | 문서형 |
| claude-mem:mode-creator | 플러그인 claude-mem | 도메인별 관찰 모드 생성·설치 | |
| claude-mem:cloud-sync | 플러그인 claude-mem | cmem.ai Pro 클라우드 동기화 설정 | 유료, OFF 상태 |
| claude-mem:ccs-align | 플러그인 claude-mem | 워커 상태 점검 주기 실행 | 운영 점검용 |

## 4. 업무 요약·이력 보고

| 항목 | 출처 | 용도 | 비고 |
|---|---|---|---|
| recap | 전역 | 최근 N개 세션 날짜별 요약 | "이번 주 뭐 했지" |
| session-history | 전역 | 과거 세션 타임라인 | |
| handoff | 전역 | 직전 세션 이어받기(미답 질문 우선) | 인수인계 |
| commit-context | 전역 | 파일·함수·줄 → 생성한 세션 역추적 | Git 관리와 겹침 |
| commit-history | 전역 | 세션 연계 커밋 목록 | Git 관리와 겹침 |
| claude-mem:timeline-report | 플러그인 claude-mem | 프로젝트 전체 개발 여정 서사 보고서 | |
| claude-mem:weekly-digests | 플러그인 claude-mem | 주 단위 연속 다이제스트 | 주간 보고 초안 |
| claude-mem:handoff | 플러그인 claude-mem | 다음 세션용 HANDOFF.md 생성(목표·현재 상태·수정 파일·실패 시도·다음 단계) | 2026-10-07 13.34.2에서 추가, 전역 handoff(직전 세션 이어받기)와 이름만 같고 용도 다름 |
| claude-mem:agent-cost-report | 플러그인 claude-mem | 기간별 에이전트 비용 보고서(HTML·PDF·CSV, 기본값 당일 제외 직전 7일) | 2026-10-07 13.34.2에서 추가, 토큰 비용은 OpenRouter 정가 적용 계산값(스킬 출력에 ESTIMATED 표기) |
| claude-mem:standup | 플러그인 claude-mem | 워크트리·브랜치·PR 간 변경 비교 스탠드업 | 읽기 전용 |
| sc:reflect | 커맨드 | 작업 회고·검증(Serena) | Serena MCP 미설치 시 제한 |
| sc:save | 커맨드 | 세션 컨텍스트 저장(Serena) | 동상 |
| sc:load | 커맨드 | 프로젝트 컨텍스트 로드(Serena) | 동상 |

## 5. 디자인·시각화

| 항목 | 출처 | 용도 | 비고 |
|---|---|---|---|
| theme-factory | 전역 | 슬라이드·문서·HTML에 10종 테마 적용·신규 테마 생성 | document-skills·example-skills에 동일 2벌, 실사용 2회 |
| frontend-design | 프로젝트 | 템플릿 티 나지 않는 UI 시각 방향·타이포 | 플러그인 frontend-design·document-skills·example-skills에 동일 3벌 |
| design | 내장 | 멀티 아트보드 디자인 캔버스 아티팩트(목업·포스터·원페이저) | 실사용 1회 |
| design-taste-frontend | 전역(skills.sh leonxlnx/taste-skill) | 템플릿 티 없는 랜딩·포트폴리오·리디자인, 감사 우선·사전 점검 | 2026-09-21 설치, "Taste" 스킬
| image-to-code | 전역(skills.sh leonxlnx/taste-skill) | 디자인 이미지를 먼저 생성·분석한 뒤 그대로 구현 | 2026-09-21 설치
| awesome-design-md | 전역(자작 래퍼, 원천 VoltAgent/awesome-design-md) | 74개 브랜드 DESIGN.md 토큰으로 UI 생성 | 2026-09-21 설치, 원천 저장소에 SKILL.md 없어 curl 래퍼로 작성
| artifact-design | 내장 | 아티팩트 작성 전 디자인 투자 수준 판단 | |
| artifact-diagramming | 내장 | 메커니즘을 보여주는 인라인 SVG 다이어그램 | 구성도·개념도 |
| dataviz | 내장 | 차트·대시보드 색상·형태·상호작용 기준 | 장표 차트 |
| document-skills:canvas-design | 플러그인 document-skills | 디자인 철학 기반 PNG·PDF 시각물 | example-skills에 동일 |
| document-skills:algorithmic-art | 플러그인 document-skills | p5.js 생성 예술 | 동상, 프로젝트 무관 |
| document-skills:brand-guidelines | 플러그인 document-skills | Anthropic 브랜드 색·타이포 적용 | 동상, 프로젝트 무관(NIA 규격과 충돌) |
| document-skills:slack-gif-creator | 플러그인 document-skills | Slack용 애니메이션 GIF | 동상, 프로젝트 무관 |
| claude-mem:design-is | 플러그인 claude-mem | Dieter Rams 10원칙 디자인 감사 | |
| understand-figma | 전역 | Figma 파일 → 디자인 지식 그래프 | Figma 미사용 |
| example-skills:frontend-design | 플러그인 example-skills | (프로젝트 것과 동일) | 중복 |
| example-skills:theme-factory | 플러그인 example-skills | (전역과 동일) | 중복 |
| example-skills:canvas-design | 플러그인 example-skills | (document-skills와 동일) | 중복 |
| example-skills:algorithmic-art | 플러그인 example-skills | (동일) | 중복 |
| example-skills:brand-guidelines / slack-gif-creator | 플러그인 example-skills | (동일) | 중복 2건 |

## 6. 문서·장표 제작

| 항목 | 출처 | 용도 | 비고 |
|---|---|---|---|
| document-skills:pptx | 플러그인 document-skills | .pptx 생성·읽기·수정·병합·템플릿 | 핵심, 실사용 1회, example-skills에 동일 |
| document-skills:docx | 플러그인 document-skills | Word 문서 생성·편집·추적변경 | 동상 |
| document-skills:xlsx | 플러그인 document-skills | 스프레드시트 읽기·수식·정리 | 요구사항 대비표 등 |
| document-skills:pdf | 플러그인 document-skills | PDF 추출·병합·OCR·양식 | 고시·GTS 원문 |
| document-skills:doc-coauthoring | 플러그인 document-skills | 제안서·기술 명세 공동 집필 워크플로 | |
| document-skills:internal-comms | 플러그인 document-skills | 상태 보고·공지·FAQ 사내 문서 | |
| humanizer | 전역 | 한국어 AI 문체 40패턴 제거 | 장표·보고서 문장 다듬기 |
| claude-mem:wowerpoint | 플러그인 claude-mem | 문서 1개 → NotebookLM풍 슬라이드 PDF | 캐주얼 스타일, 공식 장표 부적합 |
| sc:document | 커맨드 | 컴포넌트·API 문서 생성 | |
| example-skills:pptx / docx / xlsx / pdf | 플러그인 example-skills | (document-skills와 동일) | 중복 4건 |
| example-skills:doc-coauthoring / internal-comms | 플러그인 example-skills | (동일) | 중복 2건 |
| technical-writer (에이전트) | 에이전트 | 대상 독자별 기술 문서 작성 | |
| 문서 검수 도구 3종 : pandoc 3.11 · LibreOffice soffice 26.8 · Poppler pdftoppm 25.07 | 외부 CLI(winget) | docx·pptx·pdf 스킬이 요구하는 읽기(pandoc)·PDF 변환(soffice)·이미지 렌더(pdftoppm) 검수 경로 | 2026-09-10 설치, docx→PDF→JPG 파이프라인 검증 완료 |
| read-hwp | 전역 스킬 · skills.sh mouseco/k-gov-skills (12★, MIT) | HWP/HWPX/HWPML → Markdown/JSON 파싱·diff·양식 필드 추출·Markdown→HWPX 역변환(kordoc, npx 자동) | 2026-09-28 설치, 공공기관 HWP 회신 자료 읽기 |
| hwpx-mouseco | 전역 스킬 · k-gov-skills | 공공문서 HWPX 보고서 양식 분석·작성·검증(report JSON → HWPX, .hwp 바이너리 편집 제외) | 2026-09-28 설치 |
| official-report-skillset | 전역 스킬 · k-gov-skills | 공공기관 결과·계획·검토 보고, 결재문서 초안(목차 단순화·주요 내용 묶음) | 2026-09-28 설치 |
| gov-meeting-minutes | 전역 스킬 · k-gov-skills | 회의 메모·ClovaNote 전사 → 1쪽 요약 + 상세 발언록 공문서형 PDF | 2026-09-28 설치 |
| trip-expense-hwp | 전역 스킬 · k-gov-skills | 출장비 정산서 HWP + 영수증 PNG/PDF ZIP 패키지(transport-receipt-collector 연계) | 2026-09-28 설치, 본 프로젝트 관련도 하 |

## 7. 웹 아티팩트·앱 개발·브라우저

| 항목 | 출처 | 용도 | 비고 |
|---|---|---|---|
| document-skills:web-artifacts-builder | 플러그인 document-skills | React·Tailwind·shadcn 다중 컴포넌트 아티팩트 | example-skills에 동일 |
| artifact-capabilities | 내장 | 아티팩트 런타임 기능(DB·사용자·파일 저장) | |
| document-skills:webapp-testing | 플러그인 document-skills | Playwright로 로컬 웹앱 검증·스크린샷 | 동상 |
| claude-in-chrome | 내장 | 사용자 Chrome 세션 자동화 | 실사용 1회 |
| agent-browser | 전역(skills.sh vercel-labs/agent-browser) | 헤드리스 브라우저 CLI(탐색·폼·스크린샷·추출·Electron 앱) | 2026-09-21 설치, CLI 0.38.1 + Chrome 153 (~/.agent-browser)
| web-design-guidelines | 전역(skills.sh vercel-labs/agent-skills) | UI 코드를 Web Interface Guidelines 기준으로 검수(접근성·UX) | 2026-09-21 설치
| playwright MCP (`mcp__playwright__*`) | MCP | 헤드리스 브라우저 조작·스냅샷 | |
| run | 내장 | 프로젝트 앱 실행·변경 확인 | |
| sc:build | 커맨드 | 빌드·패키징·오류 처리 | |
| document-skills:mcp-builder | 플러그인 document-skills | MCP 서버 제작 가이드 | example-skills에 동일, 메타와 겹침 |
| example-skills:web-artifacts-builder / webapp-testing / mcp-builder | 플러그인 example-skills | (동일) | 중복 3건 |
| frontend-architect (에이전트) | 에이전트 | 접근성·성능 중심 UI 설계 | |

## 8. 계획·요구분석·설계

| 항목 | 출처 | 용도 | 비고 |
|---|---|---|---|
| brainstorming | 전역 | 창작 작업 전 의도·요구·설계 탐색(필수 선행) | |
| writing-plans | 전역 | 명세 → 다단계 구현 계획 | |
| executing-plans | 전역 | 작성된 계획을 검토 체크포인트와 함께 실행 | 실행과 겹침 |
| claude-mem:make-plan | 플러그인 claude-mem | 문서 탐색 포함 단계별 구현 계획 | writing-plans와 유사 |
| sc:brainstorm | 커맨드 | 소크라테스식 요구 발견 | brainstorming과 유사 |
| sc:workflow | 커맨드 | PRD → 구조화 구현 워크플로 | `docs/PRD_TOBE.md` 활용 가능 |
| sc:design | 커맨드 | 아키텍처·API·인터페이스 설계 명세 | 목표 아키텍처 초안 |
| sc:estimate | 커맨드 | 개발 규모 산정 | |
| sc:spec-panel | 커맨드 | 다중 전문가 명세 리뷰 | |
| sc:business-panel | 커맨드 | 경영 전략 전문가 패널 분석 | business-panel-experts 에이전트와 짝 |
| requirements-analyst (에이전트) | 에이전트 | 모호한 요구 → 구체 명세 | |
| Plan (에이전트) | 에이전트 | 구현 전략 설계 | 플랜 모드 기본 |
| system-architect / backend-architect / business-panel-experts (에이전트) | 에이전트 | 확장성 중심 시스템 설계 · 데이터 무결성 중심 백엔드 설계 · 경영 전략 다중 전문가 패널 | sc:design·sc:business-panel과 짝 |

## 9. 실행·오케스트레이션·자동 반복

| 항목 | 출처 | 용도 | 비고 |
|---|---|---|---|
| subagent-driven-development | 전역 | 독립 태스크를 서브에이전트로 실행 | |
| dispatching-parallel-agents | 전역 | 독립 작업 2개 이상 병렬 분배 | |
| using-git-worktrees | 전역 | 격리 작업공간 확보 | |
| claude-mem:do | 플러그인 claude-mem | 단계별 계획을 서브에이전트로 실행 | executing-plans와 유사 |
| sc:task | 커맨드 | 복잡 작업 워크플로 관리·위임 | |
| sc:spawn | 커맨드 | 메타 작업 분해·위임 | |
| sc:implement | 커맨드 | 페르소나 자동 활성 기능 구현 | |
| sc:pm | 커맨드 | 서브에이전트 조정 PM 에이전트 | |
| sc:agent | 커맨드 | 조사·구현 세션 컨트롤러 | |
| sc:sc | 커맨드 | SuperClaude 명령 디스패처 | |
| loop | 내장 | 프롬프트·명령 주기 반복 | |
| schedule | 내장 | 클라우드 예약 에이전트(cron) | |
| workflow-authoring | 내장 | Workflow 스크립트 작성 참조 | 사용자 opt-in 필요 |
| claude-mem:babysit | 플러그인 claude-mem | PR 병합 준비까지 감시 | 리뷰와 겹침 |
| general-purpose / Explore (에이전트) | 에이전트 | 범용 다단계 위임 · 읽기 전용 광역 탐색(결론만 회수해 본 컨텍스트 보호) | 토큰 보호 규칙의 격리 실행 수단 |

## 10. 코드 품질·리뷰·검증

| 항목 | 출처 | 용도 | 비고 |
|---|---|---|---|
| code-review | 내장 | diff·PR 정확성 버그·정리 리뷰 | ultra 모드는 클라우드 다중 에이전트 |
| verification-before-completion | 전역 | 완료 주장 전 실행 증거 확보 | 프로젝트 "실행 확인 없이 완료 금지" 규칙과 일치 |
| test-driven-development | 전역 | 구현 전 테스트 작성 | |
| karpathy-guidelines | 전역 | LLM 코딩 실수 방지 4원칙 | 프로젝트 CLAUDE.md에 번안 반영됨 |
| requesting-code-review | 전역 | 완료·병합 전 리뷰 요청 | |
| receiving-code-review | 전역 | 리뷰 피드백 기술적 검증 후 반영 | |
| security-review | 내장 | 보안 리뷰 | |
| sc:test | 커맨드 | 커버리지 포함 테스트 실행 | |
| sc:improve | 커맨드 | 품질·성능·유지보수성 개선 | |
| sc:cleanup | 커맨드 | 죽은 코드 제거·구조 정리 | |
| sc:analyze | 커맨드 | 품질·보안·성능·아키텍처 종합 분석 | |
| python-expert (에이전트) | 에이전트 | SOLID·보안·성능 기준 Python 코드 | 프로젝트 도구는 JS 위주라 활용도 낮음 |
| quality-engineer / security-engineer / self-review / refactoring-expert / performance-engineer (에이전트) | 에이전트 | 전문 관점 리뷰 5종 | |

## 11. 디버깅·문제 해결

| 항목 | 출처 | 용도 | 비고 |
|---|---|---|---|
| systematic-debugging | 전역 | 버그·실패 시 수정 전 체계적 원인 조사 | |
| sc:troubleshoot | 커맨드 | 코드·빌드·배포 문제 진단 | |
| root-cause-analyst (에이전트) | 에이전트 | 가설 검증 기반 근본 원인 분석 | |
| claude-mem:what-the | 플러그인 claude-mem | 기술 내용을 쉬운 말로 풀이 | 설명과 겹침 |

## 12. 코드베이스 이해·온보딩·설명

| 항목 | 출처 | 용도 | 비고 |
|---|---|---|---|
| understand | 전역 | 코드베이스 → 대화형 지식 그래프 | |
| understand-chat | 전역 | 지식 그래프로 코드 질의 | |
| understand-dashboard | 전역 | 지식 그래프 웹 대시보드 | |
| understand-diff | 전역 | diff·PR 영향 컴포넌트·리스크 분석 | |
| understand-domain | 전역 | 업무 도메인 흐름 그래프 추출 | DR 업무 도메인 정리에 응용 가능 |
| understand-explain | 전역 | 파일·함수·모듈 심층 설명 | |
| understand-knowledge | 전역 | LLM 위키 지식베이스 그래프화 | `docs/`·`guide/` 구조화에 응용 가능 |
| understand-onboard | 전역 | 신규 참여자 온보딩 가이드 생성 | 인수인계 문서 |
| sc:explain | 커맨드 | 코드·개념 교육적 설명 | |
| sc:index | 커맨드 | 프로젝트 문서·지식베이스 생성 | |
| claude-mem:learn-codebase | 플러그인 claude-mem | 저장소 전 파일 선행 학습(약 5분) | |
| claude-mem:pathfinder | 플러그인 claude-mem | 기능별 플로차트·중복 관심사 식별 | |
| learning-guide / socratic-mentor / repo-index (에이전트) | 에이전트 | 학습형 설명·저장소 브리핑 | |
| sc:README | 커맨드 | SuperClaude 명령 안내 문서 | 문서형 |

## 13. Git·릴리스·이슈 관리

| 항목 | 출처 | 용도 | 비고 |
|---|---|---|---|
| finishing-a-development-branch | 전역 | 구현 완료 후 통합 방식 결정 | |
| sc:git | 커맨드 | 지능형 커밋 메시지·워크플로 | 프로젝트 `rules/git-rules.md`(한국어 커밋) 우선 |
| claude-mem:version-bump | 플러그인 claude-mem | 플러그인 시맨틱 버전·릴리스 | 플러그인 개발 전용 |
| claude-mem:oh-my-issues | 플러그인 claude-mem | GitHub 이슈 백로그 근본원인별 군집화 | |
| devops-architect (에이전트) | 에이전트 | 인프라·배포 자동화 | |
| (commit-context · commit-history) | 전역 | 4절 참조 | 이력 보고에 배정 |

## 14. 환경 설정·스킬 관리 (메타)

| 항목 | 출처 | 용도 | 비고 |
|---|---|---|---|
| prompt-master | 전역(skills.sh nidhinjs/prompt-master, 13.4K★) | 대상 AI 도구(LLM·Cursor·Midjourney 등)별 최적 프롬프트 1개 생성·개선, 사용자가 명시 요청할 때만 활성 | 2026-09-21 설치 |
| update-config | 내장 | settings.json 훅·권한·환경변수 | 실사용 1회 |
| keybindings-help | 내장 | 단축키 커스터마이즈 | |
| fewer-permission-prompts | 내장 | 읽기 전용 명령 허용목록 생성 | 오늘 차단 사례에 직접 유효 |
| init | 내장 | CLAUDE.md 초기화 | |
| claude-code-setup:claude-automation-recommender | 플러그인 claude-code-setup | 코드베이스 분석 → 훅·스킬·MCP·서브에이전트 추천 | 2026-09-10 설치, 읽기 전용 |
| find-skills | 프로젝트 | skills.sh 스킬 탐색·설치 | 실사용 1회 |
| writing-skills | 전역 | 스킬 작성·검증 | |
| document-skills:skill-creator | 플러그인 document-skills | 스킬 생성·평가·설명 최적화 | example-skills에 동일 |
| task-observer | 전역 | 작업 관찰 → 스킬 개선 후보 로그 | 2026-09-10 설치, 전역 CLAUDE.md 활성화 블록 연결 |
| using-superpowers | 전역 | 대화 시작 시 스킬 탐색·호출 원칙 | 항상 적용 |
| write-agentmemory-skill | 전역 | agentmemory 스킬 하우스 포맷 | |
| sc:help | 커맨드 | /sc 명령 목록 | |
| sc:recommend | 커맨드 | 입력에 맞는 SuperClaude 명령 추천 | 라우팅 지침과 겹침 |
| claude-code-guide / statusline-setup / pm-agent (에이전트) | 에이전트 | Claude Code 사용법 안내·상태줄 설정·자기개선 기록 | |
| ide MCP (`mcp__ide__*`) | MCP | VS Code 진단·코드 실행 | |
| example-skills:skill-creator | 플러그인 example-skills | (동일) | 중복 |
| example-skills:claude-api | 플러그인 example-skills | (내장과 동일) | 중복, 2절 참조 |
| 스킬 라우팅 운영 장치 : `~/.claude/rules/skill-routing.md` + UserPromptSubmit 훅 + 상태표시줄 🧩 표시 | 전역 설정 | 매 요청 스킬 전수 검토·첫 줄 `활용 스킬:` 표기 강제, 상태표시줄에 직전 지시의 실제 Skill·MCP 호출 순차 표시 | 2026-09-10 신설, 준수율은 skill_목록.md 재집계로 점검 |

## 15. 조사·리서치·미디어

| 항목 | 출처 | 용도 | 비고 |
|---|---|---|---|
| agent-reach (전역 스킬 + `agent-reach` CLI 1.5.0) | skills.sh panniantong/agent-reach (83.8K★) / pipx | API 키 없이 16개 플랫폼(GitHub·YouTube·Reddit·X·RSS·임의 웹) 검색·읽기 CLI, `agent-reach doctor`로 채널 상태 확인 | 2026-09-21 설치, 5/16 채널 활성(gh CLI·mcporter+Exa 미설치), 설명문이 중국어·"MUST USE" 트리거라 sc:research 와 충돌 주의 |
| sc:research | 커맨드 | 적응형 계획 기반 심층 웹 리서치 | 고시·GTS·벤더 자료 |
| watch | 전역 | 영상 다운로드·프레임·자막 분석 | 실사용 2회 |
| deep-research / deep-research-agent (에이전트) | 에이전트 | 외부 지식 수집 전문 | |
| deep-research-pro | 전역 스킬 · k-gov-skills | 출처 등급·PDF 확인·반대검토·쟁점까지 정리하는 판단 브리프(OpenClaw 맞춤, web_search/pdf/korean-law 도구 사용) | 2026-09-28 설치, 조사 1순위는 sc:research 유지·공공 근거조사 보조 |
| korean-law-search | 전역 스킬 · k-gov-skills | 법령 조회(korean-law-mcp 우선, 법망 폴백) | 부속 `korean-law-mcp` 4.14.2 전역 설치 완료(2026-09-28), 법제처 `LAW_OC` 키 사용자 등록 대기 — 고시·법령 조문 확인 시 후보 |
| kosis-stats / public-data-finder / g2b-bid-search / national-assembly-tracker / alio | 전역 스킬 · k-gov-skills | KOSIS 통계·공공데이터포털·나라장터 입찰·국회 의안·ALIO 경영공시 Open API 조회 | 각 API 키 필요(KSKILL_KOSIS_API_KEY·DATA_GO_KR_API_KEY·NARAJANGTEO_SERVICE_KEY·OPEN_ASSEMBLY_API_KEY, `~/.config/k-skill/secrets.env`), 본 프로젝트 관련도 하 |
| transport-receipt-collector | 전역 스킬 · k-gov-skills | 하이패스·코레일·SRT 영수증 수집(playwright, 개인 계정 필요) | 2026-09-28 설치, 관련도 하 |

## 16. DB 조사 (Tibero)

| 항목 | 출처 | 용도 | 비고 |
|---|---|---|---|
| tibero MCP (`mcp__tibero__*`) | MCP | 로컬 Tibero 7 질의 실행 | 이번 세션 연결 실패(CONNECTION_CLOSED), 라이선스 2026-09-03 만료 확인 필요 |
| korean-law MCP (`mcp__korean-law__*`, remote) | 프로젝트 `.mcp.json` · https://korean-law-mcp.fly.dev/mcp (chrisryugj/korean-law-mcp 4.14.2) | 법제처 법령·행정규칙(고시)·판례 조회, LAW_OC 키 불요 | 2026-09-28 등록, initialize 응답 확인(HTTP 200). 로컬 CLI `korean-law`는 LAW_OC 등록 후 사용 |

전용 스킬이 없는 공백 영역. SQL 작성 규칙은 프로젝트 `rules/code-style.md` SQL 절이 대신하며, 필요 시 `<용도>_추출쿼리_for_티베로.sql` 패턴을 스킬화 검토

---

## 17. 정리 후보 (중복·무관)

| 구분 | 내용 | 조치 안 |
|---|---|---|
| 완전 중복 17건 | example-skills 플러그인의 17개 스킬은 document-skills 플러그인과 파일 단위로 동일 | 둘 중 하나 비활성화(`claude plugin disable example-skills@anthropic-agent-skills`) 시 스킬 목록 17개 감소 |
| 동명 3벌 | theme-factory(전역·document·example), frontend-design(프로젝트·플러그인·document·example), claude-api(내장·document·example), skill-creator(document·example) | 전역·프로젝트·내장 하나만 남기는 방향 |
| 메모리 3중 | Claude Code 자동 메모리 + agentmemory + claude-mem | 한 분기 운영 후 실사용 기준으로 하나로 수렴 |
| 프로젝트 무관 | algorithmic-art, slack-gif-creator, brand-guidelines(Anthropic 브랜드), understand-figma, wowerpoint, version-bump | 삭제 불필요(호출 전 비용 없음), 라우팅 표에서만 제외 |
| 미설치 의존 | sc:load·sc:save·sc:reflect는 Serena MCP 전제 | Serena 미설치면 사용 불가로 표시 |
