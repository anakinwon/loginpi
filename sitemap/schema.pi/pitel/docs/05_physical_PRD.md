# 05. 물리 모델 — PRD 상품

> 작성 2026-11-07 · subagent_physical_modeler · 정본 `model/physical/PRD.json` · DDL `ddl/10_prd_tables.sql`·`ddl/10_prd_constraints.sql` · 대상 PostgreSQL 17
> 테이블 30 · 칼럼 244(+시스템 4 × 30) · 인덱스 27(+PK 30) · FK 정의 44(DDL 미생성, D6) · 파티션 0 · 목표 행 합계 5,687,500

## 1. 결정 메모

| # | 결정 | 근거 |
|---|---|---|
| P1 | 파티셔닝 없음 | PRD 30 테이블 전부 REF 기준(T1~T2). 파티션 규칙 대상(T4 과금계·T3 대용량 이력)이 없음 — 최대 공시지원금이력 300만 행은 PK(단말모델+요금제+시작일시) 탐색으로 충분 |
| P2 | 반정규화 없음 | 규칙 2-7 반정규화는 대용량 조회 경로만. 후보(L2 요금제 기본제공 대표 3칼럼, G1 제거 5속성)는 모두 수천~수만 행 기준표라 Rating·청구 경로에서 PK 1회 조회 또는 캐시로 해결 — 같은 사실 두 곳 저장의 정합 비용이 더 큼 |
| P3 | FK 는 정의만(D6) — FK 칼럼이 PK 선두가 아니면 인덱스 설계 | 조인·역조회 경로 확보. PK 선두와 같은 칼럼은 PK 인덱스가 커버하므로 중복 인덱스 만들지 않음 |
| P4 | 데이터 타입 = 표준 도메인 그대로(일자 CHAR(8)·금액 NUMERIC(15)·일시 TIMESTAMP) | 규칙 2-10 도메인 사전이 정본 |
| P5 | 저선택도 상태 칼럼 단독 인덱스 금지 | S3(98% 한 값) — 선택도 높은 칼럼 뒤 복합으로만 |
| P6 | estRows 는 실무 규모 기준 목표치, 코드 표(과금권역·요금항목분류 등)는 T1 하한보다 작음 | 실제 코드 수 이상으로 부풀리면 기준 데이터가 비현실적 — 최종 배율은 data_migrationner(docs/06) |

## 2. 테이블

