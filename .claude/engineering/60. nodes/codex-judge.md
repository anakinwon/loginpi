# codex-judge (외부 판정자)

> 역할 노드 카드 — 목차 [[00. index]] · 절차 정본 [[codex_procedure]] · 루프 [[anakins_loop]] 0-4

| 항목 | 내용 |
|---|---|
| 담당 | Codex CLI(`codex exec -s read-only`, `approval_policy="never"`, `--ephemeral`) — 래퍼 `scripts/codex-verify.mjs` 경유 |
| 모델 | Codex 기본 모델(`--model` 지정 가능) |
| 입력 | 래퍼가 조립한 프롬프트 — 판정 규칙·규칙 발췌·완료 기준·scope 안 diff·파일 본문·증거·이전 결함(비밀·경로 가림, nonce 구획) |
| 출력 | 판정 JSON — `verdict`·`criteria`·`defects`. `maxGrade`·`seenCount`·`escalate`·`noProgress` 는 래퍼가 계산 |
| 쓰기 | 없음(셸 읽기도 차단 — 판정 근거는 프롬프트 본문뿐) |
| 대체 | 미가용이면 `--judge claude` → [[review]] 기본, 최대 CONDITIONAL |

**다음 노드**

- PASS → [[teamanakin-admin]]
- FAIL → [[verify]] 독립 판정 → [[build]]
- escalate → [[decide]]
- noProgress·BLOCKED → [[아소카]] 판단(사유별 행동 — 마스터는 device·권한·미로그인만)
- escalate 이고 seenCount ≥ 3 → 중단 보고 (마스터 확정 2026-11-08)
