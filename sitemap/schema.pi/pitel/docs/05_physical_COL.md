# 05 물리 모델 — COL 미납

> 작성 2026-11-07 · subagent_physical_modeler · 생성기 `tools/physical_COL_build.js` → `model/physical/COL.json`, `ddl/60_col_tables.sql`, `ddl/60_col_constraints.sql`
> 대상 PostgreSQL 17 · 테이블 30개 · 목표 합계 약 456,937,220행 · FK 는 설계만(D6) · 시스템 칼럼 4개는 DDL 에만(D7)

## 1. 테이블

| ID | 테이블 | 논리명 | 유형 | 목표 행 수 | 파티션 | PK | 인덱스 | FK(설계) |
|---|---|---|---|---:|---|---|---:|---:|
| COL-001 | `PTL_COL_UNPD_M` | 미납기본 | ACT | 20,000,000 | — | UNPD_NO | 6 | 5 |
| COL-002 | `PTL_COL_UNPD_D` | 미납상세 | ACT | 60,000,000 | — | UNPD_NO, UNPD_DTL_SEQ | 1 | 2 |
| COL-003 | `PTL_COL_OVDU_ADCHG_L` | 연체가산금내역 | ACT | 40,000,000 | 연 RANGE `ADCHG_IMPS_DTM` | OVDU_ADCHG_NO, ADCHG_IMPS_DTM | 2 | 3 |
| COL-004 | `PTL_COL_DUN_L` | 독촉내역 | ACT | 50,000,000 | 연 RANGE `DUN_SNDNG_DTM` | DUN_NO, DUN_SNDNG_DTM | 2 | 2 |
| COL-005 | `PTL_COL_SUSP_M` | 이용정지기본 | ACT | 6,000,000 | — | SUSP_NO | 3 | 2 |
| COL-006 | `PTL_COL_EXOFTRMN_M` | 직권해지기본 | ACT | 1,500,000 | — | EXOFTRMN_NO | 4 | 3 |
| COL-007 | `PTL_COL_RCVB_TRNSF_M` | 채권이관기본 | ACT | 1,000,000 | — | RCVB_TRNSF_NO | 2 | 2 |
| COL-008 | `PTL_COL_DIV_PAY_AGRMT_M` | 분할납부약정기본 | ACT | 2,000,000 | — | DIV_PAY_AGRMT_NO | 1 | 1 |
| COL-009 | `PTL_COL_BDDT_M` | 대손기본 | ACT | 4,000,000 | — | BDDT_NO | 3 | 2 |
| COL-010 | `PTL_COL_UNPD_STTS_H` | 미납상태이력 | ACT | 70,000,000 | 연 RANGE `STTS_CHG_DTM` | UNPD_NO, STTS_CHG_SEQ, STTS_CHG_DTM | 0 | 1 |
| COL-011 | `PTL_COL_OVDU_ADCHG_STD_C` | 연체가산금기준코드 | REF | 20 | — | OVDU_ADCHG_STD_TY_CD | 0 | 0 |
| COL-012 | `PTL_COL_DUN_PLCY_M` | 독촉정책기본 | REF | 2,000 | — | DUN_PLCY_NO | 0 | 0 |
| COL-013 | `PTL_COL_DUN_SNDNG_RSLT_L` | 독촉발송결과내역 | ACT | 55,000,000 | 연 RANGE `DUN_SNDNG_DTM` | DUN_NO, SNDNG_RSLT_SEQ, DUN_SNDNG_DTM | 0 | 1 |
| COL-014 | `PTL_COL_SUSP_H` | 이용정지이력 | ACT | 15,000,000 | — | SUSP_NO, SUSP_HIST_SEQ | 0 | 1 |
| COL-015 | `PTL_COL_SUSP_RLS_L` | 이용정지해제내역 | ACT | 5,000,000 | — | SUSP_RLS_NO | 4 | 4 |
| COL-016 | `PTL_COL_EXOFTRMN_PRNTC_L` | 직권해지예고내역 | ACT | 3,000,000 | — | EXOFTRMN_NO, PRNTC_SEQ | 0 | 1 |
| COL-017 | `PTL_COL_RCVB_COLL_CO_M` | 채권추심사기본 | REF | 200 | — | RCVB_COLL_CO_NO | 0 | 0 |
| COL-018 | `PTL_COL_COLL_DLGT_D` | 추심위임상세 | ACT | 1,500,000 | — | RCVB_TRNSF_NO, COLL_DLGT_SEQ | 1 | 2 |
| COL-019 | `PTL_COL_COLL_RTRVL_L` | 추심회수내역 | ACT | 3,000,000 | — | COLL_RTRVL_NO | 4 | 4 |
| COL-020 | `PTL_COL_COLL_FEE_L` | 추심수수료내역 [STL] | ACT | 12,000 | — | COLL_FEE_NO | 2 | 2 |
| COL-021 | `PTL_COL_DIV_PAY_TMS_D` | 분할납부회차상세 | ACT | 12,000,000 | — | DIV_PAY_AGRMT_NO, DIV_PAY_TMS | 2 | 2 |
| COL-022 | `PTL_COL_PAY_PRMS_L` | 납부약속내역 | ACT | 4,000,000 | — | PAY_PRMS_NO | 3 | 3 |
| COL-023 | `PTL_COL_CRINFO_REG_L` | 신용정보등록내역 | ACT | 3,000,000 | — | CRINFO_REG_NO | 2 | 2 |
| COL-024 | `PTL_COL_CRINFO_RLS_L` | 신용정보해제내역 | ACT | 2,500,000 | — | CRINFO_RLS_NO | 2 | 2 |
| COL-025 | `PTL_COL_BDDT_DPRC_D` | 대손상각상세 | ACT | 12,000,000 | — | BDDT_NO, BDDT_DPRC_DTL_SEQ | 1 | 2 |
| COL-026 | `PTL_COL_BDDT_RTRVL_L` | 대손회수내역 | ACT | 400,000 | — | BDDT_RTRVL_NO | 3 | 3 |
| COL-027 | `PTL_COL_RCVB_DSPSL_L` | 채권매각내역 | ACT | 3,000 | — | RCVB_DSPSL_NO | 1 | 1 |
| COL-028 | `PTL_COL_RCVB_PRSCR_H` | 채권시효이력 | ACT | 26,000,000 | — | UNPD_NO, PRSCR_CHG_SEQ | 1 | 1 |
| COL-029 | `PTL_COL_UNPD_MM_T` | 미납월집계 | PROC | 60,000,000 | 연 RANGE `STD_YM` | BILL_ACNT_NO, STD_YM | 0 | 1 |
| COL-030 | `PTL_COL_UNPD_RTRVL_MM_S` | 미납회수월통계 | PROC | 20,000 | — | STD_YM, UNPD_ELPS_SCTN_TY_CD, CUST_TY_CD | 0 | 0 |