| ID | 테이블 | 엔터티 | 칼럼 | PK | 목표 행 수 | 등급 |
|---|---|---|---|---|---|---|
| PRD-001 | `PTL_PRD_PROD_M` | 상품기본 | 13 | PROD_CD | 20,000 | T1 |
| PRD-002 | `PTL_PRD_RTPLN_M` | 요금제기본 | 7 | PROD_CD | 3,000 | T1 |
| PRD-003 | `PTL_PRD_ADSVC_M` | 부가서비스기본 | 10 | PROD_CD | 10,000 | T1 |
| PRD-004 | `PTL_PRD_DSCNT_PROD_M` | 할인상품기본 | 13 | PROD_CD | 4,000 | T1 |
| PRD-005 | `PTL_PRD_CMBN_PROD_M` | 결합상품기본 | 10 | PROD_CD | 500 | T1 |
| PRD-006 | `PTL_PRD_AGRMT_PROD_M` | 약정상품기본 | 11 | PROD_CD | 300 | T1 |
| PRD-007 | `PTL_PRD_EQP_MDL_M` | 단말모델기본 | 11 | EQP_MDL_CD | 5,000 | T1 |
| PRD-008 | `PTL_PRD_USIM_PROD_M` | 유심상품기본 | 8 | PROD_CD | 200 | T1 |
| PRD-009 | `PTL_PRD_CHRG_ITM_C` | 요금항목코드 | 10 | CHRG_ITM_CD | 2,000 | T1 |
| PRD-010 | `PTL_PRD_PROD_PRC_H` | 상품가격이력 | 9 | PROD_CD + PRC_APLCN_BGNG_DTM | 200,000 | T1 |
| PRD-011 | `PTL_PRD_PROD_CMPS_R` | 상품구성관계 | 6 | UP_PROD_CD + CMPS_PROD_CD | 30,000 | T1 |
| PRD-012 | `PTL_PRD_PROD_EXCLN_R` | 상품배타관계 | 6 | STD_PROD_CD + TRGT_PROD_CD + EXCLN_REL_TY_CD | 50,000 | T1 |
| PRD-013 | `PTL_PRD_RTPLN_BSCPRVD_D` | 요금제기본제공상세 | 7 | PROD_CD + USE_SVC_TY_CD | 15,000 | T1 |
| PRD-014 | `PTL_PRD_RTPLN_EXCS_TRF_D` | 요금제초과요율상세 | 10 | PROD_CD + RAT_ZONE_CD + USE_SVC_TY_CD + TRF_APLCN_BGNG_DT | 60,000 | T1 |
| PRD-015 | `PTL_PRD_RAT_ZONE_C` | 과금권역코드 | 6 | RAT_ZONE_CD | 200 | T1 |
| PRD-016 | `PTL_PRD_TMBND_TRF_D` | 시간대요율상세 | 8 | RAT_ZONE_CD + USE_SVC_TY_CD + TMBND_TY_CD + TRF_APLCN_BGNG_DT | 5,000 | T1 |
| PRD-017 | `PTL_PRD_ROAM_NATN_C` | 로밍국가코드 | 7 | NATN_CD | 250 | T1 |
| PRD-018 | `PTL_PRD_ROAM_TRF_D` | 로밍요율상세 | 9 | NATN_CD + USE_SVC_TY_CD + USE_DRCT_SE_CD + TRF_APLCN_BGNG_DT | 30,000 | T1 |
| PRD-019 | `PTL_PRD_ADSVC_CHRG_D` | 부가서비스요금상세 | 8 | PROD_CD + CHRG_ITM_CD + CHRG_APLCN_BGNG_DT | 30,000 | T1 |
| PRD-020 | `PTL_PRD_DSCNT_CND_D` | 할인조건상세 | 9 | PROD_CD + CND_SEQ | 12,000 | T1 |
| PRD-021 | `PTL_PRD_DSCNT_RT_D` | 할인율상세 | 7 | PROD_CD + DSCNT_STEP_SEQ | 12,000 | T1 |
| PRD-022 | `PTL_PRD_CMBN_CMPS_D` | 결합구성상세 | 8 | PROD_CD + CMPS_SEQ | 2,000 | T1 |
| PRD-023 | `PTL_PRD_CMBN_DSCNT_D` | 결합할인상세 | 8 | PROD_CD + CMBN_LINE_CNT + DSCNT_APLCN_BGNG_DT | 3,000 | T1 |
| PRD-024 | `PTL_PRD_AGRMT_PNLT_D` | 약정위약금상세 | 7 | PROD_CD + PNLT_STEP_SEQ | 3,000 | T1 |
| PRD-025 | `PTL_PRD_EQP_SHPM_PRC_H` | 단말출고가격이력 | 5 | EQP_MDL_CD + PRC_APLCN_BGNG_DTM | 50,000 | T1 |
| PRD-026 | `PTL_PRD_PBANC_SUBSD_H` | 공시지원금이력 | 8 | EQP_MDL_CD + RTPLN_PROD_CD + SUBSD_APLCN_BGNG_DTM | 3,000,000 | T2 |
| PRD-027 | `PTL_PRD_PROD_SALE_CHNL_R` | 상품판매채널관계 | 5 | PROD_CD + SALE_CHNL_TY_CD | 100,000 | T1 |
| PRD-028 | `PTL_PRD_PROD_SALE_PRD_H` | 상품판매기간이력 | 5 | PROD_CD + SALE_BGNG_DT | 40,000 | T1 |
| PRD-029 | `PTL_PRD_CHRG_ITM_CLSF_C` | 요금항목분류코드 | 5 | CHRG_ITM_CLSF_CD | 50 | T1 |
| PRD-030 | `PTL_PRD_PROD_CHG_H` | 상품변경이력 | 8 | PROD_CD + PROD_CHG_SEQ | 2,000,000 | T2 |

## 3. 파티션

없음 — PRD 는 전부 기준(REF) 테이블로 파티션 규칙 대상(T4 과금계 월 RANGE·T3 대용량 이력 연 RANGE)이 없다. 최대 테이블 `PTL_PRD_PBANC_SUBSD_H`(300만)·`PTL_PRD_PROD_CHG_H`(200만)도 PK·보조 인덱스로 충분하다.

## 4. 인덱스 (PK 제외)

