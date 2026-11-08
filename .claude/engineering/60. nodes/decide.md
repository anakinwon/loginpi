# decide (결론·설계 재검토)

> 역할 노드 카드 — 목차 [[00. index]] · 루프 [[anakins_loop]] C-3 escalate

| 항목 | 내용 |
|---|---|
| 담당 | `anakin_phase-decide` |
| 모델 | Fable · high (ultrathink 자동 부착) |
| 입력 | [[collect]] 결과, 또는 escalate 때 원장 결함 이력(`seenCount ≥ 2`)·관련 파일 경로 |
| 출력 | 결론 초안(강력추천·추천·뒤집히는 조건), 첫 줄 "결론 초안 : …" |
| 쓰기 | 없음(읽기 전용) |
| 정의 | `.claude/agents/teamAnakin/anakin_phase-decide.md` |

**다음 노드**

- 초안 → [[아소카]] 검토 → [[build]](설계 결정대로 수정)

**들어오는 되돌림 엣지** : [[codex-judge]] 결과 `escalate: true` — 같은 결함을 세 번째로 땜질하지 않고 설계로 올린다(사례 : first-call D-005 → "생성 경로 1개 + fail-closed").
