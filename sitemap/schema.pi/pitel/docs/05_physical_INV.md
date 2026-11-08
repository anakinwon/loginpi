# 05 물리 모델 — 수납(INV)

> 작성 2026-11-07 · subagent_physical_modeler · 정본 `model/physical/INV.json` · DDL `ddl/50_inv_tables.sql`·`ddl/50_inv_constraints.sql` · 대상 PostgreSQL 17
> 마스터 위임 자동 승인 모드 — 판단이 갈린 곳은 7절 '결정 메모'에 근거를 남김.

## 1. 요약

- 테이블 30개(엔터티 1:1, 논리 INV-001~030), 파티션 테이블 6개(월 2 · 연 4), 인덱스 56개(PK 30개 별도, 물리 관문 리뷰 추가 3 포함), FK 정의 71개(DDL 미생성, D6)
- 예상 행 수 합계 약 **3.88억 행**(scale 1.0) — 최종 행 수는 data_migrationner 가 docs/06 에서 확정
- 시스템 칼럼 4개(lst_mddtm·lst_mdfr_id·lst_rgdtm·lst_rgtr_id)는 DDL 끝에만(D7)
- DDL 검증 : pitel_dev 스키마 chk_inv 에서 두 파일 실행(재실행 포함) 오류 0 → 스키마 삭제(8절)

## 2. 테이블

| 엔터티 ID | 테이블 | 논리명 | 유형 | 칼럼 | 예상 행 | 파티션 | 인덱스 |
|---|---|---|---|---|---|---|---|
| INV-001 | PTL_INV_RCV_M | 수납기본 | ACT | 14 | 1억 | 월 RCV_DT | 6 |
| INV-002 | PTL_INV_RCV_ALLC_D | 수납배분상세 | ACT | 12 | 1.2억 | 월 BILL_YM | 4 |
| INV-003 | PTL_INV_PAY_MTHD_M | 납부방법기본 | BASE | 15 | 1,000만 | - | 2 |
| INV-004 | PTL_INV_ATRF_APLY_L | 자동이체신청내역 | ACT | 13 | 1,000만 | - | 3 |
| INV-005 | PTL_INV_ATRF_WDRW_REQ_L | 자동이체출금요청내역 | ACT | 13 | 3,000만 | 연 BILL_YM | 5 |
| INV-006 | PTL_INV_VACCT_M | 가상계좌기본 | BASE | 11 | 300만 | - | 2 |
| INV-007 | PTL_INV_OVPAY_M | 과오납기본 | ACT | 11 | 300만 | - | 3 |
| INV-008 | PTL_INV_RFND_L | 환불내역 | ACT | 13 | 200만 | - | 3 |
| INV-009 | PTL_INV_PRPAY_M | 선납기본 | ACT | 11 | 200만 | - | 3 |
| INV-010 | PTL_INV_BANK_C | 은행코드 | REF | 11 | 1만 | - | 0 |
| INV-011 | PTL_INV_CARD_CO_C | 카드사코드 | REF | 10 | 1만 | - | 0 |
| INV-012 | PTL_INV_PAY_MTHD_H | 납부방법이력 | ACT | 12 | 2,000만 | 연 VLD_BGNG_DTM | 1 |
| INV-013 | PTL_INV_ATRF_WDRW_RSLT_L | 자동이체출금결과내역 | ACT | 8 | 3,200만 | 연 BILL_YM | 2 |
| INV-014 | PTL_INV_CARD_ATMT_PAY_APRV_L | 카드자동납부승인내역 | ACT | 12 | 1,500만 | 연 BILL_YM | 5 |
| INV-015 | PTL_INV_GIRO_RCV_L | 지로수납내역 | ACT | 10 | 800만 | - | 3 |
| INV-016 | PTL_INV_VACCT_DPST_L | 가상계좌입금내역 | ACT | 9 | 500만 | - | 3 |
| INV-017 | PTL_INV_RCV_CNCL_L | 수납취소내역 | ACT | 7 | 120만 | - | 1 |
| INV-018 | PTL_INV_UNIDNTF_DPST_L | 미확인입금내역 | ACT | 10 | 50만 | - | 3 |
| INV-019 | PTL_INV_OVPAY_H | 과오납이력 | ACT | 8 | 600만 | - | 0 |
| INV-020 | PTL_INV_RFND_ACCT_D | 환불계좌상세 | BASE | 9 | 300만 | - | 0 |
| INV-021 | PTL_INV_PRPAY_USE_L | 선납사용내역 | ACT | 7 | 800만 | - | 1 |
| INV-022 | PTL_INV_RCV_AGT_INST_M | 수납대행기관기본 | REF | 9 | 1만 | - | 0 |
| INV-023 | PTL_INV_RCV_CHNL_C | 수납채널코드 | REF | 7 | 50 | - | 0 |
| INV-024 | PTL_INV_RCV_ALLC_PRRT_C | 수납배분우선순위코드 | REF | 6 | 200 | - | 0 |
| INV-025 | PTL_INV_RCV_RCNCL_L | 수납대사내역 (STL) | ACT | 11 | 30만 | - | 1 |
| INV-026 | PTL_INV_RCV_AGT_FEE_L | 수납대행수수료내역 (STL) | ACT | 13 | 1만 | - | 1 |
| INV-027 | PTL_INV_RCIPT_PBLCN_L | 영수증발행내역 | ACT | 7 | 500만 | - | 1 |
| INV-028 | PTL_INV_CASH_RCIPT_PBLCN_L | 현금영수증발행내역 | ACT | 9 | 300만 | - | 2 |
| INV-029 | PTL_INV_RCV_DD_T | 수납일집계 | PROC | 8 | 50만 | - | 1 |
| INV-030 | PTL_INV_RCV_MM_S | 수납월통계 | PROC | 9 | 1.6만 | - | 0 |