| 인덱스 | 칼럼 | 이유 |
|---|---|---|
| `X_PTL_PRD_PROD_M_01` | BAS_CHRG_ITM_CD | FK(요금항목코드) 조인 — 요금항목별 상품 역조회(청구서 항목 → 상품) |
| `X_PTL_PRD_PROD_M_02` | PROD_TY_CD, PROD_STTS_TY_CD | 상품유형별 판매중 상품 목록(가입·상담 화면 상품 선택) — 유형 먼저, 상태는 S3 저선택도라 단독 인덱스 안 만듦 |
| `X_PTL_PRD_ADSVC_M_01` | CNTS_PRVD_CO_NO | FK(PRM 콘텐츠제공사) 조인 — 제공사별 부가서비스(콘텐츠 정산 STL 경로) |
| `X_PTL_PRD_ADSVC_M_02` | NTWK_SVC_NO | 망(HLR/HSS) 연동 응답의 망서비스번호 → 부가서비스 상품 역조회 |
| `X_PTL_PRD_DSCNT_PROD_M_01` | DSCNT_TRGT_CHRG_ITM_CD | FK(요금항목코드) — 요금계산 시 대상 요금항목별 적용 할인 탐색 |
| `X_PTL_PRD_DSCNT_PROD_M_02` | DSCNT_CHRG_ITM_CD | FK(요금항목코드) — 청구서 할인 항목 → 할인상품 역조회 |
| `X_PTL_PRD_DSCNT_PROD_M_03` | ALNC_PRTNR_NO | FK(PRM 파트너) — 제휴사별 제휴할인 상품(제휴 정산 경로) |
| `X_PTL_PRD_CMBN_PROD_M_01` | CMBN_DSCNT_PROD_CD | FK(할인상품기본) 조인 |
| `X_PTL_PRD_AGRMT_PROD_M_01` | LNKG_DSCNT_PROD_CD | FK(할인상품기본) 조인 — 선택약정 25% 할인 연결 |
| `X_PTL_PRD_EQP_MDL_M_01` | MNFCT_CO_TY_CD, LNCH_DT | 제조사별 출시 모델 목록(판매·공시 화면) |
| `X_PTL_PRD_CHRG_ITM_C_01` | CHRG_ITM_CLSF_CD | FK(요금항목분류코드) — 청구서 분류 소계 조인 |
| `X_PTL_PRD_PROD_CMPS_R_01` | CMPS_PROD_CD | FK(상품기본) 역방향 — 이 상품을 포함하는 패키지(PK 선두는 상위상품코드) |
| `X_PTL_PRD_PROD_EXCLN_R_01` | TRGT_PROD_CD | FK(상품기본) 역방향 — 가입 검증 때 대상 쪽에서 배타 조합 확인 |
| `X_PTL_PRD_RTPLN_EXCS_TRF_D_01` | RAT_ZONE_CD | FK(과금권역코드) 조인 — 권역별 요율 정비 |
| `X_PTL_PRD_RTPLN_EXCS_TRF_D_02` | CHRG_ITM_CD | FK(요금항목코드) 조인 |
| `X_PTL_PRD_RAT_ZONE_C_01` | UP_RAT_ZONE_CD | FK(자기참조) — 하위 권역 펼침 |
| `X_PTL_PRD_ROAM_NATN_C_01` | NATN_NO | 로밍 사용내역(TAP) 국가번호 → 국가코드 매핑 |
| `X_PTL_PRD_ROAM_TRF_D_01` | CHRG_ITM_CD | FK(요금항목코드) 조인 |
| `X_PTL_PRD_ADSVC_CHRG_D_01` | CHRG_ITM_CD | FK(요금항목코드) — PK 2번째 칼럼이라 단독 조인용 별도 |
| `X_PTL_PRD_DSCNT_CND_D_01` | CND_TRGT_PROD_CD | FK(상품기본) — 요금제 기준 적용 가능 할인 탐색(가입 화면) |
| `X_PTL_PRD_CMBN_CMPS_D_01` | CMPS_PROD_CD | FK(상품기본) — 상품이 들어가는 결합 탐색 |
| `X_PTL_PRD_CMBN_DSCNT_D_01` | DSCNT_CHRG_ITM_CD | FK(요금항목코드) 조인 |
| `X_PTL_PRD_PBANC_SUBSD_H_01` | RTPLN_PROD_CD, SUBSD_APLCN_BGNG_DTM | FK(요금제기본) + 요금제별 시점 공시지원금(PK 선두는 단말모델) — 300만 행 T2 |
| `X_PTL_PRD_PBANC_SUBSD_H_02` | PBANC_DT | 공시일자별 공시 목록(단말기유통법 공시 게시·변경 감사) |
| `X_PTL_PRD_PROD_SALE_CHNL_R_01` | SALE_CHNL_TY_CD | 채널별 판매 가능 상품(PK 선두는 상품코드) |
| `X_PTL_PRD_CHRG_ITM_CLSF_C_01` | UP_CHRG_ITM_CLSF_CD | FK(자기참조) — 하위 분류 펼침 |
| `X_PTL_PRD_PROD_CHG_H_01` | PROD_CHG_DTM | 기간별 상품 변경 감사 조회 — 200만 행 T2 |

