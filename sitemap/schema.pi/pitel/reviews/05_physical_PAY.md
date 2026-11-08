# 05 물리 관문 — PAY 청구(사용량·요금계산 포함)

> 2026-11-07 · masteragent_da_coordinator(물리·성능 관문) · 마스터 위임 자동 승인 모드
> 대상 : `model/physical/PAY.json` · `ddl/40_pay_tables.sql` · `ddl/40_pay_constraints.sql` · `docs/05_physical_PAY.md`
> 대조 : `model/logical/*.json`(7) · `model/std/domains.json` · `model/physical/{PRD,CUS,ORD,INV,COL}.json`(PRM 은 물리 미작성이라 논리로 대조)
> 기준 : `CONTEXT.md` D1~D15 · 2절(규칙 8~10) · 3절(물리 JSON 형식)
> 점검기 : `node tools/physical_check.js PAY`(이 관문에서 새로 만든 읽기 전용 점검기, 다른 영역에도 쓸 수 있음)
>
> **판정 : APPROVED** — 오류 0건, 고칠 것 없음. 경고 6건은 모두 설계 결정 P6(기준 코드 FK 는 단독 인덱스를 두지 않음)에 해당하는 의도된 예외다. DDL 두 파일을 pitel_dev 에서 2번씩 실행해 재실행해도 안전함을 확인했고, 만든 카탈로그와 JSON 이 칼럼·타입·NULL·순서·인덱스 기준으로 완전히 일치했다.

## 1. 점검 범위

| 항목 | 수 |
|---|---|
| 테이블 | **30**(논리 엔터티 30 = 1:1, 모듈 STL 3) |
| 칼럼(모델) | 335(+ 시스템 칼럼 4 × 30 = DDL 455) |
| PK | 30(파티션 테이블 13 = 논리 PK + 파티션 키) |
| 인덱스(PK 제외) | 52(부분 인덱스 9) |
| FK 정의(DDL 미생성, D6) | 59(교차 영역 25 : ORD 15 · PRD 5 · CUS 3 · PRM 3) |
| 파티션 테이블 | 13(월 5 × 217 + 연 8 × 19 = 하위 테이블 1,237) |
| 예상 행 수 | 821,170,230 |

점검 범위 = 모델에 나오는 모든 객체(신규·승계 구분 없이 전체).

## 2. 점검 결과

| # | 점검 | 결과 | 근거 |
|---|---|---|---|
| C1 | 이름 규칙 — `PK_<테이블>` · `X_<테이블>_NN`(2자리 연번) · `FK_<테이블>_NN`, DDL 은 소문자, 63자 이하 | 위반 0 | 점검기 + 카탈로그(pg_indexes 82 = PK 30 + X 52, 이름 전부 일치). 가장 긴 이름 `x_ptl_pay_use_qty_clct_file_l_02` 32자 |
| C2 | 논리 대비 누락 — 테이블·칼럼 | 누락 0 · 근거 없는 추가 칼럼 0 | 논리 속성 전부 칼럼으로 존재. 논리에 없는 칼럼 = 반정규화 2건(C8)뿐 |
| C3 | 타입 = 도메인 | 불일치 0 | 335 칼럼 전부 `domains.json`(lgcTp·len·scale)과 같음. 논리 NULL 여부와 물리 nullYn 일치 |
| C4 | 교차 영역 FK 칼럼 타입 = 부모 PK 타입 | 불일치 0 | 나가는 FK 59건 + 다른 영역이 PAY 를 참조하는 FK 10건(COL 3 · INV 5 · CUS 2) 모두 타입·참조 칼럼 = 부모 PK(파티션 키 제외) |
| C5 | 파티션 키 ⊂ PK | 13/13 | 결정 P1 |
| C6 | 대용량 파티션 여부·범위 | 위반 0 | 1억 행 이상(T4) 5개 = 월 RANGE, 2천만 행 이상 누적 8개 = 연 RANGE, 범위 2010-01~2027-12 + DEFAULT(`_pdef`). 카탈로그 : 월 테이블 217개(216 + 기본), 연 테이블 19개(18 + 기본). 파티션하지 않은 최대 = 요금계산이력 1,500만(기준 2천만 미만) |
| C7 | 조인 FK 인덱스·중복 인덱스 | 중복 0 · FK 인덱스 없음 6(전부 P6 예외) | 아래 3절 |
| C8 | 반정규화 사유 | 2건 모두 원천·사유 있음 | 청구상세·청구세금상세의 BILL_YM — 파티션 키(논리 M1 에서 부분 종속으로 지운 칼럼을 물리에서 다시 넣음) |
| C9 | 시스템 칼럼 4개(D7) | 30/30 | 모델 JSON 에는 없음. DDL 맨 끝에 `lst_mddtm·lst_mdfr_id·lst_rgdtm·lst_rgtr_id` 순서 |
| C10 | 칼럼 순서 PK → FK → 일반 | 위반 0 | seq 기준 |
| C11 | DDL 재실행 안전 | 통과 | 5절 |
| C12 | 문서 ↔ JSON ↔ DDL | 일치 | docs 표(테이블·파티션·인덱스·FK 수)와 JSON, 카탈로그 대조 |

## 3. FK 접근 인덱스 경고 6건 — 의도된 예외(P6)

