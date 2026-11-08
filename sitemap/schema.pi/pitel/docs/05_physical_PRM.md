# 05 물리 모델 — 파트너(PRM, 정산 STL 모듈 주 배치처)

> 작성 2026-11-07 · subagent_physical_modeler · 마스터 위임 자동 승인 모드. 정본 = `model/physical/PRM.json`, 생성기 = `tools/phy_PRM_build.js`(JSON·DDL·이 문서를 한 번에 생성 — 손으로 고치지 말고 생성기 설정을 고친다).

## 1. 요약

| 항목 | 값 |
|---|---|
| 테이블 | 34개 (엔터티 1:1, 핵심 10 · 기본 24, 그중 정산 STL 19) |
| 파티션 테이블 | 1개 — 연 단위 RANGE 2010~2027 18개 + DEFAULT 1개 |
| 인덱스(PK 제외) | 43개 |
| FK 정의 | 63개 (DDL 미생성 — D6) |
| 목표 행 수 합계 | 122,054,500행 |
| DDL | `ddl/70_prm_tables.sql`(테이블·파티션·주석) · `ddl/70_prm_constraints.sql`(PK·인덱스, 적재 뒤) |
| 검증 | pitel_dev 스키마 chk_prm 에서 두 파일 실행 오류 0 → 스키마 삭제 (재실행 안전성은 같은 파일 2회 실행으로 확인) |

## 2. 테이블

