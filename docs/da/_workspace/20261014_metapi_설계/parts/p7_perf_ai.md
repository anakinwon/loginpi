## 7. 성능 모니터링·AI 튜닝 (2단계 개요)

### 7-1. 수집 SQL (P35 → `metric_*_hist`)

```sql
-- 수집 시점 헤더 (metric_clct_hist) : stats_reset 보관 → 누적 카운터 증분 계산 기준
SELECT now() AS clct_dtm, (SELECT stats_reset FROM pg_stat_statements_info) AS stats_init_dtm,
       current_setting('server_version') AS db_ver_nm;
-- 쿼리 통계 (metric_qry_hist) — pg_stat_statements 는 일반 SQL 의 상수를 $n 으로 정규화하지만 유틸리티 문 등 일부는 원문 그대로이므로 저장 전 §7-4 상수 마스킹 필터를 반드시 거친다 [확인중 : PostgreSQL 공식 문서 pg_stat_statements 정규화 범위]
SELECT queryid AS qry_uid, query AS qry_txt, calls AS clot_cnt, total_exec_time AS sum_excn_ms,
       rows AS row_cnt, shared_blks_hit AS blck_hit_cnt, shared_blks_read AS blck_rd_cnt
FROM pg_stat_statements WHERE toplevel AND dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
ORDER BY total_exec_time DESC LIMIT 500;
-- 테이블 통계·크기 (metric_tbl_hist)
SELECT relname AS tbl_nm, seq_scan AS whol_scn_cnt, idx_scan AS index_scn_cnt,
       n_live_tup AS vld_row_cnt, n_dead_tup AS invld_row_cnt,
       greatest(last_vacuum, last_autovacuum) AS last_vcm_dtm,
       pg_table_size(relid) AS tbl_sz, pg_indexes_size(relid) AS index_sz
FROM pg_stat_user_tables WHERE schemaname = $1;
-- 인덱스 통계 (metric_index_hist)
SELECT relname AS tbl_nm, indexrelname AS index_nm, idx_scan AS index_scn_cnt,
       pg_relation_size(indexrelid) AS index_sz FROM pg_stat_user_indexes WHERE schemaname = $1;
```

`pg_stat_statements` 활성·버전(PG16+ `GENERIC_PLAN`) [확인중 : 운영 프로젝트]. 증분 = `pgstatDelta(prev, cur)` : `stats_init_dtm` 이 바뀌었으면 cur 자체를 증분으로, 같으면 `cur − prev`(음수면 reset 으로 간주).

### 7-2. 산식

| 지표 | 식 |
|---|---|
| 느린 쿼리 Top-N | 구간 증분 `sum_excn_ms` 내림차순, 평균 = `sum_excn_ms / clot_cnt`(파생, 저장 안 함) |
| 미사용 인덱스 | 최근 N 수집에서 `index_scn_cnt` 증분 0 이고 PK·UNIQUE 아님 |
| seq scan 과다 | `whol_scn_cnt 증분 > k × index_scn_cnt 증분` 이고 `vld_row_cnt > 10,000` |
| dead tuple | `invld_row_cnt / (vld_row_cnt + invld_row_cnt) > 0.2` |
| 용량 급증 | `tbl_sz` 7일 변화율 > 50% |

### 7-3. 실행계획 (P39)

스테이징 DB 전용 role(SELECT 보유)로만 `EXPLAIN (GENERIC_PLAN, FORMAT JSON) <정규화 쿼리>`. `ANALYZE` 는 GENERIC_PLAN 과 병용 불가 → 실제 파라미터 값을 넣은 쿼리에 한정[확인중 : PostgreSQL 공식 문서]. 운영 DB 실행은 보류.

### 7-4. AI 권고 생성 (P40, 05 AI 설계 가이드 프롬프트 형식)

- **전송 금지** : 행 데이터, 리터럴 값(정규화 쿼리 + 상수 마스킹 필터 `'...'`·숫자 → `$c`), `pi_username`·uid 등 식별자, 접속 문자열. 전송 전 미리보기(P40 화면)로 사람이 확인.
- **입력 5종** : ① 정규화 쿼리 ② GENERIC_PLAN JSON ③ 대상 테이블 메타(`mdl_*_hist` : 컬럼·타입·인덱스 정의) ④ 통계 증분(호출·시간·블록·행수·크기) ⑤ 제약(접두사·명명 규칙·FK 유지·논리삭제 — 권고 DDL 도 표준을 지켜야 함).
- **프롬프트 템플릿(요지)** : `[역할] PostgreSQL 성능 검토자 / [규칙] 표준용어만, FK 제거 금지, 인덱스 명명 idx_<t>_<col>, DELETE·TRUNCATE 제안 금지, 가정은 질문 목록으로 / [입력] ①~⑤ / [출력] JSON 1개 — recommendations[] { type: INDEX|REWRITE|VACUUM|PARTITION, target, rationale, sql, expectedEffect, riskLevel: LOW|MID|HIGH, questions[] }`.
- **출력 검증** : zod 스키마(아래) 통과 못 하면 재생성 1회 → 실패 시 저장 안 함. 통과분은 `metric_impv_rcmnd`(`rcmnd_sts_cd` DRAFT, `mdl_nm` 모델명·근거 수집 시점 FK, 전송 프롬프트·원응답은 `dmnd_cont`·`rspns_cont` 보관 — 검수 반영 2026-10-14 보강).
- 모델·단가·월 토큰 상한·캐싱 : `claude-api` 스킬 참조 후 확정 [확인중 : claude-api·마스터]. 서버 전용 `@anthropic-ai/sdk`(설치됨), API 키는 env.

```ts
export const Recommendation = z.object({
  type: z.enum(['INDEX','REWRITE','VACUUM','PARTITION']),
  target: z.string().max(200), rationale: z.string().max(2000),
  sql: z.string().max(8000).refine(s => !/\b(DELETE|TRUNCATE|DROP\s+TABLE)\b/i.test(s), { message: '물리 삭제 금지' }),
  expectedEffect: z.string().max(500), riskLevel: z.enum(['LOW','MID','HIGH']),
  questions: z.array(z.string()).max(10),
})
export const RecommendationSet = z.object({ recommendations: z.array(Recommendation).max(10) })
```

### 7-5. 적용·측정 흐름

`metric_impv_rcmnd.rcmnd_sts_cd` DRAFT → (P41) PENDING → P20 승인(`apv_id` 필수, CHECK) → `sql` 을 P10 `checkDdl` 통과시켜 `sql/NNN_*.sql` 파일로 산출 → **사람이 마이그레이션 창에서 적용**(앱 직접 실행 없음) → `aplcn_dtm` 기록 → P42 가 적용 전후 N일 같은 `qry_uid` 증분(평균 시간·호출·블록 읽기)을 `metric_impv_rslt` 에 고정 저장(반정규화 사유 : 감사 증적) → APPLIED. 측정 행 없는 권고는 닫히지 않는다(앱 규칙).
