# commit (커밋 — 별도 턴)

> 역할 노드 카드 — 목차 [[00. index]] · 하네스 [[anakins_harnes]]

| 항목 | 내용 |
|---|---|
| 담당 | `anakin_phase-commit` |
| 모델 | Haiku 4.5 (전체 ID) |
| 입력 | [[마스터]]의 커밋 지시, 승인된 변경 파일 목록 |
| 출력 | 커밋 + `git status -sb` 원문 |
| 금지 | push(훅 `push-guard.mjs` 차단 — 마스터 직접), `git add .` |
| 정의 | `.claude/agents/teamAnakin/anakin_phase-commit.md` |

**다음 노드**

- 결과 → [[아소카]] → [[마스터]](push 는 마스터)

루프 밖 노드 — [[아소카]]의 최종 보고 뒤 별도 턴에서만 실행한다.
