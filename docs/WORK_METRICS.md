# 작업 효율 지표 체계 (Work Metrics)

> 생성: `pnpm work:metrics-doc` (정본은 `scripts/work-history-core.mjs` 의 METRICS · KPI_TREE · QUESTIONS · UNMEASURABLE). 스키마 v2.
> 2026-09-20 지표 관점 10인 점검(비용·시간·산출·품질·컨텍스트·위임·도구·하네스·행동·체계)을 종합해 재설계.

## 1. 목적과 원칙

목적은 "Claude Code 작업이 얼마나 효율적인가"를 **산출 ÷ 투입**으로 매일 비교하는 것이다. 원칙:

1. **분모를 명시한다.** 요청(distinct 턴), 완료 턴(timed), 도구 호출(steps), 서브에이전트(agents) 중 하나를 각 지표에 적는다. 파트 레코드 수(`turns`)는 분모로 쓰지 않는다.
2. **비율의 분자·분모는 같은 모집단.** 흡수·재전송·중단·미완료 턴은 합계(토큰·비용)에는 들어가고 평균·비율에서는 빠진다.
3. **역지표는 강등한다.** 컨텍스트가 커질수록 좋아 보이는 캐시 적중률, 활동량을 생산성으로 오독하게 하는 레코드 수·출력 토큰·도구 호출 수는 참고 계층에 둔다.
4. **비교는 표본이 있을 때만.** 이전 기간과 n≥20 일 때 증감을 판정하고, 그 이하는 방향만 표시한다. 활동일·세션 수가 다르면 요청당 값으로 정규화한다.
5. **원천이 없으면 없다고 쓴다.** 추정치로 채우지 않는다(§6).

## 2. KPI 트리

```
L0  완료 요청당 비용 ★  = (메인 비용 + 서브에이전트 비용) ÷ 완료 요청
 ├─ L1 결과   요청당 비용 · 요청당 소요 · 첫 응답 대기 · 교정률 · 완료 요청 수 · 변경 파일 · 편집 정착률
 ├─ L2 동인   컨텍스트 팽창률 · 캐시 미스 · 재작업률 · 무검증률 · 오류 회복 배수 · 위임 비용 비중 · 병렬도
 ├─ L3 진단   생성 속도 · 도구 시간 비중 · thinking 비율 · 요청당 API 호출 · 활성비 · 유휴 · 도구/훅 시간 · 도구 결과 크기
 └─ 참고      캐시 읽기 비중 · 도구 오류율 · 레코드 수 · 종단 처리량 · 하네스 턴 소요
```

### L0 · North Star

| 키 | 지표 | 정의 | 모집단 | 단위 | 경보 | 비고 |
|---|---|---|---|---|---|---|
| `cost_per_delivered` | 완료 요청당 비용 ★ | cost_total_usd ÷ delivered_requests | requests | USD | > $4 | North Star — 재작업·중단으로 버려진 요청의 비용까지 완료 요청에 부담시킨다 |

### L1 · 결과 (후행)

| 키 | 지표 | 정의 | 모집단 | 단위 | 경보 | 비고 |
|---|---|---|---|---|---|---|
| `cost_per_request` | 요청당 비용 | cost_total_usd ÷ requests | requests | USD | > $3 |  |
| `elapsed_per_request` | 요청당 소요 | Σ elapsed(timed) ÷ delivered_requests | requests | ms | > 300s |  |
| `ttft_ms` | 첫 응답 대기 | 첫 assistant text 블록 ts − 직전 경계 | timed | ms | > 60s (p90) |  |
| `correction_rate` | 사용자 교정률 | correction 요청 ÷ requests (10분 내 머리글 일치·교정 어두·재전송) | requests | 비율 | > 20% |  |
| `delivered_requests` | 완료 요청 수 | requests − superseded − interrupted − (다음 요청이 교정인 요청) | requests | 건 |  |  |
| `files_changed` | 변경 파일 수 | distinct(Write\|Edit 대상) | all | 개 |  |  |
| `edit_settle_rate` | 편집 정착률 | (files_changed>0 인 요청) ÷ requests | requests | 비율 |  | 평가·조회 위주 세션은 낮은 게 정상 — 카테고리와 함께 볼 것 |
| `cost_total_usd` | 총비용(에이전트 포함) | Σ cost_usd + Σ cost_agents_usd | all | USD |  |  |

### L2 · 동인 (선행)

