# 05 물리 관문 — 가입(ORD)

> 2026-11-07 · masteragent_da_coordinator(물리·성능 관문) · 마스터 위임 자동 승인 모드
> 대상 : `model/physical/ORD.json` · `ddl/30_ord_tables.sql` · `ddl/30_ord_constraints.sql` · `docs/05_physical_ORD.md` (생성기 `tools/phy_ORD_build.js`)
> 대조 : `model/logical/*.json`(7) · `model/std/*.json` · `model/physical/{PRD,CUS,PAY,INV,COL,PRM}.json`
> 점검기 : `node tools/phy_check.js ORD`(신규, 읽기 전용 — 영역 인자만 바꿔 재사용)
>
> **판정 : FIXED** — P1 1건(테이블 접미어 규칙 위반 + 교차 FK 부모 테이블 미존재 71건)·P3 1건(조인 FK 인덱스 1개)을 생성기 수정으로 직접 고치고 재생성. 최종 점검 오류 0, pitel_dev DDL 2회 실행 오류 0.

## 1. 점검 범위

전체 객체 = 테이블 30 · 칼럼 324(+DDL 시스템 칼럼 120) · 인덱스 64(PK 제외) · PK 30 · FK 정의 91 · 파티션 테이블 4(하위 76). 신규·승계 구분 없음(전부 이번 단계 신규).

## 2. 점검 결과

| # | 항목 | 기준 | 결과 | 판정 |
|---|---|---|---|---|
| Q1 | 테이블명 | `PTL_ORD_<약어>_<words.tblSfx>` = 논리 `tblNm`(CONTEXT 2절 규칙 4, 03 논리 관문 L12) | **위반 30/30** — `PTL_ORD_SBSC_APLY_BAS` 처럼 분류어 약어(BAS·DTL·DTLS·HIST·REL)를 그대로 씀. 나머지 6개 영역은 전부 `_M·_D·_L·_H·_R` | P1 → 수정 |
| Q2 | 교차 FK 부모 존재 | refTbl = 실제 부모 테이블(6절 "관계 양끝 존재") | **위반 71/91** — 타 영역 부모를 `PTL_<영역>_<phyNm>`(예 `PTL_PRD_PROD_BAS`)로 만들어 존재하지 않는 테이블 참조. 05 PRD 관문 H1 이 같은 결함 상신 | P1 → Q1 과 함께 수정 |
| Q3 | PK·인덱스·FK 이름 | `PK_<테이블>` / `X_<테이블>_NN` 연번 / `FK_<자식>_NN`, DDL 소문자, 63자 | 수정 후 위반 0. 최장 식별자 47자(하위 파티션 포함) | 통과 |
| Q4 | 논리 대비 누락 | 엔터티 30 = 테이블 30, 속성 전부 = 칼럼 | 누락 0. 논리에 없는 칼럼 6개는 전부 반정규화(사유·원천 기재) | 통과 |
| Q5 | 타입 = 도메인 | 칼럼 dataTp = domains.json 도메인 → PG 타입 | 324칼럼 불일치 0, NULL 허용 논리와 불일치 0 | 통과 |
| Q6 | 교차 FK 타입 | 자식 칼럼 타입 = 부모 PK 타입(부모 물리 우선, 없으면 논리 도메인) | 91건 불일치 0(모두 `VARCHAR(20)` 번호·`VARCHAR(20)` 코드) | 통과 |
| Q7 | 파티션 키 ⊂ PK | PG 파티션 PK 제약 | 4개 모두 변경일시를 PK 끝에 추가 — 논리 키(부모+순번) 전역 유일은 순번 채번이 보장(생성기 F2 결정) | 통과 |
| Q8 | 대용량 파티션·범위 | 2010~2027 + DEFAULT | 4개 이력 테이블 연 RANGE 18 + DEFAULT 1, DB 확인 `2010-01-01`~`2028-01-01` 경계 정확. 3천만 행 이상 무파티션 2개는 아래 3절 수용 | 통과 |
| Q9 | 조인 FK 인덱스 | FK 선두 인덱스(PK 포함) 또는 대체 경로 | 미보유 33건 → 1건 추가, 32건 사유 수용(3절) | P3 → 수정 |
| Q10 | 중복 인덱스 | 같은 칼럼·같은 부분조건의 접두 포함 | 0 | 통과 |
| Q11 | 반정규화 사유 | col·srcTbl·why | 6건 전부 기재(서비스번호·서비스관리번호·할당횟수·할부잔여원금·결합유형코드·결합회선수) | 통과 |
| Q12 | 시스템 칼럼(D7) | JSON 없음, DDL 맨 끝 `LST_MDDTM·LST_MDFR_ID·LST_RGDTM·LST_RGTR_ID` | JSON 0, DB 카탈로그로 30테이블 순서 확인 | 통과 |
| Q13 | FK 제약 미생성(D6) | DDL 에 REFERENCES 없음 | DB `contype='f'` 0 | 통과 |
| Q14 | 재실행 안전 | `IF NOT EXISTS`·PK `DO` 가드 | 2회 실행 오류 0 | 통과 |

