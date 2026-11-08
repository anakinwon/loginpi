# 08 설계 최종 승인 — masteragent_da_coordinator

> 2026-11-07 · 마스터 위임 자동 승인 모드 · 기준 `CONTEXT.md` D1~D15·2절·3절·6절
> 대상 : `model/**`(areas·conceptual·logical·physical·std) · `ddl/**` · `loader/**` · `reviews/01~07`
>
> **판정 : FIXED(조건부 승인)** — 규칙 2절 P1 위반 0. 물리 JSON 파티션 표기 결함 51건(DEFAULT 표시 누락 32 · 범위 표기 불일치 19)을 리더가 직접 수정, 점검기 오류 32 → 0. 데이터 생성(2단계) 착수 승인. 조건 C1~C3 은 schema.pi 완료 상태 전환 전까지 해소.

## 1. 단계별 관문 취합

| 단계 | 리뷰 | 판정 | 요지 |
|---|---|---|---|
| 01 주제영역 | `01_plan.md` | 승인 | 7 주제영역 + STL 업무 모듈, 엔터티 예산 |
| 02 개념 | `02_conceptual.md` | 수정 후 승인 | 핵심 엔터티 70, 필수 4종 |
| 03 논리·표준 1차 | `03_logical.md` | 수정 후 승인 | 사전 병합·속성 표준화 |
| 04 논리(영역별 7) | `04_logical_*.md` | 전부 FIXED | 반정규화 선반영·교차 관계 누락 등 리더 직접 수정 |
| 05 통합 | `05_integrate.md` | FIXED | 교차 관계 결함 9·FK 표기 6파일 수정, 오류 0 |
| 05 물리(영역별 7) | `05_physical_*.md` | APPROVED 2 · FIXED 5 | 교차 FK 부모 PK(파티션 키) 보정·접미어·FK 인덱스 보강 |
| 06 DDL | `06_ddl.md` | 통과 | pitel_dev 통합 실행·재실행 오류 0, `pitel` 테이블 적용 |
| 07 적재기 | `07_loader.md` | 통과(남은 위험 기록) | 복제 DB 적재·멱등·잠금 확인, 작성중 91 |
| **08 최종** | 이 문서 | **FIXED(조건부)** | 아래 |

## 2. 이번 관문 수정 내역

| # | 대상 | 결함 | 등급 | 조치 |
|---|---|---|---|---|
| F1 | `model/physical/{CUS,ORD,PAY,COL,PRM}.json` 파티션 32개 | `partition.dflt` 누락(INV 만 `dflt:true`) — DDL 에는 38개 모두 DEFAULT 파티션 존재, JSON 이 정본 DDL 을 표현 못 함 | P2(형식) | 38개 전부 `dflt:true` 로 통일 |
| F2 | 같은 파일 파티션 19개 | 범위 표기 불일치 — 연 단위인데 `2010-01~2027-12`(18), 월 단위인데 `201001~202712`(1) | P3(형식) | 연 = `2010~2027`, 월 = `2010-01~2027-12` 로 통일 |

검증 : `node tools/review_phy_check.js <AREA>` 7개 영역 오류 0. DB 하위 파티션 수 ↔ JSON 단위(연 19 · 월 217) 38개 전부 일치(불일치 0). DDL·데이터 영향 없음(JSON 표기만 변경, 적재기는 설명 문자열로만 사용).

## 3. 전수 점검(점검 대상 = 모델 전 객체 214 테이블 · 2,124 칼럼)

| 항목 | 기준 | 결과 |
|---|---|---|
| 물리 칼럼 표준용어 등재 | 2,124 전부 | 미등재 0 |
| `~상태코드` 단독(유형코드 아님) | 0 | 0 |
| 핵심(CNCP) 70 필수 4종(PK·명·일시·상태유형코드) | 70/70 | 누락 0 |
| PK 이름 `PK_<테이블>` | 214 | 위반 0 |
| 인덱스 이름 `X_<테이블>_NN` | 318 | 위반 0 |
| FK 이름 `FK_<자식>_NN`(정의만) | 434 | 위반 0, DDL 의 FK·REFERENCES 0(D6) |
| DB ↔ 물리 JSON(칼럼 순서·타입·개수) | 214 테이블 | 차이 0 |
| 시스템 칼럼 4개 맨 끝·순서(D7) | 214 | 위반 0 |
| 파티션 키 ⊂ PK · DEFAULT 존재 | 38 | 위반 0 |
| 주제영역 간 관계 양끝 존재 | crossRels 121 | 결함 0(`integrate_check.js`) |
| 엔터티 예산(D3 200~230) | 214 | 통과 |

