# collect (수집)

> 역할 노드 카드 — 목차 [[00. index]] · 팀 구성 [[anakins_harnes]]

| 항목 | 내용 |
|---|---|
| 담당 | `anakin_phase-collect` |
| 모델 | Sonnet · medium |
| 입력 | [[아소카]]의 수집 브리프(항목·근거 경로 요구) |
| 출력 | 요약 표 + 근거 파일 경로, 첫 줄 "수집 완료 : 항목 N건 / 미확인 M건" |
| 쓰기 | 없음(조회·집계 명령만) |
| 정의 | `.claude/agents/teamAnakin/anakin_phase-collect.md` |

**다음 노드**

- 결과 → [[아소카]] → [[decide]](결론 필요) 또는 [[build]](바로 산출)

루프 앞 보조 노드 — 되돌아가는 엣지는 없다.
