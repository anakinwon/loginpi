# 05 물리 모델 — 가입(ORD)

> 작성 2026-11-07 · subagent_physical_modeler · 마스터 위임 자동 승인 모드. 정본 = `model/physical/ORD.json`, 생성기 = `tools/phy_ORD_build.js`(JSON·DDL·이 문서를 한 번에 생성 — 손으로 고치지 말고 생성기 설정을 고친다).

## 1. 요약

| 항목 | 값 |
|---|---|
| 테이블 | 30개 (엔터티 1:1, 핵심 10 · 기본 20) |
| 파티션 테이블 | 4개 — 연 단위 RANGE 2010~2027 18개 + DEFAULT 1개씩 |
| 인덱스(PK 제외) | 64개 |
| FK 정의 | 91개 (DDL 미생성 — D6) |
| 목표 행 수 합계 | 386,500,000행 |
| DDL | `ddl/30_ord_tables.sql`(테이블·파티션·주석) · `ddl/30_ord_constraints.sql`(PK·인덱스, 적재 뒤) |

## 2. 테이블

| # | 테이블 | 엔터티 | 유형 | 칼럼 | PK | 인덱스 | 파티션 | 목표 행 수 |
|---|---|---|---|---|---|---|---|---|
| 1 | PTL_ORD_SBSC_APLY_M | 가입신청기본 | ACT·CNCP | 16 | SBSC_APLY_NO | 3 | - | 13,000,000 |
| 2 | PTL_ORD_SBSC_CTRT_M | 가입계약기본 | ACT·CNCP | 14 | SBSC_CTRT_NO | 6 | - | 13,000,000 |
| 3 | PTL_ORD_LINE_M | 회선기본 | BASE·CNCP | 15 | SVC_MGMT_NO | 3 | - | 12,000,000 |
| 4 | PTL_ORD_SVC_NO_M | 서비스번호기본 | BASE·CNCP | 12 | SVC_NO | 1 | - | 10,000,000 |
| 5 | PTL_ORD_SBSC_PROD_M | 가입상품기본 | ACT·CNCP | 12 | SBSC_PROD_NO | 3 | - | 30,000,000 |
| 6 | PTL_ORD_AGRMT_CTRT_M | 약정계약기본 | ACT·CNCP | 13 | AGRMT_CTRT_NO | 2 | - | 8,000,000 |
| 7 | PTL_ORD_EQP_INSTL_CTRT_M | 단말할부계약기본 | ACT·CNCP | 16 | EQP_INSTL_CTRT_NO | 1 | - | 2,000,000 |
| 8 | PTL_ORD_MNP_APLY_M | 번호이동신청기본 | ACT·CNCP | 13 | MNP_APLY_NO | 5 | - | 3,000,000 |
| 9 | PTL_ORD_CMBN_CTRT_M | 결합계약기본 | ACT·CNCP | 12 | CMBN_CTRT_NO | 2 | - | 2,000,000 |
| 10 | PTL_ORD_LINE_STTS_H | 회선상태이력 | ACT·CNCP | 13 | SVC_MGMT_NO, LINE_STTS_HIST_SEQ, LINE_STTS_CHG_DTM | 3 | 연 RANGE(LINE_STTS_CHG_DTM) | 28,000,000 |
| 11 | PTL_ORD_SBSC_APLY_D | 가입신청상세 | ACT·LGCL | 5 | SBSC_APLY_NO, SBSC_APLY_DTL_SEQ | 1 | - | 20,000,000 |
| 12 | PTL_ORD_SBSC_DOC_L | 가입서류내역 | ACT·LGCL | 8 | SBSC_APLY_NO, SBSC_DOC_SEQ | 1 | - | 15,000,000 |
| 13 | PTL_ORD_OPNG_PRCS_L | 개통처리내역 | ACT·LGCL | 9 | OPNG_PRCS_NO | 3 | - | 13,000,000 |
| 14 | PTL_ORD_SBSC_CTRT_H | 가입계약이력 | ACT·LGCL | 9 | SBSC_CTRT_NO, SBSC_CTRT_HIST_SEQ, SBSC_CTRT_CHG_DTM | 1 | 연 RANGE(SBSC_CTRT_CHG_DTM) | 18,000,000 |
| 15 | PTL_ORD_LINE_CHG_H | 회선변경이력 | ACT·LGCL | 13 | SVC_MGMT_NO, LINE_CHG_HIST_SEQ, LINE_CHG_DTM | 2 | 연 RANGE(LINE_CHG_DTM) | 16,000,000 |
| 16 | PTL_ORD_SBSC_PROD_H | 가입상품이력 | ACT·LGCL | 10 | SBSC_PROD_NO, SBSC_PROD_HIST_SEQ, SBSC_PROD_CHG_DTM | 2 | 연 RANGE(SBSC_PROD_CHG_DTM) | 32,000,000 |
| 17 | PTL_ORD_RTPLN_CHG_APLY_L | 요금제변경신청내역 | ACT·LGCL | 11 | RTPLN_CHG_APLY_NO | 2 | - | 6,000,000 |
| 18 | PTL_ORD_ADSVC_APLY_L | 부가서비스신청내역 | ACT·LGCL | 10 | ADSVC_APLY_NO | 3 | - | 12,000,000 |
| 19 | PTL_ORD_AGRMT_CTRT_H | 약정계약이력 | ACT·LGCL | 10 | AGRMT_CTRT_NO, AGRMT_CTRT_HIST_SEQ | 0 | - | 9,000,000 |
| 20 | PTL_ORD_SUBSD_APLCN_L | 지원금적용내역 | ACT·LGCL | 8 | AGRMT_CTRT_NO, SUBSD_APLCN_SEQ | 1 | - | 8,000,000 |
| 21 | PTL_ORD_EQP_INSTL_D | 단말할부상세 | ACT·LGCL | 8 | EQP_INSTL_CTRT_NO, INSTL_TMS | 1 | - | 45,000,000 |
| 22 | PTL_ORD_LINE_EQP_R | 회선단말관계 | ACT·LGCL | 9 | SVC_MGMT_NO, LINE_EQP_REL_SEQ | 3 | - | 15,000,000 |
| 23 | PTL_ORD_EQP_CHG_L | 단말변경내역 | ACT·LGCL | 13 | EQP_CHG_NO | 2 | - | 5,000,000 |
| 24 | PTL_ORD_USIM_CHG_L | 유심변경내역 | ACT·LGCL | 13 | USIM_CHG_NO | 2 | - | 4,000,000 |
| 25 | PTL_ORD_MNP_H | 번호이동이력 | ACT·LGCL | 7 | MNP_APLY_NO, MNP_HIST_SEQ | 0 | - | 10,000,000 |
| 26 | PTL_ORD_NMNE_CHG_L | 명의변경내역 | ACT·LGCL | 13 | NMNE_CHG_NO | 3 | - | 1,000,000 |
| 27 | PTL_ORD_PAUS_L | 일시정지내역 | ACT·LGCL | 9 | PAUS_NO | 3 | - | 1,500,000 |
| 28 | PTL_ORD_TRMN_APLY_L | 해지신청내역 | ACT·LGCL | 9 | TRMN_APLY_NO | 3 | - | 7,000,000 |
| 29 | PTL_ORD_CMBN_CMPS_LINE_R | 결합구성회선관계 | ACT·LGCL | 6 | CMBN_CTRT_NO, SBSC_CTRT_NO | 1 | - | 5,000,000 |
| 30 | PTL_ORD_SVC_NO_H | 서비스번호이력 | ACT·LGCL | 8 | SVC_NO, SVC_NO_HIST_SEQ | 1 | - | 23,000,000 |