| # | 테이블 | 엔터티 | 유형 | 모듈 | 칼럼 | PK | 인덱스 | FK | 파티션 | 목표 행 수 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | PTL_PRM_PRTNR_M | 파트너기본 | BASE·CNCP |  | 16 | PRTNR_NO | 3 | 2 | - | 60,000 |
| 2 | PTL_PRM_ORG_M | 조직기본 | REF·CNCP |  | 10 | ORG_CD | 1 | 1 | - | 2,000 |
| 3 | PTL_PRM_AGNC_M | 대리점기본 | BASE·CNCP |  | 10 | AGNC_NO | 0 | 1 | - | 5,000 |
| 4 | PTL_PRM_SHOP_M | 판매점기본 | BASE·CNCP |  | 11 | SHOP_NO | 1 | 2 | - | 40,000 |
| 5 | PTL_PRM_CNTS_PRVD_CO_M | 콘텐츠제공사기본 | BASE·CNCP |  | 9 | CNTS_PRVD_CO_NO | 0 | 1 | - | 8,000 |
| 6 | PTL_PRM_CARR_M | 통신사업자기본 | BASE·CNCP |  | 10 | CARR_NO | 0 | 2 | - | 300 |
| 7 | PTL_PRM_ROAM_BZMN_M | 로밍사업자기본 | BASE·CNCP |  | 11 | ROAM_BZMN_NO | 1 | 2 | - | 1,200 |
| 8 | PTL_PRM_PRTNR_CTRT_M | 파트너계약기본 | ACT·CNCP |  | 12 | PRTNR_CTRT_NO | 2 | 1 | - | 150,000 |
| 9 | PTL_PRM_STLM_M | 정산기본 | ACT·CNCP | STL | 16 | STLM_NO | 4 | 2 | - | 4,000,000 |
| 10 | PTL_PRM_TXINV_M | 세금계산서기본 | ACT·CNCP | STL | 15 | TXINV_NO | 5 | 3 | - | 3,500,000 |
| 11 | PTL_PRM_PRTNR_H | 파트너이력 | ACT·LGCL |  | 10 | PRTNR_NO, VLD_BGNG_DTM | 0 | 3 | - | 400,000 |
| 12 | PTL_PRM_PRTNR_CTRT_H | 파트너계약이력 | ACT·LGCL |  | 8 | PRTNR_CTRT_NO, VLD_BGNG_DTM | 0 | 1 | - | 500,000 |
| 13 | PTL_PRM_PRTNR_ACCT_D | 파트너계좌상세 | BASE·LGCL |  | 9 | PRTNR_NO, PRTNR_ACCT_SEQ | 0 | 2 | - | 90,000 |
| 14 | PTL_PRM_PRTNR_PIC_D | 파트너담당자상세 | BASE·LGCL |  | 7 | PRTNR_NO, PIC_SEQ | 0 | 1 | - | 150,000 |
| 15 | PTL_PRM_ORG_H | 조직이력 | ACT·LGCL |  | 7 | ORG_CD, VLD_BGNG_DTM | 0 | 2 | - | 10,000 |
| 16 | PTL_PRM_EQP_STCK_L | 단말재고내역 | ACT·LGCL |  | 9 | EQP_STCK_NO | 2 | 2 | - | 9,000,000 |
| 17 | PTL_PRM_USIM_STCK_L | 유심재고내역 | ACT·LGCL |  | 7 | USIM_STCK_NO | 2 | 2 | - | 8,000,000 |
| 18 | PTL_PRM_STLM_D | 정산상세 | ACT·LGCL | STL | 6 | STLM_NO, STLM_DTL_SEQ | 0 | 1 | - | 9,000,000 |
| 19 | PTL_PRM_FEE_PLCY_M | 수수료정책기본 | REF·LGCL | STL | 7 | FEE_PLCY_NO | 0 | 0 | - | 5,000 |
| 20 | PTL_PRM_FEE_TRF_D | 수수료요율상세 | REF·LGCL | STL | 7 | FEE_PLCY_NO, FEE_TRF_SEQ | 0 | 2 | - | 80,000 |
| 21 | PTL_PRM_ATRCT_FEE_L | 유치수수료내역 | ACT·LGCL | STL | 8 | ATRCT_FEE_NO | 3 | 4 | - | 9,000,000 |
| 22 | PTL_PRM_MGMT_FEE_L | 관리수수료내역 | ACT·LGCL | STL | 10 | MGMT_FEE_NO, STLM_YM | 3 | 4 | 연 RANGE(STLM_YM) | 40,000,000 |
| 23 | PTL_PRM_FEE_CLBK_L | 수수료환수내역 | ACT·LGCL | STL | 8 | FEE_CLBK_NO | 3 | 3 | - | 1,500,000 |
| 24 | PTL_PRM_INCNTV_PLCY_M | 장려금정책기본 | REF·LGCL | STL | 8 | INCNTV_PLCY_NO | 0 | 2 | - | 30,000 |
| 25 | PTL_PRM_INCNTV_GIVE_L | 장려금지급내역 | ACT·LGCL | STL | 8 | INCNTV_GIVE_NO | 3 | 4 | - | 8,000,000 |
| 26 | PTL_PRM_INTCN_TRF_D | 상호접속요율상세 | REF·LGCL | STL | 5 | CARR_NO, INTCN_TY_CD, APLCN_BGNG_DT | 0 | 1 | - | 3,000 |
| 27 | PTL_PRM_INTCN_USE_T | 상호접속사용집계 | PROC·LGCL | STL | 7 | CARR_NO, STLM_YM, INTCN_TY_CD | 1 | 2 | - | 200,000 |
| 28 | PTL_PRM_ROAM_STLM_FILE_L | 로밍정산파일내역 | ACT·LGCL | STL | 11 | ROAM_STLM_FILE_NO | 3 | 2 | - | 6,000,000 |
| 29 | PTL_PRM_ROAM_STLM_L | 로밍정산내역 | ACT·LGCL | STL | 8 | ROAM_STLM_NO | 2 | 2 | - | 500,000 |
| 30 | PTL_PRM_CNTS_STLM_L | 콘텐츠정산내역 | ACT·LGCL | STL | 9 | CNTS_STLM_NO | 2 | 2 | - | 1,600,000 |
| 31 | PTL_PRM_STLM_GIVE_L | 정산지급내역 | ACT·LGCL | STL | 8 | STLM_NO, STLM_GIVE_SEQ | 2 | 2 | - | 4,200,000 |
| 32 | PTL_PRM_STLM_CFMTN_H | 정산확정이력 | ACT·LGCL | STL | 6 | STLM_NO, STLM_CFMTN_HIST_SEQ | 0 | 1 | - | 9,000,000 |
| 33 | PTL_PRM_TXINV_D | 세금계산서상세 | ACT·LGCL | STL | 5 | TXINV_NO, TXINV_DTL_SEQ | 0 | 1 | - | 7,000,000 |
| 34 | PTL_PRM_STLM_MM_S | 정산월통계 | PROC·LGCL | STL | 8 | STLM_YM, STLM_TY_CD, PRTNR_TY_CD | 0 | 0 | - | 20,000 |