중복 검사 : 인덱스 칼럼이 PK 선두 접두와 같은 것 0건(생성기 검사). FK 칼럼은 전부 PK 선두 또는 인덱스 선두로 커버.

## 5. FK 정의 (설계만 — DDL 미생성, D6)

| FK | 칼럼 | 부모 테이블(칼럼) |
|---|---|---|
| `FK_PTL_PRD_PROD_M_01` | BAS_CHRG_ITM_CD | `PTL_PRD_CHRG_ITM_C`(CHRG_ITM_CD) |
| `FK_PTL_PRD_RTPLN_M_01` | PROD_CD | `PTL_PRD_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_ADSVC_M_01` | PROD_CD | `PTL_PRD_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_ADSVC_M_02` | CNTS_PRVD_CO_NO | `PTL_PRM_CNTS_PRVD_CO_M`(CNTS_PRVD_CO_NO) |
| `FK_PTL_PRD_DSCNT_PROD_M_01` | PROD_CD | `PTL_PRD_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_DSCNT_PROD_M_02` | DSCNT_TRGT_CHRG_ITM_CD | `PTL_PRD_CHRG_ITM_C`(CHRG_ITM_CD) |
| `FK_PTL_PRD_DSCNT_PROD_M_03` | DSCNT_CHRG_ITM_CD | `PTL_PRD_CHRG_ITM_C`(CHRG_ITM_CD) |
| `FK_PTL_PRD_DSCNT_PROD_M_04` | ALNC_PRTNR_NO | `PTL_PRM_PRTNR_M`(PRTNR_NO) |
| `FK_PTL_PRD_CMBN_PROD_M_01` | PROD_CD | `PTL_PRD_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_CMBN_PROD_M_02` | CMBN_DSCNT_PROD_CD | `PTL_PRD_DSCNT_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_AGRMT_PROD_M_01` | PROD_CD | `PTL_PRD_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_AGRMT_PROD_M_02` | LNKG_DSCNT_PROD_CD | `PTL_PRD_DSCNT_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_USIM_PROD_M_01` | PROD_CD | `PTL_PRD_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_CHRG_ITM_C_01` | CHRG_ITM_CLSF_CD | `PTL_PRD_CHRG_ITM_CLSF_C`(CHRG_ITM_CLSF_CD) |
| `FK_PTL_PRD_PROD_PRC_H_01` | PROD_CD | `PTL_PRD_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_PROD_CMPS_R_01` | UP_PROD_CD | `PTL_PRD_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_PROD_CMPS_R_02` | CMPS_PROD_CD | `PTL_PRD_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_PROD_EXCLN_R_01` | STD_PROD_CD | `PTL_PRD_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_PROD_EXCLN_R_02` | TRGT_PROD_CD | `PTL_PRD_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_RTPLN_BSCPRVD_D_01` | PROD_CD | `PTL_PRD_RTPLN_M`(PROD_CD) |
| `FK_PTL_PRD_RTPLN_EXCS_TRF_D_01` | PROD_CD | `PTL_PRD_RTPLN_M`(PROD_CD) |
| `FK_PTL_PRD_RTPLN_EXCS_TRF_D_02` | RAT_ZONE_CD | `PTL_PRD_RAT_ZONE_C`(RAT_ZONE_CD) |
| `FK_PTL_PRD_RTPLN_EXCS_TRF_D_03` | CHRG_ITM_CD | `PTL_PRD_CHRG_ITM_C`(CHRG_ITM_CD) |
| `FK_PTL_PRD_RAT_ZONE_C_01` | UP_RAT_ZONE_CD | `PTL_PRD_RAT_ZONE_C`(RAT_ZONE_CD) |
| `FK_PTL_PRD_TMBND_TRF_D_01` | RAT_ZONE_CD | `PTL_PRD_RAT_ZONE_C`(RAT_ZONE_CD) |
| `FK_PTL_PRD_ROAM_TRF_D_01` | NATN_CD | `PTL_PRD_ROAM_NATN_C`(NATN_CD) |
| `FK_PTL_PRD_ROAM_TRF_D_02` | CHRG_ITM_CD | `PTL_PRD_CHRG_ITM_C`(CHRG_ITM_CD) |
| `FK_PTL_PRD_ADSVC_CHRG_D_01` | PROD_CD | `PTL_PRD_ADSVC_M`(PROD_CD) |
| `FK_PTL_PRD_ADSVC_CHRG_D_02` | CHRG_ITM_CD | `PTL_PRD_CHRG_ITM_C`(CHRG_ITM_CD) |
| `FK_PTL_PRD_DSCNT_CND_D_01` | PROD_CD | `PTL_PRD_DSCNT_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_DSCNT_CND_D_02` | CND_TRGT_PROD_CD | `PTL_PRD_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_DSCNT_RT_D_01` | PROD_CD | `PTL_PRD_DSCNT_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_CMBN_CMPS_D_01` | PROD_CD | `PTL_PRD_CMBN_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_CMBN_CMPS_D_02` | CMPS_PROD_CD | `PTL_PRD_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_CMBN_DSCNT_D_01` | PROD_CD | `PTL_PRD_CMBN_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_CMBN_DSCNT_D_02` | DSCNT_CHRG_ITM_CD | `PTL_PRD_CHRG_ITM_C`(CHRG_ITM_CD) |
| `FK_PTL_PRD_AGRMT_PNLT_D_01` | PROD_CD | `PTL_PRD_AGRMT_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_EQP_SHPM_PRC_H_01` | EQP_MDL_CD | `PTL_PRD_EQP_MDL_M`(EQP_MDL_CD) |
| `FK_PTL_PRD_PBANC_SUBSD_H_01` | EQP_MDL_CD | `PTL_PRD_EQP_MDL_M`(EQP_MDL_CD) |
| `FK_PTL_PRD_PBANC_SUBSD_H_02` | RTPLN_PROD_CD | `PTL_PRD_RTPLN_M`(PROD_CD) |
| `FK_PTL_PRD_PROD_SALE_CHNL_R_01` | PROD_CD | `PTL_PRD_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_PROD_SALE_PRD_H_01` | PROD_CD | `PTL_PRD_PROD_M`(PROD_CD) |
| `FK_PTL_PRD_CHRG_ITM_CLSF_C_01` | UP_CHRG_ITM_CLSF_CD | `PTL_PRD_CHRG_ITM_CLSF_C`(CHRG_ITM_CLSF_CD) |
| `FK_PTL_PRD_PROD_CHG_H_01` | PROD_CD | `PTL_PRD_PROD_M`(PROD_CD) |