칼럼 수는 시스템 칼럼 4개(DDL 에만, D7) 제외.

## 3. 파티셔닝

- 기준 : ORD 는 T3(고객·가입계) 영역이라 T4 월 파티션 대상 없음. **T3 대용량 이력**(1천5백만 행 이상인 `~이력`, 시간이 갈수록 누적만 되고 최근 구간 조회·과거 구간 보관 분리가 필요한 테이블)만 **연 단위 RANGE** 로 나눈다.
- 파티션 키 = 이력 행의 변경 일시(행이 생기는 시각, NULL 없음). PostgreSQL 은 파티션 테이블의 PK·유일 제약에 파티션 키를 반드시 포함해야 하므로 **PK 끝에 키를 추가**했다 — 논리 식별자(부모 키 + 순번)의 전역 유일은 순번 채번(부모별 max+1)이 보장한다.
- 다른 영역이 FK 로 참조하는 테이블(가입계약·회선·가입상품·약정·단말할부상세·결합·해지신청)은 파티션하지 않는다 — 참조되는 논리 키 = PK 를 그대로 유지(교차 crossKeys 계약 보존).
- 단말할부상세(4천5백만)는 행 수가 크지만 PAY 단말할부청구상세가 (단말할부계약번호, 할부회차) 로 참조하므로 PK 변경 없이 일반 테이블 + 청구년월 인덱스로 둔다.

