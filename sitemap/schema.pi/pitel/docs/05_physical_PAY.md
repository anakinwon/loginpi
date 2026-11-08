# 05 물리 모델 — PAY 청구(사용량·요금계산 포함)

> 작성 2026-11-07 · subagent_physical_modeler · 대상 PostgreSQL 17 · 생성기 `tools/physical_PAY.js` · 산출 `model/physical/PAY.json`, `ddl/40_pay_tables.sql`, `ddl/40_pay_constraints.sql`
> 마스터 위임 자동 승인 모드 — 판단 근거는 6절 결정 메모.

## 1. 테이블 목록

| ID | 엔터티 | 테이블 | 유형 | 모듈 | 칼럼 | PK | 파티션 | 인덱스 | FK(정의) | 예상 행 수 | 등급 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PAY-001 | 원시사용내역 | `PTL_PAY_RAW_USE_L` | ACT |  | 15(+4) | RAW_USE_NO + CLCT_DTM | 월 CLCT_DTM | 3 | 1 | 100,000,000 | T4 |
| PAY-002 | 사용내역 | `PTL_PAY_USE_L` | ACT |  | 18(+4) | USE_NO + BILL_YM | 월 BILL_YM | 4 | 3 | 150,000,000 | T4 |
| PAY-003 | 사용량월집계 | `PTL_PAY_USE_QTY_MM_T` | PROC |  | 12(+4) | SVC_MGMT_NO + BILL_YM + USE_SVC_TY_CD | 연 BILL_YM | 0 | 1 | 20,000,000 | T3 |
| PAY-004 | 요금계산내역 | `PTL_PAY_CHRG_CALC_L` | ACT |  | 18(+4) | CHRG_CALC_NO + BILL_YM | 월 BILL_YM | 5 | 7 | 100,000,000 | T4 |
| PAY-005 | 청구주기코드 | `PTL_PAY_BILL_CYCL_C` | REF |  | 10(+4) | BILL_CYCL_CD | - | 0 | 0 | 30 | T1 |
| PAY-006 | 청구작업기본 | `PTL_PAY_BILL_JOB_M` | ACT |  | 13(+4) | BILL_JOB_NO | - | 1 | 1 | 5,000 | T1 |
| PAY-007 | 청구기본 | `PTL_PAY_BILL_M` | ACT |  | 18(+4) | BILL_NO + BILL_YM | 연 BILL_YM | 4 | 4 | 25,000,000 | T3 |
| PAY-008 | 청구상세 | `PTL_PAY_BILL_D` | ACT |  | 12(+4) | BILL_NO + BILL_DTL_SEQ + BILL_YM | 월 BILL_YM | 1 | 3 | 100,000,000 | T4 |
| PAY-009 | 청구조정내역 | `PTL_PAY_BILL_ADJ_L` | ACT |  | 13(+4) | BILL_ADJ_NO | - | 2 | 3 | 5,000,000 | T2 |
| PAY-010 | 청구세금상세 | `PTL_PAY_BILL_TAX_D` | ACT |  | 12(+4) | BILL_NO + TXTN_TY_CD + BILL_YM | 연 BILL_YM | 1 | 1 | 30,000,000 | T3 |
| PAY-011 | 사용량수집파일내역 | `PTL_PAY_USE_QTY_CLCT_FILE_L` | ACT |  | 11(+4) | CLCT_FILE_NO | - | 2 | 0 | 2,000,000 | T2 |
| PAY-012 | 사용량오류내역 | `PTL_PAY_USE_QTY_ERR_L` | ACT |  | 8(+4) | USE_QTY_ERR_NO | - | 2 | 1 | 3,000,000 | T2 |
| PAY-013 | 사용량일집계 | `PTL_PAY_USE_QTY_DD_T` | PROC |  | 8(+4) | SVC_MGMT_NO + USE_DT + USE_SVC_TY_CD | 월 USE_DT | 0 | 1 | 100,000,000 | T4 |
| PAY-014 | 기본제공소진내역 | `PTL_PAY_BSCPRVD_EXHST_L` | ACT |  | 9(+4) | SVC_MGMT_NO + BILL_YM + USE_SVC_TY_CD + SBSC_PROD_NO | 연 BILL_YM | 1 | 2 | 20,000,000 | T3 |
| PAY-015 | 요금계산이력 | `PTL_PAY_CHRG_CALC_H` | ACT |  | 8(+4) | CHRG_CALC_NO + CHRG_CALC_HIST_SEQ | - | 1 | 2 | 15,000,000 | T3 |
| PAY-016 | 일할요금상세 | `PTL_PAY_DYPRT_CHRG_D` | ACT |  | 9(+4) | CHRG_CALC_NO + DYPRT_CHRG_DTL_SEQ | - | 0 | 1 | 8,000,000 | T2 |
| PAY-017 | 할인적용내역 | `PTL_PAY_DSCNT_APLCN_L` | ACT |  | 9(+4) | DSCNT_APLCN_NO + DSCNT_APLCN_DTM | 연 DSCNT_APLCN_DTM | 3 | 3 | 30,000,000 | T3 |
| PAY-018 | 결합할인배분내역 | `PTL_PAY_CMBN_DSCNT_ALLC_L` | ACT |  | 10(+4) | CMBN_DSCNT_ALLC_NO | - | 3 | 3 | 10,000,000 | T3 |
| PAY-019 | 위약금부과내역 | `PTL_PAY_PNLT_IMPS_L` | ACT |  | 12(+4) | PNLT_IMPS_NO | - | 3 | 3 | 3,000,000 | T2 |
| PAY-020 | 단말할부청구상세 | `PTL_PAY_EQP_INSTL_BILL_D` | ACT |  | 10(+4) | EQP_INSTL_CTRT_NO + INSTL_TMS + BILL_YM | 연 BILL_YM | 1 | 2 | 20,000,000 | T3 |
| PAY-021 | 로밍사용내역 | `PTL_PAY_ROAM_USE_L` | ACT | STL | 17(+4) | ROAM_USE_NO | - | 4 | 3 | 5,000,000 | T2 |
| PAY-022 | 소액결제청구상세 | `PTL_PAY_MCPAY_BILL_D` | ACT | STL | 11(+4) | MCPAY_NO | - | 3 | 3 | 10,000,000 | T3 |
| PAY-023 | 콘텐츠이용요금내역 | `PTL_PAY_CNTS_UTLZ_CHRG_L` | ACT | STL | 12(+4) | CNTS_UTLZ_NO | - | 4 | 4 | 10,000,000 | T3 |
| PAY-024 | 청구조정사유코드 | `PTL_PAY_BILL_ADJ_RSN_C` | REF |  | 9(+4) | BILL_ADJ_RSN_TY_CD | - | 0 | 0 | 200 | T1 |
| PAY-025 | 청구마감이력 | `PTL_PAY_BILL_DDLN_H` | ACT |  | 6(+4) | BILL_JOB_NO + BILL_DDLN_HIST_SEQ | - | 0 | 1 | 15,000 | T1 |
| PAY-026 | 청구서발행내역 | `PTL_PAY_INVC_PBLCN_L` | ACT |  | 8(+4) | INVC_PBLCN_NO + INVC_PBLCN_DTM | 연 INVC_PBLCN_DTM | 1 | 1 | 28,000,000 | T3 |
| PAY-027 | 청구서재발행내역 | `PTL_PAY_INVC_RE_PBLCN_L` | ACT |  | 7(+4) | INVC_RE_PBLCN_NO | - | 2 | 2 | 2,000,000 | T2 |
| PAY-028 | 청구계정월집계 | `PTL_PAY_BILL_ACNT_MM_T` | PROC |  | 12(+4) | BILL_ACNT_NO + BILL_YM | 연 BILL_YM | 0 | 1 | 25,000,000 | T3 |
| PAY-029 | 요금항목월통계 | `PTL_PAY_CHRG_ITM_MM_S` | PROC |  | 9(+4) | CHRG_ITM_CD + BILL_YM | - | 1 | 1 | 100,000 | T1 |
| PAY-030 | 청구작업단계이력 | `PTL_PAY_BILL_JOB_STEP_H` | ACT |  | 9(+4) | BILL_JOB_NO + BILL_JOB_STEP_SEQ | - | 0 | 1 | 50,000 | T1 |

