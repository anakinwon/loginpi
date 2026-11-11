---
name: anakin_arch_4_claude
description: loginpi 에서 만든 Claude Code 작업 아키텍처(5단계 엔지니어링 프롬프트 → 컨텍스트 → 하네스 → 루프 → 그래프, 요청 흐름 그래프 HTML + Obsidian md 노드, 파일을 바꾼 서브에이전트만 받는 Codex 루프 판정, teamAnakin 단계 에이전트, 훅 4종, 결정적 커밋 검사)를 설명하고 적용·이식할 때 쓴다. "엔지니어링 아키텍처 적용·이식", "5단계 엔지니어링", "요청 흐름 그래프", "그래프 엔지니어링 with obsidian", "Codex 루프 판정", "새 프로젝트에 하네스 구성", "anakin_arch_4_claude" 같은 요청, 또는 이 저장소의 훅·생성기·판정 규칙이 왜 이렇게 생겼는지 물을 때 이 스킬을 쓴다.
---

# anakin_arch_4_claude — Claude Code 작업 아키텍처

> 작성 2026-11-10(마스터 지시 "요청한 엔지니어링 아키텍처를 skill로 구성해 줘! 5단계 엔지니어링과 그래프 엔지니어링 with obsidian, Codex검증").
> 갱신 2026-11-11 — 간소 절차, 묶음 판정 코드 삭제, 셸 2차 귀속 실행 시각 조건, 연관 군집 `-pN` 분할, 그래프 면제·이어받은 원장·상세 창 접기 반영.
> 이 스킬은 **요약과 지도**다. 규칙 정본은 저장소 파일이고, 서로 다르면 정본이 이긴다(우선순위 : 루트 `CLAUDE.md` → `.claude/engineering/10. prompt/anakins_prompt.md` 0절 → 각 장표, Codex 세부는 `codex_procedure.md`).
> 상수·조건 같은 세부 값은 바뀔 수 있다 — 이식·수정 전에 해당 파일 머리 주석과 시험을 직접 확인한다.

## 1. 아키텍처 개요

```
마스터(사람) ── 요청 ──▶ 메인 = 파다완 아소카(Opus) : 지명·브리프·리뷰·승인만, 직접 작업 금지
                              │
   ┌──────────── 5단계 엔지니어링(설계 관점, 정본 .claude/engineering/10~50) ────────────┐
   │ 10 프롬프트 → 20 컨텍스트 → 30 하네스 → 40 루프 → 50 그래프                          │
   │ (지시 한 건)   (보는 토큰)    (모델 밖 강제)  (되돌림 엣지)  (노드·엣지·파일 흐름)     │
   └───────────────────────────────────────────────────────────────────────────────┘
                              │ 실행
   teamAnakin 단계 에이전트(.claude/agents/teamAnakin/)
     collect(Sonnet) · decide(Fable) · build(Opus) · review(Opus) · graph(Sonnet)
     · commit(Haiku 4.5) · teamanakin-admin(Opus, 팀장 승인)
                              │ 강제(결정적)
   훅 4종 : model-advisor(단계 계획 주입) · codex-gate(Codex 루프 판정)
           · turn-gate(종료 승인 줄 기록기, 비차단) · push-guard(git push 차단)
   커밋 검사 : scripts/precommit-check.mjs(Codex 없음)
                              │ 판정(외부)
   Codex 검증 = 루프에만 : 파일을 바꾼 에이전트 → 원장 c4-<주제>-<agentId 앞 6자>
                          하네스 파일 변경도 같은 원장(계약 AC-4)로 흡수
                              │ 관측
   그래프 엔지니어링 : scripts/request-graph.mjs → 요청 흐름 그래프 HTML
                      + Obsidian md 노드(볼트 루트 .claude/engineering)
```

요청 흐름 그래프의 칸(설계도 9칸, 생성기 `SLOT_MAP`) :

```
1 마스터 아나킨 요청
└ 1.1 파다완 아소카 접수
  ├ 1.1.1 SA-프롬프트
  ├ 1.1.2 SA-컨텍스트      (collect)
  ├ 1.1.3 SA-하네스
  ├ 1.1.4 SA-루프          (build)
  │  └ 1.1.4.1 CDX-루프 검수   ← 유일한 Codex 칸
  └ 1.1.5 SA-그래프        (graph)
1.2 파다완 아소카 승인     (teamanakin-admin)
```

## 2. 현재 정본 규칙 — 2026-11-10 마스터 확정 · 2026-11-11 보완