| FK | 칼럼 → 부모 | 판정 |
|---|---|---|
| FK_PTL_PAY_USE_L_03 · FK_PTL_PAY_CHRG_CALC_L_06 · FK_PTL_PAY_BILL_D_03 | CHRG_ITM_CD → 요금항목코드(PRD) | 인정 — 부모가 수백 행짜리 기준 코드라 부모에서 자식으로 조인할 일이 없고 선택도가 낮다. 요금항목별 집계는 요금항목월통계(PROC)가 맡는다 |
| FK_PTL_PAY_BILL_JOB_M_01 · FK_PTL_PAY_BILL_M_03 | BILL_CYCL_CD → 청구주기코드(30행) | 인정 — 같은 이유. 청구작업은 `x_..._01(bill_ym, bill_cycl_cd)` 로 실제 조회 경로를 받친다 |
| FK_PTL_PAY_BILL_ADJ_L_03 | BILL_ADJ_RSN_TY_CD → 청구조정사유코드(200행) | 인정 — 같은 이유 |

자기 참조 FK `FK_PTL_PAY_BILL_M_04(ORGN_BILL_NO)` 는 부분 인덱스 `x_ptl_pay_bill_m_03 … WHERE orgn_bill_no IS NOT NULL` 로 받쳐진다(선택 FK, 재청구 건만 값이 있음).

## 4. 경계면 교차 비교(다른 영역 → PAY)

| 자식 FK | 칼럼 | PAY 부모 | 결과 |
|---|---|---|---|
| COL FK_PTL_COL_UNPD_M_01 · FK_PTL_COL_OVDU_ADCHG_L_02 | (BILL_NO, BILL_YM) | PTL_PAY_BILL_M | 타입·PK 일치(파티션 키까지 포함한 전체 PK 참조) |
| COL FK_PTL_COL_UNPD_D_02 | (BILL_NO, BILL_DTL_SEQ, BILL_YM) | PTL_PAY_BILL_D | 일치 |
| INV 5건(수납배분·자동이체 출금요청·카드 자동납부 승인·지로 수납·선납 사용) | BILL_NO | PTL_PAY_BILL_M | 일치(논리 PK 기준 — 결정 P4) |
| CUS 2건(청구계정기본·이력) | BILL_CYCL_CD | PTL_PAY_BILL_CYCL_C | 일치 |

참고 : COL 은 청구기본을 BILL_YM 까지 포함해 참조하고, INV 는 BILL_NO 만 참조한다. 두 방식 모두 P4(FK 는 DDL 에 만들지 않음, 업무 키 기준)와 맞아 결함은 아니다. 다만 나중에 RI 를 물리로 구현하면 INV 쪽에 BILL_YM 을 넣어야 한다 — 그 시점에 다시 검토한다.

## 5. DDL 실행 검증(pitel_dev, 스키마 rv_pay)

| 순서 | 파일 | 결과 |
|---|---|---|
| 1회차 | `40_pay_tables.sql` → `40_pay_constraints.sql` | exit 0, 오류 0 |
| 2회차(재실행) | 같은 두 파일 | exit 0, 오류 0 — `IF NOT EXISTS` 와 PK 존재 여부 확인 블록이 제대로 동작 |
| 카탈로그 대조 | pg_attribute · pg_indexes · pg_inherits | 테이블 30 · 칼럼 455 · 인덱스 82 · 파티션 1,237 — JSON 과 불일치 0(이름·순서·타입·NOT NULL·인덱스 칼럼·부분 인덱스 여부) |
| 정리 | `DROP SCHEMA rv_pay CASCADE` | 완료(아래 운영 메모 참고) |

**운영 메모(P3 — 적재 절차에 반영 권고)** : 파티션 1,237개와 그 인덱스를 한 트랜잭션에서 `DROP SCHEMA … CASCADE` 하니 `max_locks_per_transaction` 이 부족해 실패했다. 파티션 부모 테이블을 하나씩 DROP 한 뒤 스키마를 지우는 방식으로 정리했다. 7개 영역을 모두 합치면 파티션이 이보다 훨씬 많아지므로, 메인 적재기에서 재생성·정리할 때는 **테이블 단위 트랜잭션**으로 처리하거나 `max_locks_per_transaction` 을 늘려야 한다(예 256 이상, `pitel-pg` 재기동 필요).

## 6. 개선 과제(P3 — 이번 관문을 막지 않음)

| # | 내용 | 처리처 |
|---|---|---|
| A1 | 테이블명 25자 권고(schema.pi TBL_NM_MAX) 초과 `PTL_PAY_USE_QTY_CLCT_FILE_L`(27자) — 논리 단계 이름을 그대로 물려받음(grandfathered). 같은 사례 INV 2건(`PTL_INV_CARD_ATMT_PAY_APRV_L` 28자, `PTL_INV_CASH_RCIPT_PBLCN_L` 26자) | schema.pi 적재(D12) 전 통합 관문에서 일괄 판단 |
| A2 | 시스템 칼럼 4개의 표준용어(최종수정일시 등)가 `terms.json` 에 없다. 모든 영역의 DDL 이 똑같이 `TIMESTAMP`·`VARCHAR(50)` 을 쓰고 있어 PAY 만의 결함은 아님 | 표준사전 3차 등재 |
| A3 | 연 단위 파티션 테이블 중 청구서발행내역(INVC_PBLCN_DTM)·할인적용내역(DSCNT_APLCN_DTM)은 FK 조회(BILL_NO·CHRG_CALC_NO)에 파티션 제거가 안 되어 19개 파티션을 모두 탐색한다. 2,800만·3,000만 행 규모라 허용 범위 | 데이터 적재 뒤 실행 계획으로 재확인 |

## 7. 점검기 참고(다른 영역 관문용)

`tools/physical_check.js <AREA>` 를 다른 영역에 돌리면 파티션 범위 표기(`2010~2027`·`201001~202712`) 와 P2 기준(2천만 행 이상이면 파티션)에서 오류가 나온다. P2 는 PAY 가 정한 결정이고, 범위 표기는 영역마다 형식이 다르다. 그래서 그 결과를 곧바로 결함으로 판정하지 말고 각 영역의 관문에서 해석해야 한다(이번 관문 범위 밖).