## 3. 파티션

| 테이블 | 방식 | 키 | 범위 | 물리 PK | 근거 |
|---|---|---|---|---|---|
| PTL_INV_RCV_M | RANGE 월 | RCV_DT | 2010-01~2027-12 + DEFAULT | (RCV_NO, RCV_DT) | 수납일자 월 파티션 — 일마감·대사·장애일(S4) 조회가 일자 범위, 최근 파티션 쏠림 S6 · 기본 파티션 DEFAULT 1개 |
| PTL_INV_RCV_ALLC_D | RANGE 월 | BILL_YM | 2010-01~2027-12 + DEFAULT | (RCV_ALLC_NO, BILL_YM) | 청구년월 월 파티션 — PAY 청구기본·청구상세와 같은 키라 청구월 단위 조인·미납 판단이 파티션 단위로 끝남 · 기본 파티션 DEFAULT 1개 |
| PTL_INV_ATRF_WDRW_REQ_L | RANGE 연 | BILL_YM | 2010~2027 + DEFAULT | (WDRW_REQ_NO, BILL_YM) | 청구년월 연 파티션(T3) — 출금 요청은 청구월 단위 생성, 결과내역과 같은 키로 파티션 조인 · 기본 파티션 DEFAULT 1개 |
| PTL_INV_PAY_MTHD_H | RANGE 연 | VLD_BGNG_DTM | 2010~2027 + DEFAULT | (PAY_MTHD_NO, VLD_BGNG_DTM) | 유효시작일시 연 파티션(T3 대용량 이력) — PK 에 이미 포함, 오래된 이력 보관·삭제 단위 · 기본 파티션 DEFAULT 1개 |
| PTL_INV_ATRF_WDRW_RSLT_L | RANGE 연 | BILL_YM | 2010~2027 + DEFAULT | (WDRW_REQ_NO, WDRW_RSLT_SEQ, BILL_YM) | 반정규화한 청구년월 연 파티션 — 출금요청내역과 같은 파티션 경계(파티션 단위 조인) · 기본 파티션 DEFAULT 1개 |
| PTL_INV_CARD_ATMT_PAY_APRV_L | RANGE 연 | BILL_YM | 2010~2027 + DEFAULT | (CARD_ATMT_PAY_APRV_NO, BILL_YM) | 청구년월 연 파티션(T3) — 청구월 단위 카드 자동납부 승인 요청 · 기본 파티션 DEFAULT 1개 |