**Codex 판정 범위**
1. 프롬프트·컨텍스트·그래프·총괄 Codex 판정 **제거**, 루프 **유지**, 하네스는 루프에 **흡수**(원문 "프롬프트+컨텍스트+그래프+총괄=>제거, 루프 유지+하네스는 루프에 흡수").
2. **파일을 바꾼 에이전트만** c4 판정 — SubagentStop 훅이 자동 실행. 비대상(`NO_GATE`) = collect·decide·review·graph·commit·teamanakin-admin + 파일 변경 0건 실행.
3. **turn-gate 는 차단하지 않고 기록만** — 응답 끝 `종료 승인 : <승인|보류> — <근거>` 줄을 `.omc/state/codex-gate/approvals.jsonl` 에 적고 항상 종료 0.
4. **커밋은 결정적 스크립트로 검사** — `node scripts/precommit-check.mjs --commit`(금지 경로·5MB·추가 줄 비밀·Co-Authored-By).

**그래프 표시**
5. CDX 칸은 **CDX-루프(1.1.4.1) 하나**뿐.
6. **SA·CDX 쌍 배치** — CDX = 짝 SA 의 자식. 세로 = SA 바로 아래 오른쪽 들여쓰기, 가로 = SA 바로 오른쪽.
7. **순차 연결** — 보이는 칸을 시작 → 1 → 1.1 → SA → 짝 CDX → 다음 SA … → 승인 → 종료로 끝까지 잇는다. CDX 가 Y 가 아니어도 선은 잇고 그 칸에 N·'⚠ 검증 누락'만 표시.
8. **에이전트는 칸 안 줄** — 독립 노드로 그리지 않는다(collect = SA-컨텍스트, build = SA-루프, graph = SA-그래프, admin = 승인 칸, 그 밖 = 1.1 접수).
9. **되돌림이 1회라도 있으면 루프 칸 표시** — 루프 쌍 = c4 판정 1회 이상 OR 파일 변경 실행 OR N 1회 이상 OR 반복.
10. **SA-프롬프트 칸 = 요청 원문 축약**(새 문장 없음, 태그 블록 제거·글자 수 초과 '…').
11. **SA-컨텍스트 칸 = 전·후·좌우·요점 내용 줄**(구획 제목 '전'·'후'·'좌우' 없음, 얇은 구분선만).
12. **SA-하네스 칸 = 도구를 시각순으로**('HH:MM:SS 도구 [주체]', 연속 묶음 'a~b 도구 ×k', 입력값 비노출).
13. **세로 모드 배치** — 시작 = 1번 칸 왼쪽(같은 행), 승인 칸 = 맨 아래 정중앙, 종료 = 승인 칸 왼쪽.
14. **총괄승인 칸 없음** — 1.1.5.2 '총괄승인' 칸은 2026-11-10 마스터 "총괄승인 칸 삭제하고, 볼트는 루트로 정리해 줘" 로 삭제(실행 기록 runs.jsonl 도 폐지). 그래프 갱신 = 훅 자동, 최종 종료 승인 = 1.2.
15. **면제 = 'Y(면제)'** — 열린 결함이 전부 근거 있게 면제된 FAIL 원장은 'Y(면제)'로 그리고, 근거를 확인할 수 없으면 FAIL 유지 — 정본: `request-graph.mjs` `waiverOf`, `codex_procedure.md` 13절 9항(면제 기록).
16. **이어받은 원장** — 같은 에이전트가 다음 요청까지 이어 처리한 c4 원장의 판정 결과를 앞 요청 CDX-루프 칸에도 반영한다('이어받은 원장'·'최종 판정 이어받음') — 정본: `request-graph.mjs` `buildRequestGraph` 이어받은 원장 주석.
17. **오른쪽 상세 창 접기(폴더블)** — 토글로 접고 펼치며 접힘 상태를 저장한다 — 정본: `request-graph.mjs` `setFold`(노드 상세 패널 접기 주석).

**폐지(이력) — 다시 만들지 않는다**
- 검증 단계 에이전트 `anakin_phase-verify`(2026-11-10 폐지 — Codex 실행 주체 = 훅).
- 칸별 판정 c1 프롬프트·c2 컨텍스트·c3 하네스(→ c4 AC-4)·c5 그래프·c6 총괄·커밋·승인(2026-11-09 도입 → 2026-11-10 폐지).
- 턴 묶음 판정(`c<N>-turn-…`·`bundle-turn-…`)과 턴 끝 차단(2026-11-10 폐지). 과거 원장 폴더는 보존하고 그래프 집계에서만 뺀다.
- 그래프의 ⛔ 정지 표지·'차단 후 실행 · 게이트 위반' 배지, SA-컨텍스트 구획 제목.

