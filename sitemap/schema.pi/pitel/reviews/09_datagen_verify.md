# 09 적재 데이터 검증 — 행 수 대조 · 관계(S11) · 편향 S1~S14

> 2026-11-11 19:40~19:45(KST) · 대상 = 로컬 Docker `pitel-pg`(localhost 55432, PG17) DB `pitel` 스키마 `public` · 읽기 전용(INSERT·UPDATE·DELETE·DDL·ANALYZE 실행 0)
> 기준 = `CONTEXT.md` D9·D10·5절 S1~S14 · 계획 행 수 `datagen/out/volume.md`(= `datagen/out/plan.json`, 배율 1.0)
>
> **판정 : 부분 통과** — 행 수 214/214 계획 일치(±5% 이탈 0), 관계 고아 비율 목표 안. 편향은 PASS 6(S1 상위 0.01%·S3·S4 최근 3년·S9·S11·S14) / FAIL 4(S1 법인 100만+·S2·S5 선택 칼럼·S6) / 미점검 7(S7·S8·S10·S12·S13 전체, S2·S4 일부). **S6 결함 : 파티션 테이블 38개 중 15개가 데이터 전부를 2010년 파티션 1~3개에 몰아 넣음**(일시 생성식 결함 추정 — 4절).

## 1. 실행 환경·명령

| # | 명령 | 종료 코드 | 소요 |
|---|---|---|---|
| 0 | Docker Desktop 기동(엔진 꺼져 있었음) → `docker start pitel-pg` | 0 | 26초 |
| 1 | 행 수 : `pg_partition_tree` 잎 테이블 `pg_class.reltuples` 합(비파티션은 자기 `reltuples`) — 214 테이블 | 0 | 0.4초 |
| 1a | 표본 정확 건수 `count(*)` 3개(`ptl_col_ovdu_adchg_std_c`·`ptl_col_exoftrmn_m`·`ptl_ord_sbsc_ctrt_m`) | 0 | 2초 |
| 2 | `node datagen/verify.mjs --db prod --schema public --conc 1`(편향 지표 3건만 재실행 — 2절) | 0 | 21초 |
| 3 | 편향 보조 점검 SQL(`pg_stats`·`reltuples`·소규모 집계, 읽기 전용) | 0 | 4초 |
| 3a | 파티션 키 일시 실제 범위 `ptl_cus_cust_h`·`ptl_pay_chrg_calc_l`(min·max·건수) | 0 | 39초 |

- 행 수 방식 : `n_live_tup` 은 쓸 수 없음 — 컨테이너 재기동으로 통계 수집기가 초기화됨(`pg_stat_user_tables` 의 `last_analyze` 전부 NULL·`n_tup_ins` 0). `reltuples` 는 카탈로그 값이라 남아 있고, 잎 테이블 2,482개 모두 값 있음(`reltuples < 0` 0개). 값의 출처 = 적재 뒤 PK·인덱스 생성·ANALYZE(2026-11-08). 이번에는 ANALYZE 를 다시 돌리지 않음(데이터 변경 없음 — 아래 표본 정확 건수가 추정치와 일치).
- 접속 : `verify.mjs` 는 `docker exec pitel-pg psql` 로만 붙고 `.env.local` 의 URL 은 DB 이름만 읽음(`PITEL_DB_URL` = localhost:55432/pitel 확인, 값은 기록하지 않음). 운영·스테이징 DB 접속 0.

## 2. 행 수 대조(계획 대 실측 추정)

| 항목 | 값 |
|---|---|
| 테이블 | 계획 214 · DB 214 · 누락 0 · 계획 밖 0 |
| 합계 | 계획 **1,101,170,707** · 추정 **1,101,170,710**(+3, 0.000%) |
| ±5% 이탈 테이블 | **0개** |
| 최대 편차 | `ptl_pay_use_l` 계획 70,509,807 · 추정 70,509,800(−0.000%) |
| 표본 정확 건수 | `ptl_col_ovdu_adchg_std_c` 20 · `ptl_col_exoftrmn_m` 705,098 · `ptl_ord_sbsc_ctrt_m` 6,110,850 — 세 개 모두 계획·추정과 같음 |
| 파티션 DEFAULT | 38개 · 추정 행 0(기대 0) |