- 월 파티션 = 216개 + DEFAULT, 연 파티션 = 18개 + DEFAULT. 하위 테이블 이름 = `<테이블>_pYYYYMM` / `_pYYYY` / `_pdflt`(테이블 수에 넣지 않음, D3)
- 파티션 키가 PK 에 들어가야 하므로 물리 PK 가 논리 PK 보다 넓은 테이블이 있다(수납기본 = 수납번호+수납일자 등). 수납번호·수납배분번호·출금요청번호·카드자동납부승인번호는 채번이 전역 유일(5절 결정적 키)이라 논리 유일성은 유지된다. FK 정의의 참조 칼럼은 논리 PK — DDL FK 가 없으므로(D6) 물리 유일 제약 불일치는 문제 되지 않음
- 키 타입 : 수납일자 CHAR(8) 'YYYYMMDD'·청구년월 CHAR(6) 'YYYYMM' 문자 범위(사전순 = 시간순), 유효시작일시 TIMESTAMP

## 4. 인덱스

| 테이블 | 인덱스 | 칼럼 | 부분 조건 | 근거 |
|---|---|---|---|---|
| PTL_INV_RCV_M | X_PTL_INV_RCV_M_01 | BILL_ACNT_NO, RCV_DT |  | 청구계정별 수납 이력(상담·미납 판단) — 조인 FK + 기간 조건 |
| PTL_INV_RCV_M | X_PTL_INV_RCV_M_02 | RCV_DT, RCV_CHNL_TY_CD |  | 수납일자·채널 일마감·수납일집계 생성 — 파티션 안 일자 범위 |
| PTL_INV_RCV_M | X_PTL_INV_RCV_M_03 | PAY_MTHD_NO | PAY_MTHD_NO IS NOT NULL | 납부방법 → 수납 조인(자동이체·카드 수납 추적), NULL 30%(S5) |
| PTL_INV_RCV_M | X_PTL_INV_RCV_M_04 | RCV_AGT_INST_NO, RCV_DT | RCV_AGT_INST_NO IS NOT NULL | 대행기관 수납 대사(STL) — 기관·일자별 건수·금액 집계 |
| PTL_INV_RCV_M | X_PTL_INV_RCV_M_05 | BILL_ACNT_NO | RCV_STTS_TY_CD IN ('01','03') | 배분 배치 대상(배분대기·일부배분)만 — 상태 98% 배분완료(S3)라 상태 단독 인덱스 대신 부분 인덱스 |
| PTL_INV_RCV_M | X_PTL_INV_RCV_M_06 | APRV_NO | APRV_NO IS NOT NULL | 카드·간편결제 승인번호로 수납 역조회(고객 문의·카드사 대사) |
| PTL_INV_RCV_ALLC_D | X_PTL_INV_RCV_ALLC_D_01 | BILL_NO, CHRG_ITM_CD |  | 청구서·요금항목별 수납액 합계 — 미납 확정(COL 미납상세 항목 단위)의 핵심 경로, 청구년월로 파티션 프루닝 |
| PTL_INV_RCV_ALLC_D | X_PTL_INV_RCV_ALLC_D_02 | RCV_NO |  | 수납 → 배분 조인(수납취소 역배분·수납 상세) — 파티션 키 없는 조회라 전 파티션 로컬 인덱스 탐색 |
| PTL_INV_RCV_ALLC_D | X_PTL_INV_RCV_ALLC_D_03 | BILL_ACNT_NO, BILL_YM |  | 청구계정+청구년월 수납 조회(반정규화 칼럼) |
| PTL_INV_RCV_ALLC_D | X_PTL_INV_RCV_ALLC_D_04 | PRPAY_NO | PRPAY_NO IS NOT NULL | 선납 차감 배분 추적 |
| PTL_INV_PAY_MTHD_M | X_PTL_INV_PAY_MTHD_M_01 | BILL_ACNT_NO, APLCN_END_DT |  | 청구계정의 현재 납부방법(적용종료일자 99991231) 조회 — 청구·출금 배치 조인 |
| PTL_INV_PAY_MTHD_M | X_PTL_INV_PAY_MTHD_M_02 | PYR_NO |  | 납부자 → 납부방법 조인(CUS 납부자 상담) |
| PTL_INV_ATRF_APLY_L | X_PTL_INV_ATRF_APLY_L_01 | PAY_MTHD_NO |  | 납부방법 → 자동이체 신청 조인 |
| PTL_INV_ATRF_APLY_L | X_PTL_INV_ATRF_APLY_L_02 | BILL_ACNT_NO, ATRF_APLY_DTM |  | 청구계정별 자동이체 신청 이력 |
| PTL_INV_ATRF_APLY_L | X_PTL_INV_ATRF_APLY_L_03 | ATRF_APLY_DTM | PRCS_RSLT_TY_CD IS NULL | 금결원 CMS 신청 결과 미처리 건 배치 |
| PTL_INV_ATRF_WDRW_REQ_L | X_PTL_INV_ATRF_WDRW_REQ_L_01 | BILL_NO |  | 청구서 → 출금요청 조인(수납 반영·미납 판단) |
| PTL_INV_ATRF_WDRW_REQ_L | X_PTL_INV_ATRF_WDRW_REQ_L_02 | BILL_ACNT_NO, BILL_YM |  | 청구계정+청구년월 출금 이력(상담) |
| PTL_INV_ATRF_WDRW_REQ_L | X_PTL_INV_ATRF_WDRW_REQ_L_03 | WDRW_SCHD_DT, BANK_CD |  | 출금예정일자·은행별 출금 요청 파일 생성 배치 |
| PTL_INV_ATRF_WDRW_REQ_L | X_PTL_INV_ATRF_WDRW_REQ_L_04 | RCV_NO | RCV_NO IS NOT NULL | 수납 → 출금요청 역추적(수납취소·재출금) |
| PTL_INV_ATRF_WDRW_REQ_L | X_PTL_INV_ATRF_WDRW_REQ_L_05 | PAY_MTHD_NO, BILL_YM |  | 납부방법 → 출금요청 조인(자동이체 해지·변경 시 진행 중 출금 확인) — 리뷰 추가 R1 |
| PTL_INV_VACCT_M | X_PTL_INV_VACCT_M_01 | ACCT_NO, BANK_CD |  | 은행 입금 통지(계좌번호) → 가상계좌 매칭 — 회수 후 재사용 번호(S8)라 유일 아님 |
| PTL_INV_VACCT_M | X_PTL_INV_VACCT_M_02 | BILL_ACNT_NO |  | 청구계정의 가상계좌 조회 |
| PTL_INV_OVPAY_M | X_PTL_INV_OVPAY_M_01 | BILL_ACNT_NO |  | 청구계정별 과오납 조회·다음 달 대체 |
| PTL_INV_OVPAY_M | X_PTL_INV_OVPAY_M_02 | OVPAY_OCRN_DTM | OVPAY_BAL > 0 | 잔액 남은 과오납(환불·대체·소멸시효 배치)만 |
| PTL_INV_OVPAY_M | X_PTL_INV_OVPAY_M_03 | RCV_NO | RCV_NO IS NOT NULL | 수납 → 과오납 조인 |
| PTL_INV_RFND_L | X_PTL_INV_RFND_L_01 | BILL_ACNT_NO, RFND_DTM |  | 청구계정별 환불 이력 |
| PTL_INV_RFND_L | X_PTL_INV_RFND_L_02 | OVPAY_NO | OVPAY_NO IS NOT NULL | 과오납 → 환불 조인 |
| PTL_INV_RFND_L | X_PTL_INV_RFND_L_03 | PRPAY_NO | PRPAY_NO IS NOT NULL | 선납 → 환불 조인 |
| PTL_INV_PRPAY_M | X_PTL_INV_PRPAY_M_01 | BILL_ACNT_NO |  | 청구계정별 선납 조회 — 청구 시 선납 차감 대상 탐색 |
| PTL_INV_PRPAY_M | X_PTL_INV_PRPAY_M_02 | RCV_NO | RCV_NO IS NOT NULL | 수납 → 선납 조인 |
| PTL_INV_PRPAY_M | X_PTL_INV_PRPAY_M_03 | OVPAY_NO | OVPAY_NO IS NOT NULL | 과오납 → 선납 전환 조인 |
| PTL_INV_PAY_MTHD_H | X_PTL_INV_PAY_MTHD_H_01 | PAY_MTHD_NO, VLD_END_DTM |  | 납부방법의 현재 이력(유효종료일시 9999-12-31) — 파티션 키 없는 조회 보조 |
| PTL_INV_ATRF_WDRW_RSLT_L | X_PTL_INV_ATRF_WDRW_RSLT_L_01 | WDRW_RSLT_DTM | RE_WDRW_TRGT_YN = 'Y' | 재출금 대상 배치 — 재출금대상여부 Y 소수(S3)라 부분 인덱스 |
| PTL_INV_ATRF_WDRW_RSLT_L | X_PTL_INV_ATRF_WDRW_RSLT_L_02 | WDRW_RSLT_TY_CD, WDRW_RSLT_DTM | WDRW_RSLT_TY_CD <> '01' | 출금 실패 사유별 통계·모니터링(정상 제외) |
| PTL_INV_CARD_ATMT_PAY_APRV_L | X_PTL_INV_CARD_ATMT_PAY_APRV_L_01 | BILL_NO |  | 청구서 → 카드 승인 조인 |
| PTL_INV_CARD_ATMT_PAY_APRV_L | X_PTL_INV_CARD_ATMT_PAY_APRV_L_02 | PAY_MTHD_NO, BILL_YM |  | 납부방법별 월 승인 이력(재승인·거절 상담) |
| PTL_INV_CARD_ATMT_PAY_APRV_L | X_PTL_INV_CARD_ATMT_PAY_APRV_L_03 | CARD_CO_CD, CARD_APRV_REQ_DTM |  | 카드사별 승인·매입 대사 파일 |
| PTL_INV_CARD_ATMT_PAY_APRV_L | X_PTL_INV_CARD_ATMT_PAY_APRV_L_04 | APRV_NO | APRV_NO IS NOT NULL | 카드 승인번호 조회 |
| PTL_INV_CARD_ATMT_PAY_APRV_L | X_PTL_INV_CARD_ATMT_PAY_APRV_L_05 | RCV_NO | RCV_NO IS NOT NULL | 수납 → 카드 승인 역추적(수납취소 시 승인취소) — 리뷰 추가 R2 |
| PTL_INV_GIRO_RCV_L | X_PTL_INV_GIRO_RCV_L_01 | BILL_NO |  | 청구서 → 지로 수납 조인 |
| PTL_INV_GIRO_RCV_L | X_PTL_INV_GIRO_RCV_L_02 | GIRO_RCV_DTM |  | 지로 수납 일자별 반영·대사 |
| PTL_INV_GIRO_RCV_L | X_PTL_INV_GIRO_RCV_L_03 | RCV_NO | RCV_NO IS NOT NULL | 수납 → 지로 원천 역추적 |
| PTL_INV_VACCT_DPST_L | X_PTL_INV_VACCT_DPST_L_01 | VACCT_NO, DPST_DTM |  | 가상계좌별 입금 이력 |
| PTL_INV_VACCT_DPST_L | X_PTL_INV_VACCT_DPST_L_02 | BANK_CD, BANK_TRD_NO |  | 은행 거래번호 중복 통지 검사·대사 — 형식 함정(S12) 데이터라 유일 아님 |
| PTL_INV_VACCT_DPST_L | X_PTL_INV_VACCT_DPST_L_03 | RCV_NO | RCV_NO IS NOT NULL | 수납 → 입금 원천 역추적 |
| PTL_INV_RCV_CNCL_L | X_PTL_INV_RCV_CNCL_L_01 | RCV_NO |  | 수납 → 취소 조인(역배분) |
| PTL_INV_UNIDNTF_DPST_L | X_PTL_INV_UNIDNTF_DPST_L_01 | DPST_DTM | UNIDNTF_DPST_STTS_TY_CD = '01' | 미확인 상태 입금만 — 귀속 처리 작업 목록 |
| PTL_INV_UNIDNTF_DPST_L | X_PTL_INV_UNIDNTF_DPST_L_02 | BANK_CD, BANK_TRD_NO |  | 은행 거래번호 조회·중복 통지 검사 |
| PTL_INV_UNIDNTF_DPST_L | X_PTL_INV_UNIDNTF_DPST_L_03 | RCV_NO | RCV_NO IS NOT NULL | 수납 → 미확인입금 귀속 원천 역추적 — 리뷰 추가 R3 |
| PTL_INV_PRPAY_USE_L | X_PTL_INV_PRPAY_USE_L_01 | BILL_NO | BILL_NO IS NOT NULL | 청구서 → 선납 차감 조인 |
| PTL_INV_RCV_RCNCL_L | X_PTL_INV_RCV_RCNCL_L_01 | RCV_RCNCL_STD_DT, RCV_AGT_INST_NO |  | 기준일자·기관별 대사 결과 조회(STL) |
| PTL_INV_RCV_AGT_FEE_L | X_PTL_INV_RCV_AGT_FEE_L_01 | RCV_AGT_INST_NO, STLM_YM |  | 기관·정산년월 수수료 조회(STL) |
| PTL_INV_RCIPT_PBLCN_L | X_PTL_INV_RCIPT_PBLCN_L_01 | RCV_NO |  | 수납 → 영수증 조인 |
| PTL_INV_CASH_RCIPT_PBLCN_L | X_PTL_INV_CASH_RCIPT_PBLCN_L_01 | RCV_NO |  | 수납 → 현금영수증 조인 |
| PTL_INV_CASH_RCIPT_PBLCN_L | X_PTL_INV_CASH_RCIPT_PBLCN_L_02 | CASH_RCIPT_PBLCN_DTM | NTS_TRNM_DTM IS NULL | 국세청 미전송 건 전송 배치 |
| PTL_INV_RCV_DD_T | X_PTL_INV_RCV_DD_T_01 | RCV_DT |  | 일자 범위 전 채널 집계 조회 — PK 선두가 채널이라 보조 |

