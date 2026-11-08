# Pi통신 과금 데이터 표준화 — 설계 요약(00_SUMMARY)

> 2026-11-07 · masteragent_da_coordinator · 설계 최종 승인 = [`reviews/08_design_approval.md`](../reviews/08_design_approval.md)(FIXED, 조건부)
> 공용 기준 = [`CONTEXT.md`](../CONTEXT.md)(결정 D1~D15 · 모델링 규칙 2절 · 산출물 형식 3절)

## 1. 프로젝트 개요

| 항목 | 값 |
|---|---|
| 프로젝트 | Pi통신 과금 시스템(분류체계 "Pi통신 과금 데이터 표준화") |
| 테이블 접두 | `PTL` → `PTL_<주제영역>_<엔터티 약어>[_접미어]`(모델 대문자, DDL 소문자) |
| 대상 DBMS | PostgreSQL 17 — 로컬 Docker `pitel-pg`(55432), 적재 DB `pitel`, 검증 DB `pitel_dev`(D2) |
| 업종 | TEL(이동통신) — 국내 3사 실무 · TM Forum SID/eTOM · 3GPP 과금 개념 |
| 범위(오늘) | 표준 → 개념 → 논리 → 물리 → DDL → 테스트 데이터 생성·적재(D1). CDC·데이터 레이크·AI 분석은 다음 세션 |
| 참조무결성 | 관계·FK 는 설계만(434 정의), DDL FK 제약 0 — FK 칼럼 인덱스로 접근 경로 확보(D6) |
| 시스템 칼럼 | DDL 에만 맨 끝 `LST_MDDTM·LST_MDFR_ID·LST_RGDTM·LST_RGTR_ID`(D7) |
| 정산 | 주제영역 아님 — 업무 모듈 `STL`(`moduleCd:'STL'`) 25 테이블(D15) |

## 2. 주제영역별 엔터티·테이블

| 코드 | 주제영역 | 볼륨 등급 | 엔터티(핵심 / 논리) | 테이블 | 속성 / 칼럼 | 보조 인덱스 | FK 정의 | 파티션 | STL |
|---|---|---|---|---|---|---|---|---|---|
| PRD | 상품 | T2 | 30 (10 / 20) | 30 | 244 / 244 | 27 | 44 | 0 | 0 |
| CUS | 고객 | T3 | 30 (10 / 20) | 30 | 310 / 311 | 26 | 51 | 9 | 0 |
| ORD | 가입 | T3 | 30 (10 / 20) | 30 | 318 / 324 | 64 | 91 | 4 | 0 |
| PAY | 청구(사용량·요금계산) | T4 | 30 (10 / 20) | 30 | 333 / 335 | 52 | 59 | 13 | 3 |
| INV | 수납 | T4 | 30 (10 / 20) | 30 | 303 / 305 | 56 | 71 | 6 | 2 |
| COL | 미납 | T3 | 30 (10 / 20) | 30 | 285 / 299 | 50 | 55 | 5 | 1 |
| PRM | 파트너 | T2 | 34 (10 / 24) | 34 | 303 / 306 | 43 | 63 | 1 | 19 |
| **계** | 7 | | **214 (70 / 144)** | **214** | **2,096 / 2,124** | **318** | **434** | **38** | **25** |

주제영역 간 관계(crossRels) 121. 칼럼이 속성보다 많은 28 = 물리 반정규화·파티션 키 PK 확장.

## 3. 표준사전

| 사전 | 건수 | 파일 |
|---|---|---|
| 표준단어 | 410 | `model/std/words.json` |
| 표준도메인 | 36 | `model/std/domains.json` |
| 표준용어 | 1,281 | `model/std/terms.json` |
| 공통코드 / 값 | 326 / 1,617 (유형 313 · 구분 11 · 종류 2) | `model/std/codes.json` |

요약 문서 [`03_standards.md`](03_standards.md). schema.pi 적재 시 도메인은 앱 규칙으로 50개로 재생성(`reviews/07_loader.md` L2).

## 4. 파티션 테이블(RANGE · 전부 DEFAULT 1개 포함, 하위 2,306)