칼럼 수는 시스템 칼럼 4개(DDL 에만, D7) 제외.

## 3. 파티셔닝

- 기준 : PRM 은 T2(상품계) 영역 — T4(1억+) 과금계 테이블이 없어 **월 단위 파티션 대상 없음**. 정산 원천 중 **관리수수료내역만 T3 규모(4천만)** 로 누적되므로 연 단위 RANGE 1개를 둔다.
- 파티션 키 = 정산년월(`STLM_YM`, CHAR(6), NOT NULL) — 월 정산 생성·대리점 월 집계가 모두 정산년월 조건이라 프루닝이 그대로 맞는다. 경계는 `'YYYY01'`(문자 비교 = 시간 순). PK 끝에 키를 추가해 (관리수수료번호, 정산년월).
- 다른 테이블이 FK 로 참조하는 정산기본·유치수수료내역·파트너 계열은 파티션하지 않는다(참조 키 = PK 유지). 관리수수료내역은 참조하는 자식이 없다.

| 테이블 | 파티션 키 | 범위 | 하위 테이블 | PK |
|---|---|---|---|---|
| PTL_PRM_MGMT_FEE_L | STLM_YM | '201001' ~ '202801' | `ptl_prm_mgmt_fee_l_p2010`~`_p2027` + `_pdflt` | MGMT_FEE_NO, STLM_YM |

## 4. 인덱스

원칙 : ① 자식 → 부모 역조회가 실제로 일어나는 FK(파트너·계약·정산서·가입계약 단위) ② 실무 조회 경로(파트너+정산년월, 판매점+발생일자, TAP 파일 순번, IMEI·유심 일련번호, 국세청 미전송) ③ PK 앞부분과 겹치는 인덱스 금지(생성기 점검) ④ 정산 전 NULL 인 정산번호 같은 선택 FK(S5)는 `WHERE … IS NOT NULL` 부분 인덱스 ⑤ 저선택도 상태 칼럼(S3) 선두 금지 ⑥ 1만 행 안팎 기준 테이블(대리점·통신사업자·수수료정책·상호접속요율 등)은 PK 외 인덱스 생략(로밍사업자 TADIG 만 예외 — 파일 처리마다 조회).