- 인덱스 없는 테이블 : 은행코드·카드사코드·수납대행기관기본·수납채널코드·수납배분우선순위코드(소형 기준 — PK 로 충분), 과오납이력·환불계좌상세(PK 선두 = 부모 키라 조인을 PK 가 처리), 수납월통계(1.6만 행)
- **만들지 않은 FK 인덱스** : 은행코드·카드사코드·수납채널유형코드·요금항목코드·수납대행기관번호(수납기본 외) — 자식→부모(소형 기준) 방향 조회만 있고 부모에서 대량 자식을 찾는 업무가 없음. 저선택도(S3) 상태유형코드 단독 인덱스 없음 — 작업 대상 상태는 부분 인덱스로
- 중복 검사 : 비부분 인덱스가 다른 인덱스·PK 의 선두 접두와 같으면 생성기가 실패(통과)

## 5. 반정규화

| 테이블 | 칼럼 | 원천 | 구분 | 사유 |
|---|---|---|---|---|
| PTL_INV_RCV_M | UNALLC_AMT | (파생) | 논리 인계 | 미배분금액 = 수납금액 − 배분 합계(파생). 배분 배치·과오납 판단이 1억 행 수납마다 배분 합계를 다시 구하지 않도록 유지(논리 L4 인계) |
| PTL_INV_RCV_ALLC_D | BILL_YM | PTL_PAY_BILL_M | 논리 인계 | 청구번호 → 청구년월 이행 종속. 파티션 키·레이크 업무 키(논리 L4 인계) |
| PTL_INV_RCV_ALLC_D | BILL_ACNT_NO | PTL_INV_RCV_M | 물리 추가 | 청구계정+청구년월 수납 조회(상담·미납 판단)가 1.2억 행 배분상세에서 수납기본 조인 없이 끝나도록 복제. 값은 수납기본.청구계정번호(=청구서의 청구계정)와 같음 — 배분 생성 시 기록, 수정 없음 |
| PTL_INV_ATRF_WDRW_REQ_L | BILL_YM | PTL_PAY_BILL_M | 논리 인계 | 파티션 키·업무 키(논리 L4) |
| PTL_INV_ATRF_WDRW_REQ_L | BILL_ACNT_NO | PTL_PAY_BILL_M | 논리 인계 | 청구계정+청구년월 조회 경로(논리 L4) |
| PTL_INV_ATRF_WDRW_RSLT_L | BILL_YM | PTL_INV_ATRF_WDRW_REQ_L | 물리 추가 | 파티션 키 — 부모 출금요청내역과 같은 청구년월 연 파티션으로 맞춰 요청↔결과 조인을 파티션 단위로 끝냄. 요청의 청구년월 그대로(불변) |
| PTL_INV_CARD_ATMT_PAY_APRV_L | BILL_YM | PTL_PAY_BILL_M | 논리 인계 | 파티션 키·업무 키(논리 L4) |
| PTL_INV_GIRO_RCV_L | BILL_YM | PTL_PAY_BILL_M | 논리 인계 | 청구월 지로 대사 업무 키(논리 L4) |
| PTL_INV_PRPAY_USE_L | BILL_YM | PTL_PAY_BILL_M | 논리 인계 | 청구월 차감 업무 키(논리 L4) |

