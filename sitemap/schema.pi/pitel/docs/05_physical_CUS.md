# 05 물리 모델 — CUS 고객

> 작성 2026-11-07 · subagent_physical_modeler · 대상 PostgreSQL 17 · 원본 `model/physical/CUS.json` · DDL `ddl/20_cus_tables.sql`·`ddl/20_cus_constraints.sql`

## 1. 요약

- 테이블 **30개**(엔터티 1:1), 파티션 테이블 **9개**(하위 파티션 369개 — 개수 미포함 D3), 인덱스 **26개**(PK 제외), FK 정의 **51개**(설계만 — DDL 미생성 D6), 반정규화 **1건**.
- 예상 행 수 합계(scale 1.0) **161,365,000행** — 영역 등급 T3(최대 테이블 1.5천만), 기준(REF) 3개는 T1. 최종 행 수는 data_migrationner 가 docs/06 에서 확정.
- DDL 검증 : pitel_dev 스키마 chk_cus 에 tables → constraints → (재실행) tables → constraints 순 실행 오류 0(ON_ERROR_STOP), 테이블 30·하위 파티션 369·PK 30·인덱스 25(리뷰 뒤 26)·FK 제약 0 확인 후 DROP SCHEMA.

## 2. 규칙

- **naming** : PK = PK_<테이블>, 인덱스 = X_<테이블>_NN, FK = FK_<자식테이블>_NN(정의만 — D6, DDL 미생성). PostgreSQL DDL 은 소문자
- **colOrder** : PK → FK → 일반(논리 순번 순). 시스템 칼럼 4개는 DDL 에만(D7)
- **types** : 도메인 사전(model/std/domains.json) lgcTp·len·scale 그대로 — 일자 CHAR(8)·년월 CHAR(6)·금액 NUMERIC(15)
- **partition** : 월 단위 적재·조회 테이블(고객월통계 — 기준년월 키) 월 RANGE 2010-01~2027-12, T3 대용량 이력·행위(7백만 행 이상 + 시점 키) 연 RANGE 2010~2027, 각각 DEFAULT 1개. 파티션 키는 PK 에 포함
- **index** : PK 선두 칼럼과 같은 FK 는 별도 인덱스 없음(중복 금지). 소용량 기준(REF T1) 부모로 가는 FK(지역코드·우편번호·청구주기·조직·동의항목)는 자식→부모 방향만 쓰여 부모 PK 로 충분 — 인덱스 없음

## 3. 테이블