| 키 | 지표 | 정의 | 모집단 | 단위 | 경보 | 비고 |
|---|---|---|---|---|---|---|
| `ctx_growth` | 컨텍스트 팽창률 | 끝 턴 (context÷api_calls) ÷ 첫 턴 (context÷api_calls) | all | 배 | > 5배 |  |
| `cache_miss_events` | 캐시 미스 이벤트 | 직전 고수위 대비 호출당 cache_read 20k 이상 하락 횟수 | all | 회 | > 3 |  |
| `rework_rate` | 파일 재작업률 | 2턴 이상에서 수정된 파일 ÷ 수정 파일 | steps | 비율 | > 50% |  |
| `unverified_rate` | 무검증 쓰기 턴 비율 | 쓰기 후 테스트·실행 확인 없는 턴 ÷ 쓰기 턴 | requests | 비율 | > 1% |  |
| `recovery_multiplier` | 오류 회복 배수 | Σ(오류 후 같은 도구 성공까지 추가 호출 시간) ÷ Σ 오류 호출 시간 | steps | 배 | > 5배 |  |
| `agent_cost_share` | 위임 비용 비중 | cost_agents_usd ÷ cost_total_usd | agents | 비율 | > 60% | 병렬도와 함께 판단 — 비중이 높아도 벽시계 절감이 크면 정당 |
| `agent_parallelism` | 병렬도 | Σ agent wall ÷ max agent wall | agents | 배 |  |  |
| `cost_usd` | 메인 세션 비용 | Σ (input·p_in + cache_read·p_cr + cache_create·p_cc·1.6 + output·p_out)/1e6 | all | USD |  |  |
| `cost_agents_usd` | 서브에이전트 비용 | Σ agents_detail[].cost_usd | agents | USD |  |  |

### L3 · 진단

| 키 | 지표 | 정의 | 모집단 | 단위 | 경보 | 비고 |
|---|---|---|---|---|---|---|
| `gen_tps` | 생성 속도(근사) | output ÷ (elapsed − tool_ms − hook_ms) | timed | tok/s |  | 분모에 하네스 대기 약 16% 포함 |
| `tool_share` | 도구 시간 비중 | tool_ms ÷ elapsed | timed | 비율 | > 45% | 서브에이전트 대기 미포함 |
| `thinking_ratio` | thinking 비율 | thinking ÷ output | all | 비율 |  |  |
| `api_per_request` | 요청당 API 호출 | Σ api_calls ÷ requests | requests | 회 |  | 도구 루프 길이 |
| `active_ratio` | 세션 활성비 | Σ elapsed ÷ (Σ elapsed + Σ idle) | timed | 비율 |  |  |
| `idle_ms` | 턴 간 유휴 | ts_req − 이전 턴 ts_res (mid-turn 제외) | requests | ms |  |  |
| `tool_ms` | 도구 실행 시간 | Σ steps[].ms (Agent 는 디스패치 시간만) | all | ms |  |  |
| `hook_ms` | Stop 훅 시간 | Σ stop_hook_summary.durationMs | all | ms |  | Pre/Post 훅은 원천에 시간 없음 |
| `tool_chars` | 도구 결과 컨텍스트 소비 | Σ tool_result 문자 수 | steps | 자 |  |  |

### ref · 참고·허영

| 키 | 지표 | 정의 | 모집단 | 단위 | 경보 | 비고 |
|---|---|---|---|---|---|---|
| `cache_hit` | 캐시 읽기 비중 | cache_read ÷ context | all | 비율 |  | 컨텍스트가 클수록 1에 수렴 — 효율 지표 아님 |
| `error_rate` | 도구 오류율 | tool_errors ÷ tools_total | steps | 비율 | > 3% · n≥50 | 보조 지표 — 서브에이전트·오답 산출물 미포함 |
| `turns` | 레코드 수 | count(part 레코드) | all | 건 |  | 요청이 아니라 파트 단위 — 분모로 쓰지 말 것 |
| `n_timed` | 완료 턴 수 | count(elapsed_ms≠null ∧ ¬absorbed ∧ ¬superseded ∧ ¬incomplete) | timed | 건 |  |  |
| `out_tps` | 종단 처리량 | output ÷ elapsed | timed | tok/s |  |  |
| `turn_duration_ms` | 하네스 턴 소요 | system.turn_duration (파트별 FIFO 귀속) | timed | ms |  | 흡수된 직전 턴 작업 포함 |

## 3. 대시보드가 답해야 할 질문