## 2. 파티션

COL 은 T3(고객·가입계) 영역이라 월 파티션(T4) 대상이 없다. **목표 3천만 행 이상인 누적형 테이블만 연 RANGE**(2010~2027 연 18개 + DEFAULT 1개, 이름 `<테이블>_yYYYY`·`<테이블>_def`). 파티션 키는 PK 끝에 붙인다.

| 테이블 | 파티션 키 | PK | 근거 |
|---|---|---|---|
| `PTL_COL_OVDU_ADCHG_L` | ADCHG_IMPS_DTM | OVDU_ADCHG_NO, ADCHG_IMPS_DTM | 40,000,000행 누적, 최근 연도 쏠림(S6) — 오래된 연도 분리·보관 정리, 기간 조회 프루닝 |
| `PTL_COL_DUN_L` | DUN_SNDNG_DTM | DUN_NO, DUN_SNDNG_DTM | 50,000,000행 누적, 최근 연도 쏠림(S6) — 오래된 연도 분리·보관 정리, 기간 조회 프루닝 |
| `PTL_COL_UNPD_STTS_H` | STTS_CHG_DTM | UNPD_NO, STTS_CHG_SEQ, STTS_CHG_DTM | 70,000,000행 누적, 최근 연도 쏠림(S6) — 오래된 연도 분리·보관 정리, 기간 조회 프루닝 |
| `PTL_COL_DUN_SNDNG_RSLT_L` | DUN_SNDNG_DTM | DUN_NO, SNDNG_RSLT_SEQ, DUN_SNDNG_DTM | 55,000,000행 누적, 최근 연도 쏠림(S6) — 오래된 연도 분리·보관 정리, 기간 조회 프루닝 |
| `PTL_COL_UNPD_MM_T` | STD_YM | BILL_ACNT_NO, STD_YM | 60,000,000행 누적, 최근 연도 쏠림(S6) — 오래된 연도 분리·보관 정리, 기간 조회 프루닝 |

파티션하지 않은 큰 테이블 : `PTL_COL_UNPD_M`(2천만)·`PTL_COL_UNPD_D`(6천만) — 현재값 테이블이고 여러 자식 테이블이 미납번호만으로 참조하므로 PK 에 날짜를 붙이면 모든 자식이 반정규화를 떠안는다. 조회는 미납번호·청구번호 키 조회가 주 경로라 파티션 이득 없음. `PTL_COL_RCVB_PRSCR_H`(2,600만)는 3천만 기준 미만.

## 3. 반정규화