| ID | 테이블 | 논리명 | 칼럼 | PK | 예상 행 | 파티션 |
|---|---|---|---|---|---:|---|
| CUS-001 | PTL_CUS_CUST_M | 고객기본 | 13 | CUST_NO | 5,000,000 | - |
| CUS-002 | PTL_CUS_INDV_CUST_D | 개인고객상세 | 11 | CUST_NO | 4,650,000 | - |
| CUS-003 | PTL_CUS_CORP_CUST_D | 법인고객상세 | 12 | CUST_NO | 350,000 | - |
| CUS-004 | PTL_CUS_BILL_ACNT_M | 청구계정기본 | 14 | BILL_ACNT_NO | 6,000,000 | - |
| CUS-005 | PTL_CUS_PYR_M | 납부자기본 | 11 | PYR_NO | 5,500,000 | - |
| CUS-006 | PTL_CUS_CUST_CNTC_D | 고객연락처상세 | 10 | CUST_NO, CNTC_SEQ | 8,000,000 | - |
| CUS-007 | PTL_CUS_CUST_ADDR_D | 고객주소상세 | 14 | CUST_NO, ADDR_SEQ | 6,000,000 | - |
| CUS-008 | PTL_CUS_CUST_AGRE_L | 고객동의내역 | 12 | CUST_AGRE_NO | 10,000,000 | - |
| CUS-009 | PTL_CUS_CUST_GRD_H | 고객등급이력 | 11 | CUST_NO, GRD_APLCN_BGNG_DTM | 7,000,000 | 연 GRD_APLCN_BGNG_DTM |
| CUS-010 | PTL_CUS_RGN_C | 지역코드 | 10 | RGN_CD | 20,000 | - |
| CUS-011 | PTL_CUS_CUST_H | 고객이력 | 10 | CUST_NO, VLD_BGNG_DTM | 8,000,000 | 연 VLD_BGNG_DTM |
| CUS-012 | PTL_CUS_RLNM_CRTF_L | 실명인증내역 | 12 | RLNM_CRTF_NO | 6,000,000 | - |
| CUS-013 | PTL_CUS_LGLRP_D | 법정대리인상세 | 9 | CUST_NO, LGLRP_SEQ | 300,000 | - |
| CUS-014 | PTL_CUS_CORP_PIC_D | 법인담당자상세 | 11 | CUST_NO, PIC_SEQ | 600,000 | - |
| CUS-015 | PTL_CUS_CORP_BPLC_D | 법인사업장상세 | 12 | CUST_NO, BPLC_SEQ | 400,000 | - |
| CUS-016 | PTL_CUS_CUST_R | 고객관계 | 8 | CUST_NO, REL_CUST_NO, CUST_REL_TY_CD | 1,500,000 | - |
| CUS-017 | PTL_CUS_BILL_ACNT_H | 청구계정이력 | 10 | BILL_ACNT_NO, VLD_BGNG_DTM | 7,000,000 | 연 VLD_BGNG_DTM |
| CUS-018 | PTL_CUS_INVC_RCPT_MTHD_H | 청구서수령방법이력 | 7 | BILL_ACNT_NO, VLD_BGNG_DTM | 5,000,000 | - |
| CUS-019 | PTL_CUS_PYR_H | 납부자이력 | 9 | PYR_NO, VLD_BGNG_DTM | 5,500,000 | - |
| CUS-020 | PTL_CUS_CUST_CNTC_H | 고객연락처이력 | 9 | CUST_NO, CNTC_SEQ, VLD_BGNG_DTM | 9,000,000 | 연 VLD_BGNG_DTM |
| CUS-021 | PTL_CUS_CUST_ADDR_H | 고객주소이력 | 12 | CUST_NO, ADDR_SEQ, VLD_BGNG_DTM | 7,000,000 | 연 VLD_BGNG_DTM |
| CUS-022 | PTL_CUS_AGRE_ITM_C | 동의항목코드 | 10 | AGRE_ITM_TY_CD, AGRE_ITM_VER_NO | 10,000 | - |
| CUS-023 | PTL_CUS_CUST_AGRE_H | 고객동의이력 | 7 | CUST_AGRE_NO, VLD_BGNG_DTM | 12,000,000 | 연 VLD_BGNG_DTM |
| CUS-024 | PTL_CUS_MKT_RCPTN_DENY_L | 마케팅수신거부내역 | 8 | RCPTN_DENY_NO | 1,000,000 | - |
| CUS-025 | PTL_CUS_ZIP_M | 우편번호기본 | 7 | ZIP | 35,000 | - |
| CUS-026 | PTL_CUS_CUST_MBSP_M | 고객멤버십기본 | 8 | MBSP_NO | 3,000,000 | - |
| CUS-027 | PTL_CUS_MBSP_POINT_L | 멤버십포인트내역 | 8 | MBSP_NO, POINT_TRD_SEQ, POINT_TRD_DTM | 15,000,000 | 연 POINT_TRD_DTM |
| CUS-028 | PTL_CUS_CUST_CNSL_L | 고객상담내역 | 11 | CNSL_NO, CNSL_DTM | 12,000,000 | 연 CNSL_DTM |
| CUS-029 | PTL_CUS_CUST_CVLCPT_L | 고객민원내역 | 14 | CVLCPT_NO | 500,000 | - |
| CUS-030 | PTL_CUS_CUST_MM_S | 고객월통계 | 11 | CUST_NO, STD_YM | 15,000,000 | 월 STD_YM |

칼럼 수는 시스템 칼럼 4개(LST_MDDTM·LST_MDFR_ID·LST_RGDTM·LST_RGTR_ID — DDL 에만, D7) 제외.

## 4. 파티션