테이블 30개 · 예상 합계 821,170,230행 · 인덱스 52개(PK 제외) · FK 정의 59개(DDL 미생성, D6)

## 2. 파티션

| 테이블 | 단위 | 키(타입) | 범위 | 하위 테이블 | 사유 |
|---|---|---|---|---|---|
| `PTL_PAY_RAW_USE_L` | 월 | CLCT_DTM(TIMESTAMP) | 2010-01~2027-12 | 216 + DEFAULT(`_pdef`) | T4 100,000,000행 — 청구월 단위 보관·삭제·재청구, 최근 파티션 쏠림(S6) 분리 |
| `PTL_PAY_USE_L` | 월 | BILL_YM(CHAR(6)) | 2010-01~2027-12 | 216 + DEFAULT(`_pdef`) | T4 150,000,000행 — 청구월 단위 보관·삭제·재청구, 최근 파티션 쏠림(S6) 분리 |
| `PTL_PAY_USE_QTY_MM_T` | 연 | BILL_YM(CHAR(6)) | 2010-01~2027-12 | 18 + DEFAULT(`_pdef`) | T3 누적 이력 20,000,000행 — 청구월 단위 보관·삭제·재청구, 최근 파티션 쏠림(S6) 분리 |
| `PTL_PAY_CHRG_CALC_L` | 월 | BILL_YM(CHAR(6)) | 2010-01~2027-12 | 216 + DEFAULT(`_pdef`) | T4 100,000,000행 — 청구월 단위 보관·삭제·재청구, 최근 파티션 쏠림(S6) 분리 |
| `PTL_PAY_BILL_M` | 연 | BILL_YM(CHAR(6)) | 2010-01~2027-12 | 18 + DEFAULT(`_pdef`) | T3 누적 이력 25,000,000행 — 청구월 단위 보관·삭제·재청구, 최근 파티션 쏠림(S6) 분리 |
| `PTL_PAY_BILL_D` | 월 | BILL_YM(CHAR(6)) | 2010-01~2027-12 | 216 + DEFAULT(`_pdef`) | T4 100,000,000행 — 청구월 단위 보관·삭제·재청구, 최근 파티션 쏠림(S6) 분리 |
| `PTL_PAY_BILL_TAX_D` | 연 | BILL_YM(CHAR(6)) | 2010-01~2027-12 | 18 + DEFAULT(`_pdef`) | T3 누적 이력 30,000,000행 — 청구월 단위 보관·삭제·재청구, 최근 파티션 쏠림(S6) 분리 |
| `PTL_PAY_USE_QTY_DD_T` | 월 | USE_DT(CHAR(8)) | 2010-01~2027-12 | 216 + DEFAULT(`_pdef`) | T4 100,000,000행 — 청구월 단위 보관·삭제·재청구, 최근 파티션 쏠림(S6) 분리 |
| `PTL_PAY_BSCPRVD_EXHST_L` | 연 | BILL_YM(CHAR(6)) | 2010-01~2027-12 | 18 + DEFAULT(`_pdef`) | T3 누적 이력 20,000,000행 — 청구월 단위 보관·삭제·재청구, 최근 파티션 쏠림(S6) 분리 |
| `PTL_PAY_DSCNT_APLCN_L` | 연 | DSCNT_APLCN_DTM(TIMESTAMP) | 2010-01~2027-12 | 18 + DEFAULT(`_pdef`) | T3 누적 이력 30,000,000행 — 청구월 단위 보관·삭제·재청구, 최근 파티션 쏠림(S6) 분리 |
| `PTL_PAY_EQP_INSTL_BILL_D` | 연 | BILL_YM(CHAR(6)) | 2010-01~2027-12 | 18 + DEFAULT(`_pdef`) | T3 누적 이력 20,000,000행 — 청구월 단위 보관·삭제·재청구, 최근 파티션 쏠림(S6) 분리 |
| `PTL_PAY_INVC_PBLCN_L` | 연 | INVC_PBLCN_DTM(TIMESTAMP) | 2010-01~2027-12 | 18 + DEFAULT(`_pdef`) | T3 누적 이력 28,000,000행 — 청구월 단위 보관·삭제·재청구, 최근 파티션 쏠림(S6) 분리 |
| `PTL_PAY_BILL_ACNT_MM_T` | 연 | BILL_YM(CHAR(6)) | 2010-01~2027-12 | 18 + DEFAULT(`_pdef`) | T3 누적 이력 25,000,000행 — 청구월 단위 보관·삭제·재청구, 최근 파티션 쏠림(S6) 분리 |