| 테이블 | 칼럼 | 원천 | 사유 |
|---|---|---|---|
| `PTL_COL_UNPD_M` | BILL_ACNT_NO | PTL_PAY_BILL_M | 청구계정+청구년월 미납 조회(상담·수납배분 대상 선정)가 매일 수백만 회 — 청구기본(T4 수억 행) 조인 제거 |
| `PTL_COL_UNPD_M` | BILL_YM | PTL_PAY_BILL_M | 청구계정+청구년월 복합 조회·월별 미납 발생 집계(미납월집계 생성) — 청구기본 조인 제거. 청구기본 PK(청구번호+청구년월, 연 파티션)를 완성하는 FK 칼럼 겸용 |
| `PTL_COL_UNPD_M` | CUST_NO | PTL_CUS_BILL_ACNT_M | 고객번호 단위 미납 조회(상담·채권이관 묶음·신용정보 등록 판정 배치) — 청구계정 경유 2단 조인 제거 |
| `PTL_COL_UNPD_M` | UNPD_RMND_AMT | PTL_COL_UNPD_D | 04 관문 F1 인계. 이용정지·독촉·직권해지 판정 배치가 매일 미납 채권 전체의 잔액을 봄 — 미납상세 6천만 행 SUM 회피. 수납배분 반영 시 같은 트랜잭션에서 갱신 |
| `PTL_COL_UNPD_D` | BILL_YM | PTL_PAY_BILL_D | PAY 청구상세 PK(청구번호+청구상세순번+청구년월, 월 파티션 217개)를 완성하는 FK 칼럼 — 수납배분·조정의 청구상세 조인을 1개 파티션으로 프루닝(05 COL 물리 관문 R1) |
| `PTL_COL_UNPD_D` | UNPD_RMND_AMT | PTL_COL_UNPD_D(자기 계산값) | 04 관문 F1 인계. 수납배분이 항목 순위대로 잔액 있는 항목을 찾는 핫 경로 — 최초미납금액−누적수납금액+미납조정금액 매번 계산 회피 |
| `PTL_COL_OVDU_ADCHG_L` | RFLT_BILL_YM | PTL_PAY_BILL_M | PAY 청구기본 PK(청구번호+청구년월, 연 파티션)를 완성하는 FK 칼럼 — 반영 청구서 조회 프루닝(05 COL 물리 관문 R1). 반영 전 NULL |
| `PTL_COL_DUN_SNDNG_RSLT_L` | DUN_SNDNG_DTM | PTL_COL_DUN_L | 부모 독촉내역 PK(독촉번호+독촉발송일시, 파티션 키 포함)를 완성하는 FK 칼럼이자 이 테이블의 파티션 키 — 부모와 같은 연 파티션끼리 조인(partition-wise join) |
| `PTL_COL_SUSP_RLS_L` | RCV_DT | PTL_INV_RCV_M | INV 수납기본 PK(수납번호+수납일자, 수납일자 월 파티션 217개)를 완성하는 FK 칼럼 — 없으면 수납번호 조회가 전 파티션 인덱스를 훑음(05 COL 물리 관문 R1). 수납 반영 시 수납번호와 함께 기록, 미반영 NULL |
| `PTL_COL_COLL_RTRVL_L` | RCV_DT | PTL_INV_RCV_M | INV 수납기본 PK(수납번호+수납일자, 수납일자 월 파티션 217개)를 완성하는 FK 칼럼 — 없으면 수납번호 조회가 전 파티션 인덱스를 훑음(05 COL 물리 관문 R1). 수납 반영 시 수납번호와 함께 기록, 미반영 NULL |
| `PTL_COL_DIV_PAY_TMS_D` | RCV_DT | PTL_INV_RCV_M | INV 수납기본 PK(수납번호+수납일자, 수납일자 월 파티션 217개)를 완성하는 FK 칼럼 — 없으면 수납번호 조회가 전 파티션 인덱스를 훑음(05 COL 물리 관문 R1). 수납 반영 시 수납번호와 함께 기록, 미반영 NULL |
| `PTL_COL_PAY_PRMS_L` | RCV_DT | PTL_INV_RCV_M | INV 수납기본 PK(수납번호+수납일자, 수납일자 월 파티션 217개)를 완성하는 FK 칼럼 — 없으면 수납번호 조회가 전 파티션 인덱스를 훑음(05 COL 물리 관문 R1). 수납 반영 시 수납번호와 함께 기록, 미반영 NULL |
| `PTL_COL_CRINFO_RLS_L` | RCV_DT | PTL_INV_RCV_M | INV 수납기본 PK(수납번호+수납일자, 수납일자 월 파티션 217개)를 완성하는 FK 칼럼 — 없으면 수납번호 조회가 전 파티션 인덱스를 훑음(05 COL 물리 관문 R1). 수납 반영 시 수납번호와 함께 기록, 미반영 NULL |
| `PTL_COL_BDDT_RTRVL_L` | RCV_DT | PTL_INV_RCV_M | INV 수납기본 PK(수납번호+수납일자, 수납일자 월 파티션 217개)를 완성하는 FK 칼럼 — 없으면 수납번호 조회가 전 파티션 인덱스를 훑음(05 COL 물리 관문 R1). 수납 반영 시 수납번호와 함께 기록, 미반영 NULL |