| 인덱스 | 칼럼 | 조건 | 사유 |
|---|---|---|---|
| X_PTL_PRM_PRTNR_M_01 | MGMT_ORG_CD | mgmt_org_cd IS NOT NULL | 관리 조직별 담당 파트너 목록(영업 조직 실적·개편 영향) — 조직기본 조인 FK |
| X_PTL_PRM_PRTNR_M_02 | RGN_CD | rgn_cd IS NOT NULL | 지역별 유통망 현황(S10 지역↔대리점 강상관 — 통계 오판 점검) — 지역코드 조인 FK |
| X_PTL_PRM_PRTNR_M_03 | BRNO | brno IS NOT NULL | 사업자등록번호로 거래처 찾기(세금계산서 대사·중복 거래처 점검) |
| X_PTL_PRM_ORG_M_01 | UP_ORG_CD | up_org_cd IS NOT NULL | 조직 계층 전개(상위 → 하위, 재귀 조회) — 자기 참조 FK |
| X_PTL_PRM_SHOP_M_01 | AGNC_NO | agnc_no IS NOT NULL | 대리점 산하 판매점(2차점) 목록·대리점 단위 유치 실적 — 대리점기본 조인 FK |
| X_PTL_PRM_ROAM_BZMN_M_01 | TADIG_CD |  | TAP·RAP 파일 헤더의 TADIG 코드 → 로밍사업자 매칭(파일·레코드 처리마다 조회) |
| X_PTL_PRM_PRTNR_CTRT_M_01 | PRTNR_NO |  | 파트너별 계약 목록 — 파트너기본 조인 FK |
| X_PTL_PRM_PRTNR_CTRT_M_02 | CTRT_END_DT | ctrt_trmn_dt IS NULL | 계약 만료 도래 추출(자동 갱신·재계약 안내 배치) — 해지 안 된 계약만 |
| X_PTL_PRM_STLM_M_01 | PRTNR_CTRT_NO, STLM_YM |  | 계약별 월 정산서 — 파트너계약기본 조인 FK |
| X_PTL_PRM_STLM_M_02 | PRTNR_NO, STLM_YM |  | 파트너별 정산 이력·월 정산 조회(반정규화 칼럼) |
| X_PTL_PRM_STLM_M_03 | STLM_YM, STLM_TY_CD |  | 정산월 마감 배치 — 해당 월 정산 유형별 일괄 확정·정산월통계 생성 |
| X_PTL_PRM_STLM_M_04 | GIVE_SCHD_DT | give_schd_dt IS NOT NULL | 지급 예정일 도래 정산 추출(자금 계획·지급 배치) |
| X_PTL_PRM_TXINV_M_01 | STLM_NO |  | 정산서 → 세금계산서 — 정산기본 조인 FK |
| X_PTL_PRM_TXINV_M_02 | PRTNR_NO, WRT_DT |  | 거래처별 작성일자 기간 조회(매입·매출 장부 대사, 반정규화 칼럼) |
| X_PTL_PRM_TXINV_M_03 | ORGN_TXINV_NO | orgn_txinv_no IS NOT NULL | 수정세금계산서 → 원본 추적 |
| X_PTL_PRM_TXINV_M_04 | ELCTR_TXINV_APRV_NO | elctr_txinv_aprv_no IS NOT NULL | 국세청 전자세금계산서 승인번호 대사 |
| X_PTL_PRM_TXINV_M_05 | WRT_DT | nts_trnm_dtm IS NULL | 국세청 미전송 건 추출(전송 기한 = 작성일 익월 10일) — 미전송만 |
| X_PTL_PRM_EQP_STCK_L_01 | PRTNR_NO, EQP_STCK_STTS_TY_CD |  | 유통점별 재고 현황(보유·출고) — 파트너기본 조인 FK, 상태 저선택도(S3)는 선두에 두지 않음 |
| X_PTL_PRM_EQP_STCK_L_02 | IMEI_NO |  | 개통 시 IMEI 재고 차감·분실·도난 단말 입고처 조회 |
| X_PTL_PRM_USIM_STCK_L_01 | PRTNR_NO, USIM_STCK_STTS_TY_CD |  | 유통점별 유심 재고 현황 — 파트너기본 조인 FK |
| X_PTL_PRM_USIM_STCK_L_02 | USIM_SN |  | 개통·유심 교체 시 유심 일련번호 재고 차감 |
| X_PTL_PRM_ATRCT_FEE_L_01 | SBSC_CTRT_NO |  | 계약 → 유치 수수료(조기 해지 환수 대상 판정) — ORD 가입계약기본 조인 FK |
| X_PTL_PRM_ATRCT_FEE_L_02 | SHOP_NO, FEE_OCRN_DT |  | 판매점별 기간 유치 수수료 집계(월 정산 생성) — 판매점기본 조인 FK |
| X_PTL_PRM_ATRCT_FEE_L_03 | STLM_NO | stlm_no IS NOT NULL | 정산서 → 원천 수수료 내역(정산 전 = NULL, S5) |
| X_PTL_PRM_MGMT_FEE_L_01 | AGNC_NO, STLM_YM |  | 대리점 월 관리수수료 집계(월 정산 생성) — 대리점기본 조인 FK, 파티션 프루닝 |
| X_PTL_PRM_MGMT_FEE_L_02 | SBSC_CTRT_NO |  | 계약별 관리수수료 이력(해지·명의변경 정산) — ORD 가입계약기본 조인 FK |
| X_PTL_PRM_MGMT_FEE_L_03 | STLM_NO | stlm_no IS NOT NULL | 정산서 → 원천 수수료 내역 |
| X_PTL_PRM_FEE_CLBK_L_01 | ATRCT_FEE_NO |  | 유치 수수료 → 환수 내역 — 유치수수료내역 조인 FK |
| X_PTL_PRM_FEE_CLBK_L_02 | TRMN_APLY_NO | trmn_aply_no IS NOT NULL | ORD 해지신청 → 환수 추적 |
| X_PTL_PRM_FEE_CLBK_L_03 | STLM_NO | stlm_no IS NOT NULL | 정산서 → 환수 내역(음수 상계 S7) |
| X_PTL_PRM_INCNTV_GIVE_L_01 | PRTNR_NO, INCNTV_OCRN_DT |  | 유통점별 기간 장려금 집계(월 정산 생성) — 파트너기본 조인 FK |
| X_PTL_PRM_INCNTV_GIVE_L_02 | SBSC_CTRT_NO | sbsc_ctrt_no IS NOT NULL | 개통 건 → 장려금 추적(불법 지원금 점검) |
| X_PTL_PRM_INCNTV_GIVE_L_03 | STLM_NO | stlm_no IS NOT NULL | 정산서 → 원천 장려금 내역 |
| X_PTL_PRM_INTCN_USE_T_01 | STLM_NO | stlm_no IS NOT NULL | 정산서 → 상호접속 집계 |
| X_PTL_PRM_ROAM_STLM_FILE_L_01 | ROAM_BZMN_NO, ROAM_DRCT_SE_CD, ROAM_STLM_FILE_SEQ |  | TAP 파일 순번 누락·중복 점검(누락 = RAP 반송) — 로밍사업자기본 조인 FK |
| X_PTL_PRM_ROAM_STLM_FILE_L_02 | ROAM_STLM_FILE_PRCS_DTM |  | 일자별 파일 처리 현황·오류 파일 재처리 배치 |
| X_PTL_PRM_ROAM_STLM_FILE_L_03 | ROAM_STLM_NO | roam_stlm_no IS NOT NULL | 월 로밍 정산 → 포함 파일 |
| X_PTL_PRM_ROAM_STLM_L_01 | ROAM_BZMN_NO, STLM_YM |  | 사업자×월 로밍 정산 조회 — 로밍사업자기본 조인 FK |
| X_PTL_PRM_ROAM_STLM_L_02 | STLM_NO | stlm_no IS NOT NULL | 정산서 → 로밍 정산 |
| X_PTL_PRM_CNTS_STLM_L_01 | CNTS_PRVD_CO_NO, STLM_YM |  | 제공사×월 콘텐츠·소액결제 정산 조회 — 콘텐츠제공사기본 조인 FK |
| X_PTL_PRM_CNTS_STLM_L_02 | STLM_NO | stlm_no IS NOT NULL | 정산서 → 콘텐츠 정산 |
| X_PTL_PRM_STLM_GIVE_L_01 | STLM_GIVE_DTM |  | 일자별 지급 실적·자금 집행 대사 |
| X_PTL_PRM_STLM_GIVE_L_02 | PRTNR_NO, PRTNR_ACCT_SEQ | prtnr_no IS NOT NULL | 지급 계좌별 지급 이력(채권양도 계좌 점검) — 파트너계좌상세 조인 FK |