## 3. 수정 내역

| # | 결함 | 등급 | 근거 | 조치 |
|---|---|---|---|---|
| F1 | 테이블명·refTbl 을 `PFX + phyNm` 으로 계산(사전 tblSfx 무시) | P1 | CONTEXT 2절 규칙 4, 6절, 03 논리 관문 L12, 05 PRD 관문 H1 | `tools/phy_ORD_build.js` : `tblNm = e.tblNm`, `refTbl = 부모 e.tblNm`(논리 사전이 기계 계산한 값만 사용), 미사용 `PFX` 삭제 → JSON·DDL·docs 재생성. 결과 30테이블 개명(`_BAS→_M`, `_DTL→_D`, `_DTLS→_L`, `_HIST→_H`, `_REL→_R`), PK·인덱스·FK 이름 동반 변경. 타 영역이 ORD 를 참조하는 refTbl 25건(`PTL_ORD_LINE_M` 13 등)이 이제 모두 실재 |
| F2 | `PTL_ORD_MNP_APLY_M.SBSC_APLY_NO` 조인 인덱스 없음 | P3 | D6 "FK 칼럼 인덱스는 접근 경로에 따라 설계" | 번호이동 개통 처리가 신청마다 번호이동 동반 여부를 조회 → `X_PTL_ORD_MNP_APLY_M_05 (sbsc_aply_no) WHERE sbsc_aply_no IS NOT NULL` 추가(S5 NULL 쏠림 → 부분 인덱스) |

수용(수정 안 함) 근거 :

- **FK 선두 인덱스 미보유 32건** — ① 타 영역 기준·코드 부모(상품코드·단말모델코드·유심상품코드·결합상품코드·약정상품코드·판매점번호·대리점번호·통신사업자번호, 25건) : 접근은 자식→부모 PK 조회 방향이고 역방향(코드 → 전 가입 건)은 S2 인기 상품 쏠림으로 선택도가 낮아 인덱스가 쓰이지 않는다. 실적·수수료 경로가 필요한 판매점·대리점은 신청·계약 테이블에 이미 (번호, 일시) 복합 인덱스 있음. ② `PTL_ORD_SBSC_APLY_M.BILL_ACNT_NO`(NULL 다수, 계정→신청 역조회 업무 없음). ③ 같은 영역 `EQP_CHG_L`(신청·할부계약·약정 3건)·`NMNE_CHG_L`(이전계약·계약·신청 3건) : 100만~500만 행, 계약의 회선이 불변이라 기존 `SBSC_CTRT_NO`·`SVC_MGMT_NO` 인덱스로 같은 행에 도달.
- **3천만 행 이상 무파티션 2개** — `PTL_ORD_SBSC_PROD_M`(3천만, 현재 상태 기본 테이블 — 누적형 이력 아님, PAY·COL 이 FK 로 참조) · `PTL_ORD_EQP_INSTL_D`(4,500만, PAY 단말할부청구상세가 1:1 참조, 8칼럼 좁은 행, 접근 = 계약번호·청구년월 인덱스). 파티션 시 PK 에 일시가 붙어 교차 참조 키 계약(crossKeys)이 깨지므로 생성기 결정(타 영역 참조 테이블 비파티션) 수용.

## 4. 검증 실행 (pitel_dev, 스키마 `rv_ord`)

`tables → constraints → tables → constraints` 순 `ON_ERROR_STOP=1` 실행 — 4회 모두 종료 코드 0. 카탈로그 : 일반·부모 테이블 30 · 하위 파티션 76(4×19) · PK 30 · 인덱스 `x_` 64 · FK 제약 0 · 이름 규칙 벗어난 인덱스 0 · 시스템 칼럼 끝 4개 순서 위반 0. 확인 뒤 `DROP SCHEMA rv_ord CASCADE`.

## 5. 통합 관문 상신(ORD 범위 밖 — 고치지 않음)

1. **하위 파티션 이름 접미 3종 혼재** : `_p<YYYY>`+`_pdef`(CUS·PAY) / `_p<YYYY>`+`_pdflt`(ORD·INV·PRM) / `_y<YYYY>`+`_def`(COL). CONTEXT 에 규칙 없음 — 통합 관문에서 하나로 정하고(권고 : 다수인 `_p<YYYY>`·`_pdef`) 생성기 일괄 재생성. 적재기·CDC 가 하위 이름을 패턴으로 다룰 때 문제.
2. `node tools/phy_check.js <AREA>` 를 타 영역에 돌린 결과 CUS 9·INV 10·COL 2 건 오류 표시 — 대부분 이 점검기의 DDL 블록 해석(파티션 루프 위치·부분 인덱스 표기 차이) 때문일 가능성이 높아 각 영역 물리 관문에서 원인 확인 필요(INV `RCV_M.UNALLC_AMT` 반정규화 사유 누락, COL `pk.cols` 순서 불일치 2건은 실제 결함으로 보임).