미채택(04 관문 F1 후보) : 연체가산금누적금액·누적회수금액·최종납부예정일자·납부완료회차수·누적납부금액·불이행회차수·대손회수누적금액 — 원천이 수백만 행 이하이거나 월 1회 조회라 동기화 비용이 더 크다.

## 4. 인덱스

PK 인덱스 `PK_<테이블>` 외 보조 인덱스. 부분 인덱스는 WHERE 표시. 중복(PK·다른 인덱스의 앞부분과 같은 칼럼 목록)은 생성기가 막는다.

| 인덱스 | 칼럼 | 유일 | 조건 | 근거 |
|---|---|---|---|---|
| `X_PTL_COL_UNPD_M_01` | BILL_NO | Y |  | PAY 청구기본과 1:1 대체키 — 청구서→미납 조인·중복 생성 방지 |
| `X_PTL_COL_UNPD_M_02` | BILL_ACNT_NO, BILL_YM |  |  | 청구계정+청구년월 미납 조회(반정규화 칼럼) |
| `X_PTL_COL_UNPD_M_03` | CUST_NO |  |  | 고객번호 단위 미납 조회·채권이관 묶음 생성 |
| `X_PTL_COL_UNPD_M_04` | UNPD_STTS_TY_CD, UNPD_OCRN_DTM |  | `unpd_stts_ty_cd IN ('01','02','04')` | 진행 중 미납(미납·일부납부·분할납부중)만 부분 인덱스 — 완납이 대부분인 저선택도 상태값(S3)을 전체 인덱싱하지 않음. 독촉·정지 대상 추출 배치 |
| `X_PTL_COL_UNPD_M_05` | RCVB_TRNSF_NO |  | `rcvb_trnsf_no IS NOT NULL` | 채권이관기본→미납 조인(FK, 대부분 NULL — S5 부분 인덱스) |
| `X_PTL_COL_UNPD_M_06` | DIV_PAY_AGRMT_NO |  | `div_pay_agrmt_no IS NOT NULL` | 분할납부약정→대상 미납 조인(FK, 대부분 NULL — S5 부분 인덱스) |
| `X_PTL_COL_UNPD_D_01` | BILL_NO, BILL_DTL_SEQ |  |  | 수납배분(INV)·청구 조정 시 청구상세→미납상세 조회(FK 조인) |
| `X_PTL_COL_OVDU_ADCHG_L_01` | UNPD_NO, IMPS_YM |  |  | 미납별 가산금 조회·같은 부과년월 중복 부과 점검(FK 조인) |
| `X_PTL_COL_OVDU_ADCHG_L_02` | RFLT_BILL_NO |  | `rflt_bill_no IS NOT NULL` | 청구서에 실린 가산금 조회(FK, 반영 전 NULL) |
| `X_PTL_COL_DUN_L_01` | UNPD_NO, DUN_SNDNG_DTM |  |  | 미납별 독촉 이력 조회(FK 조인·최근순) |
| `X_PTL_COL_DUN_L_02` | DUN_SNDNG_DTM |  | `dun_sndng_stts_ty_cd = '01'` | 발송대기 독촉만 부분 인덱스 — 발송 배치 큐(상태 대부분 발송 완료 S3) |
| `X_PTL_COL_SUSP_M_01` | SVC_MGMT_NO, SUSP_DTM |  |  | 회선(서비스관리번호)별 미납 정지 조회 — 상담·회선상태 반영(FK 조인) |
| `X_PTL_COL_SUSP_M_02` | UNPD_NO |  |  | 미납→이용정지 조인(FK) |
| `X_PTL_COL_SUSP_M_03` | SUSP_STTS_TY_CD, SUSP_DTM |  | `susp_stts_ty_cd IN ('01','02')` | 예고·정지 중인 건만 부분 인덱스 — 해제·직권해지 전환 배치 |
| `X_PTL_COL_EXOFTRMN_M_01` | SBSC_CTRT_NO |  |  | 가입계약별 직권해지 조회(FK 조인) |
| `X_PTL_COL_EXOFTRMN_M_02` | UNPD_NO |  |  | 미납→직권해지 조인(FK) |
| `X_PTL_COL_EXOFTRMN_M_03` | SUSP_NO |  | `susp_no IS NOT NULL` | 이용정지→직권해지 조인(FK, 선택) |
| `X_PTL_COL_EXOFTRMN_M_04` | EXOFTRMN_SCHD_DT |  | `exoftrmn_stts_ty_cd IN ('01','02')` | 예고·예정 건의 해지 예정일 도래 배치(부분 인덱스) |
| `X_PTL_COL_RCVB_TRNSF_M_01` | CUST_NO |  |  | 고객번호별 이관 채권 조회(FK 조인) |
| `X_PTL_COL_RCVB_TRNSF_M_02` | RCVB_DSPSL_NO |  | `rcvb_dspsl_no IS NOT NULL` | 채권매각→이관 묶음 조인(FK, 대부분 NULL) |
| `X_PTL_COL_DIV_PAY_AGRMT_M_01` | BILL_ACNT_NO |  |  | 청구계정별 분할납부 약정 조회(FK 조인) |
| `X_PTL_COL_BDDT_M_01` | UNPD_NO |  |  | 미납→대손 조인(FK) |
| `X_PTL_COL_BDDT_M_02` | RCVB_TRNSF_NO |  | `rcvb_trnsf_no IS NOT NULL` | 이관 묶음→대손 조인(FK, 선택) |
| `X_PTL_COL_BDDT_M_03` | BDDT_CFMTN_DT |  |  | 회계 월 마감·세무 대손금 집계(확정일자 범위 조회) |
| `X_PTL_COL_SUSP_RLS_L_01` | SUSP_NO |  |  | 이용정지→해제 처리 조인(FK) |
| `X_PTL_COL_SUSP_RLS_L_02` | RCV_NO |  | `rcv_no IS NOT NULL` | 수납→정지 해제 역추적(FK, 선택) |
| `X_PTL_COL_SUSP_RLS_L_03` | DIV_PAY_AGRMT_NO |  | `div_pay_agrmt_no IS NOT NULL` | 분할납부약정→해제 조인(FK, 선택) |
| `X_PTL_COL_SUSP_RLS_L_04` | PAY_PRMS_NO |  | `pay_prms_no IS NOT NULL` | 납부약속→해제 조인(FK, 선택) |
| `X_PTL_COL_COLL_DLGT_D_01` | RCVB_COLL_CO_NO, COLL_DLGT_DT |  |  | 추심사별 위임 현황·기간 조회(FK 조인) |
| `X_PTL_COL_COLL_RTRVL_L_01` | RCVB_TRNSF_NO, COLL_DLGT_SEQ |  |  | 추심위임→회수 조인(FK) |
| `X_PTL_COL_COLL_RTRVL_L_02` | UNPD_NO |  |  | 미납별 추심 회수 조회(FK) |
| `X_PTL_COL_COLL_RTRVL_L_03` | RCV_NO |  | `rcv_no IS NOT NULL` | 수납→추심회수 역추적(FK, 선택) |
| `X_PTL_COL_COLL_RTRVL_L_04` | COLL_FEE_NO |  | `coll_fee_no IS NOT NULL` | 추심수수료→대상 회수 조인(FK, 정산 전 NULL) |
| `X_PTL_COL_COLL_FEE_L_01` | RCVB_COLL_CO_NO, STLM_YM | Y |  | 추심사×정산년월 1건 — 중복 정산 방지·월 정산 조회(FK 조인) |
| `X_PTL_COL_COLL_FEE_L_02` | STLM_NO |  | `stlm_no IS NOT NULL` | PRM 정산기본→추심수수료 조인(FK, 선택) |
| `X_PTL_COL_DIV_PAY_TMS_D_01` | RCV_NO |  | `rcv_no IS NOT NULL` | 수납→분할납부 회차 반영 조회(FK, 선택) |
| `X_PTL_COL_DIV_PAY_TMS_D_02` | PAY_SCHD_DT |  | `div_pay_tms_stts_ty_cd IN ('01','03')` | 예정·일부납 회차의 납부예정일 도래 배치(부분 인덱스) |
| `X_PTL_COL_PAY_PRMS_L_01` | BILL_ACNT_NO, PAY_PRMS_DT |  |  | 청구계정별 납부약속 조회·약속일 도래 점검(FK 조인) |
| `X_PTL_COL_PAY_PRMS_L_02` | UNPD_NO |  | `unpd_no IS NOT NULL` | 미납→납부약속 조인(FK, 선택) |
| `X_PTL_COL_PAY_PRMS_L_03` | RCV_NO |  | `rcv_no IS NOT NULL` | 수납→약속 이행 확인(FK, 선택) |
| `X_PTL_COL_CRINFO_REG_L_01` | CUST_NO |  |  | 고객번호별 신용정보 등록 조회(FK 조인) |
| `X_PTL_COL_CRINFO_REG_L_02` | UNPD_NO |  | `unpd_no IS NOT NULL` | 미납→신용정보 등록 조인(FK, 선택) |
| `X_PTL_COL_CRINFO_RLS_L_01` | CRINFO_REG_NO |  |  | 등록→해제 조인(FK) |
| `X_PTL_COL_CRINFO_RLS_L_02` | RCV_NO |  | `rcv_no IS NOT NULL` | 완납 수납→해제 역추적(FK, 선택) |
| `X_PTL_COL_BDDT_DPRC_D_01` | UNPD_NO, UNPD_DTL_SEQ |  |  | 미납상세→대손상각상세 조인(FK) |
| `X_PTL_COL_BDDT_RTRVL_L_01` | BDDT_NO |  |  | 대손→회수 조인(FK) |
| `X_PTL_COL_BDDT_RTRVL_L_02` | RCV_NO |  | `rcv_no IS NOT NULL` | 수납→대손 회수 역추적(FK, 선택) |
| `X_PTL_COL_BDDT_RTRVL_L_03` | COLL_RTRVL_NO |  | `coll_rtrvl_no IS NOT NULL` | 추심회수→대손 회수 조인(FK, 선택) |
| `X_PTL_COL_RCVB_DSPSL_L_01` | RCVB_COLL_CO_NO |  |  | 매입사별 매각 조회(FK 조인) |
| `X_PTL_COL_RCVB_PRSCR_H_01` | EXTSH_PRSCR_EXPRY_DT |  | `vld_end_dtm = '9999-12-31 23:59:59'` | 현재 유효 시효만 부분 인덱스 — 소멸시효 만료 도래 배치(대손 전환) |