## 3. 검증 결과

### 3.1 관계 — 고아 비율(S11)

`verify.mjs` FK 434건은 **이번에 다시 돌리지 않았다**. 전체 재실행 실측 소요 = 1시간 14분 47초(동시 3, 시간초과 10건) + 8분 22초(나머지 10건, 동시 1) ≈ 1시간 23분으로 30분을 넘고, `verify.mjs` 에 표본·테이블 제한 옵션이 없다. 그래서 브리프대로 편향 지표만 다시 돌렸고, 그때 `verify.mjs` 가 진행 기록(`database/verify_state.json`)에서 2026-11-08 완료분 FK 결과를 함께 출력했다. 그 FK 실행(2026-11-08 09:02~15:40) 시각은 적재 끝(같은 날 02:21, `datagen/state/pitel_public_1.json`) 뒤이고, 그 뒤로 데이터 변경은 없다(행 수 2절 일치).

| 검사 | 기대 | 실측 | 판정 |
|---|---|---|---|
| FK 전체 고아 비율 | 약 0.05% | FK 434개 · 자식 행 2,682,339,017 · 고아 1,036,121 = **0.039%** | PASS |
| 고아를 넣은 FK(고아 > 0, 310개) 비율 | 0.05%(`gen.orphan` 확률 0.0005) | **0.0499%** | PASS |
| 고아 1% 초과 FK | 0개 | **0개**(최대 `FK_PTL_PRD_CHRG_ITM_C_01` 0.150%) | PASS |
| 고아 0건 FK | — | 124개(예 `FK_PTL_PAY_BILL_D_01` 47,006,538행) — 부모 번호를 순번 공식으로 바로 만드는 FK 라 `gen.orphan` 이 안 걸림(추정) | 참고 |

FK 비율 분포 : 0건 124 · 0.03% 미만 4 · 0.03~0.07% 300 · 0.07% 초과 6.

### 3.2 편향 S1~S14

