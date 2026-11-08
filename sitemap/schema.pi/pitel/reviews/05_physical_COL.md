# 05 물리 관문 — COL 미납

> 2026-11-07 · masteragent_da_coordinator(물리·성능 관문) · 마스터 위임 자동 승인 모드
> 대상 : `model/physical/COL.json` · `ddl/60_col_tables.sql` · `ddl/60_col_constraints.sql` · `docs/05_physical_COL.md`(생성기 `tools/physical_COL_build.js`)
> 대조 : `model/logical/*.json`(7) · `model/std/*.json` · `model/physical/{PRD,CUS,ORD,PAY,INV}.json`(PRM 물리 미작성)
> 기준 : `CONTEXT.md` D6·D7·D14·2절(규칙 8·9·10)·3절
>
> **판정 : FIXED** — 교차 FK 9건이 부모 물리 PK(파티션 키 포함)를 다 채우지 못한 결함(R1)을 생성기에서 직접 고쳐 재생성. 재점검 오류 0, pitel_dev 재실행 안전 확인.

## 1. 점검 범위·결과 요약

테이블 30(논리 엔터티 30 = 1:1) · 칼럼 299(시스템 칼럼 제외) · PK 30 · 보조 인덱스 50 · FK 정의 55(DDL 미생성, D6) · 파티션 테이블 5(연 18 + DEFAULT 1 = 하위 95개).

| 항목 | 결과 |
|---|---|
| 이름 규칙 : `PK_<테이블>` / `X_<테이블>_NN` / `FK_<테이블>_NN`, DDL 소문자, 63자 이하 | 위반 0(DB 카탈로그 확인 : PK 30 · `x_ptl_col_*_NN` 50 · 그 외 이름 0) |
| 논리 대비 누락 테이블·칼럼 | 0 / 0. 논리에 없는 칼럼 = 반정규화 표시 칼럼뿐 |
| 타입 = 도메인 | 299칼럼 전부 표준용어 → 도메인 타입 일치, 용어 물리명 일치 |
| 교차 FK 칼럼 타입 = 부모 PK 타입 | 일치(PAY·INV·CUS·ORD 부모 확인, PRM 은 물리 미작성이라 논리 기준) |
| 교차 FK refCols = 부모 물리 PK 전체 | **불일치 9건 → 수정(R1)** |
| 파티션 키 ⊂ PK, 범위 2010-01~2027-12 + DEFAULT | 5개 전부 충족(경계 예 : `201001`~`201101`, `2027-01-01`~`2028-01-01`) |
| 대용량 파티션 여부 | 3천만+ 6개 중 5개 파티션, `PTL_COL_UNPD_D`(6천만) 비파티션 — 사유 타당해 승인(아래 R2) |
| 조인 FK 인덱스 | 대형 부모·자식 조인 FK 는 선두 칼럼 인덱스 있음. 없음 = 작은 기준(20·2천 행) FK 2건·PK 선두가 FK 인 이력/상세 — 결정 메모대로 승인 |
| 중복 인덱스 | 0(PK·다른 인덱스 앞부분, WHERE 동일 기준) |
| 반정규화 사유 | 전 칼럼 사유·원천 기록(문서 3절) |
| 시스템 칼럼 4개 순서(D7) | 30테이블 전부 맨 끝 `lst_mddtm, lst_mdfr_id, lst_rgdtm, lst_rgtr_id`, 타입은 다른 영역 DDL 과 동일 |
| DDL 재실행 안전 | 스키마 `rv_col` 에서 tables→constraints 를 2회 실행, 오류 0, 이후 `DROP SCHEMA rv_col CASCADE` |

## 2. 결함·조치