인덱스 없는 테이블 : 기준(연체가산금기준코드·독촉정책·채권추심사·미납회수월통계 — 수만 행 이하, PK 로 충분), 이력·상세 중 PK 선두가 부모 키인 것(미납상태이력·이용정지이력·직권해지예고내역·독촉발송결과내역 — 부모→자식 조인을 PK 가 처리).

## 5. FK 정의(설계만 — DDL 미생성, D6)

| FK | 자식 칼럼 | 부모 테이블 | 부모 칼럼 |
|---|---|---|---|
| `FK_PTL_COL_UNPD_M_01` | BILL_NO, BILL_YM | `PTL_PAY_BILL_M` | BILL_NO, BILL_YM |
| `FK_PTL_COL_UNPD_M_02` | RCVB_TRNSF_NO | `PTL_COL_RCVB_TRNSF_M` | RCVB_TRNSF_NO |
| `FK_PTL_COL_UNPD_M_03` | DIV_PAY_AGRMT_NO | `PTL_COL_DIV_PAY_AGRMT_M` | DIV_PAY_AGRMT_NO |
| `FK_PTL_COL_UNPD_M_04` | BILL_ACNT_NO | `PTL_CUS_BILL_ACNT_M` | BILL_ACNT_NO |
| `FK_PTL_COL_UNPD_M_05` | CUST_NO | `PTL_CUS_CUST_M` | CUST_NO |
| `FK_PTL_COL_UNPD_D_01` | UNPD_NO | `PTL_COL_UNPD_M` | UNPD_NO |
| `FK_PTL_COL_UNPD_D_02` | BILL_NO, BILL_DTL_SEQ, BILL_YM | `PTL_PAY_BILL_D` | BILL_NO, BILL_DTL_SEQ, BILL_YM |
| `FK_PTL_COL_OVDU_ADCHG_L_01` | UNPD_NO | `PTL_COL_UNPD_M` | UNPD_NO |
| `FK_PTL_COL_OVDU_ADCHG_L_02` | RFLT_BILL_NO, RFLT_BILL_YM | `PTL_PAY_BILL_M` | BILL_NO, BILL_YM |
| `FK_PTL_COL_OVDU_ADCHG_L_03` | OVDU_ADCHG_STD_TY_CD | `PTL_COL_OVDU_ADCHG_STD_C` | OVDU_ADCHG_STD_TY_CD |
| `FK_PTL_COL_DUN_L_01` | UNPD_NO | `PTL_COL_UNPD_M` | UNPD_NO |
| `FK_PTL_COL_DUN_L_02` | DUN_PLCY_NO | `PTL_COL_DUN_PLCY_M` | DUN_PLCY_NO |
| `FK_PTL_COL_SUSP_M_01` | SVC_MGMT_NO | `PTL_ORD_LINE_M` | SVC_MGMT_NO |
| `FK_PTL_COL_SUSP_M_02` | UNPD_NO | `PTL_COL_UNPD_M` | UNPD_NO |
| `FK_PTL_COL_EXOFTRMN_M_01` | SBSC_CTRT_NO | `PTL_ORD_SBSC_CTRT_M` | SBSC_CTRT_NO |
| `FK_PTL_COL_EXOFTRMN_M_02` | UNPD_NO | `PTL_COL_UNPD_M` | UNPD_NO |
| `FK_PTL_COL_EXOFTRMN_M_03` | SUSP_NO | `PTL_COL_SUSP_M` | SUSP_NO |
| `FK_PTL_COL_RCVB_TRNSF_M_01` | CUST_NO | `PTL_CUS_CUST_M` | CUST_NO |
| `FK_PTL_COL_RCVB_TRNSF_M_02` | RCVB_DSPSL_NO | `PTL_COL_RCVB_DSPSL_L` | RCVB_DSPSL_NO |
| `FK_PTL_COL_DIV_PAY_AGRMT_M_01` | BILL_ACNT_NO | `PTL_CUS_BILL_ACNT_M` | BILL_ACNT_NO |
| `FK_PTL_COL_BDDT_M_01` | UNPD_NO | `PTL_COL_UNPD_M` | UNPD_NO |
| `FK_PTL_COL_BDDT_M_02` | RCVB_TRNSF_NO | `PTL_COL_RCVB_TRNSF_M` | RCVB_TRNSF_NO |
| `FK_PTL_COL_UNPD_STTS_H_01` | UNPD_NO | `PTL_COL_UNPD_M` | UNPD_NO |
| `FK_PTL_COL_DUN_SNDNG_RSLT_L_01` | DUN_NO, DUN_SNDNG_DTM | `PTL_COL_DUN_L` | DUN_NO, DUN_SNDNG_DTM |
| `FK_PTL_COL_SUSP_H_01` | SUSP_NO | `PTL_COL_SUSP_M` | SUSP_NO |
| `FK_PTL_COL_SUSP_RLS_L_01` | SUSP_NO | `PTL_COL_SUSP_M` | SUSP_NO |
| `FK_PTL_COL_SUSP_RLS_L_02` | RCV_NO, RCV_DT | `PTL_INV_RCV_M` | RCV_NO, RCV_DT |
| `FK_PTL_COL_SUSP_RLS_L_03` | DIV_PAY_AGRMT_NO | `PTL_COL_DIV_PAY_AGRMT_M` | DIV_PAY_AGRMT_NO |
| `FK_PTL_COL_SUSP_RLS_L_04` | PAY_PRMS_NO | `PTL_COL_PAY_PRMS_L` | PAY_PRMS_NO |
| `FK_PTL_COL_EXOFTRMN_PRNTC_L_01` | EXOFTRMN_NO | `PTL_COL_EXOFTRMN_M` | EXOFTRMN_NO |
| `FK_PTL_COL_COLL_DLGT_D_01` | RCVB_TRNSF_NO | `PTL_COL_RCVB_TRNSF_M` | RCVB_TRNSF_NO |
| `FK_PTL_COL_COLL_DLGT_D_02` | RCVB_COLL_CO_NO | `PTL_COL_RCVB_COLL_CO_M` | RCVB_COLL_CO_NO |
| `FK_PTL_COL_COLL_RTRVL_L_01` | RCVB_TRNSF_NO, COLL_DLGT_SEQ | `PTL_COL_COLL_DLGT_D` | RCVB_TRNSF_NO, COLL_DLGT_SEQ |
| `FK_PTL_COL_COLL_RTRVL_L_02` | UNPD_NO | `PTL_COL_UNPD_M` | UNPD_NO |
| `FK_PTL_COL_COLL_RTRVL_L_03` | RCV_NO, RCV_DT | `PTL_INV_RCV_M` | RCV_NO, RCV_DT |
| `FK_PTL_COL_COLL_RTRVL_L_04` | COLL_FEE_NO | `PTL_COL_COLL_FEE_L` | COLL_FEE_NO |
| `FK_PTL_COL_COLL_FEE_L_01` | RCVB_COLL_CO_NO | `PTL_COL_RCVB_COLL_CO_M` | RCVB_COLL_CO_NO |
| `FK_PTL_COL_COLL_FEE_L_02` | STLM_NO | `PTL_PRM_STLM_M` | STLM_NO |
| `FK_PTL_COL_DIV_PAY_TMS_D_01` | DIV_PAY_AGRMT_NO | `PTL_COL_DIV_PAY_AGRMT_M` | DIV_PAY_AGRMT_NO |
| `FK_PTL_COL_DIV_PAY_TMS_D_02` | RCV_NO, RCV_DT | `PTL_INV_RCV_M` | RCV_NO, RCV_DT |
| `FK_PTL_COL_PAY_PRMS_L_01` | BILL_ACNT_NO | `PTL_CUS_BILL_ACNT_M` | BILL_ACNT_NO |
| `FK_PTL_COL_PAY_PRMS_L_02` | UNPD_NO | `PTL_COL_UNPD_M` | UNPD_NO |
| `FK_PTL_COL_PAY_PRMS_L_03` | RCV_NO, RCV_DT | `PTL_INV_RCV_M` | RCV_NO, RCV_DT |
| `FK_PTL_COL_CRINFO_REG_L_01` | CUST_NO | `PTL_CUS_CUST_M` | CUST_NO |
| `FK_PTL_COL_CRINFO_REG_L_02` | UNPD_NO | `PTL_COL_UNPD_M` | UNPD_NO |
| `FK_PTL_COL_CRINFO_RLS_L_01` | CRINFO_REG_NO | `PTL_COL_CRINFO_REG_L` | CRINFO_REG_NO |
| `FK_PTL_COL_CRINFO_RLS_L_02` | RCV_NO, RCV_DT | `PTL_INV_RCV_M` | RCV_NO, RCV_DT |
| `FK_PTL_COL_BDDT_DPRC_D_01` | BDDT_NO | `PTL_COL_BDDT_M` | BDDT_NO |
| `FK_PTL_COL_BDDT_DPRC_D_02` | UNPD_NO, UNPD_DTL_SEQ | `PTL_COL_UNPD_D` | UNPD_NO, UNPD_DTL_SEQ |
| `FK_PTL_COL_BDDT_RTRVL_L_01` | BDDT_NO | `PTL_COL_BDDT_M` | BDDT_NO |
| `FK_PTL_COL_BDDT_RTRVL_L_02` | RCV_NO, RCV_DT | `PTL_INV_RCV_M` | RCV_NO, RCV_DT |
| `FK_PTL_COL_BDDT_RTRVL_L_03` | COLL_RTRVL_NO | `PTL_COL_COLL_RTRVL_L` | COLL_RTRVL_NO |
| `FK_PTL_COL_RCVB_DSPSL_L_01` | RCVB_COLL_CO_NO | `PTL_COL_RCVB_COLL_CO_M` | RCVB_COLL_CO_NO |
| `FK_PTL_COL_RCVB_PRSCR_H_01` | UNPD_NO | `PTL_COL_UNPD_M` | UNPD_NO |
| `FK_PTL_COL_UNPD_MM_T_01` | BILL_ACNT_NO | `PTL_CUS_BILL_ACNT_M` | BILL_ACNT_NO |

