# verify (실행 검증 · Codex 호출 · 독립 판정)

> 역할 노드 카드 — 목차 [[00. index]] · 루프 [[anakins_loop]] B-2·B-4 · 호출 [[codex_procedure]] 3절

| 항목 | 내용 |
|---|---|
| 담당 | `anakin_phase-verify` |
| 모델 | Sonnet · medium |
| 입력 | 루프 계약, 작업 트리, Codex 결과 |
| 출력 | `L/evidence-N/*.txt`(실행 출력 원문), `L/iter-N.codex.json`(래퍼), `L/iter-N.triage.md`(독립 판정 표), `[Iteration N]` 보고(회차 N/5·`loopEnd`) |
| 쓰기 | `L/ = .omc/state/loop/<id>/` 만 — 프로젝트 파일 수정 안 함 |
| 명령 | `pnpm build` → `pnpm tsc --noEmit` → `pnpm lint` → `pnpm test`, 래퍼 `--confirm-real`(실호출은 verify 만), `--init`·`--waive` 실행 |
| 정의 | `.claude/agents/teamAnakin/anakin_phase-verify.md` |

**다음 노드**

- 증거 → [[codex-judge]]
- FAIL → 독립 판정 → CONFIRMED 는 [[build]], PLAUSIBLE·FALSE 는 [[아소카]] — 단 `loopEnd: true`(5회차)면 회송 없이 [[아소카]]
- PASS → [[teamanakin-admin]](문서면 [[review]] 먼저)