| # | 등급 | 결함 | 조치 |
|---|---|---|---|
| R1 | P1 | 교차 FK 가 부모 **논리** PK 만 참조 — PAY 청구기본(PK 청구번호+청구년월)·청구상세(청구번호+청구상세순번+청구년월)·INV 수납기본(수납번호+수납일자)이 물리에서 파티션 키를 PK 에 붙였는데 COL FK 9건(`FK_PTL_COL_UNPD_M_01`·`UNPD_D_02`·`OVDU_ADCHG_L_02`·`SUSP_RLS_L_02`·`COLL_RTRVL_L_03`·`DIV_PAY_TMS_D_02`·`PAY_PRMS_L_03`·`CRINFO_RLS_L_02`·`BDDT_RTRVL_L_02`)이 PK 일부만 가리킴. 성능 : 청구상세 월 파티션 217개·수납기본 월 파티션 217개를 번호만으로 찾으면 전 파티션 인덱스를 훑는다 | 생성기 수정 : 다른 영역 물리 JSON 을 읽어 부모 물리 PK 로 refCols 를 맞추고, 빠진 파티션 키는 반정규화 칼럼(`den.fkOf`)으로 채움 — 못 채우면 생성 실패. 추가 칼럼 8개 : `PTL_COL_UNPD_D.BILL_YM`(NOT NULL), `PTL_COL_OVDU_ADCHG_L.RFLT_BILL_YM`, 수납 참조 6테이블 `RCV_DT`(선택 FK 와 같이 NULL 허용). `PTL_COL_UNPD_M.BILL_YM` 은 기존 반정규화 칼럼을 FK 칼럼 겸용으로. 모두 기존 표준용어(청구년월·반영청구년월·수납일자) 사용, 신규 용어 0 |
| R2 | 승인 | `PTL_COL_UNPD_D` 6천만 행 비파티션 | 현재값 테이블 + 미납번호 키 조회가 주 경로 + 자식(대손상각상세)이 미납번호·순번으로 참조 — 날짜 PK 를 붙이면 자식 반정규화만 늘고 프루닝 이득 없음. 결정 메모 근거 인정 |
| R3 | 타 영역 인계 | COL 이 가리키는 `PTL_ORD_LINE_M`·`PTL_ORD_SBSC_CTRT_M` 이 ORD 물리에 없음 — ORD 물리가 테이블명을 엔터티 약어(`PTL_ORD_LINE_BAS`·`PTL_ORD_SBSC_CTRT_BAS`)로 지어 표준 접미어(words.json `기본 → _M`)와 어긋남. PRD·CUS·PAY·INV·COL 은 `_M` 규칙 | COL 쪽은 표준대로 유지(칼럼 타입·PK 는 ORD `_BAS` 기준으로 일치 확인). **ORD 물리 관문에서 30테이블 이름을 접미어 규칙으로 바꿔야 함** — 통합 단계 점검 항목 |
| R4 | 타 영역 인계 | 다른 영역에도 파티션 부모 PK 미완성 FK 존재(예 `PTL_PAY_BILL_ADJ_L`·`PTL_PAY_MCPAY_BILL_D`·`PTL_INV_OVPAY_M`·`PTL_INV_GIRO_RCV_L` 등 — 청구년월·수납일자 없이 번호만) | COL 범위 밖. 같은 원인이므로 PAY·INV 관문 또는 통합 관문에서 같은 방식(파티션 키 반정규화)으로 정리 권고 |
| R5 | 미결(정보) | `FK_PTL_COL_COLL_FEE_L_02 → PTL_PRM_STLM_M` 은 PRM 물리 미작성이라 부모 물리 PK 대조 못 함 | PRM 물리 완성 뒤 생성기 재실행하면 자동 대조(파티션 키가 PK 에 붙으면 생성기가 실패로 알려 줌) |

## 3. 수정 파일

- `tools/physical_COL_build.js` — 다른 영역 물리 PK 로 FK 완성 로직, `den.fkOf`, 반정규화 8칼럼 추가, 결정 메모 2줄 갱신
- 재생성 : `model/physical/COL.json` · `ddl/60_col_tables.sql` · `ddl/60_col_constraints.sql` · `docs/05_physical_COL.md`

## 4. 후속(data_migrationner)

- 추가 칼럼 값 규칙 : `UNPD_D.BILL_YM` = 부모 미납기본의 청구년월, `OVDU_ADCHG_L.RFLT_BILL_YM` = 반영 청구서의 청구년월(반영청구번호 NULL 이면 NULL), 수납 참조 `RCV_DT` = 해당 수납기본의 수납일자(수납번호 NULL 이면 NULL). 결정적 키 공식에서 부모 번호로 바로 계산되게 할 것.