- 논리 G1 인계 후보 **수납배분상세.납부기한일자 = 반정규화 안 함** : 미납 확정(COL)은 청구서 단위로 PAY.청구기본의 납부기한일자를 한 번 읽으면 되고, 배분상세(1.2억)에 복제하면 납기 변경(청구조정) 때 대량 갱신이 생김

## 6. 예상 행 수(scale 1.0)

| 등급 | 테이블 | 행 수 |
|---|---|---|
| T4 | 수납기본 1억 · 수납배분상세 1.2억 | 2.2억 |
| T3 | 납부방법기본 1,000만 · 자동이체신청내역 1,000만 · 자동이체출금요청내역 3,000만 · 납부방법이력 2,000만 · 자동이체출금결과내역 3,200만 · 카드자동납부승인내역 1,500만 | 1.17억 |
| T2 | 가상계좌기본 300만 · 과오납기본 300만 · 환불내역 200만 · 선납기본 200만 · 지로수납내역 800만 · 가상계좌입금내역 500만 · 수납취소내역 120만 · 과오납이력 600만 · 환불계좌상세 300만 · 선납사용내역 800만 · 영수증발행내역 500만 · 현금영수증발행내역 300만 | 4,920만 |
| T1 | 은행코드 1만 · 카드사코드 1만 · 미확인입금내역 50만 · 수납대행기관기본 1만 · 수납채널코드 50 · 수납배분우선순위코드 200 · 수납대사내역 30만 · 수납대행수수료내역 1만 · 수납일집계 50만 · 수납월통계 1.6만 | 135.625만 |
| 합계 | 30개 | 약 3.88억 |