| 테이블 | 파티션 키 | 범위 | 하위 테이블 | PK |
|---|---|---|---|---|
| PTL_ORD_LINE_STTS_H | LINE_STTS_CHG_DTM | 2010-01-01 ~ 2028-01-01 | `ptl_ord_line_stts_h_p2010`~`_p2027` + `_pdflt` | SVC_MGMT_NO, LINE_STTS_HIST_SEQ, LINE_STTS_CHG_DTM |
| PTL_ORD_SBSC_CTRT_H | SBSC_CTRT_CHG_DTM | 2010-01-01 ~ 2028-01-01 | `ptl_ord_sbsc_ctrt_h_p2010`~`_p2027` + `_pdflt` | SBSC_CTRT_NO, SBSC_CTRT_HIST_SEQ, SBSC_CTRT_CHG_DTM |
| PTL_ORD_LINE_CHG_H | LINE_CHG_DTM | 2010-01-01 ~ 2028-01-01 | `ptl_ord_line_chg_h_p2010`~`_p2027` + `_pdflt` | SVC_MGMT_NO, LINE_CHG_HIST_SEQ, LINE_CHG_DTM |
| PTL_ORD_SBSC_PROD_H | SBSC_PROD_CHG_DTM | 2010-01-01 ~ 2028-01-01 | `ptl_ord_sbsc_prod_h_p2010`~`_p2027` + `_pdflt` | SBSC_PROD_NO, SBSC_PROD_HIST_SEQ, SBSC_PROD_CHG_DTM |

## 4. 인덱스

원칙 : ① 다른 테이블과 조인하는 FK 칼럼 중 **자식 → 부모 역조회가 실제로 일어나는 것**(고객·청구계정·회선·계약 단위 조회) ② 실무 조회 경로(서비스번호·IMSI·IMEI·판매점+기간·적용예정일 배치) ③ PK 앞부분과 겹치는 인덱스 금지(생성기가 중복 점검) ④ NULL 이 대부분인 선택 FK(S5)는 `WHERE … IS NOT NULL` 부분 인덱스 ⑤ 저선택도 상태 칼럼 단독 인덱스 금지(S3) — 날짜·상품과 복합으로만. 상품코드·단말모델코드 같은 기준 FK 는 역조회가 집계성이라 가입상품 1건 외 인덱스 생략.