## 3. 턴 흐름

훅 `model-advisor.mjs` 가 요청문을 분류해 `[모델 단계 계획]` 한 줄을 넣고, 메인은 그 순서로 지명한다.

| 턴 종류 | 단계 순서(담당 · 모델) |
|---|---|
| 산출(FEATURE·FIX·REFACTOR·DOCS·DATA·CONFIG) | (수집 collect · Sonnet) → (결론 decide · Fable) → 산출 build · Opus → **Codex 루프 판정(훅 자동, 파일 변경 시만)** → (검수 review · Opus — DOCS 면 필수) → 그래프 분석 graph · Sonnet → 취합·승인 teamanakin-admin · Opus(간소 절차면 이 둘 생략) → 종료 승인 줄(메인, 기록용) |
| 조회 단독(QUERY) | 수집 collect · Sonnet → 응답 메인 → 종료 승인 줄 (팀장 승인 생략) |
| 결론 단독 | 결론 decide · Fable → 취합·승인 admin → 응답 메인 → 종료 승인 줄 |
| 커밋 단독(GIT) | 커밋 commit · Haiku 4.5(`precommit-check --commit`) → 응답 메인 → 종료 승인 줄 (팀장 승인 생략, push 는 마스터) |

괄호 단계는 요청문에 수집·결론 신호가 있을 때만. 판정 결과(종료 0 PASS / 1 FAIL / 2 BLOCKED)는 메인의 다음 도구 호출·요청 때 `[CDX 자동 판정]` 으로 온다.
**PASS 전 다음 단계 진행 금지**, FAIL = 그 에이전트에 회송(같은 원장 다음 회차, 상한 5회), BLOCKED = 사유 해소 후 재실행. 승인 전제 = c4 원장 전부 Y(간소 절차 턴은 아래 참조).
인증·결제·페이지 변경은 Pi Browser 실기기 미검증이면 최대 CONDITIONAL.

**간소 절차** — 소규모 변경(하네스·문서·일반 앱 파일 — 제외 경로는 정본)은 조건 ①~⑤ 전부 충족 시 c4 PASS 뒤 그래프 분석·팀장 승인 생략 — 정본: 루트 `CLAUDE.md` teamAnakin 트리거, `.claude/hooks/model-advisor.mjs` `LITE_RULE`.

## 4. 사용법

### (a) 이 저장소에서

| 할 일 | 명령 |
|---|---|
| 요청 흐름 그래프 실데이터판 + 요청별 md | `node scripts/request-graph.mjs --md` (기본 출력 `work-statistics/mywork/myRequestGraph.html`, md `.claude/engineering/50. graph/requests/` — 둘 다 gitignore) |
| 설계도판 + 슬롯 md(커밋 대상) | `node scripts/request-graph.mjs --design-only --md` |
| 훅 자체 시험 | `node .claude/hooks/model-advisor.mjs --selftest` · `node .claude/hooks/codex-gate.mjs --selftest` · `node .claude/hooks/turn-gate.mjs --selftest` · `node .claude/hooks/push-guard.mjs --selftest` |
| 래퍼 자체 시험 | `node scripts/codex-verify.mjs --selftest` |
| 회귀 시험 전체 | `pnpm test` (= `node --test test/**/*.test.mjs` — codex-gate·codex-verify·precommit-check·request-graph·turn-gate·work-history·request-resume) |
| 커밋 검사 | `node scripts/precommit-check.mjs` (검사만) / `… --commit < 메시지` (통과 시 커밋) |
| Codex 판정 래퍼 | `scripts/codex-verify.mjs --init` → `--confirm-real` — **사람·Claude 가 직접 실행하지 않는다.** SubagentStop 훅 `codex-gate.mjs` 만 실행한다. 시험은 가짜 판정자 env `CODEX_JS` 대역 |
| push 해제(마스터만) | `! node .claude/hooks/push-guard.mjs --allow [분] [원격] [브랜치]` |

### (b) 다른 프로젝트에 이식