## 4. 표본 점검(주제영역마다 3개 — 핵심 2 + 논리 1, 파티션 대상 우선)

| 영역 | 엔터티 | 단계 | 테이블 | PK | 명 | 일시 | 상태유형코드 | FK | 인덱스 | 파티션 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PRD | 상품기본 | CNCP | PTL_PRD_PROD_M | PROD_CD | PROD_NM | PROD_REG_DTM | PROD_STTS_TY_CD | 1 | 2 | - | ✓ |
| PRD | 요금제기본 | CNCP | PTL_PRD_RTPLN_M | PROD_CD | RTPLN_PBANC_NM | RTPLN_REG_DTM | RTPLN_TRMS_DCLR_STTS_TY_CD | 1 | 0 | - | ✓(서브타입, PK=상위 PK) |
| PRD | 상품구성관계 | LGCL | PTL_PRD_PROD_CMPS_R | UP_PROD_CD+CMPS_PROD_CD | - | - | - | 2 | 1 | - | ✓(관계 엔터티, 필수 4종 대상 아님) |
| CUS | 고객기본 | CNCP | PTL_CUS_CUST_M | CUST_NO | CUST_NM | CUST_REG_DTM | CUST_STTS_TY_CD | 0 | 1 | - | ✓ |
| CUS | 고객등급이력 | CNCP | PTL_CUS_CUST_GRD_H | CUST_NO+GRD_APLCN_BGNG_DTM | CUST_GRD_NM | GRD_APLCN_BGNG_DTM | GRD_APLCN_STTS_TY_CD | 1 | 0 | 연 | ✓ |
| CUS | 고객이력 | LGCL | PTL_CUS_CUST_H | CUST_NO+VLD_BGNG_DTM | CUST_NM | VLD_BGNG_DTM | CUST_STTS_TY_CD | 1 | 0 | 연 | △ C1(스냅숏 CUST_NM) |
| ORD | 가입계약기본 | CNCP | PTL_ORD_SBSC_CTRT_M | SBSC_CTRT_NO | SBSC_CTRT_NM | SBSC_CTRT_DTM | SBSC_CTRT_STTS_TY_CD | 5 | 6 | - | ✓ |
| ORD | 회선상태이력 | CNCP | PTL_ORD_LINE_STTS_H | SVC_MGMT_NO+LINE_STTS_HIST_SEQ(+키) | LINE_STTS_HIST_NM | LINE_STTS_CHG_DTM | LINE_STTS_TY_CD | 4 | 3 | 연 | ✓ |
| ORD | 가입신청상세 | LGCL | PTL_ORD_SBSC_APLY_D | SBSC_APLY_NO+SBSC_APLY_DTL_SEQ | - | - | - | 3 | 1 | - | ✓ |
| PAY | 원시사용내역 | CNCP | PTL_PAY_RAW_USE_L | RAW_USE_NO(+CLCT_DTM) | RAW_USE_NM | USE_BGNG_DTM | RAW_USE_PRCS_STTS_TY_CD | 1 | 3 | 월 | ✓ |
| PAY | 사용내역 | CNCP | PTL_PAY_USE_L | USE_NO(+BILL_YM) | USE_DTLS_NM | USE_BGNG_DTM | USE_RAT_STTS_TY_CD | 3 | 4 | 월 | ✓ |
| PAY | 사용량수집파일내역 | LGCL | PTL_PAY_USE_QTY_CLCT_FILE_L | CLCT_FILE_NO | CLCT_FILE_NM | FILE_CRT_DTM | CLCT_FILE_PRCS_STTS_TY_CD | 0 | 2 | - | △ C3(테이블명 27자) |
| INV | 수납기본 | CNCP | PTL_INV_RCV_M | RCV_NO(+RCV_DT) | DPSTR_NM | RCV_DTM | RCV_STTS_TY_CD | 6 | 6 | 월 | ✓ |
| INV | 수납배분상세 | CNCP | PTL_INV_RCV_ALLC_D | RCV_ALLC_NO(+BILL_YM) | ALLC_SMRY_NM | RCV_ALLC_DTM | RCV_ALLC_STTS_TY_CD | 5 | 4 | 월 | ✓ |
| INV | 카드사코드 | LGCL | PTL_INV_CARD_CO_C | CARD_CO_CD | CARD_CO_NM | CARD_CO_REG_DTM | CARD_CO_STTS_TY_CD | 1 | 0 | - | ✓ |
| COL | 미납기본 | CNCP | PTL_COL_UNPD_M | UNPD_NO | UNPD_RCVB_NM | UNPD_OCRN_DTM | UNPD_STTS_TY_CD | 5 | 6 | - | ✓ |
| COL | 연체가산금내역 | CNCP | PTL_COL_OVDU_ADCHG_L | OVDU_ADCHG_NO(+ADCHG_IMPS_DTM) | OVDU_ADCHG_NM | ADCHG_IMPS_DTM | ADCHG_IMPS_STTS_TY_CD | 3 | 2 | 연 | ✓ |
| COL | 연체가산금기준코드 | LGCL | PTL_COL_OVDU_ADCHG_STD_C | OVDU_ADCHG_STD_TY_CD | OVDU_ADCHG_STD_NM | - | - | 0 | 0 | - | △ P3(코드 엔터티 키에 `_TY_CD` — 05 통합 '코드 엔터티 키' 관례로 수용) |
| PRM | 파트너기본 | CNCP | PTL_PRM_PRTNR_M | PRTNR_NO | PRTNR_NM | PRTNR_REG_DTM | PRTNR_STTS_TY_CD | 2 | 3 | - | ✓ |
| PRM | 조직기본 | CNCP | PTL_PRM_ORG_M | ORG_CD | ORG_NM | ORG_REG_DTM | ORG_STTS_TY_CD | 1 | 1 | - | ✓ |
| PRM | 관리수수료내역(STL) | LGCL | PTL_PRM_MGMT_FEE_L | MGMT_FEE_NO(+STLM_YM) | - | - | MGMT_FEE_STTS_TY_CD | 4 | 3 | 연 | ✓(논리 일반 엔터티) |