| 테이블 | 키 | 단위·범위 | 비고 |
|---|---|---|---|
| PTL_CUS_CUST_GRD_H | GRD_APLCN_BGNG_DTM | YEAR 2010~2027 | 연 단위 2010~2027(18개) + DEFAULT — 파티션 키가 이미 PK 에 포함 |
| PTL_CUS_CUST_H | VLD_BGNG_DTM | YEAR 2010~2027 | 연 단위 2010~2027(18개) + DEFAULT — 파티션 키가 이미 PK 에 포함 |
| PTL_CUS_BILL_ACNT_H | VLD_BGNG_DTM | YEAR 2010~2027 | 연 단위 2010~2027(18개) + DEFAULT — 파티션 키가 이미 PK 에 포함 |
| PTL_CUS_CUST_CNTC_H | VLD_BGNG_DTM | YEAR 2010~2027 | 연 단위 2010~2027(18개) + DEFAULT — 파티션 키가 이미 PK 에 포함 |
| PTL_CUS_CUST_ADDR_H | VLD_BGNG_DTM | YEAR 2010~2027 | 연 단위 2010~2027(18개) + DEFAULT — 파티션 키가 이미 PK 에 포함 |
| PTL_CUS_CUST_AGRE_H | VLD_BGNG_DTM | YEAR 2010~2027 | 연 단위 2010~2027(18개) + DEFAULT — 파티션 키가 이미 PK 에 포함 |
| PTL_CUS_MBSP_POINT_L | POINT_TRD_DTM | YEAR 2010~2027 | 연 단위 2010~2027(18개) + DEFAULT — 파티션 키 POINT_TRD_DTM 를 PK 뒤에 편입(PostgreSQL 파티션 PK 제약). 논리 주식별자 유일성은 채번 규칙으로 보장 |
| PTL_CUS_CUST_CNSL_L | CNSL_DTM | YEAR 2010~2027 | 연 단위 2010~2027(18개) + DEFAULT — 파티션 키 CNSL_DTM 를 PK 뒤에 편입(PostgreSQL 파티션 PK 제약). 논리 주식별자 유일성은 채번 규칙으로 보장 |
| PTL_CUS_CUST_MM_S | STD_YM | MONTH 201001~202712 | 월 단위 2010-01~2027-12(216개) + DEFAULT — 파티션 키가 이미 PK 에 포함 |

파티션 이름 = `<테이블>_pYYYY`(연)·`<테이블>_pYYYYMM`(월)·`<테이블>_pdef`(DEFAULT — 범위 밖 일시 수용). 2028년 이후는 운영 배치가 파티션을 미리 추가한다. SCD2 이력은 유효시작일시 기준이라 현재행(유효종료 9999-12-31)도 시작 연도 파티션에 들어간다.

## 5. 인덱스(PK 제외)

