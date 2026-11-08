# teamanakin-admin (팀장 · 승인 2단)

> 역할 노드 카드 — 목차 [[00. index]] · 루프 [[anakins_loop]] 0-3

| 항목 | 내용 |
|---|---|
| 담당 | `teamanakin-admin` |
| 모델 | Opus · high |
| 입력 | 요청 원문, 루프 계약, 단계별 결과 요약, 결과 파일 경로(`iter-N.codex.json` 등) |
| 출력 | "승인 판정 : APPROVED·CONDITIONAL·REJECTED / 요구 N건 중 충족 M건 / 지적 K건" |
| 규칙 | `maxGrade` 를 넘지 않음, 실기기 미검증 = 최대 CONDITIONAL, **원본 표본 대조**(보고문만 믿지 않음), waive 결정 권한 |
| 쓰기 | 없음(점검 명령만) |
| 정의 | `.claude/agents/teamAnakin/teamAnakin_admin.md` |

**다음 노드**

- APPROVED·CONDITIONAL → [[아소카]] 최종 승인
- REJECTED → [[build]] 회송(다음 회차 — [[codex-judge]] 재판정). 5회차면 회송 없이 [[아소카]] → [[마스터]] 보고