- 기간 2010-01~2026-10(D8), 최근 쏠림(S4·S6). 순수 코드 테이블(수납채널코드 50·수납배분우선순위코드 200)은 업무상 값 수가 한정돼 T1 하한(1만) 미만 — 은행코드·카드사코드·수납대행기관기본은 폐지·합병·재사용(S8) 이력 포함 1만
- INV 를 약 3.9억 행으로 잡은 이유 : D9 전체 10억~12억 중 PAY(원시사용·사용·요금계산·청구상세)가 가장 크고 INV 는 그다음 — T4 범위(1억~4억)는 수납기본·수납배분상세 2개만, 나머지는 실무 비율(수납 1건당 배분 약 1.2건, 자동이체 약 30%·카드 15%)로 배정

## 7. 결정 메모

| # | 결정 | 근거 |
|---|---|---|
| P1 | 월 파티션 = 수납기본(수납일자)·수납배분상세(청구년월) | T4 두 테이블. 수납은 입금일 기준 마감·대사, 배분은 청구월 기준 미납 판단 — 조회 축이 달라 키를 다르게 |
| P2 | 연 파티션 = 자동이체출금요청내역·자동이체출금결과내역·카드자동납부승인내역(청구년월)·납부방법이력(유효시작일시) | T3 대용량 내역·이력(1,500만~3,200만). 1천만 이하·현재 상태(~기본) 테이블은 파티션 안 함 |
| P3 | 자동이체출금결과내역에 청구년월 반정규화 + PK 포함 | 부모와 같은 파티션 경계 → 파티션 단위 조인. 결과 PK 에 일시를 넣는 것보다 업무 키가 자연스러움 |
| P4 | 수납배분상세에 청구계정번호 반정규화 | 지시 조회 경로 '청구계정+청구년월' — 1.2억 행 조인 회피 |
| P5 | FK 참조 칼럼 = 부모 논리 PK, 결과내역→출금요청만 (출금요청번호, 청구년월) | D6 정의 전용. 같은 파티션 키를 가진 경우만 부모 물리 PK 와 일치. PAY.청구기본 물리 PK 가 파티션 키를 포함하게 되면 coordinator 가 refCols 를 맞춤(PAY 물리 미확인) |
| P6 | 상태 인덱스는 부분 인덱스로만 | S3 저선택도 — 배분대기·일부배분, 미확인, 재출금, 잔액>0, 국세청 미전송 같은 작업 대상 소수 행만 |
| P7 | 일자 CHAR(8)·년월 CHAR(6) 그대로 파티션 키 | 표준 도메인(일자C8·년월C6) 유지, 문자 범위 = 시간 순서 |
| P8 | 파티션 PK 는 ALTER TABLE ADD CONSTRAINT PRIMARY KEY(...) | 파티션 테이블은 USING INDEX 불가 — 지시 형식 그대로 |

## 8. DDL 검증

- 2026-11-07 `docker exec -i pitel-pg psql -U postgres -d pitel_dev -v ON_ERROR_STOP=1` — 스키마 `chk_inv` 생성 → `SET search_path` → `50_inv_tables.sql` → 시험 행 2건 → `50_inv_constraints.sql` → **두 파일 재실행(멱등)** → 점검 → `DROP SCHEMA chk_inv CASCADE`. 종료 코드 0, 오류 0
- 점검 결과 : 테이블 30 · 하위 파티션 510(월 2×217 + 연 4×19) · 상위 인덱스 83(PK 30 + 일반 53) → 물리 관문 인덱스 3 추가 후 86(PK 30 + 일반 56), 스키마 rv_inv 재검증(reviews/05_physical_INV.md) · PK 제약 30 · 주석 없는 칼럼 0
- 파티션 라우팅 : 수납일자 '20261015' → `ptl_inv_rcv_m_p202610`, 범위 밖 '20300101' → `ptl_inv_rcv_m_pdflt`
- 길이 63 객체는 PostgreSQL 이 파티션마다 자동으로 붙인 하위 인덱스 이름(자동 절단) — 직접 정한 이름은 최대 33자