| 인덱스 | 칼럼 | 근거 |
|---|---|---|
| X_PTL_CUS_CUST_M_01 | CUST_NM | 상담·매장 화면 고객명 검색(동명이인 다수 S8 — 생년월일·연락처로 2차 확인) |
| X_PTL_CUS_INDV_CUST_D_01 | RLNM_IDNTF_NO_ENCPT_VL | 가입 시 명의자 기존 고객 여부·명의도용 점검(암호화 실명번호 동등 조회) |
| X_PTL_CUS_CORP_CUST_D_01 | BRNO | 법인 가입·세금계산서 발행 시 사업자등록번호로 법인 고객 조회 |
| X_PTL_CUS_BILL_ACNT_M_01 | CUST_NO | 고객→청구계정 조인(FK), 청구지주소 복합 FK(고객번호+청구지주소순번)의 선두 칼럼 겸용 |
| X_PTL_CUS_BILL_ACNT_M_02 | PYR_NO | 납부자→청구계정 조인(FK) — 자동이체 납부자 기준 청구계정 일괄 조회 |
| X_PTL_CUS_PYR_M_01 | CUST_NO | 고객→납부자 조인(FK) — 명의자 본인 납부자 조회 |
| X_PTL_CUS_CUST_CNTC_D_01 | CNTC_CN | 연락처(전화번호·이메일)로 고객 역조회 — 고객센터 인입 번호 식별 |
| X_PTL_CUS_CUST_AGRE_L_01 | CUST_NO, AGRE_ITM_TY_CD | 고객별 동의 현황(마케팅·제3자 제공) 조회 — 발송 대상 판정 시 고객번호+항목 동등 조회(FK) |
| X_PTL_CUS_RGN_C_01 | UP_RGN_CD | 상위지역코드 계층 전개(시도→시군구→읍면동) 재귀 조회(자기 참조 FK) |
| X_PTL_CUS_RLNM_CRTF_L_01 | CUST_NO, RLNM_CRTF_DTM | 고객별 실명인증 이력 최신순 조회(FK) |
| X_PTL_CUS_RLNM_CRTF_L_02 | SBSC_APLY_NO | 가입신청서→실명인증 결과 조인(ORD FK) — 개통 전 인증 확인 |
| X_PTL_CUS_RLNM_CRTF_L_03 | PRTNR_NO, RLNM_CRTF_DTM | 대리점별 기간 인증 실적·명의도용 의심 점검(PRM FK + 기간 범위) |
| X_PTL_CUS_LGLRP_D_01 | LGLRP_CUST_NO | 법정대리인 고객 쪽에서 피대리 미성년 고객 역조회(역할명 FK) |
| X_PTL_CUS_CUST_R_01 | REL_CUST_NO | 관계고객 쪽 역방향 조회(가족결합·대납 상대방) — PK 선두가 고객번호라 역방향 별도 필요(FK) |
| X_PTL_CUS_MKT_RCPTN_DENY_L_01 | CUST_NO | 고객→수신거부 조인(FK) |
| X_PTL_CUS_MKT_RCPTN_DENY_L_02 | RCPTN_DENY_TELNO | 광고 발송 직전 수신거부 번호 대조(정보통신망법 제50조) — 번호 동등 조회 |
| X_PTL_CUS_CUST_MBSP_M_01 | CUST_NO | 고객→멤버십 조인(FK) — 재가입 시 과거 멤버십 포함 조회 |
| X_PTL_CUS_CUST_MBSP_M_02 | MBSP_CARD_NO | 제휴처 결제·적립 시 멤버십 카드번호로 멤버십 조회 |
| X_PTL_CUS_MBSP_POINT_L_01 | PRTNR_NO, POINT_TRD_DTM | 제휴사별 기간 포인트 정산 대사(PRM FK + 거래일시 범위 — 파티션 프루닝) |
| X_PTL_CUS_CUST_CNSL_L_01 | CUST_NO, CNSL_DTM | 고객별 상담 이력 최신순 조회(FK) — 상담 화면 기본 경로 |
| X_PTL_CUS_CUST_CNSL_L_02 | SVC_MGMT_NO, CNSL_DTM | 회선(서비스관리번호)별 상담 이력 조회(ORD FK) |
| X_PTL_CUS_CUST_CVLCPT_L_01 | CUST_NO, CVLCPT_ACPT_DTM | 고객별 민원 이력 조회(FK) |
| X_PTL_CUS_CUST_CVLCPT_L_02 | CNSL_NO, CNSL_DTM | 상담→민원 전환 건 조인(FK + 반정규화 상담일시) |
| X_PTL_CUS_CUST_CVLCPT_L_03 | PRCS_TMLMT_DT WHERE PRCS_CMPTN_DTM IS NULL | 미처리 민원 처리기한 관리(처리완료일시 NULL 인 행만 — 부분 인덱스, 상태값 저선택도 S3 회피) |
| X_PTL_CUS_CUST_CVLCPT_L_04 | SVC_MGMT_NO, CVLCPT_ACPT_DTM | 회선(서비스관리번호)별 민원 이력 조회(ORD FK) — 고객상담내역 X_02 와 같은 접근 경로(리뷰 R1 추가) |
| X_PTL_CUS_CUST_MM_S_01 | RGN_CD | 월별(파티션) 지역별 고객 집계 — 월 파티션 안 지역코드 조회 |