## 6. 결정 메모

- 파티션 기준 : COL 은 T3 영역 — 목표 3천만 행 이상인 누적형(내역·이력·월 스냅샷) 테이블만 연 RANGE 파티션(2010~2027 + DEFAULT). 현재값 ~기본(미납기본 2천만·미납상세 6천만)은 자식 FK 가 많고 날짜 조건 없는 키 조회가 주 경로라 파티션하지 않음
- 파티션 키는 PK 끝에 둔다 — 업무 식별자(번호) 선두로 단건 조회는 그대로, PostgreSQL 파티션 PK 요건 충족
- 독촉발송결과내역 = 부모 독촉내역 파티션 키(독촉발송일시)를 반정규화해 PK·파티션 키로 사용 → 부모·자식 같은 연 파티션끼리 조인
- 04 관문 F1 반정규화 후보 9개 중 채택 2개(미납기본·미납상세 미납잔여금액) — 매일 배치·수납배분 핫 경로. 나머지 7개(연체가산금누적금액·누적회수금액·분할납부 집계 4종·대손회수누적금액)는 행 수 수백만 이하 또는 월 1회 조회라 원천 집계로 충분해 미채택
- 미납기본에 청구계정번호·청구년월·고객번호 반정규화 — 실무 조회 경로(청구계정+청구년월, 고객번호)를 청구기본(T4) 조인 없이 처리
- 저선택도 상태값(S3)은 전체 인덱스 대신 진행 중 상태만 부분 인덱스, NULL 이 대부분인 선택 FK(S5)는 IS NOT NULL 부분 인덱스
- 작은 기준 테이블(코드·정책·추심사, 수천 행 이하)을 가리키는 FK 칼럼은 인덱스 없음 — 조인은 자식→부모 PK 방향만 쓰고 부모 삭제는 논리 처리(D6 RI 미구현)
- REF 기준 테이블 행 수는 업무 실제 규모(추심사 200·정책 2천·가산금 기준 20)로 T1 하한(1만) 미만 — data_migrationner 가 배율로 조정
- 교차 FK 의 refCols 는 부모 물리 PK 전체(파티션 키 포함) — PAY 청구기본(청구년월)·청구상세(청구년월)·INV 수납기본(수납일자)의 파티션 키를 자식에 반정규화해 FK 를 완성(05 COL 물리 관문 R1, 미완성 시 생성기 실패). 부모 물리 모델이 아직 없는 영역(PRM)은 논리 PK 기준
- 부모 물리 테이블명은 표준 접미어(_M 등) 기준 — ORD 물리가 엔터티 약어(_BAS)로 이름을 지은 불일치는 ORD 관문 소관(05 COL 물리 관문 R3)

## 7. 검증

`pitel_dev` 에 스키마 `chk_col` 을 만들어 두 DDL 을 순서대로 2회(재실행 안전 확인) 실행, 오류 0 확인 후 `DROP SCHEMA chk_col CASCADE`.