| 단위 | 수 | 하위/개 | 테이블 |
|---|---|---|---|
| 월(2010-01~2027-12) | 8 | 217 | CUS_CUST_MM_S · PAY_RAW_USE_L · PAY_USE_L · PAY_CHRG_CALC_L · PAY_BILL_D · PAY_USE_QTY_DD_T · INV_RCV_M · INV_RCV_ALLC_D |
| 연(2010~2027) | 30 | 19 | CUS_CUST_GRD_H · CUS_CUST_H · CUS_BILL_ACNT_H · CUS_CUST_CNTC_H · CUS_CUST_ADDR_H · CUS_CUST_AGRE_H · CUS_MBSP_POINT_L · CUS_CUST_CNSL_L · ORD_LINE_STTS_H · ORD_SBSC_CTRT_H · ORD_LINE_CHG_H · ORD_SBSC_PROD_H · PAY_USE_QTY_MM_T · PAY_BILL_M · PAY_BILL_TAX_D · PAY_BSCPRVD_EXHST_L · PAY_DSCNT_APLCN_L · PAY_EQP_INSTL_BILL_D · PAY_INVC_PBLCN_L · PAY_BILL_ACNT_MM_T · INV_ATRF_WDRW_REQ_L · INV_PAY_MTHD_H · INV_ATRF_WDRW_RSLT_L · INV_CARD_ATMT_PAY_APRV_L · COL_OVDU_ADCHG_L · COL_DUN_L · COL_UNPD_STTS_H · COL_DUN_SNDNG_RSLT_L · COL_UNPD_MM_T · PRM_MGMT_FEE_L |

(표 안 이름은 `PTL_` 생략.) 파티션 키는 모두 PK 끝에 포함(PostgreSQL 파티션 유일성 제약).

## 5. 인덱스

| 구분 | 수 | 비고 |
|---|---|---|
| PK(`pk_<테이블>`) | 214 | 비파티션 176 = 유일 인덱스 후 `USING INDEX`, 파티션 38 = `ADD PRIMARY KEY` |
| 보조(`x_<테이블>_NN`) | 318 | 유일 2 포함 |
| 계 | 532 | `ddl/*_constraints.sql` — 데이터 적재 **뒤** 실행(D14) |

## 6. DB 현황(`pitel` public, 실측 2026-11-07)

`ptl_` 테이블 214(파티션 하위 제외) · 파티션 상위 38 · 하위 2,306 · 인덱스 0 · PK 0 · 데이터 0행 — 테이블 단계까지 적용 완료, 적재 대기.

## 7. 결정·리뷰 기록

| 단계 | 문서 | 리뷰 |
|---|---|---|
| 주제영역 | [`01_subject_areas.md`](01_subject_areas.md) · `model/areas.json` | [`01_plan.md`](../reviews/01_plan.md) |
| 개념 | `02_conceptual_<AREA>.md` · `model/conceptual/` | [`02_conceptual.md`](../reviews/02_conceptual.md) |
| 표준 | [`03_standards.md`](03_standards.md) · `model/std/` | [`03_logical.md`](../reviews/03_logical.md) · [`05_integrate.md`](../reviews/05_integrate.md) |
| 논리 | `04_logical_<AREA>.md` · `model/logical/` | `reviews/04_logical_<AREA>.md`(7) |
| 물리 | `05_physical_<AREA>.md` · `model/physical/` | `reviews/05_physical_<AREA>.md`(7) |
| DDL | `ddl/README.md` · `ddl/00_run_order.txt` | [`06_ddl.md`](../reviews/06_ddl.md) |
| schema.pi 적재기 | `loader/README.md` | [`07_loader.md`](../reviews/07_loader.md) |
| 설계 최종 승인 | 이 문서 | [`08_design_approval.md`](../reviews/08_design_approval.md) |

## 8. 다음 단계 — 테스트 데이터 생성(2단계)

1. **생성기 검증** : `node datagen/datagen.mjs run --db dev --schema chk_gen --scale 0.001 --jobs 6 --ddl` → `node datagen/verify.mjs`(관계·편향 S1~S14·고아 0.05% 확인). 배율 0.001 계획 = 214 테이블 · 2,270,702 행(`datagen/out/volume.md`).
2. **볼륨 문서** : `docs/06_datagen.md` — 테이블별 목표 행(배율 1.0 합계 목표 11억, D9)·예상 크기(인덱스 포함 ≤ 220GB)·편향 적용표.
3. **본 적재(메인 세션만)** : `pitel` public 에 테이블 × 연도 단위 병렬(동시 6) 적재 → `ddl/*_constraints.sql` 10~70 → `ANALYZE` → 파티션 DEFAULT 건수 확인(0 기대).
4. **schema.pi 반영** : 승인 조건 C1·C2(논리 스냅숏·조회용 중복 → 물리 반정규화, FK 역할명 4) 해소 후 `loader/load-schema-pi.mjs --replace` 로 복제 DB 재시험 → 메인이 운영 적용(대상 ref 확인 필수).
5. 이후 세션 : CDC 파이프라인(`wal_level=logical` 준비 완료) → 데이터 레이크 → AI 분석 센터.