인덱스를 두지 않은 FK : PK 선두와 같은 FK(상세·이력의 고객번호·청구계정번호 등 — PK 인덱스가 겸함), 소용량 기준 부모(지역코드·우편번호·청구주기코드·조직코드·동의항목) 쪽 FK — 자식→부모 방향만 쓰이고 부모 PK 로 충분. 예외 1건 — 청구계정이력.납부자번호(부모 납부자기본 550만 — 소용량 기준 아님)는 납부자→청구계정 경로를 청구계정기본 X_02 가 받고 이력은 청구계정번호(PK 선두)로만 읽어 인덱스 없음(리뷰 R2). 상태유형코드 등 저선택도(S3) 칼럼은 단독 인덱스 금지.

## 6. 반정규화

| 칼럼 | 원천 | 사유 |
|---|---|---|
| PTL_CUS_CUST_CVLCPT_L.CNSL_DTM | PTL_CUS_CUST_CNSL_L | 고객상담내역이 상담일시 연 파티션 + PK(상담번호, 상담일시)라 민원→상담 조인 때 상담번호만으로는 19개 파티션 PK 를 모두 탐색 — 상담일시를 함께 들고 있어 파티션 프루닝·PK 1건 조회로 만든다(민원 50만 행, 저장 비용 미미). 상담번호 NULL 이면 함께 NULL |

## 7. FK 정의(설계만, D6)