## 5. 반정규화

논리 단계 denormCandidates 4건(L1 이행 종속 제거분)을 물리에서 판정 — 3건 채택, 1건 기각.

| 테이블 | 칼럼 | 원천 | 사유 |
|---|---|---|---|
| PTL_PRM_STLM_M | PRTNR_NO | 파트너계약기본.파트너번호(정산 → 계약 → 파트너) | 파트너별 정산 조회·정산월통계 집계 경로 — 계약 조인 1단계 제거(논리 L1 후보). 계약의 파트너는 불변이라 갱신 부담 없음 |
| PTL_PRM_STLM_M | STLM_CFMTN_DTM | 정산확정이력 중 확정 상태 행의 처리일시 | 확정 기간 조회·지급 예정 산정 — 이력(900만) 스캔 회피(논리 L1 후보). 확정 처리와 같은 트랜잭션에서 기록, 확정 전 NULL |
| PTL_PRM_TXINV_M | PRTNR_NO | 정산기본 → 파트너계약기본.파트너번호 | 거래처별 세금계산서 조회·국세청 전송 묶음 — 2단계 조인 제거(논리 L1 후보). 발행 시점 확정, 이후 불변 |
| (기각) PTL_PRM_ROAM_STLM_L | 원화정산금액 | 정산통화금액 × 적용환율 | 표준용어 미등재(사전 수정 권한 밖) + 50만 행 소형 표라 조회 시 계산으로 충분 — 대용량 경로 아님 |