순서 요약(상세 = [references/porting-guide.md](references/porting-guide.md)) :
1. Node 22 이상·git·Codex CLI(`npm i -g @openai/codex` + 마스터 `! codex login`) 준비, Obsidian 은 선택.
2. 훅·스크립트·에이전트·정본 문서·시험 파일을 복사(목록은 이식 가이드 1절).
3. `.claude/settings.json` 에 훅 등록 조각을 합친다(이식 가이드 2절).
4. `.gitignore` 에 `.omc/*`·`work-history/`·`work-statistics/`·`.claude/engineering/**/.obsidian/`·`requests/` 추가.
5. selftest → `pnpm test`(또는 `node --test`) → 가짜 판정자로 codex-gate 시험 → 실호출 1회 순으로 켠다.
6. 프로젝트 규칙(빌드 관문·브랜드·DA 등)은 에이전트 정의와 래퍼의 규칙 발췌에서 바꾼다.

## 5. 원본 구현 파일 지도

| 경로 | 역할 |
|---|---|
| `.claude/engineering/00. index.md` | Obsidian 볼트 목차(MOC) — 정본 5종·역할 노드 링크 |
| `.claude/engineering/10. prompt/anakins_prompt.md` | 10 프롬프트 정본 + 메인 운영 규칙 0절(최우선) |
| `.claude/engineering/20. context/anakins_context.md` | 20 컨텍스트 정본(계층 지도·인계 메모) |
| `.claude/engineering/30. harnes/anakins_harnes.md` | 30 하네스 정본(훅·권한·MCP·정의·격리·관측) |
| `.claude/engineering/40. loop/anakins_loop.md` | 40 루프 정본(되돌림·상한·멈춤) |
| `.claude/engineering/40. loop/codex_procedure.md` | Codex 호출 절차 정본(13절 = 현행 루프 판정) |
| `.claude/engineering/50. graph/anakins_graph.md` | 50 그래프 정본(B-6 요청 흐름 그래프 표시 규칙) |
| `.claude/engineering/50. graph/request-flow/` | 설계 슬롯 md(생성기 산출, 손 수정 금지) |
| `.claude/engineering/60. nodes/` | 역할 노드 카드(Obsidian 그래프 뷰용) |
| `.claude/hooks/model-advisor.mjs` | UserPromptSubmit — 단계 계획 주입, decide 시작 때 ultrathink 지시 |
| `.claude/hooks/codex-gate.mjs` | SubagentStart `--base`(기준선) · SubagentStop(판정) · PostToolUse/UserPromptSubmit `--flush`(결과 전달) |
| `.claude/hooks/turn-gate.mjs` | Stop — 종료 승인 줄 기록기(비차단) |
| `.claude/hooks/push-guard.mjs` | PreToolUse — Claude 의 git push 차단, 마스터 1회 승인 |
| `.claude/hooks/request-graph-refresh.mjs` | SubagentStart/Stop — 그래프 실데이터판 턴 중간 갱신 |
| `.claude/hooks/work-history-logger.mjs` | Stop·SessionEnd — 세션 기록 → `work-history/` jsonl(그래프 원천) |
| `.claude/hooks/work-stats-refresh.mjs` | Stop — 통계·대시보드·그래프 재생성(분리 프로세스) |
| `scripts/codex-verify.mjs` | Codex 판정 래퍼(원장·계약·export·스크럽·`isSecretPath`·출력 스키마) |
| `scripts/request-graph.mjs` | 그래프 생성기(`SLOT_MAP`·`NO_GATE`·`HARNESS_RE`·`mergeParts`) |
| `scripts/precommit-check.mjs` | 커밋 전 결정적 검사 |
| `scripts/work-history-core.mjs` | 요청 분류기 `categorize` 등 공용 정의(model-advisor 가 import) |
| `.claude/agents/teamAnakin/` | 단계 에이전트 7종 정의(frontmatter model·effort) |
| `.claude/skills/anakin-skills/anakins-ClaudeModel-for-Work.md` | 단계별 모델·effort 운용 기준서 |
| `.claude/subagent-statusline.mjs` | 서브에이전트 상태줄 `[단계] · 모델 · effort · 경과` |
| `.claude/settings.json` | 훅 등록·env(`WORKSPACE_ROOT` 등) |

## 6. 참고 문서(이 스킬 안)

- [references/five-stage-engineering.md](references/five-stage-engineering.md) — 5단계 정의·산출·그래프 칸 매핑
- [references/graph-engineering-obsidian.md](references/graph-engineering-obsidian.md) — 생성기 사용법·표시 규칙·Obsidian 연결
- [references/codex-verification.md](references/codex-verification.md) — 루프 판정 절차·도입 경위
- [references/porting-guide.md](references/porting-guide.md) — 이식 체크리스트
- [references/lessons.md](references/lessons.md) — 2026-11-10 세션 실패 사례 → 규칙