| FK | 칼럼 | 부모 | 부모 칼럼 | 비고 |
|---|---|---|---|---|
| FK_PTL_CUS_INDV_CUST_D_01 | CUST_NO | PTL_CUS_CUST_M | CUST_NO |  |
| FK_PTL_CUS_CORP_CUST_D_01 | CUST_NO | PTL_CUS_CUST_M | CUST_NO |  |
| FK_PTL_CUS_BILL_ACNT_M_01 | CUST_NO | PTL_CUS_CUST_M | CUST_NO |  |
| FK_PTL_CUS_BILL_ACNT_M_02 | CUST_NO, BILL_PLC_ADDR_SEQ | PTL_CUS_CUST_ADDR_D | CUST_NO, ADDR_SEQ |  |
| FK_PTL_CUS_BILL_ACNT_M_03 | PYR_NO | PTL_CUS_PYR_M | PYR_NO |  |
| FK_PTL_CUS_BILL_ACNT_M_04 | BILL_CYCL_CD | PTL_PAY_BILL_CYCL_C | BILL_CYCL_CD |  |
| FK_PTL_CUS_PYR_M_01 | CUST_NO | PTL_CUS_CUST_M | CUST_NO |  |
| FK_PTL_CUS_CUST_CNTC_D_01 | CUST_NO | PTL_CUS_CUST_M | CUST_NO |  |
| FK_PTL_CUS_CUST_ADDR_D_01 | CUST_NO | PTL_CUS_CUST_M | CUST_NO |  |
| FK_PTL_CUS_CUST_ADDR_D_02 | RGN_CD | PTL_CUS_RGN_C | RGN_CD |  |
| FK_PTL_CUS_CUST_ADDR_D_03 | ZIP | PTL_CUS_ZIP_M | ZIP |  |
| FK_PTL_CUS_CUST_AGRE_L_01 | CUST_NO | PTL_CUS_CUST_M | CUST_NO |  |
| FK_PTL_CUS_CUST_AGRE_L_02 | AGRE_ITM_TY_CD, AGRE_ITM_VER_NO | PTL_CUS_AGRE_ITM_C | AGRE_ITM_TY_CD, AGRE_ITM_VER_NO |  |
| FK_PTL_CUS_CUST_GRD_H_01 | CUST_NO | PTL_CUS_CUST_M | CUST_NO |  |
| FK_PTL_CUS_RGN_C_01 | UP_RGN_CD | PTL_CUS_RGN_C | RGN_CD |  |
| FK_PTL_CUS_CUST_H_01 | CUST_NO | PTL_CUS_CUST_M | CUST_NO |  |
| FK_PTL_CUS_RLNM_CRTF_L_01 | CUST_NO | PTL_CUS_CUST_M | CUST_NO |  |
| FK_PTL_CUS_RLNM_CRTF_L_02 | SBSC_APLY_NO | PTL_ORD_SBSC_APLY_M | SBSC_APLY_NO |  |
| FK_PTL_CUS_RLNM_CRTF_L_03 | PRTNR_NO | PTL_PRM_PRTNR_M | PRTNR_NO |  |
| FK_PTL_CUS_LGLRP_D_01 | CUST_NO | PTL_CUS_CUST_M | CUST_NO |  |
| FK_PTL_CUS_LGLRP_D_02 | LGLRP_CUST_NO | PTL_CUS_CUST_M | CUST_NO |  |
| FK_PTL_CUS_CORP_PIC_D_01 | CUST_NO | PTL_CUS_CORP_CUST_D | CUST_NO |  |
| FK_PTL_CUS_CORP_BPLC_D_01 | CUST_NO | PTL_CUS_CORP_CUST_D | CUST_NO |  |
| FK_PTL_CUS_CORP_BPLC_D_02 | RGN_CD | PTL_CUS_RGN_C | RGN_CD |  |
| FK_PTL_CUS_CORP_BPLC_D_03 | ZIP | PTL_CUS_ZIP_M | ZIP |  |
| FK_PTL_CUS_CUST_R_01 | CUST_NO | PTL_CUS_CUST_M | CUST_NO |  |
| FK_PTL_CUS_CUST_R_02 | REL_CUST_NO | PTL_CUS_CUST_M | CUST_NO |  |
| FK_PTL_CUS_BILL_ACNT_H_01 | BILL_ACNT_NO | PTL_CUS_BILL_ACNT_M | BILL_ACNT_NO |  |
| FK_PTL_CUS_BILL_ACNT_H_02 | PYR_NO | PTL_CUS_PYR_M | PYR_NO |  |
| FK_PTL_CUS_BILL_ACNT_H_03 | BILL_CYCL_CD | PTL_PAY_BILL_CYCL_C | BILL_CYCL_CD |  |
| FK_PTL_CUS_INVC_RCPT_MTHD_H_01 | BILL_ACNT_NO | PTL_CUS_BILL_ACNT_M | BILL_ACNT_NO |  |
| FK_PTL_CUS_PYR_H_01 | PYR_NO | PTL_CUS_PYR_M | PYR_NO |  |
| FK_PTL_CUS_CUST_CNTC_H_01 | CUST_NO, CNTC_SEQ | PTL_CUS_CUST_CNTC_D | CUST_NO, CNTC_SEQ |  |
| FK_PTL_CUS_CUST_ADDR_H_01 | CUST_NO, ADDR_SEQ | PTL_CUS_CUST_ADDR_D | CUST_NO, ADDR_SEQ |  |
| FK_PTL_CUS_CUST_ADDR_H_02 | RGN_CD | PTL_CUS_RGN_C | RGN_CD |  |
| FK_PTL_CUS_CUST_ADDR_H_03 | ZIP | PTL_CUS_ZIP_M | ZIP |  |
| FK_PTL_CUS_CUST_AGRE_H_01 | CUST_AGRE_NO | PTL_CUS_CUST_AGRE_L | CUST_AGRE_NO |  |
| FK_PTL_CUS_MKT_RCPTN_DENY_L_01 | CUST_NO | PTL_CUS_CUST_M | CUST_NO |  |
| FK_PTL_CUS_ZIP_M_01 | RGN_CD | PTL_CUS_RGN_C | RGN_CD |  |
| FK_PTL_CUS_CUST_MBSP_M_01 | CUST_NO | PTL_CUS_CUST_M | CUST_NO |  |
| FK_PTL_CUS_MBSP_POINT_L_01 | MBSP_NO | PTL_CUS_CUST_MBSP_M | MBSP_NO |  |
| FK_PTL_CUS_MBSP_POINT_L_02 | MBSP_NO, ORGN_POINT_TRD_SEQ | PTL_CUS_MBSP_POINT_L | MBSP_NO, POINT_TRD_SEQ | 논리 키(멤버십번호, 포인트거래순번) 참조 — 물리 PK 는 파티션 키 포함이라 이 FK 는 설계 정의만(D6), 원거래 탐색은 PK 선두 2칼럼 범위 조회 |
| FK_PTL_CUS_MBSP_POINT_L_03 | PRTNR_NO | PTL_PRM_PRTNR_M | PRTNR_NO |  |
| FK_PTL_CUS_CUST_CNSL_L_01 | CUST_NO | PTL_CUS_CUST_M | CUST_NO |  |
| FK_PTL_CUS_CUST_CNSL_L_02 | SVC_MGMT_NO | PTL_ORD_LINE_M | SVC_MGMT_NO |  |
| FK_PTL_CUS_CUST_CNSL_L_03 | ORG_CD | PTL_PRM_ORG_M | ORG_CD |  |
| FK_PTL_CUS_CUST_CVLCPT_L_01 | CUST_NO | PTL_CUS_CUST_M | CUST_NO |  |
| FK_PTL_CUS_CUST_CVLCPT_L_02 | CNSL_NO, CNSL_DTM | PTL_CUS_CUST_CNSL_L | CNSL_NO, CNSL_DTM | 물리 PK(상담번호, 상담일시)에 맞춰 반정규화 칼럼 상담일시 포함 |
| FK_PTL_CUS_CUST_CVLCPT_L_03 | SVC_MGMT_NO | PTL_ORD_LINE_M | SVC_MGMT_NO |  |
| FK_PTL_CUS_CUST_MM_S_01 | CUST_NO | PTL_CUS_CUST_M | CUST_NO |  |
| FK_PTL_CUS_CUST_MM_S_02 | RGN_CD | PTL_CUS_RGN_C | RGN_CD |  |