하위 테이블 이름 = `<테이블>_pYYYYMM`(월)·`<테이블>_pYYYY`(연)·`<테이블>_pdef`(기본). 파티션 키는 PK 에 포함(결정 P1). 2028년 이후 파티션은 운영 배치가 매년 추가(DEFAULT 에 쌓이지 않게).

## 3. 인덱스

| 테이블 | 이름 | 칼럼 | 조건 | 근거 |
|---|---|---|---|---|
| `PTL_PAY_RAW_USE_L` | `PK_PTL_PAY_RAW_USE_L` | RAW_USE_NO, CLCT_DTM | PK | 주식별자 + 파티션 키 |
| `PTL_PAY_RAW_USE_L` | `X_PTL_PAY_RAW_USE_L_01` | CLCT_FILE_NO |  | FK 조인(수집파일 → 원시 CDR) — 파일 단위 건수 대사·재수집 삭제 범위 |
| `PTL_PAY_RAW_USE_L` | `X_PTL_PAY_RAW_USE_L_02` | SVC_NO, USE_BGNG_DTM |  | 서비스번호 + 사용 기간 원시 CDR 조회(과금 이의·민원 원본 확인) |
| `PTL_PAY_RAW_USE_L` | `X_PTL_PAY_RAW_USE_L_03` | CLCT_DTM | `raw_use_prcs_stts_ty_cd IN ('01','02','03','05')` | 미과금 처리 큐 — 수집·파싱완료·과금대기·오류 상태만(98% 과금완료 저선택도 S3 회피 부분 인덱스) |
| `PTL_PAY_USE_L` | `PK_PTL_PAY_USE_L` | USE_NO, BILL_YM | PK | 주식별자 + 파티션 키 |
| `PTL_PAY_USE_L` | `X_PTL_PAY_USE_L_01` | SVC_MGMT_NO, BILL_YM, USE_BGNG_DTM |  | 회선 + 청구년월 사용내역 조회(요금 상세·통화내역서) — 최다 조회 경로, FK 조인(회선기본) |
| `PTL_PAY_USE_L` | `X_PTL_PAY_USE_L_02` | SVC_NO, USE_BGNG_DTM |  | 서비스번호 + 사용 일시 조회(상담 화면 — 서비스관리번호 모르는 진입) |
| `PTL_PAY_USE_L` | `X_PTL_PAY_USE_L_03` | RAW_USE_NO |  | FK 조인(원시사용내역 ↔ 사용내역 대사·재Rating) |
| `PTL_PAY_USE_L` | `X_PTL_PAY_USE_L_04` | BILL_YM | `use_rat_stts_ty_cd IN ('01','03','05')` | Bill Run 직전 미완료 과금 점검 — 과금대기·재과금·오류만(부분 인덱스) |
| `PTL_PAY_USE_QTY_MM_T` | `PK_PTL_PAY_USE_QTY_MM_T` | SVC_MGMT_NO, BILL_YM, USE_SVC_TY_CD | PK | 주식별자 + 파티션 키 |
| `PTL_PAY_CHRG_CALC_L` | `PK_PTL_PAY_CHRG_CALC_L` | CHRG_CALC_NO, BILL_YM | PK | 주식별자 + 파티션 키 |
| `PTL_PAY_CHRG_CALC_L` | `X_PTL_PAY_CHRG_CALC_L_01` | BILL_ACNT_NO, BILL_YM |  | 청구계정 + 청구년월 요금계산 결과 조회(청구서 구성·상담) — FK 조인(청구계정기본) |
| `PTL_PAY_CHRG_CALC_L` | `X_PTL_PAY_CHRG_CALC_L_02` | SVC_MGMT_NO, BILL_YM |  | 회선 + 청구년월 요금계산 조회 — FK 조인(회선기본) |
| `PTL_PAY_CHRG_CALC_L` | `X_PTL_PAY_CHRG_CALC_L_03` | BILL_JOB_NO |  | FK 조인(청구작업) — Bill Run 단위 재계산·롤백 대상 |
| `PTL_PAY_CHRG_CALC_L` | `X_PTL_PAY_CHRG_CALC_L_04` | BILL_NO, BILL_DTL_SEQ |  | FK 조인(청구상세) — 청구 라인의 계산 근거 역추적 |
| `PTL_PAY_CHRG_CALC_L` | `X_PTL_PAY_CHRG_CALC_L_05` | SBSC_PROD_NO |  | FK 조인(가입상품기본) — 가입상품별 요금 이력 |
| `PTL_PAY_BILL_CYCL_C` | `PK_PTL_PAY_BILL_CYCL_C` | BILL_CYCL_CD | PK | 주식별자 |
| `PTL_PAY_BILL_JOB_M` | `PK_PTL_PAY_BILL_JOB_M` | BILL_JOB_NO | PK | 주식별자 |
| `PTL_PAY_BILL_JOB_M` | `X_PTL_PAY_BILL_JOB_M_01` | BILL_YM, BILL_CYCL_CD |  | 청구년월 + 청구주기 Bill Run 조회 — FK 조인(청구주기코드) |
| `PTL_PAY_BILL_M` | `PK_PTL_PAY_BILL_M` | BILL_NO, BILL_YM | PK | 주식별자 + 파티션 키 |
| `PTL_PAY_BILL_M` | `X_PTL_PAY_BILL_M_01` | BILL_ACNT_NO, BILL_YM |  | 청구계정 + 청구년월 청구서 조회(수납·상담 최다 경로) — FK 조인(청구계정기본), 핫 키 S14 는 BILL_YM 으로 범위 축소 |
| `PTL_PAY_BILL_M` | `X_PTL_PAY_BILL_M_02` | BILL_JOB_NO |  | FK 조인(청구작업) — Bill Run 단위 청구서 확정·발행 |
| `PTL_PAY_BILL_M` | `X_PTL_PAY_BILL_M_03` | ORGN_BILL_NO | `orgn_bill_no IS NOT NULL` | 재청구 → 원청구 추적(자기 참조 FK) — 재청구만(부분 인덱스) |
| `PTL_PAY_BILL_M` | `X_PTL_PAY_BILL_M_04` | PAY_TMLMT_DT | `bill_stts_ty_cd IN ('03','05','06')` | 납부기한 경과 미납 확정 배치(COL 입력) — 발행·일부수납·미납 상태만(부분 인덱스) |
| `PTL_PAY_BILL_D` | `PK_PTL_PAY_BILL_D` | BILL_NO, BILL_DTL_SEQ, BILL_YM | PK | 주식별자 + 파티션 키 |
| `PTL_PAY_BILL_D` | `X_PTL_PAY_BILL_D_01` | SVC_MGMT_NO, BILL_YM |  | 회선 + 청구년월 청구 라인 조회(회선별 요금 명세) — FK 조인(회선기본) |
| `PTL_PAY_BILL_ADJ_L` | `PK_PTL_PAY_BILL_ADJ_L` | BILL_ADJ_NO | PK | 주식별자 |
| `PTL_PAY_BILL_ADJ_L` | `X_PTL_PAY_BILL_ADJ_L_01` | BILL_NO, BILL_DTL_SEQ |  | FK 조인(청구기본·청구상세) — 청구서별 조정 내역 |
| `PTL_PAY_BILL_ADJ_L` | `X_PTL_PAY_BILL_ADJ_L_02` | RFLT_BILL_YM | `bill_adj_stts_ty_cd = '02'` | 승인되었으나 미반영된 조정 → 반영 청구년월 Bill Run 입력(부분 인덱스) |
| `PTL_PAY_BILL_TAX_D` | `PK_PTL_PAY_BILL_TAX_D` | BILL_NO, TXTN_TY_CD, BILL_YM | PK | 주식별자 + 파티션 키 |
| `PTL_PAY_BILL_TAX_D` | `X_PTL_PAY_BILL_TAX_D_01` | ELCTR_TXINV_APRV_NO | `elctr_txinv_aprv_no IS NOT NULL` | 전자세금계산서 승인번호 조회(국세청 대사) — 발행분만(부분 인덱스) |
| `PTL_PAY_USE_QTY_CLCT_FILE_L` | `PK_PTL_PAY_USE_QTY_CLCT_FILE_L` | CLCT_FILE_NO | PK | 주식별자 |
| `PTL_PAY_USE_QTY_CLCT_FILE_L` | `X_PTL_PAY_USE_QTY_CLCT_FILE_L_01` | CLCT_DTM |  | 수집일시 범위 파일 대사(일별 수집 건수 점검) |
| `PTL_PAY_USE_QTY_CLCT_FILE_L` | `X_PTL_PAY_USE_QTY_CLCT_FILE_L_02` | CLCT_FILE_NM |  | 파일명 중복 수집 확인(재전송 파일 판별) |
| `PTL_PAY_USE_QTY_ERR_L` | `PK_PTL_PAY_USE_QTY_ERR_L` | USE_QTY_ERR_NO | PK | 주식별자 |
| `PTL_PAY_USE_QTY_ERR_L` | `X_PTL_PAY_USE_QTY_ERR_L_01` | RAW_USE_NO |  | FK 조인(원시사용내역) — 원본 CDR 별 오류 이력 |
| `PTL_PAY_USE_QTY_ERR_L` | `X_PTL_PAY_USE_QTY_ERR_L_02` | ERR_OCRN_DTM | `err_prcs_stts_ty_cd IN ('01','02')` | 재처리 대상 큐 — 미처리·재처리중만(부분 인덱스) |
| `PTL_PAY_USE_QTY_DD_T` | `PK_PTL_PAY_USE_QTY_DD_T` | SVC_MGMT_NO, USE_DT, USE_SVC_TY_CD | PK | 주식별자 + 파티션 키 |
| `PTL_PAY_BSCPRVD_EXHST_L` | `PK_PTL_PAY_BSCPRVD_EXHST_L` | SVC_MGMT_NO, BILL_YM, USE_SVC_TY_CD, SBSC_PROD_NO | PK | 주식별자 + 파티션 키 |
| `PTL_PAY_BSCPRVD_EXHST_L` | `X_PTL_PAY_BSCPRVD_EXHST_L_01` | SBSC_PROD_NO, BILL_YM |  | FK 조인(가입상품기본) — 가입상품(데이터 부가팩)별 월 소진 조회 |
| `PTL_PAY_CHRG_CALC_H` | `PK_PTL_PAY_CHRG_CALC_H` | CHRG_CALC_NO, CHRG_CALC_HIST_SEQ | PK | 주식별자 |
| `PTL_PAY_CHRG_CALC_H` | `X_PTL_PAY_CHRG_CALC_H_01` | BILL_JOB_NO |  | FK 조인(청구작업) — Bill Run 별 재계산 이력 |
| `PTL_PAY_DYPRT_CHRG_D` | `PK_PTL_PAY_DYPRT_CHRG_D` | CHRG_CALC_NO, DYPRT_CHRG_DTL_SEQ | PK | 주식별자 |
| `PTL_PAY_DSCNT_APLCN_L` | `PK_PTL_PAY_DSCNT_APLCN_L` | DSCNT_APLCN_NO, DSCNT_APLCN_DTM | PK | 주식별자 + 파티션 키 |
| `PTL_PAY_DSCNT_APLCN_L` | `X_PTL_PAY_DSCNT_APLCN_L_01` | CHRG_CALC_NO |  | FK 조인(요금계산내역) — 요금계산 건별 할인 |
| `PTL_PAY_DSCNT_APLCN_L` | `X_PTL_PAY_DSCNT_APLCN_L_02` | SBSC_PROD_NO |  | FK 조인(가입상품기본) — 가입 할인상품 적용 실적 |
| `PTL_PAY_DSCNT_APLCN_L` | `X_PTL_PAY_DSCNT_APLCN_L_03` | PROD_CD, DSCNT_APLCN_DTM |  | FK 조인(할인상품기본) — 할인상품별 기간 적용 실적(선택약정 25% 등) |
| `PTL_PAY_CMBN_DSCNT_ALLC_L` | `PK_PTL_PAY_CMBN_DSCNT_ALLC_L` | CMBN_DSCNT_ALLC_NO | PK | 주식별자 |
| `PTL_PAY_CMBN_DSCNT_ALLC_L` | `X_PTL_PAY_CMBN_DSCNT_ALLC_L_01` | CMBN_CTRT_NO, BILL_YM |  | FK 조인(결합계약기본) — 결합계약 + 청구년월 배분 조회 |
| `PTL_PAY_CMBN_DSCNT_ALLC_L` | `X_PTL_PAY_CMBN_DSCNT_ALLC_L_02` | SVC_MGMT_NO, BILL_YM |  | FK 조인(회선기본) — 회선 + 청구년월 결합할인 |
| `PTL_PAY_CMBN_DSCNT_ALLC_L` | `X_PTL_PAY_CMBN_DSCNT_ALLC_L_03` | CHRG_CALC_NO |  | FK 조인(요금계산내역) |
| `PTL_PAY_PNLT_IMPS_L` | `PK_PTL_PAY_PNLT_IMPS_L` | PNLT_IMPS_NO | PK | 주식별자 |
| `PTL_PAY_PNLT_IMPS_L` | `X_PTL_PAY_PNLT_IMPS_L_01` | SVC_MGMT_NO |  | FK 조인(회선기본) — 회선별 위약금 조회(해지 상담) |
| `PTL_PAY_PNLT_IMPS_L` | `X_PTL_PAY_PNLT_IMPS_L_02` | AGRMT_CTRT_NO |  | FK 조인(약정계약기본) |
| `PTL_PAY_PNLT_IMPS_L` | `X_PTL_PAY_PNLT_IMPS_L_03` | CHRG_CALC_NO |  | FK 조인(요금계산내역) |
| `PTL_PAY_EQP_INSTL_BILL_D` | `PK_PTL_PAY_EQP_INSTL_BILL_D` | EQP_INSTL_CTRT_NO, INSTL_TMS, BILL_YM | PK | 주식별자 + 파티션 키 |
| `PTL_PAY_EQP_INSTL_BILL_D` | `X_PTL_PAY_EQP_INSTL_BILL_D_01` | BILL_NO, BILL_DTL_SEQ |  | FK 조인(청구상세) — 청구 라인별 할부금 |
| `PTL_PAY_ROAM_USE_L` | `PK_PTL_PAY_ROAM_USE_L` | ROAM_USE_NO | PK | 주식별자 |
| `PTL_PAY_ROAM_USE_L` | `X_PTL_PAY_ROAM_USE_L_01` | SVC_MGMT_NO, USE_BGNG_DTM |  | FK 조인(회선기본) — 회선 로밍 사용 조회 |
| `PTL_PAY_ROAM_USE_L` | `X_PTL_PAY_ROAM_USE_L_02` | ROAM_BZMN_NO, BILL_YM |  | FK 조인(로밍사업자기본) — 사업자 + 청구년월 로밍 정산 집계(STL) |
| `PTL_PAY_ROAM_USE_L` | `X_PTL_PAY_ROAM_USE_L_03` | USE_NO |  | FK 조인(사용내역) |
| `PTL_PAY_ROAM_USE_L` | `X_PTL_PAY_ROAM_USE_L_04` | TAP_FILE_NM |  | TAP 파일 단위 수신 대사·RAP 반송 |
| `PTL_PAY_MCPAY_BILL_D` | `PK_PTL_PAY_MCPAY_BILL_D` | MCPAY_NO | PK | 주식별자 |
| `PTL_PAY_MCPAY_BILL_D` | `X_PTL_PAY_MCPAY_BILL_D_01` | SVC_MGMT_NO, PYMT_DTM |  | FK 조인(회선기본) — 회선 소액결제 이용 내역(상담·한도) |
| `PTL_PAY_MCPAY_BILL_D` | `X_PTL_PAY_MCPAY_BILL_D_02` | CNTS_PRVD_CO_NO, BILL_YM |  | FK 조인(콘텐츠제공사기본) — 제공사 + 청구년월 정산(STL) |
| `PTL_PAY_MCPAY_BILL_D` | `X_PTL_PAY_MCPAY_BILL_D_03` | BILL_NO, BILL_DTL_SEQ |  | FK 조인(청구상세) |
| `PTL_PAY_CNTS_UTLZ_CHRG_L` | `PK_PTL_PAY_CNTS_UTLZ_CHRG_L` | CNTS_UTLZ_NO | PK | 주식별자 |
| `PTL_PAY_CNTS_UTLZ_CHRG_L` | `X_PTL_PAY_CNTS_UTLZ_CHRG_L_01` | SVC_MGMT_NO, CNTS_UTLZ_DTM |  | FK 조인(회선기본) — 회선 콘텐츠 이용 내역 |
| `PTL_PAY_CNTS_UTLZ_CHRG_L` | `X_PTL_PAY_CNTS_UTLZ_CHRG_L_02` | CNTS_PRVD_CO_NO, BILL_YM |  | FK 조인(콘텐츠제공사기본) — 제공사 + 청구년월 정산(STL) |
| `PTL_PAY_CNTS_UTLZ_CHRG_L` | `X_PTL_PAY_CNTS_UTLZ_CHRG_L_03` | BILL_NO, BILL_DTL_SEQ |  | FK 조인(청구상세) |
| `PTL_PAY_CNTS_UTLZ_CHRG_L` | `X_PTL_PAY_CNTS_UTLZ_CHRG_L_04` | USE_NO |  | FK 조인(사용내역) |
| `PTL_PAY_BILL_ADJ_RSN_C` | `PK_PTL_PAY_BILL_ADJ_RSN_C` | BILL_ADJ_RSN_TY_CD | PK | 주식별자 |
| `PTL_PAY_BILL_DDLN_H` | `PK_PTL_PAY_BILL_DDLN_H` | BILL_JOB_NO, BILL_DDLN_HIST_SEQ | PK | 주식별자 |
| `PTL_PAY_INVC_PBLCN_L` | `PK_PTL_PAY_INVC_PBLCN_L` | INVC_PBLCN_NO, INVC_PBLCN_DTM | PK | 주식별자 + 파티션 키 |
| `PTL_PAY_INVC_PBLCN_L` | `X_PTL_PAY_INVC_PBLCN_L_01` | BILL_NO |  | FK 조인(청구기본) — 청구서별 발송 결과 |
| `PTL_PAY_INVC_RE_PBLCN_L` | `PK_PTL_PAY_INVC_RE_PBLCN_L` | INVC_RE_PBLCN_NO | PK | 주식별자 |
| `PTL_PAY_INVC_RE_PBLCN_L` | `X_PTL_PAY_INVC_RE_PBLCN_L_01` | BILL_NO |  | FK 조인(청구기본) |
| `PTL_PAY_INVC_RE_PBLCN_L` | `X_PTL_PAY_INVC_RE_PBLCN_L_02` | INVC_PBLCN_NO |  | FK 조인(청구서발행내역) — 원 발행 건 추적 |
| `PTL_PAY_BILL_ACNT_MM_T` | `PK_PTL_PAY_BILL_ACNT_MM_T` | BILL_ACNT_NO, BILL_YM | PK | 주식별자 + 파티션 키 |
| `PTL_PAY_CHRG_ITM_MM_S` | `PK_PTL_PAY_CHRG_ITM_MM_S` | CHRG_ITM_CD, BILL_YM | PK | 주식별자 |
| `PTL_PAY_CHRG_ITM_MM_S` | `X_PTL_PAY_CHRG_ITM_MM_S_01` | BILL_YM |  | 청구년월 전체 요금항목 매출 통계(PK 선두가 요금항목코드라 월 단위 조회 보완) |
| `PTL_PAY_BILL_JOB_STEP_H` | `PK_PTL_PAY_BILL_JOB_STEP_H` | BILL_JOB_NO, BILL_JOB_STEP_SEQ | PK | 주식별자 |

