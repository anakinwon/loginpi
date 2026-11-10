# 실패 사례 → 규칙 (2026-11-10 세션)

> 근거 = 저장소 파일의 기록(줄은 작성 시점). 원장 폴더 `.omc/state/loop/` 는 gitignore 라 이식 대상에는 없다.

| # | 사례 | 원인 | 지금의 규칙 | 근거 |
|---|---|---|---|---|
| 1 | **증거 공백 → unverifiable N** : 턴 묶음 판정에서 P·X·T 칸이 '확인 불가' N 을 반복 | 판정 대상이 파일이 아니라 대화(브리프·수집 결과)라 판정자 입력에 근거가 없었다. Codex 는 셸로 파일을 읽지 못한다(Windows read-only 샌드박스) | 판정은 파일 산출물이 있는 c4 만. 판정 입력은 프롬프트 본문(파일 전문 포함)뿐이라고 가정. 빠진 AC 는 래퍼가 unverifiable 로 채우고 PASS → FAIL | `.claude/engineering/40. loop/codex_procedure.md` 13절 머리 배경 · 4절 |
| 2 | **병렬 에이전트 scope 오귀속** : 한 build 원장에 다른 에이전트·이전 세션의 미커밋 변경이 섞임 | scope 를 `git status` 전체로 잡았다 | scope 1차 = 그 에이전트 기록의 Write·Edit·NotebookEdit. Bash 보조 귀속은 시작 뒤 수정 시각 ∩ 기준선 diff, 형제가 쓴 경로는 빼고 '병렬 에이전트 귀속 제외 n건'. SubagentStart 기준선 스냅샷 | `.claude/hooks/codex-gate.mjs` `changedFiles` 머리 주석(결함 8) |
| 3 | **gitignore 산출물 누락** : 에이전트가 쓴 gitignore 대상 파일이 판정에서 빠짐 | `git diff`·`git status` 는 무시 대상을 보지 않는다 | Write·Edit 기록 기준이라 gitignore 무관. 무시 대상 본문은 증거 `written-files.md` 로 첨부(비밀 경로·허용 밖 확장자는 제외) | 같은 주석 · 13절 규칙 8 |
| 4 | **시험 결과가 pending 으로 샘** : selftest 가 실제 `.omc/state` 의 pending 에 가짜 판정을 써 메인에 `[CDX 자동 판정]` 으로 전달 | 시험이 실제 상태 루트를 썼다 | 시험은 env `CODEX_GATE_STATE`·`CODEX_LOOP_ROOT` 로 임시 루트에 격리(사고 표기 '2026-11-10 E') | `codex-gate.mjs` `stateOf` 주석 · `scripts/codex-verify.mjs` `LOOP_ROOT` 주석 |
| 5 | **차단 상한 반복** : 턴 끝 차단 훅이 서브에이전트 실행 중 '결과 없음'을 N 으로 보고 차단을 상한(3/3)까지 반복 | 진행 중 상태를 실패로 판정 + 턴 끝 강제 차단 | turn-gate = 종료 승인 줄 기록기(비차단, 항상 종료 0). 그래프는 진행 중 요청의 판정 대기 칸을 '위반'에서 뺀다 | 13절 머리 배경 · 규칙 7 · `anakins_graph.md` B-6-3 |
| 6 | **단정 완화** : 근거 없는 현황·수치를 확인된 사실처럼 보고(수집 결과 없이 운영 브랜치·gitignore 상태를 사실로 보고 등) | 확인 전 값에 미확정 표시를 하지 않았다 | 확인 못 한 값은 `[확인중 : 확인 채널]`·`[TBD]`. 보고는 실행한 명령·출력 줄로 근거를 단다. 측정값은 측정 시점과 방법을 함께 적는다 | 턴 묶음 원장 결함 X-D-001 2건(2026-11-10, `.omc/state/loop/bundle-turn-…`) |

## 공통 교훈

- "반드시"는 훅으로(결정적), 판단이 필요한 판정은 외부 판정자(Codex)로, 기록·표시는 생성기로 — 세 역할을 섞지 않는다.
- 판정 범위를 넓히면 근거 없는 N 과 비용이 같이 는다. 파일로 남는 산출물만 판정한다.
- 시험은 실제 상태를 건드리지 않는다. 결과 전달 경로(pending)는 시험에서 반드시 격리한다.
