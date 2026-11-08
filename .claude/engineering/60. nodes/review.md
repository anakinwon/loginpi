# review (문서 검수 · 대체 판정자)

> 역할 노드 카드 — 목차 [[00. index]] · 루프 [[anakins_loop]] B-6

| 항목 | 내용 |
|---|---|
| 담당 | `anakin_phase-review` |
| 모델 | Opus · high |
| 입력 | 산출물(문서·i18n·보고서)과 요청 원문 — 작성자 설명은 받지 않는다 |
| 출력 | 결함 목록, 첫 줄 "검수 : 통과 N / 결함 M". 대체 판정 때는 판정 JSON(응답으로만) |
| 쓰기 | 없음(점검 명령만) |
| 정의 | `.claude/agents/teamAnakin/anakin_phase-review.md` |

**다음 노드**

- 결함 → [[아소카]] → [[build]]
- 통과 → [[teamanakin-admin]]
- 대체 판정 JSON → [[verify]](`--ingest`)