| 인덱스 | 칼럼 | 조건 | 사유 |
|---|---|---|---|
| X_PTL_ORD_SBSC_APLY_M_01 | CUST_NO |  | 고객별 신청 이력 조회(상담·명의도용 점검) — 고객 조인 FK |
| X_PTL_ORD_SBSC_APLY_M_02 | SHOP_NO, SBSC_APLY_DTM |  | 판매점별 기간 유치 실적·유치 수수료(STL) 산정 경로 |
| X_PTL_ORD_SBSC_APLY_M_03 | SBSC_APLY_DTM |  | 일자별 신청 현황·미처리 신청 추출 배치 |
| X_PTL_ORD_SBSC_CTRT_M_01 | CUST_NO |  | 고객별 보유 계약 조회(S1 멱법칙 — 법인 1곳 100만 회선) — 고객 조인 FK |
| X_PTL_ORD_SBSC_CTRT_M_02 | BILL_ACNT_NO |  | 청구계정별 계약 목록(요금계산·청구서 작성 배치) — 청구계정 조인 FK |
| X_PTL_ORD_SBSC_CTRT_M_03 | SVC_MGMT_NO |  | 회선 → 계약 역조회(PAY 사용내역·COL 이용정지 조인) — 회선 조인 FK |
| X_PTL_ORD_SBSC_CTRT_M_04 | SVC_NO |  | 서비스번호로 계약 검색(반정규화 칼럼) |
| X_PTL_ORD_SBSC_CTRT_M_05 | AGNC_NO, SBSC_CTRT_DTM | agnc_no IS NOT NULL | 대리점별 유지 회선·관리수수료(STL) 산정 경로 |
| X_PTL_ORD_SBSC_CTRT_M_06 | SBSC_APLY_NO | sbsc_aply_no IS NOT NULL | 신청 → 계약 추적(개통 완료 확인) |
| X_PTL_ORD_LINE_M_01 | SVC_NO |  | 서비스번호 → 회선 조회(번호 재사용 S8 — 한 번호에 시기별 여러 회선) — 서비스번호 조인 FK |
| X_PTL_ORD_LINE_M_02 | IMSI_NO |  | 망 이벤트·원시사용내역(CDR) IMSI → 회선 매칭 |
| X_PTL_ORD_LINE_M_03 | IMEI_NO | imei_no IS NOT NULL | 분실·도난 단말 조회, 단말 기준 회선 찾기 |
| X_PTL_ORD_SVC_NO_M_01 | SVC_NO_STTS_TY_CD, RE_USE_PSBL_DT |  | 신규 개통 번호 풀 — 회수 후 재사용 가능일 도래 번호 추출(상태 저선택도 S3 보완용 복합) |
| X_PTL_ORD_SBSC_PROD_M_01 | SBSC_CTRT_NO |  | 계약별 가입 상품 목록(상담·해지 정산) — 가입계약 조인 FK |
| X_PTL_ORD_SBSC_PROD_M_02 | SVC_MGMT_NO, VLD_BGNG_DTM |  | 회선 단위 요금계산 — 청구월 유효 상품 범위 조회(반정규화 칼럼) |
| X_PTL_ORD_SBSC_PROD_M_03 | PROD_CD, SBSC_PROD_STTS_TY_CD |  | 상품별 가입자 수·상품 폐지 영향 분석(S2 인기 상품 쏠림 — 통계 오판 점검 대상) |
| X_PTL_ORD_AGRMT_CTRT_M_01 | SBSC_CTRT_NO |  | 계약별 약정 조회(해지 위약금 산정) — 가입계약 조인 FK |
| X_PTL_ORD_AGRMT_CTRT_M_02 | AGRMT_END_DT |  | 약정 만료 도래 대상 추출(재약정 안내·선택약정 종료 배치) |
| X_PTL_ORD_EQP_INSTL_CTRT_M_01 | SBSC_CTRT_NO |  | 계약별 할부 조회(해지·명의변경 정산) — 가입계약 조인 FK |
| X_PTL_ORD_MNP_APLY_M_01 | SVC_NO, MNP_APLY_DTM |  | 번호별 번호이동 이력(전출입 반복 고객 점검) — 서비스번호 조인 FK |
| X_PTL_ORD_MNP_APLY_M_02 | CARR_NO, MNP_APLY_DTM |  | 상대 사업자별 기간 전출입 집계·상호 정산 — 통신사업자 조인 FK |
| X_PTL_ORD_MNP_APLY_M_03 | MNP_ACPT_NO |  | 번호이동 관리기관(KTOA) 접수번호 대사 |
| X_PTL_ORD_MNP_APLY_M_04 | SBSC_CTRT_NO | sbsc_ctrt_no IS NOT NULL | 계약 → 번호이동 추적 |
| X_PTL_ORD_MNP_APLY_M_05 | SBSC_APLY_NO | sbsc_aply_no IS NOT NULL | 가입신청 → 번호이동 동반 신청 조회(번호이동 개통 처리 매 건) — 가입신청 조인 FK(05 ORD 물리 관문 추가) |
| X_PTL_ORD_CMBN_CTRT_M_01 | RPRS_CUST_NO |  | 대표 고객별 결합 조회 — 고객 조인 FK |
| X_PTL_ORD_CMBN_CTRT_M_02 | RPRS_SBSC_CTRT_NO |  | 대표 회선 계약 → 결합 조회 — 가입계약 조인 FK |
| X_PTL_ORD_LINE_STTS_H_01 | SBSC_CTRT_NO | sbsc_ctrt_no IS NOT NULL | 계약별 상태 이력(해지·정지 기간 산정) — 가입계약 조인 FK |
| X_PTL_ORD_LINE_STTS_H_02 | SUSP_NO | susp_no IS NOT NULL | COL 미납 이용정지 → 회선 상태 결과 추적(S5 NULL 쏠림 — 부분 인덱스) |
| X_PTL_ORD_LINE_STTS_H_03 | EXOFTRMN_NO | exoftrmn_no IS NOT NULL | COL 직권해지 → 회선 상태 결과 추적(부분 인덱스) |
| X_PTL_ORD_SBSC_APLY_D_01 | SBSC_PROD_NO | sbsc_prod_no IS NOT NULL | 가입상품 → 신청 항목 역추적 |
| X_PTL_ORD_SBSC_DOC_L_01 | DSTR_SCHD_DT |  | 개인정보 서류 파기 기한 도래 추출 배치(개인정보보호법) |
| X_PTL_ORD_OPNG_PRCS_L_01 | SBSC_APLY_NO |  | 신청별 개통 처리 결과 — 가입신청 조인 FK |
| X_PTL_ORD_OPNG_PRCS_L_02 | SBSC_CTRT_NO | sbsc_ctrt_no IS NOT NULL | 계약별 개통 처리 조회 |
| X_PTL_ORD_OPNG_PRCS_L_03 | OPNG_PRCS_DTM |  | 일자별 개통 현황·망 연동 실패 재처리 배치 |
| X_PTL_ORD_SBSC_CTRT_H_01 | BILL_ACNT_NO |  | 청구계정 변경 추적(청구계정별 과거 계약 귀속) — 청구계정 조인 FK |
| X_PTL_ORD_LINE_CHG_H_01 | SVC_NO |  | 번호별 과거 회선 추적(번호변경·재사용 S8) — 서비스번호 조인 FK |
| X_PTL_ORD_LINE_CHG_H_02 | IMSI_NO |  | 과거 IMSI → 회선 매칭(지연 도착 CDR 재처리) |
| X_PTL_ORD_SBSC_PROD_H_01 | RTPLN_CHG_APLY_NO | rtpln_chg_aply_no IS NOT NULL | 요금제 변경 신청 → 반영 이력 추적(부분 인덱스) |
| X_PTL_ORD_SBSC_PROD_H_02 | ADSVC_APLY_NO | adsvc_aply_no IS NOT NULL | 부가서비스 신청 → 반영 이력 추적(부분 인덱스) |
| X_PTL_ORD_RTPLN_CHG_APLY_L_01 | SBSC_CTRT_NO |  | 계약별 요금제 변경 신청 조회 — 가입계약 조인 FK |
| X_PTL_ORD_RTPLN_CHG_APLY_L_02 | APLCN_SCHD_DT, RTPLN_CHG_APLY_STTS_TY_CD |  | 익월 1일 적용 예정 일괄 반영 배치(S4 1일 급증) |
| X_PTL_ORD_ADSVC_APLY_L_01 | SBSC_CTRT_NO |  | 계약별 부가서비스 신청 조회 — 가입계약 조인 FK |
| X_PTL_ORD_ADSVC_APLY_L_02 | SBSC_PROD_NO | sbsc_prod_no IS NOT NULL | 가입상품 → 신청 추적 |
| X_PTL_ORD_ADSVC_APLY_L_03 | APLCN_SCHD_DT |  | 적용 예정 일괄 반영 배치 |
| X_PTL_ORD_SUBSD_APLCN_L_01 | SHOP_NO, SUBSD_APLCN_DTM | shop_no IS NOT NULL | 판매점별 지원금 정산(STL 근거)·추가지원금 한도 점검 |
| X_PTL_ORD_EQP_INSTL_D_01 | INSTL_BILL_YM |  | 월 청구 배치 — 해당 청구년월 할부 회차 추출(PAY 단말할부청구상세 생성) |
| X_PTL_ORD_LINE_EQP_R_01 | IMEI_NO |  | IMEI → 사용 회선 기간 조회(분실·도난·자급제 점검) |
| X_PTL_ORD_LINE_EQP_R_02 | EQP_INSTL_CTRT_NO | eqp_instl_ctrt_no IS NOT NULL | 할부 계약 → 단말 장착 회선 |
| X_PTL_ORD_LINE_EQP_R_03 | EQP_CHG_NO | eqp_chg_no IS NOT NULL | 단말변경 처리 → 결과 관계 |
| X_PTL_ORD_EQP_CHG_L_01 | SBSC_CTRT_NO |  | 계약별 기기변경 이력 — 가입계약 조인 FK |
| X_PTL_ORD_EQP_CHG_L_02 | SHOP_NO, EQP_CHG_DTM |  | 판매점별 기기변경 실적·수수료(STL) |
| X_PTL_ORD_USIM_CHG_L_01 | SVC_MGMT_NO |  | 회선별 유심 교체 이력(유심 복제 의심 점검) — 회선 조인 FK |
| X_PTL_ORD_USIM_CHG_L_02 | USIM_SN |  | 유심 일련번호 → 교체 처리 조회 |
| X_PTL_ORD_NMNE_CHG_L_01 | SVC_MGMT_NO |  | 회선별 명의변경 이력 — 회선 조인 FK |
| X_PTL_ORD_NMNE_CHG_L_02 | BFR_CUST_NO |  | 양도 고객 기준 조회(미납 승계 점검) |
| X_PTL_ORD_NMNE_CHG_L_03 | CUST_NO |  | 양수 고객 기준 조회 |
| X_PTL_ORD_PAUS_L_01 | SVC_MGMT_NO |  | 회선별 일시정지 이력(연간 횟수·기간 한도 점검) — 회선 조인 FK |
| X_PTL_ORD_PAUS_L_02 | SBSC_CTRT_NO |  | 계약별 일시정지 조회 |
| X_PTL_ORD_PAUS_L_03 | PAUS_END_SCHD_DT | paus_rls_dtm IS NULL | 종료 예정일 도래 자동 해제 배치 — 미해제 건만(부분) |
| X_PTL_ORD_TRMN_APLY_L_01 | SBSC_CTRT_NO |  | 계약별 해지 신청 조회(PRM 수수료 환수 근거) — 가입계약 조인 FK |
| X_PTL_ORD_TRMN_APLY_L_02 | MNP_APLY_NO | mnp_aply_no IS NOT NULL | 번호이동 전출 해지 연결 |
| X_PTL_ORD_TRMN_APLY_L_03 | TRMN_SCHD_DT |  | 해지 예정일 도래 일괄 해지 배치 |
| X_PTL_ORD_CMBN_CMPS_LINE_R_01 | SBSC_CTRT_NO |  | 회선 계약 → 소속 결합 역조회(결합 할인 대상 판정) — 가입계약 조인 FK |
| X_PTL_ORD_SVC_NO_H_01 | SVC_MGMT_NO | svc_mgmt_no IS NOT NULL | 회선 → 사용 번호 이력 |