## 6. 예상 행 수 근거

- 기간 2010-01 ~ 2026-10(202개월) 누적, 거래 종료 파트너 포함(D8). 거래처 : 대리점 5천 · 판매점 4만 · 콘텐츠제공사 8천 · 통신사업자 300 · 로밍사업자 1,200 + 제휴사 → 파트너 6만.
- 정산기본 = 활성 파트너계약 × 월(정산주기 월·분기 혼재) ≈ 400만, 정산상세·정산확정이력 ≈ 정산서당 2.2건, 세금계산서 = 정산서의 약 90%(상계·면세 제외).
- 유치수수료 = 판매점 경유 개통(ORD 가입계약 3,200만 중 수수료 정책 대상) 900만, 관리수수료 = 대리점 관리 회선 × 월(2014년 정책 도입 이후·최근 쏠림 S6) 4천만, 환수 = 유치 건의 약 17%(조기 해지·기변).
- 로밍정산파일 = 로밍사업자 × 방향 × 일 파일(TAP) ≈ 600만, 로밍정산 = 사업자 × 월 × 방향 50만, 콘텐츠정산 = 제공사 × 월 160만.
- 최종 배분은 data_migrationner(docs/06)가 D9 총량 안에서 확정.

## 7. 결정 메모

| # | 결정 | 근거 |
|---|---|---|
| F1 | 테이블명 = 논리 `tblNm`(`PTL_PRM_<약어>_<사전 tblSfx>`) 그대로 | reviews/03_logical.md L12 — 생성기가 사전에서 기계 계산한 이름, FK 부모 테이블명도 같은 키 |
| F2 | 파티션 = 관리수수료내역 1개(연 RANGE, 키 정산년월) | PRM 최대 누적 표(T3 규모), 월 정산·대리점 월 집계 프루닝, 참조 자식 없음(PK 확장 영향 0) |
| F3 | 일반 테이블 PK 는 유일 인덱스 먼저 → `USING INDEX`, 파티션 테이블은 `PRIMARY KEY (…)` | 대량 적재 뒤 인덱스 빌드 1회(D14), pg_constraint 확인으로 재실행 안전 |
| F4 | 정산번호 FK 는 전부 부분 인덱스 | 정산 전 원천 내역은 정산번호 NULL(논리 L5, S5) |
| F5 | FK 묶음 = 같은 부모의 서로 다른 PK 속성만 복합으로, 같은 부모 속성이 반복되면 별도 FK | 정산지급내역 → 파트너계좌상세 복합 FK(L6)와 조직이력 → 조직기본 2개(자기·상위 조직)를 함께 맞게 표현 |
| F6 | 반정규화 파트너번호 2건은 파트너기본으로 FK 정의 추가 | 반정규화 칼럼도 RI 설계 대상(정의만, D6) — ERD·적재 고아 점검(S11) 근거 |
| F7 | 일자 CHAR(8)·년월 CHAR(6)·여부 CHAR(1) 은 도메인 정본 유지 | 규칙 2-10 도메인 사전 우선(ORD·PRD 물리와 동일) |
| F8 | FK 정의 63건 중 14건은 자식 쪽 선두 인덱스를 두지 않음 — 부모가 코드·기준표(지역·은행·로밍국가·조직·상위통신사업자·단말모델·유심상품·상품·수수료정책·장려금정책)인 FK | 조인 방향이 자식 → 부모(부모 PK 사용)뿐이고 "이 코드·정책을 쓰는 자식 전부" 역조회는 정책 영향 분석 같은 월 배치라 전체 스캔으로 충분. DDL FK 제약이 없어(D6) 부모 갱신·삭제 때 자식 잠금 스캔도 없다. 단말·유심 모델별 재고는 유통점 조건과 함께 조회해 X_01(파트너번호 선두)로 처리(리뷰 05_physical_PRM 2026-11-07) |
