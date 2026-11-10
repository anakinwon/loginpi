# verify (폐지 2026-11-10 — Codex 판정은 SubagentStop 훅)

> 역할 노드 카드 — 목차 [[00. index]] · 루프 [[anakins_loop]] · 호출 [[codex_procedure]] 13절

2026-11-10 마스터 결정("Codex 목적이 검수인데 클로드가 검수를 또 하는 의도가 뭘까 … 그래프가 복잡해지고 전체 구조의 오해가 있으니 삭제 바람", 실행 주체 = "훅 자동 실행")으로 검증 단계 에이전트를 폐지하고 정의 파일을 삭제했다. 이 카드는 옛 링크([[verify]])가 끊기지 않게 남긴 안내다.

| 항목 | 지금 |
|---|---|
| Codex 판정 실행 | SubagentStop 훅 `.claude/hooks/codex-gate.mjs` — 서브에이전트 종료마다 자동 계약·증거·scope 저장 → `--init` → `--confirm-real` |
| 결과 전달 | 메인의 다음 도구 호출·요청 때 `[CDX 자동 판정]`(`--flush`, PostToolUse·UserPromptSubmit) |
| 실행 검사(tsc·lint·build·test·selftest) | [[build]] 가 산출과 함께 실행·보고 |
| 독립 판정·회송 지명·waive 결정 | [[아소카]]·[[teamanakin-admin]] |
| 그래프 | 과거 verify 실행은 칸·집계에서 숨기고 판정 원장만 CDX 칸에 반영 |

**다음 노드**

- 판정 → [[codex-judge]] → PASS 면 다음 단계, FAIL 이면 결과를 낸 에이전트로 회송(같은 원장 다음 회차, 상한 5회)