다른 주제영역 부모 : `PTL_PRM_CNTS_PRVD_CO_M`(콘텐츠제공사)·`PTL_PRM_PRTNR_M`(파트너). PRD 가 부모인 다른 영역 FK(ORD 가입상품·약정계약·단말할부·회선·결합, PAY 사용내역·요금계산·할인적용)는 각 영역 물리 모델이 소유한다.

## 6. 반정규화

없음(P2). 검토한 후보와 기각 사유 :

| 후보 | 기각 사유 |
|---|---|
| 요금제기본 ← 음성·문자·데이터 기본제공량 대표 3칼럼(L2) | 요금제기본제공상세 1.5만 행, Rating 은 (요금제, 사용서비스유형) PK 1회 조회 — 캐시 대상 |
| 결합상품기본.유선상품포함여부 | 결합구성상세 2천 행에서 유도, 조회 빈도 낮음 |
| 약정상품기본.선택약정할인율 | 연계할인상품 PK 조인 1회, ORD 약정계약에 가입 당시 스냅숏 존재 |
| 단말모델기본.공시지원금 | (단말, 요금제) 종속이라 단말 단독 값 정의 불가 |
| 상품가격이력.이전월정액금액 / 단말출고가격이력.이전단말출고가격 | LAG 윈도 함수로 유도, 이력 20만·5만 행 |

## 7. 시스템 칼럼 (DDL 전용, D7)

모든 테이블 맨 끝 : `lst_mddtm TIMESTAMP` · `lst_mdfr_id VARCHAR(50)` · `lst_rgdtm TIMESTAMP` · `lst_rgtr_id VARCHAR(50)` — NOT NULL, 기본값 일시 CURRENT_TIMESTAMP · ID 'SYSTEM'.

## 8. DDL 검증

`pitel_dev` 스키마 `chk_prd` 에서 tables → constraints → constraints(재실행) 순 실행, 오류 0 확인 후 스키마 삭제.
