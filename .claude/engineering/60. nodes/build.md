# build (산출)

> 역할 노드 카드 — 목차 [[00. index]] · 루프 [[anakins_loop]] B-5 회송 브리프

| 항목 | 내용 |
|---|---|
| 담당 | `anakin_phase-build` |
| 모델 | Opus · high |
| 입력 | 루프 계약 `L/contract.md`, 회송 시 `L/iter-N.triage.md`의 CONFIRMED 결함(ID·file:line·repro·fix_hint) |
| 출력 | 변경 파일, 보고(결함 ID → 수정 파일:줄, diff stat, tsc·단위 테스트·selftest 결과) |
| 쓰기 | 계약의 쓰기 허용 경로만 |
| 금지 | 실제 Codex 호출(시험은 `CODEX_JS` 만), 계약 파일 수정, 커밋 |
| 정의 | `.claude/agents/teamAnakin/anakin_phase-build.md` |

**다음 노드**

- 산출 → [[verify]]

**들어오는 되돌림 엣지**(4회차까지 — 5회차 결과는 회송 없음) : [[verify]] 독립 판정 CONFIRMED, [[아소카]] 회송, [[decide]] 설계 결정, [[teamanakin-admin]] REJECTED.