## 5. 반정규화

논리 단계 denormCandidates(L1·L2·L12)를 물리에서 판정. 6건 모두 채택 — 대용량 조회 경로(요금계산·상담 검색·번호 풀·결합 할인·할부 잔액)에서 조인·집계 1단계를 없앤다. 갱신 책임 = 원천을 바꾸는 업무 처리와 같은 트랜잭션.

| 테이블 | 칼럼 | 원천 | 사유 |
|---|---|---|---|
| PTL_ORD_SBSC_CTRT_M | SVC_NO | 회선기본.서비스번호 | 번호로 계약 찾기(상담·청구 검색 1순위 경로) — 회선 조인 1단계 제거. 번호 변경 시 회선변경 처리와 같은 트랜잭션에서 갱신 |
| PTL_ORD_SVC_NO_M | SVC_NO_ASGN_NMTM | 서비스번호이력 COUNT(할당 사유) | 재사용 번호 골라내기(S8)·번호 풀 등급 산정 — 이력 집계 회피. 번호 할당 처리에서 +1 |
| PTL_ORD_SBSC_PROD_M | SVC_MGMT_NO | 가입계약기본.서비스관리번호 | 요금계산(PAY)·레이크 파티셔닝이 회선 단위 — 가입계약 조인 1단계 제거(개념 결정 O4). 계약의 회선은 불변(명의변경은 새 계약) |
| PTL_ORD_EQP_INSTL_CTRT_M | INSTL_RMND_PRNC | 단말할부상세 마지막 청구 회차의 할부잔여원금 | 잔액 조회·해지 시 잔여 할부금 일시 청구·명의변경 승계 — 회차 상세 스캔 회피. 회차 청구 확정 때 갱신 |
| PTL_ORD_CMBN_CTRT_M | CMBN_TY_CD | PRD 결합상품기본.결합유형코드 | 결합 유형별 집계·할인 산정 — PRD 조인 회피(결합상품의 유형은 불변) |
| PTL_ORD_CMBN_CTRT_M | CMBN_LINE_CNT | 결합구성회선관계 COUNT(유효) | 결합 할인 단계 산정(회선 수 구간) — 구성 관계 집계 회피. 구성 변경 처리에서 갱신 |