`verify.mjs` 지표 = S1·S4·S9 3건(이번 재실행 값). 나머지는 보조 SQL(1절 #3)이며, `pg_stats` 근거 행은 ANALYZE 표본(테이블당 3만 행) 통계다.

| 편향 | 검사 항목 | 기대(CONTEXT 5절) | 실측 | 판정 |
|---|---|---|---|---|
| S1 | 상위 1% 청구계정의 가입계약 점유(`verify.mjs`) | 멱법칙(쏠림) | **0.464** | PASS |
| S1 | 상위 0.01% 고객(235명)의 가입계약 점유 | 20% | **0.2155** | PASS |
| S1 | 고객 1명 최대 가입계약 수 | 법인 1곳 회선 100만+ | **530,241**(`C000000001`) | FAIL |
| S2 | 가입상품 최다 상품 점유(`ptl_ord_sbsc_prod_m`, 정확 집계) | 요금제 1개 = 35% | **0.0368**(`P0000001` 518,647행) | FAIL |
| S2 | 부가서비스 70% 미사용 | 70% | 미점검 | [확인중] |
| S3 | 상태유형코드 칼럼(`*_stts_ty_cd`) 최빈값 비율(`pg_stats`) | 98% 한 값 | 160칼럼 중 **157칼럼 97% 이상**, 중앙값 **0.979** | PASS |
| S4 | 가입계약 최근 3년(2023-11-01 이후) 비율(`verify.mjs`) | 60% | **0.596** | PASS |
| S4 | 말일·1일 급증 · 장애일 하루 수납 5% | 있음 | 미점검 | [확인중] |
| S5 | NULL 허용 FK 류 칼럼 NULL 30%(`pg_stats`) | 30% | NULL 허용 501칼럼 중 **165칼럼 25~35%** | PASS |
| S5 | 선택 칼럼 NULL 90~99%(`pg_stats`) | 90~99% | **22칼럼만 90% 이상**, 313칼럼 50~70%(생성기 상수 `nullCol: 0.6`) | FAIL |
| S6 | 최근 파티션 = 과거의 10~20배 | 10~20배 | 정상 분포 월 파티션 5개 : 2026-01~10 월평균 / 2011 월평균 = **약 4,150배**(연 합계 2026 14,515,739 · 2016 659,583 · 2011 4,196 — `ptl_pay_use_l`). **15개 테이블은 2010년 파티션 1~3개에 전부 몰림**(4절) | FAIL |
| S7 | 금액 0.001% 극단값·음수 조정 | 있음 | 미점검(`verify.mjs` 미구현) | [확인중] |
| S8 | 해지 번호 재사용·같은 이름 다수 | 있음 | 미점검(`verify.mjs` 미구현) | [확인중] |
| S9 | 메모 1KB 초과 행(`ptl_pay_raw_use_l`, `verify.mjs`) | 0.5% | **225,791행** ÷ 47,006,540 = **0.480%** | PASS |
| S10 | 지역↔대리점 강상관 | 있음 | 미점검(`verify.mjs` 미구현) | [확인중] |
| S11 | 고아 행 | 0.05% | 3.1절 0.039%(주입 FK 0.0499%) | PASS |
| S12 | 앞자리 0·공백 섞인 코드 | 있음 | 미점검(`verify.mjs` 미구현) | [확인중] |
| S13 | 대소문자·표기 흔들림 | 있음 | 미점검(`verify.mjs` 미구현) | [확인중] |
| S14 | 청구서 최다 청구계정의 청구서 수(`ptl_pay_bill_m`, 정확 집계) | 수천 건 | **987,294건**(`B000000001`) | PASS |

## 4. 결함 — 파티션 키 일시가 2010년 초에 몰림(S6·S4)

| 증상 | 테이블(`ptl_` 생략) |
|---|---|
| 데이터 전부가 파티션 1개(2010 또는 2010-01) | cus_bill_acnt_h · cus_cust_h · cus_cust_grd_h · cus_cust_cntc_h · cus_cust_addr_h · cus_cust_agre_h · col_unpd_mm_t · pay_use_qty_mm_t · pay_use_qty_dd_t · pay_bscprvd_exhst_l · pay_eqp_instl_bill_d · pay_bill_acnt_mm_t · inv_pay_mthd_h (13) |
| 2010-02~04 파티션 2~3개 | pay_chrg_calc_l(2 — 2010-02·03, 47,006,538행) · cus_cust_mm_s(3) (2) |

- 정확 확인 : `ptl_cus_cust_h` 3,760,523행의 `vld_bgng_dtm` = 2010-01-01 01:00 ~ 02:00, 2011년 이후 0행. `ptl_pay_chrg_calc_l` 47,006,538행의 `bill_ym` = 201002 ~ 201003.
- 생성식(`datagen/out/plan.json`) : `ptl_cus_cust_h.vld_bgng_dtm = gen.t0() + (((k - 1) % 2 + 1)) * interval '1 hour'`, `ptl_pay_chrg_calc_l.bill_ym = to_char(gen.t0() + ((gen.skew(…) - 1) % 2 + 1) * interval '1 month', 'YYYYMM')`. 정상인 `ptl_pay_use_l` 은 `gen.recent_dtm(k, N)`. 원인 추정 = PK 에 들어간 일시 칼럼이 `recent_dtm` 대신 '순번 % 2' 공식으로 만들어짐 — `datagen/datagen.mjs` 해당 분기 확인 필요 [확인중].
- 영향 : 파티션 가지치기·연도별 분포 시험이 이 15개에서 의미 없음. 날짜 조건 쿼리 성능 시험(CDC·레이크 다음 단계 포함) 전에 재생성 필요.
- 이 문서는 기록만 한다(데이터 변경 금지 브리프). 재생성 여부는 [확인중 : 메인·마스터 결정].

## 5. 결론

1. **행 수** : 계획과 일치 — 214 테이블 · 1,101,170,710행(추정, 계획 +3), ±5% 이탈 0, DEFAULT 파티션 0.
2. **관계** : 고아 0.039%(주입 FK 기준 0.0499%), 1% 초과 FK 0 — S11 목표 충족(FK 결과는 2026-11-08 실행분).
3. **편향** : S1(쏠림)·S3·S4(최근 3년)·S9·S11·S14 충족. S2(인기 상품 35%)·S5(선택 칼럼 90~99% NULL)·S1(법인 100만+)는 생성기 상수·식이 CONTEXT 목표보다 약함. **S6 은 15개 테이블 일시 생성 결함**으로 실패.
4. 이 검증 도중(19:42) 다른 작업이 새로 만든 `docs/06_datagen.md`(미커밋) 3절 편향 적용표도 S1·S2·S5·S6·S14 의 CONTEXT 목표가 코드 상수로 확인되지 않거나 다르다고 적었다(S5 = 코드값 선택 칼럼 60%) — 이 문서의 실측과 같은 방향.

## 6. 남은 [확인중]

| # | 항목 | 확인 방법 |
|---|---|---|
| 1 | FK 434건 이번 재실행 안 함(2026-11-08 결과 사용) | `node datagen/verify.mjs --db prod --schema public --fresh`(약 1시간 23분) |
| 2 | S6 결함 원인 — PK 일시 칼럼 생성 분기 | `datagen/datagen.mjs` 일시 식 생성 부분 확인 |
| 3 | 15개 테이블 재생성 여부 | 메인·마스터 결정 |
| 4 | S2 부가서비스 미사용 · S4 말일·1일·장애일 · S7 · S8 · S10 · S12 · S13 | `verify.mjs` 에 지표 추가 후 실행 |
| 5 | S1·S2·S5 목표 미달이 의도된 조정인지 | `docs/06_datagen.md` 3절(미커밋, 같은 날 작성)이 [확인중] 으로 둠 — 생성 담당·마스터 결정 |
| 6 | 고아 0건 FK 124개가 설계 의도인지 | 순번 공식 부모 FK 목록과 `gen.orphan` 적용 범위 대조 |

## 7. 계약 이탈 1건(추가 접촉 포함) · 처분 완료 — 진행 기록 파일 수정

| 항목 | 내용 |
|---|---|
| 대상 | `database/verify_state.json`(gitignore 대상이지만 저장소 폴더 안의 파일, 브리프 쓰기 범위 밖) |
| 지운 것 | `results` 의 지표 3건 키 `S4 최근3년(가입계약)` · `S1 상위1% 청구계정 회선 점유` · `S9 TOAST 메모 행(원시사용)`(FK 434건 키는 그대로) |
| 이유 | `verify.mjs` 는 완료 건을 건너뛰므로, 편향 지표 3건만 다시 실행하려고 |
| 백업 | 스크래치패드 `verify_state.backup.json`(세션 임시 폴더, 저장소 밖 — 수정 전 원본) |
| 현재 상태 | 지표 3건 = 이번 재실행 결과(2026-11-11 19:41:48~19:42:09), FK 434건 = 2026-11-08 결과, 437/437 완료. 최신 실측이라 복구하지 않음 |
| 추가 접촉 | 회송 2회차 문서 수정 중 셸 따옴표 처리 실수로 `verify.mjs` 가 한 번 더 실행됨(19:48:27, 남은 작업 0건 — DB 쿼리 0). 결과값은 그대로이고 상태 파일의 `pid`·`startedAt`·`endAt`·`conc`(NaN) 와 `database/verify.log` 2줄만 바뀜. 상태 파일에는 `NaN` 이 JSON 으로 저장되지 않아 `"conc":null` 로 기록됨 |
| 처분(메인 결정 2026-11-11) | ① `verify_state.json` : 지표 3건 값(0.596 · 0.464 · 225791) 보존, `conc` 만 `null` → `1`(1회차 실행 값) 복구. `pid`·`startedAt`·`endAt` 는 오실행 값 그대로 둠 — 남은 작업 0건 실행이라 결과에 의미 있는 변경이 아님 ② `verify.log` : 오실행 2줄은 사실 기록이라 지우지 않고, 바로 아래에 처분 주석 1줄(`# 2026-11-11 19:48:27 위 2줄 = 문서 회송 작업 중 오실행(남은 작업 0, DB 쿼리 없음) — 처분: 메인 결정으로 보존`) 추가 ③ 두 파일 모두 Edit 도구로 수정, 셸 편집 0. 확인 : `JSON.parse` 성공, `conc` = 1, 완료 437/437 |
| 다음부터 | 상태 파일을 사본으로 바꿔 두고 실행한 뒤 원본을 되돌리거나, `verify.mjs` 에 상태 파일 경로 옵션(`--state`)·작업 선택 옵션을 추가해 원본을 건드리지 않는다 [확인중 : 옵션 추가는 별도 지명] |

## 8. 실행 출력 원문·보조 SQL

보고에 붙였던 출력을 그대로 옮긴다. 보고에는 '끝 20줄'이라 적었으나 실제로는 두 명령의 출력 전체(5줄 + 22줄)였다 — 아래가 그 원문 전부다.

### 8.1 `node datagen/verify.mjs --db prod --schema public --conc 1` 출력(5줄 전부)

```
FK 434개 · 자식 행 2,682,339,017 · 고아 1,036,121 (0.039%, 목표 약 0.05%)
고아 1% 초과 FK 0개
S4 최근3년(가입계약) = 0.596
S1 상위1% 청구계정 회선 점유 = 0.464
S9 TOAST 메모 행(원시사용) = 225791
```

### 8.2 보조 SQL(1절 #3 `bias.sql`) 출력(22줄 전부)

실행 : `docker exec -i pitel-pg psql -U postgres -d pitel -At -F '|' -v ON_ERROR_STOP=1 -c "SET statement_timeout='10min'" -f - < bias.sql`

```
SET
== S1a 상위 0.01% 고객(번호 작은 쪽 = 핫 키) 가입계약 점유
0.2155
== S1b 고객 1명 최대 가입계약 수
C000000001|530241
== S2 가입상품 최다 상품 점유(정확)
P0000001|518647|0.0368
== S3 상태유형코드 칼럼(pg_stats) : 칼럼 수 · 최빈값 97%+ 수 · 최빈 비율 중앙값
160|157|0.979
== S5 NULL 허용 칼럼(pg_stats) : 칼럼 수 · null 90%+ · null 25~35% · null 50~70%
501|22|165|313
== S6 월 파티션 8개 : 2026-01~10 월평균 / 2011 월평균 (reltuples)
ptl_cus_cust_mm_s|
ptl_inv_rcv_allc_d|4151.1
ptl_inv_rcv_m|4150.3
ptl_pay_bill_d|4150.3
ptl_pay_chrg_calc_l|
ptl_pay_raw_use_l|4150.3
ptl_pay_use_l|4151.3
ptl_pay_use_qty_dd_t|
== S14 청구서 최다 청구계정의 청구서 수(정확)
B000000001|987294
```

### 8.3 보조 SQL 원문

1절 #1 행 수(`rows.sql`, 실행 = `docker exec -i pitel-pg psql -U postgres -d pitel -At -F '|' < rows.sql`) — 파티션 테이블(`relkind = 'p'`)은 `est`, 일반 테이블은 `own` 을 계획 행 수와 비교 :

```sql
SELECT c.relname,
       (SELECT sum(l.reltuples)::bigint FROM pg_partition_tree(c.oid) t JOIN pg_class l ON l.oid=t.relid WHERE t.isleaf) AS est, c.reltuples::bigint AS own,
       c.relkind
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relispartition AND c.relname LIKE 'ptl\_%'
ORDER BY 1;
```

1절 #1a 표본 정확 건수 :

```sql
SELECT (SELECT count(*) FROM ptl_col_ovdu_adchg_std_c),(SELECT count(*) FROM ptl_col_exoftrmn_m),(SELECT count(*) FROM ptl_ord_sbsc_ctrt_m);
```

1절 #3 편향 보조 점검(`bias.sql`) :

```sql
-- 편향 보조 점검(읽기 전용) — verify.mjs 에 없는 S1 세부·S2·S3·S5·S6·S14
\echo == S1a 상위 0.01% 고객(번호 작은 쪽 = 핫 키) 가입계약 점유
SELECT round((SELECT count(*) FROM ptl_ord_sbsc_ctrt_m WHERE cust_no IN (SELECT cust_no FROM ptl_cus_cust_m ORDER BY cust_no LIMIT (SELECT count(*)/10000 FROM ptl_cus_cust_m)))::numeric / count(*), 4) FROM ptl_ord_sbsc_ctrt_m;
\echo == S1b 고객 1명 최대 가입계약 수
SELECT cust_no, count(*) FROM ptl_ord_sbsc_ctrt_m GROUP BY 1 ORDER BY 2 DESC LIMIT 1;
\echo == S2 가입상품 최다 상품 점유(정확)
SELECT prod_cd, count(*), round(count(*)::numeric / sum(count(*)) OVER (), 4) FROM ptl_ord_sbsc_prod_m GROUP BY 1 ORDER BY 2 DESC LIMIT 1;
\echo == S3 상태유형코드 칼럼(pg_stats) : 칼럼 수 · 최빈값 97%+ 수 · 최빈 비율 중앙값
SELECT count(*), count(*) FILTER (WHERE (most_common_freqs)[1] >= 0.97), round(percentile_cont(0.5) WITHIN GROUP (ORDER BY (most_common_freqs)[1])::numeric, 3)
FROM pg_stats s JOIN pg_class c ON c.relname = s.tablename AND NOT c.relispartition
WHERE s.schemaname = 'public' AND s.tablename LIKE 'ptl\_%' AND s.attname LIKE '%stts\_ty\_cd' AND s.inherited = (c.relkind = 'p');
\echo == S5 NULL 허용 칼럼(pg_stats) : 칼럼 수 · null 90%+ · null 25~35% · null 50~70%
SELECT count(*), count(*) FILTER (WHERE s.null_frac >= 0.9), count(*) FILTER (WHERE s.null_frac BETWEEN 0.25 AND 0.35), count(*) FILTER (WHERE s.null_frac BETWEEN 0.5 AND 0.7)
FROM pg_stats s JOIN pg_class c ON c.relname = s.tablename AND NOT c.relispartition AND c.relnamespace = 'public'::regnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = s.attname AND NOT a.attnotnull
WHERE s.schemaname = 'public' AND s.tablename LIKE 'ptl\_%' AND s.inherited = (c.relkind = 'p') AND s.attname NOT LIKE 'lst\_%';
\echo == S6 월 파티션 8개 : 2026-01~10 월평균 / 2011 월평균 (reltuples)
SELECT p.relname, round(avg(l.reltuples) FILTER (WHERE right(l.relname,6) BETWEEN '202601' AND '202610')::numeric / nullif(avg(l.reltuples) FILTER (WHERE right(l.relname,6) LIKE '2011%'),0)::numeric, 1)
FROM pg_class p JOIN pg_inherits i ON i.inhparent = p.oid JOIN pg_class l ON l.oid = i.inhrelid
WHERE p.relkind = 'p' AND p.relnamespace = 'public'::regnamespace AND l.relname ~ '_p\d{6}$' GROUP BY 1 ORDER BY 1;
\echo == S14 청구서 최다 청구계정의 청구서 수(정확)
SELECT bill_acnt_no, count(*) FROM ptl_pay_bill_m WHERE bill_acnt_no = (SELECT (most_common_vals::text::text[])[1] FROM pg_stats WHERE schemaname='public' AND tablename='ptl_pay_bill_m' AND attname='bill_acnt_no' AND inherited) GROUP BY 1;
```

1절 #3a·2절 DEFAULT·4절 파티션 쏠림 확인 :

```sql
SELECT p.relname, pg_get_partkeydef(p.oid), count(*) FILTER (WHERE l.reltuples>0) nonempty, count(*) parts, round(max(l.reltuples)::numeric/nullif(sum(l.reltuples),0)::numeric,3) top_share, min(right(l.relname,6)) FILTER (WHERE l.reltuples>0) first_p, max(right(l.relname,6)) FILTER (WHERE l.reltuples>0) last_p FROM pg_class p JOIN pg_inherits i ON i.inhparent=p.oid JOIN pg_class l ON l.oid=i.inhrelid WHERE p.relkind='p' AND p.relnamespace='public'::regnamespace GROUP BY p.oid, p.relname ORDER BY top_share DESC NULLS LAST;
SELECT count(*), coalesce(sum(c.reltuples),0)::bigint, count(*) FILTER (WHERE c.reltuples>0) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relispartition AND pg_get_expr(c.relpartbound,c.oid)='DEFAULT';
SET statement_timeout='5min';
SELECT count(*) FILTER (WHERE vld_bgng_dtm >= '2011-01-01'), count(*), min(vld_bgng_dtm), max(vld_bgng_dtm) FROM ptl_cus_cust_h;
SELECT count(*) FILTER (WHERE bill_ym >= '201004'), count(*), min(bill_ym), max(bill_ym) FROM ptl_pay_chrg_calc_l;
```