| 질문 | 지표 | 판정 규칙 |
|---|---|---|
| 오늘이 어제보다 효율적이었나 | `cost_per_delivered`, `elapsed_per_request`, `correction_rate` | 이전 기간과 n≥20 일 때만 증감 판정, 아니면 방향만 |
| 돈이 어디로 가나 | `cost_total_usd`, `cost_agents_usd`, `agent_cost_share` | 카테고리·모델·에이전트별 분해 |
| 느린 원인이 모델인가 도구인가 위임인가 | `tool_share`, `gen_tps`, `agent_parallelism`, `ttft_ms` | 턴 소요 구성(도구·훅·모델) + 도구별 p90 |
| 재작업을 얼마나 했나 | `correction_rate`, `rework_rate`, `unverified_rate`, `recovery_multiplier` | 요청 연쇄·파일 재수정·무검증 쓰기·오류 회복 |
| 컨텍스트가 비대해지고 있나 | `ctx_growth`, `cache_miss_events`, `api_per_request` | 호출당 컨텍스트 첫/끝/피크 — cache_hit 는 보지 않는다 |

## 4. 레코드 스키마 (v2, work-history/YYYY/MM/YYYY-MM-DD.jsonl)

| 레코드 | 키 | 내용 |
|---|---|---|
| 턴(파트) | `id = <session_id>:<turn>.<part>` | tokens · cost_usd · elapsed_ms · ttft_ms · idle_ms · tools · steps[{t, ok, ms, tgt, chars}] · files_changed · verified · resources · perf · category · flags(superseded/absorbed/incomplete/interrupted) — part>1 은 구간 델타 |
| 보정 | `fix:true, id` | Stop 이후 도착한 turn_duration_ms · hook_ms 를 값 없는 파트에 FIFO 병합 |
| 에이전트 | `agent:true, id(턴), agent_id` | 서브에이전트 모델·토큰·비용·실행시간·도구·오류 (디스패치 턴에 귀속: name → toolUseId → parentAgentId → 시작 시각) |

집계(`loadRows`)는 id 기준 last-write-wins 로 중복을 없애고 보정·에이전트를 병합한 뒤 `correction`(사용자 교정)·`recovery`(오류 회복)를 파생한다.

## 5. 카테고리 (요청문 점수제: 동사 4 · 명사 1 · 도구 증거 · 부정어 창)

| 키 | 라벨 | 예 |
|---|---|---|
| FEATURE | 기능 구현 | 만들어, 만들고, 구현, 추가해 |
| FIX | 수정·버그 | 고쳐, 수정해, 바로잡, 해결해 |
| REFACTOR | 재구성 | 리팩토, 재구성, 정리해, 단순화 |
| GIT | Git | 커밋, 푸시, commit, push |
| DEPLOY | 배포 | 배포해, 승격, deploy, promote |
| INSTALL | 설치 | 설치, 걸치, install, npm i |
| TEST | 테스트 | 테스트해, 검증해, 점검해, 확인테스트 |
| DATA | 데이터 | 마이그레이션, migrat |
| CONFIG | 설정 | 설정해, 등록, 반영, 적용 |
| DOCS | 문서 | 문서화, 정리해줘, 요약해, 기록해 |
| QUERY | 조회·설명 | 보여줘, 알려줘, 확인해줘, 설명해 |

요청문에 `#cat:NAME` 을 쓰면 강제. 판정 근거는 레코드 `rule` · `confidence` 에 남는다.

## 6. 아직 측정할 수 없는 것

| 지표 | 이유 |
|---|---|
| Pre/PostToolUse 훅 소요 | transcript hook_success 첨부에 durationMs 없음 (Stop 훅만 stop_hook_summary 로 존재) |
| 플랜 한도 소진율(5시간·7일) | transcript 에 없음 — 상태표시줄 입력 rate_limits 를 별도 스냅샷해야 함 |
| 서브에이전트 내부 오류 상세 | errors 건수만 귀속, 오류 내용·회복 비용은 서브 transcript 재파싱 필요 |
| 커밋·라인 단위 산출 | git 과 턴의 연결 키 없음 — 턴 경계 HEAD SHA 기록 필요 |

## 7. 사용법

| 명령 | 결과 |
|---|---|
| `pnpm work:stats --type kpi [--date D]` | KPI 트리 값 · 경보 · 질문별 판정 (터미널) |
| `pnpm work:report --period all` | 일·주·월·년 보고서 (summary/tokens/usage/performance/outcome/metrics.json + report.html) |
| `pnpm work:metrics-doc` | 이 문서 재생성 |
| `pnpm test` | 로거·집계·분류·마스킹 회귀 테스트 |