중복 인덱스 검사 : PK·다른 인덱스의 앞부분과 같은 칼럼 열 = 0건(생성기가 검사). 부분 인덱스는 조건이 달라 별도.

## 4. 반정규화

| 테이블 | 칼럼 | 원천 | 사유 |
|---|---|---|---|
| `PTL_PAY_BILL_D` | BILL_YM | `PTL_PAY_BILL_M` | 월 RANGE 파티션 키(논리 M1 에서 제거한 청구년월 복원) — 청구기본과 같은 월 파티션 정렬, 회선 + 청구년월 청구 라인 조회. 값은 청구기본.청구년월과 항상 같음(청구서 생성 시 함께 기록) |
| `PTL_PAY_BILL_TAX_D` | BILL_YM | `PTL_PAY_BILL_M` | 연 RANGE 파티션 키 — 부모 청구기본과 같은 연 파티션 정렬(부가가치세 신고 기간 = 청구년월 기준 조회) |

그 외 반정규화 없음 — 청구기본 금액 합계는 논리 E2(확정 금액 스냅샷)로 이미 논리 속성이고, 서비스번호·청구계정번호 복사는 PK 조인 1회로 충분해 하지 않음.

## 5. FK 정의(DDL 미생성, D6)

| 이름 | 자식 칼럼 | 부모 테이블 | 부모 칼럼 | 부모 영역 |
|---|---|---|---|---|
| `FK_PTL_PAY_RAW_USE_L_01` | CLCT_FILE_NO | `PTL_PAY_USE_QTY_CLCT_FILE_L` | CLCT_FILE_NO | PAY |
| `FK_PTL_PAY_USE_L_01` | RAW_USE_NO | `PTL_PAY_RAW_USE_L` | RAW_USE_NO | PAY |
| `FK_PTL_PAY_USE_L_02` | SVC_MGMT_NO | `PTL_ORD_LINE_M` | SVC_MGMT_NO | ORD |
| `FK_PTL_PAY_USE_L_03` | CHRG_ITM_CD | `PTL_PRD_CHRG_ITM_C` | CHRG_ITM_CD | PRD |
| `FK_PTL_PAY_USE_QTY_MM_T_01` | SVC_MGMT_NO | `PTL_ORD_LINE_M` | SVC_MGMT_NO | ORD |
| `FK_PTL_PAY_CHRG_CALC_L_01` | BILL_JOB_NO | `PTL_PAY_BILL_JOB_M` | BILL_JOB_NO | PAY |
| `FK_PTL_PAY_CHRG_CALC_L_02` | BILL_ACNT_NO | `PTL_CUS_BILL_ACNT_M` | BILL_ACNT_NO | CUS |
| `FK_PTL_PAY_CHRG_CALC_L_03` | SVC_MGMT_NO | `PTL_ORD_LINE_M` | SVC_MGMT_NO | ORD |
| `FK_PTL_PAY_CHRG_CALC_L_04` | SVC_MGMT_NO, BILL_YM, USE_SVC_TY_CD | `PTL_PAY_USE_QTY_MM_T` | SVC_MGMT_NO, BILL_YM, USE_SVC_TY_CD | PAY |
| `FK_PTL_PAY_CHRG_CALC_L_05` | SBSC_PROD_NO | `PTL_ORD_SBSC_PROD_M` | SBSC_PROD_NO | ORD |
| `FK_PTL_PAY_CHRG_CALC_L_06` | CHRG_ITM_CD | `PTL_PRD_CHRG_ITM_C` | CHRG_ITM_CD | PRD |
| `FK_PTL_PAY_CHRG_CALC_L_07` | BILL_NO, BILL_DTL_SEQ | `PTL_PAY_BILL_D` | BILL_NO, BILL_DTL_SEQ | PAY |
| `FK_PTL_PAY_BILL_JOB_M_01` | BILL_CYCL_CD | `PTL_PAY_BILL_CYCL_C` | BILL_CYCL_CD | PAY |
| `FK_PTL_PAY_BILL_M_01` | BILL_ACNT_NO | `PTL_CUS_BILL_ACNT_M` | BILL_ACNT_NO | CUS |
| `FK_PTL_PAY_BILL_M_02` | BILL_JOB_NO | `PTL_PAY_BILL_JOB_M` | BILL_JOB_NO | PAY |
| `FK_PTL_PAY_BILL_M_03` | BILL_CYCL_CD | `PTL_PAY_BILL_CYCL_C` | BILL_CYCL_CD | PAY |
| `FK_PTL_PAY_BILL_M_04` | ORGN_BILL_NO | `PTL_PAY_BILL_M` | BILL_NO | PAY |
| `FK_PTL_PAY_BILL_D_01` | BILL_NO | `PTL_PAY_BILL_M` | BILL_NO | PAY |
| `FK_PTL_PAY_BILL_D_02` | SVC_MGMT_NO | `PTL_ORD_LINE_M` | SVC_MGMT_NO | ORD |
| `FK_PTL_PAY_BILL_D_03` | CHRG_ITM_CD | `PTL_PRD_CHRG_ITM_C` | CHRG_ITM_CD | PRD |
| `FK_PTL_PAY_BILL_ADJ_L_01` | BILL_NO | `PTL_PAY_BILL_M` | BILL_NO | PAY |
| `FK_PTL_PAY_BILL_ADJ_L_02` | BILL_NO, BILL_DTL_SEQ | `PTL_PAY_BILL_D` | BILL_NO, BILL_DTL_SEQ | PAY |
| `FK_PTL_PAY_BILL_ADJ_L_03` | BILL_ADJ_RSN_TY_CD | `PTL_PAY_BILL_ADJ_RSN_C` | BILL_ADJ_RSN_TY_CD | PAY |
| `FK_PTL_PAY_BILL_TAX_D_01` | BILL_NO | `PTL_PAY_BILL_M` | BILL_NO | PAY |
| `FK_PTL_PAY_USE_QTY_ERR_L_01` | RAW_USE_NO | `PTL_PAY_RAW_USE_L` | RAW_USE_NO | PAY |
| `FK_PTL_PAY_USE_QTY_DD_T_01` | SVC_MGMT_NO | `PTL_ORD_LINE_M` | SVC_MGMT_NO | ORD |
| `FK_PTL_PAY_BSCPRVD_EXHST_L_01` | SVC_MGMT_NO, BILL_YM, USE_SVC_TY_CD | `PTL_PAY_USE_QTY_MM_T` | SVC_MGMT_NO, BILL_YM, USE_SVC_TY_CD | PAY |
| `FK_PTL_PAY_BSCPRVD_EXHST_L_02` | SBSC_PROD_NO | `PTL_ORD_SBSC_PROD_M` | SBSC_PROD_NO | ORD |
| `FK_PTL_PAY_CHRG_CALC_H_01` | CHRG_CALC_NO | `PTL_PAY_CHRG_CALC_L` | CHRG_CALC_NO | PAY |
| `FK_PTL_PAY_CHRG_CALC_H_02` | BILL_JOB_NO | `PTL_PAY_BILL_JOB_M` | BILL_JOB_NO | PAY |
| `FK_PTL_PAY_DYPRT_CHRG_D_01` | CHRG_CALC_NO | `PTL_PAY_CHRG_CALC_L` | CHRG_CALC_NO | PAY |
| `FK_PTL_PAY_DSCNT_APLCN_L_01` | CHRG_CALC_NO | `PTL_PAY_CHRG_CALC_L` | CHRG_CALC_NO | PAY |
| `FK_PTL_PAY_DSCNT_APLCN_L_02` | PROD_CD | `PTL_PRD_DSCNT_PROD_M` | PROD_CD | PRD |
| `FK_PTL_PAY_DSCNT_APLCN_L_03` | SBSC_PROD_NO | `PTL_ORD_SBSC_PROD_M` | SBSC_PROD_NO | ORD |
| `FK_PTL_PAY_CMBN_DSCNT_ALLC_L_01` | CMBN_CTRT_NO | `PTL_ORD_CMBN_CTRT_M` | CMBN_CTRT_NO | ORD |
| `FK_PTL_PAY_CMBN_DSCNT_ALLC_L_02` | SVC_MGMT_NO | `PTL_ORD_LINE_M` | SVC_MGMT_NO | ORD |
| `FK_PTL_PAY_CMBN_DSCNT_ALLC_L_03` | CHRG_CALC_NO | `PTL_PAY_CHRG_CALC_L` | CHRG_CALC_NO | PAY |
| `FK_PTL_PAY_PNLT_IMPS_L_01` | AGRMT_CTRT_NO | `PTL_ORD_AGRMT_CTRT_M` | AGRMT_CTRT_NO | ORD |
| `FK_PTL_PAY_PNLT_IMPS_L_02` | SVC_MGMT_NO | `PTL_ORD_LINE_M` | SVC_MGMT_NO | ORD |
| `FK_PTL_PAY_PNLT_IMPS_L_03` | CHRG_CALC_NO | `PTL_PAY_CHRG_CALC_L` | CHRG_CALC_NO | PAY |
| `FK_PTL_PAY_EQP_INSTL_BILL_D_01` | EQP_INSTL_CTRT_NO, INSTL_TMS | `PTL_ORD_EQP_INSTL_D` | EQP_INSTL_CTRT_NO, INSTL_TMS | ORD |
| `FK_PTL_PAY_EQP_INSTL_BILL_D_02` | BILL_NO, BILL_DTL_SEQ | `PTL_PAY_BILL_D` | BILL_NO, BILL_DTL_SEQ | PAY |
| `FK_PTL_PAY_ROAM_USE_L_01` | ROAM_BZMN_NO | `PTL_PRM_ROAM_BZMN_M` | ROAM_BZMN_NO | PRM |
| `FK_PTL_PAY_ROAM_USE_L_02` | SVC_MGMT_NO | `PTL_ORD_LINE_M` | SVC_MGMT_NO | ORD |
| `FK_PTL_PAY_ROAM_USE_L_03` | USE_NO | `PTL_PAY_USE_L` | USE_NO | PAY |
| `FK_PTL_PAY_MCPAY_BILL_D_01` | CNTS_PRVD_CO_NO | `PTL_PRM_CNTS_PRVD_CO_M` | CNTS_PRVD_CO_NO | PRM |
| `FK_PTL_PAY_MCPAY_BILL_D_02` | SVC_MGMT_NO | `PTL_ORD_LINE_M` | SVC_MGMT_NO | ORD |
| `FK_PTL_PAY_MCPAY_BILL_D_03` | BILL_NO, BILL_DTL_SEQ | `PTL_PAY_BILL_D` | BILL_NO, BILL_DTL_SEQ | PAY |
| `FK_PTL_PAY_CNTS_UTLZ_CHRG_L_01` | CNTS_PRVD_CO_NO | `PTL_PRM_CNTS_PRVD_CO_M` | CNTS_PRVD_CO_NO | PRM |
| `FK_PTL_PAY_CNTS_UTLZ_CHRG_L_02` | SVC_MGMT_NO | `PTL_ORD_LINE_M` | SVC_MGMT_NO | ORD |
| `FK_PTL_PAY_CNTS_UTLZ_CHRG_L_03` | USE_NO | `PTL_PAY_USE_L` | USE_NO | PAY |
| `FK_PTL_PAY_CNTS_UTLZ_CHRG_L_04` | BILL_NO, BILL_DTL_SEQ | `PTL_PAY_BILL_D` | BILL_NO, BILL_DTL_SEQ | PAY |
| `FK_PTL_PAY_BILL_DDLN_H_01` | BILL_JOB_NO | `PTL_PAY_BILL_JOB_M` | BILL_JOB_NO | PAY |
| `FK_PTL_PAY_INVC_PBLCN_L_01` | BILL_NO | `PTL_PAY_BILL_M` | BILL_NO | PAY |
| `FK_PTL_PAY_INVC_RE_PBLCN_L_01` | BILL_NO | `PTL_PAY_BILL_M` | BILL_NO | PAY |
| `FK_PTL_PAY_INVC_RE_PBLCN_L_02` | INVC_PBLCN_NO | `PTL_PAY_INVC_PBLCN_L` | INVC_PBLCN_NO | PAY |
| `FK_PTL_PAY_BILL_ACNT_MM_T_01` | BILL_ACNT_NO | `PTL_CUS_BILL_ACNT_M` | BILL_ACNT_NO | CUS |
| `FK_PTL_PAY_CHRG_ITM_MM_S_01` | CHRG_ITM_CD | `PTL_PRD_CHRG_ITM_C` | CHRG_ITM_CD | PRD |
| `FK_PTL_PAY_BILL_JOB_STEP_H_01` | BILL_JOB_NO | `PTL_PAY_BILL_JOB_M` | BILL_JOB_NO | PAY |