## 6. 예상 행 수 근거

- 기간 2010-01 ~ 2026-10 누적(해지 포함, D8). 회선 1천2백만(활성 약 1/2 + 해지 누적), 계약 = 회선 + 명의변경 재계약, 가입상품 = 계약당 요금제 1 + 부가·할인 평균 1.3. ORD 합계 약 3.9억 행은 D9 전체 10~12억 중 가입계 몫 — 디스크 한도에 걸리면 생성기 배율(scale)로 줄인다.
- 이력은 변경 빈도 기준 : 회선상태 2.3건/회선, 가입상품 1.07건/가입상품, 가입계약 1.4건/계약, 서비스번호 2.3건/번호(재사용 S8).
- 단말할부상세 = 할부 계약 200만 × 평균 22.5 회차 ≈ 4천5백만 — 최종 배분은 data_migrationner(docs/06)가 확정.

## 7. 결정 메모

| # | 결정 | 근거 |
|---|---|---|
| F1 | 파티션 = 회선상태이력·가입계약이력·회선변경이력·가입상품이력 4개(연 RANGE) | T3 대용량 이력 규칙(1천5백만 행 이상 이력), 다른 영역 FK 참조 없음, 최근 연도 조회·과거 연도 보관 분리(S6 최근 파티션 쏠림 재현) |
| F2 | 파티션 키를 PK 끝에 추가하고 칼럼 순서는 PK 칼럼 바로 뒤로 이동 | PostgreSQL 파티션 PK 제약 + 규칙 2-9(PK → FK → 일반) |
| F3 | 일반 테이블 PK 는 유일 인덱스 먼저 만든 뒤 `USING INDEX` 로 승격 | 대량 적재 뒤 인덱스 빌드 1회(D14), 재실행 시 pg_constraint 확인으로 건너뜀 |
| F4 | 선택 FK 인덱스는 부분 인덱스 | NULL 90%+ (S5) 칼럼 인덱스 크기 1/10 이하 |
| F5 | FK 칼럼 중 PRD 기준 코드(상품·단말모델·유심) 역조회 인덱스 생략(가입상품.상품코드만 예외) | 기준 → 가입 역조회는 집계 배치뿐, S2 쏠림으로 인덱스 효용 낮음 |
| F6 | 일자C8·년월C6 은 도메인 정본대로 CHAR 유지 | 규칙 2-10 도메인 정본(이 저장소 앱 규칙 "CHAR 금지"는 cafe.pi 대상 — pitel 은 도메인 사전 우선) |