## 8. 결정 메모

| # | 결정 | 근거 |
|---|---|---|
| P1 | 연 파티션 8개(고객등급이력·고객이력·청구계정이력·고객연락처이력·고객주소이력·고객동의이력·멤버십포인트내역·고객상담내역), 월 파티션 1개(고객월통계) | 과업 지시(T4 월·T3 대용량 이력 연) + 영역 상위 테이블 7백만 행 이상 기준. 고객월통계는 1.5천만 행이라 T4 는 아니나 월 집계를 파티션 단위로 교체 적재(DETACH·ATTACH)하므로 월 단위. 이력 테이블은 고객번호 조회 시 전 파티션 탐색 비용이 있으나 보관기간 경과분 파티션 DETACH(개인정보 파기)·CDC 기간 추출 이득이 더 큼. 고객동의내역(1천만)은 PK 에 시점이 없고 현재 상태 조회 위주라 파티션 제외 |
| P2 | 멤버십포인트내역·고객상담내역은 파티션 키(거래일시·상담일시)를 PK 뒤에 편입 | PostgreSQL 파티션 테이블의 PK·UNIQUE 는 파티션 키를 포함해야 함. 논리 PK 는 그대로(물리만 확장) |
| P3 | 반정규화 1건 — 고객민원내역.상담일시 | 파티션된 상담 PK 조회를 1개 파티션으로 한정(denorm.why) |
| P4 | 포인트잔액(고객멤버십기본) 반정규화는 보류 | 표준용어 미등재(포인트잔액) — 표준 먼저 규칙. 필요 시 표준 등재 후 추가(논리 L7 후보) |
| P5 | 청구계정기본.청구주기코드·각종 상태유형코드 인덱스 없음 | 값 수 소수(저선택도 S3) — Bill Run 은 주기별 대량 추출이라 순차 스캔이 유리 |
| P6 | CUS 예상 행 수 합계 약 1.6억(최대 테이블 1.5천만 — T3 범위) | D9 전체 10억~12억 중 과금계(PAY·INV T4)가 대부분 — 고객계는 약 15% 배분. 고객 500만(누적) 기준 상세·이력 배수, 고객월통계는 고객×월 전량 대신 표본 고객 월 평균 약 7만(최근 월 많게 S6). data_migrationner 가 docs/06 에서 최종 확정 |