표본 21개 P1 0. FK 선두 인덱스 미설계(참고 154건)는 각 영역 물리 리뷰의 결정(기준 코드 FK 단독 인덱스 생략·PRM F8)으로 수용.

## 5. 승인 조건(다음 세션 · schema.pi 완료 전환 전)

| # | 조건 | 근거 | 영향 |
|---|---|---|---|
| C1 | 논리 모델의 스냅숏 속성 46 · 조회용 중복 44(규칙 2-7 "반정규화는 물리 단계만")를 '변경전/후' 용어로 바꾸거나 물리 `denorm` 으로 내린다 | `07_loader.md` 3절 — schema.pi 앱 관문 2NF·3NF 의심, 작성중 91 | 물리 칼럼은 그대로(반정규화로 이동) → DDL·데이터 생성 영향 없음 |
| C2 | FK 상속 역할명 용어 4건 추가(예 청구계정고객번호) | 같은 | 논리·사전만 |
| C3 | 25자 초과 테이블명 3건 — **현행 유지로 결정 완료**(아래 메모), schema.pi 에서는 작성중 사유로만 남김 | 같은 · 04 논리 A1 | 없음 |

결정 메모 : C1~C3 은 schema.pi 앱 관문의 '의심' 휴리스틱이고 물리 DDL·데이터 계약을 바꾸지 않으므로 데이터 생성을 막지 않는다(D1 오늘 범위 우선). C3 은 개명 비용이 적재 뒤 급증하므로 **현행 유지로 확정**(63자 한도 내, 앱 경고만) — 다음 세션 재론 불필요.

## 6. DB 실측(`pitel` public, 2026-11-07)

`docker exec pitel-pg psql -d pitel` : `ptl_` 테이블(파티션 하위 제외) **214** · 파티션 상위 38 · 하위 2,306(DEFAULT 38) · 인덱스 0 · PK 0 — D14 에 따라 제약은 적재 뒤 `ddl/*_constraints.sql`(PK 214 + 보조 318 = 532).
