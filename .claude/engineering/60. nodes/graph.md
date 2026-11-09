# graph (그래프 분석 · 요청 흐름 판독)

> 역할 노드 카드 — 목차 [[00. index]] · 그래프 규칙 [[anakins_graph]] B-6 · 설계 슬롯 [[1.1.5 SA-그래프]]

| 항목 | 내용 |
|---|---|
| 담당 | `anakin_phase-graph` (2026-11-08 마스터 신설) |
| 모델 | Sonnet · medium |
| 입력 | 이번 요청(턴), 생성기 산출 `work-statistics/mywork/myRequestGraph.html`·`50. graph/requests/*.md` |
| 출력 | "그래프 분석 : 엔지니어링 N/5 / 미수행 M건 / 비정상 K건" + 슬롯별 표 |
| 쓰기 | 없음 — 생성기 `node scripts/request-graph.mjs --md` 실행만(산출물 gitignore) |
| 판독 | 노드 상태·실행 경로·루프 회차(N/5)·엔지니어링 N/5, 미수행 슬롯, 비정상 흐름(상한 근접·BLOCKED·오류·순서 이탈) |
| 정의 | `.claude/agents/teamAnakin/anakin_phase-graph.md` |

**다음 노드**

- 산출 턴 : [[verify]] → graph → [[teamanakin-admin]]
