# 하네스 변경 창 대기 목록

> **하네스 동결 2026-11-12 ~ 2026-11-26 (마스터 결정 R4)** — 동결 중 하네스 파일(`.claude/hooks/**`·`.claude/settings*.json`·`.claude/agents/teamAnakin/**`·판정·그래프 스크립트) 변경은 결함 수정·보안만. 그 밖의 요청은 아래 표에 적고 마스터에게 알린다(동결 중에는 주 1회 변경 창도 열지 않음). 동결 끝에 work-history KPI(`cost_per_request`·p90 소요·제품 커밋 수)로 재측정한 뒤 이 목록의 처리 방식을 정한다 [확인중 : 마스터]. 정본 루트 `CLAUDE.md` teamAnakin 절 R4.
> 2026-11-12 R3 로 대상이 사라진 항목(graph 에이전트)은 처리일 칸에 '대상 폐지'로 닫는다.

> 결함 수정이 아닌 하네스 파일 변경 요청을 주 1회 창에 모아 처리하기 위한 대기 목록(2026-11-11 마스터 결정 M1). 규칙 정본 = `.claude/skills/anakin-skills/anakins-ClaudeModel-for-Work.md` '하네스 동결' 절(2026-11-12 — 구 '하네스 변경 창' 절 대체).
> 창 요일·시각 : [TBD : 마스터 지정] · 즉시 처리 예외 = 보안·판정 결함 수정, 마스터 "지금" 명시

| 접수일 | 요청 요지(마스터 원문 축약) | 대상 파일 | 처리일 |
|--------|---------------------------|-----------|--------|
| 2026-11-11 | 요청 104·105 원장 중복 귀속(그래프 표시) | `scripts/request-graph.mjs` | |
| 2026-11-11 | graph 요약 캐시 `at` 은 실제 시계 값만 쓰도록 규정 | `.claude/agents/teamAnakin/` graph 정의·`scripts/request-graph.mjs` [확인중 : 변경 창에서 대상 확정] | 2026-11-12 대상 폐지(R3 — graph 에이전트 폐지, 생성기는 수동 실행) |
| 2026-11-11 | build 보고 형식 — 자동 증거 첨부 반영 뒤 재검토 | `.claude/agents/teamAnakin/` build 정의 | |
| 2026-11-11 | 브리프 조건마다 판정 가능한 정의(기준·예시·시험)를 함께 적는 규칙 — 근거 c4-build-ad8596 1회차 FAIL(메인 브리프의 '이의 인정 표식' 정의 누락) | 운용 기준서 '일감 크기·위임 규칙' 절(2026-11-12 삭제) · anakin_phase-build 정의 [확인중 : 변경 창에서 대상 확정] | |
| 2026-11-11 | gitignore 런타임 상태·로그 파일은 본문 대신 기준선 대비 차이(추가 줄·바뀐 키)·해시·결정적 비밀 검사 결과로 증거를 만든다 — 원인 : gitignore 파일 본문이 written-files.md 상한 30000자로 잘려 구조적 BLOCKED(c4-pitel-verify-a7d45a). 판정 결함 성격 | .claude/hooks/codex-gate.mjs fileExcerpt | |
| 2026-11-12 | [결함] 감사 장치 1단계(c41470fc) 결함 7건 — ① 세션 전체 마스터 메시지를 요구로 편입(다른 작업 요구 섞임) ② 병렬 작업 파일 오귀속(리디자인 D-001 6건) ③ codex-audit 시험 동시 실행 취약 ④ request 가 메인에서도 CLAUDE_CODE_CHILD_SESSION 으로 거부 ⑤ 판정 훅 도구 기록 중간 생략 → 금지 규칙(인라인 쓰기·커밋 안 함) 증명 불가, 도구 기록 결정적 스캔으로 대체 ⑥ 파일 변경 없는 재종료에도 재판정 ⑦ codex-audit check 가 원장 waived.all 미인식 | `.claude/hooks/codex-gate.mjs`·`scripts/codex-audit.mjs`·`scripts/codex-verify.mjs`·`test/` | 결함 수정 — 동결 중 처리 가능 |
| 2026-11-12 | 요청 흐름 그래프 갱신 방식(수동 실행 vs Stop 자동) — R3 로 자동 갱신 폐지 뒤 새 요청 미표시 문의 | `scripts/request-graph.mjs`·settings | 마스터 결정 대기 |
| 2026-11-12 | 배포 요청 시 push 자동 승인 — 마스터 원문 "내가 배포 요청 시 '푸시를 허용' 물어보지 말고 바로 푸시해 줘!"(오늘 `--allow` 수동 6회 이상) | `.claude/hooks/push-guard.mjs`(`--from-prompt`)·루트·하위 앱 4개 settings.json UserPromptSubmit | 2026-11-12 즉시 처리 — 동결 예외(마스터 명시 지시) |