## 6. 결정 메모

| # | 결정 | 근거 |
|---|---|---|
| P1 | 파티션 키는 PK 에 포함 — 파티션 테이블의 물리 PK = 논리 PK + 파티션 키 | PostgreSQL 파티션 테이블의 PK·유일 인덱스는 파티션 키를 포함해야 한다. 논리 식별자(번호)는 결정적 키 공식으로 전역 유일하게 발번(데이터 생성 5절)하므로 업무 유일성은 유지 |
| P2 | T4(1억+) = 월 RANGE 2010-01~2027-12(216 + DEFAULT), T3 2천만+ 누적 이력 = 연 RANGE 2010~2027(18 + DEFAULT), 그 외 비파티션 | 과제 지시. 월 키는 청구년월(청구 마감 단위 = 보관·재청구·삭제 단위)이 있으면 그것, 없으면 행위 일시(원시사용 = 수집일시, 사용량일집계 = 사용일자) |
| P3 | 청구상세·청구세금상세에 청구년월 반정규화(파티션 키) | 논리 M1 에서 부분 종속으로 제거한 칼럼 — 파티션 정렬·회선 + 청구년월 조회 때문에 물리에서만 복원. 다른 반정규화(서비스번호 등)는 회선기본 1회 조회로 충분해 하지 않음 |
| P4 | FK 의 부모가 파티션 키를 PK 에 추가한 테이블이면(원시사용내역·사용내역·요금계산내역·청구기본·청구상세·청구서발행내역) 참조 칼럼 = 논리 PK 만 | FK 는 DDL 미생성(D6) — 설계 정의는 업무 키 기준. PostgreSQL 에서 실제 FK 를 걸려면 자식에 파티션 키를 추가해야 하므로 RI 물리 구현 시 재검토 |
| P5 | 상태 칼럼 단독 인덱스 금지 — 저선택도(S3) 상태는 처리 대상 상태만 부분 인덱스 | 98% 한 값 칼럼의 B-tree 는 옵티마이저가 쓰지 않거나 오판(S3 편향). 처리 큐(미과금·재처리·미반영 조정·미납 확정 대상)만 작게 유지 |
| P6 | 기준 코드 FK(요금항목코드·청구조정사유유형코드·청구주기코드) 단독 인덱스 없음 | 부모가 수십~수백 행 기준 테이블이라 부모→자식 조인 경로가 없고 저선택도. 요금항목별 집계는 요금항목월통계(PROC)가 담당 |
| P7 | estRows 는 볼륨 등급 목표 — 청구주기코드(30)·청구조정사유코드(200)는 코드 성격상 T1 하한 미만 | 실무 코드 수. 최종 행 수·배율은 data_migrationner(docs/06) 결정 |

## 7. 타입·시스템 칼럼

- 칼럼 타입 = 표준 도메인 그대로(`번호V20` → VARCHAR(20), `금액N15` → NUMERIC(15), `일자C8` → CHAR(8), `일시TS` → TIMESTAMP, `금액N18_4` → NUMERIC(18,4) 등). 칼럼 순서 = PK → FK → 일반.
- 시스템 칼럼(DDL 만, D7) : `lst_mddtm TIMESTAMP` · `lst_mdfr_id VARCHAR(50)` · `lst_rgdtm TIMESTAMP` · `lst_rgtr_id VARCHAR(50)` — NOT NULL, 기본값 CURRENT_TIMESTAMP / 'SYSTEM'.
- 이름 길이 : 테이블 25자 권고(schema.pi TBL_NM_MAX) 초과 1건 `PTL_PAY_USE_QTY_CLCT_FILE_L`(27자) — 논리 단계 tblNm 승계, PostgreSQL 63자 한도 안이라 유지(인덱스명 `x_ptl_pay_use_qty_clct_file_l_02` 32자).
