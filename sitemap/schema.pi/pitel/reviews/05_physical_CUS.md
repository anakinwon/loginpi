# 05 물리 모델 관문 리뷰 — CUS 고객 (masteragent_da_coordinator · 물리·성능 관문)

> 2026-11-07 · 대상 `model/physical/CUS.json`, `ddl/20_cus_tables.sql`, `ddl/20_cus_constraints.sql`, `docs/05_physical_CUS.md`(작성 subagent_physical_modeler) · 대조 `model/logical/CUS.json`·`model/std/domains.json`·`model/physical/{PRD,ORD,PAY,INV,COL,PRM}.json`
> 기준 `CONTEXT.md` D2·D3·D6·D7·D14·2절(규칙 8~10)·3절 형식·6절 관문. 마스터 위임 자동 승인 모드.
> 점검 도구 = 저장소 밖 `%TEMP%/pitel05cus/check.js`(PRD 관문 도구를 CUS 용으로 고쳐 씀 — JSON↔논리↔도메인↔타 영역 물리↔DDL 자동 대조) + `pitel_dev` 실제 실행
> **판정 : FIXED(직접 수정 후 승인)** — P1 0 · P2 1건 수정(R1) · 문서 보완 1건(R2) · P3 2건

## 1. 점검표 (점검 범위 = 테이블 30 전부 · 칼럼 311 · PK 30 · 보조 인덱스 26(수정 뒤) · FK 정의 51 · 파티션 9 · 반정규화 1)

| # | 항목 | 기준 | 결과 | 판정 |
|---|---|---|---|---|
| Q1 | 이름 규칙 | `PTL_CUS_<약어>_<접미>`, PK `PK_<테이블>`, 인덱스 `X_<테이블>_NN` 2자리 연번, FK `FK_<테이블>_NN`, DDL 소문자, 63자 이내 | 위반 0. DB 실측 인덱스 이름 정규식 불일치 0, 최장 식별자 53자(하위 파티션 포함) | 통과 |
| Q2 | 논리 대비 누락 | 엔터티 30 ↔ 테이블 30, 속성 ↔ 칼럼 | 누락 테이블 0 · 누락 칼럼 0. 차이 3건은 모두 문서화된 물리 결정 : 멤버십포인트내역·고객상담내역 PK 에 파티션 키 편입(P2), 고객민원내역.상담일시 반정규화(P3) | 통과 |
| Q3 | 타입 = 도메인 | dataTp = 논리 domNm 의 domains.json 정의 | 불일치 0 | 통과 |
| Q4 | 칼럼 순서 | PK → FK → 일반 | 위반 0(고객민원내역.상담일시는 복합 FK `FK_..._CVLCPT_L_02` 구성 칼럼이라 FK 묶음 안 — 도구 오탐) | 통과 |
| Q5 | 교차 영역 FK 타입(CUS → 타 영역) | FK 칼럼 타입 = 부모 PK 타입, 부모 실재 | 8건(ORD 가입신청기본·회선기본 3, PRM 파트너·조직 3, PAY 청구주기 2) 전부 부모 실재·VARCHAR(20)/VARCHAR(10) 일치. ORD 는 점검 중 ORD 관문이 `_BAS`→`_M` 교정을 반영해 해소(점검 초회엔 부모 미존재로 검출) | 통과 |
| Q6 | 교차 영역 FK 타입(타 영역 → CUS) | ORD·INV·COL 의 CUS 참조 FK | ORD 8 · INV 11 · COL 7 = 26건 부모 실재·타입 일치·부모 PK 전체 참조 | 통과 |
| Q7 | FK 정의 완전성 | 논리 fk 속성마다 fks 정의 | 51건, 누락 0. 부분 참조 1건(`FK_PTL_CUS_MBSP_POINT_L_02` 원거래 자기참조 — 물리 PK 가 파티션 키로 확장돼 논리 키 참조, docs 7절 사유 명시) | 통과 |
| Q8 | FK 칼럼 인덱스(D6) | FK 가 PK 선두·인덱스 선두로 커버되거나 사유 명시 | 미커버 15건 중 11건은 소용량 기준 부모(지역·우편번호·청구주기·조직·동의항목)로 conventions 사유 일치, 2건은 선두 칼럼 커버(청구지주소·원거래). **1건 결함 → R1**, 1건 사유 누락 → R2 | 수정 후 통과 |
| Q9 | 중복 인덱스 | 보조 인덱스가 PK·다른 인덱스 접두와 같으면 중복 | 0건 | 통과 |
| Q10 | 저선택도(S3) | 상태 칼럼 단독 인덱스 금지 | 0건. 미처리 민원은 부분 인덱스(`WHERE prcs_cmptn_dtm IS NULL`)로 회피 — 적절 | 통과 |
| Q11 | 파티션 키 ⊂ PK | PostgreSQL 파티션 PK 제약 | 9/9 포함 | 통과 |
| Q12 | 대용량 파티션 여부·범위 | 대용량 RANGE 2010-01~2027-12 + DEFAULT | 연 RANGE 8개(2010~2027 18개) + 월 RANGE 1개(고객월통계 201001~202712 216개), 각 DEFAULT 1 → 하위 369개 실측 일치. 미파티션 대용량(고객동의내역 1천만·고객연락처상세 8백만·실명인증내역 6백만 등)은 PK 에 시점 키가 없거나 현재 상태 조회 위주 — P1 결정 메모 기준(7백만 이상 + 시점 키) 일관 적용 확인 | 통과 |
| Q13 | 반정규화 | 칼럼마다 원천·사유 | 1건(고객민원내역.상담일시 ← 고객상담내역) — 파티션 PK 1개 파티션 조회로 한정, 실측 EXPLAIN 에서 `ptl_cus_cust_cnsl_l_p2020` 단일 파티션 Index Scan 확인 | 통과 |
| Q14 | 시스템 칼럼(D7) | JSON 에 없음, DDL 맨 끝 `lst_mddtm`·`lst_mdfr_id`·`lst_rgdtm`·`lst_rgtr_id` 순 | JSON 0건, DB 실측 30/30 순서 일치, 칼럼 431 = 311 + 30×4 | 통과 |
| Q15 | FK 제약(D6)·적재 순서(D14) | DDL 에 FK 없음, tables = PK·인덱스 없음 | FK 제약 0(실측). 일반 테이블 PK = 유일 인덱스 선생성 후 `USING INDEX`, 파티션 테이블 PK = `ADD CONSTRAINT … PRIMARY KEY`(파티션 테이블은 USING INDEX 미지원 — 올바른 분기) | 통과 |
| Q16 | 재실행 안전 | `pitel_dev` 스키마 `rv_cus` 에 tables → constraints → tables → constraints | 4회 모두 rc=0(ERROR 0). 결과 테이블 30 · 하위 파티션 369 · DEFAULT 9 · PK 30 · 인덱스 56(=PK 30 + 보조 26, R1 반영) · FK 0 · 무효 인덱스 0. 검증 후 `DROP SCHEMA rv_cus CASCADE` | 통과 |
| Q17 | 문서 = JSON | docs 요약 수치 | 테이블 30·칼럼 311·FK 51·파티션 9·반정규화 1 일치. 인덱스 수는 R1 반영해 25→26 갱신 | 수정 후 통과 |

## 2. 수정 내역 (위임 모드 — 직접 수정)

| # | 결함 | 등급 | 근거 | 수정 |
|---|---|---|---|---|
| R1 | `FK_PTL_CUS_CUST_CVLCPT_L_03`(서비스관리번호 → ORD 회선기본, 수천만 행 부모) 커버 인덱스 없음 — conventions 의 무인덱스 허용 범주(PK 선두·소용량 기준 부모) 어디에도 해당 안 됨. 같은 경로인 고객상담내역은 `X_02 (SVC_MGMT_NO, CNSL_DTM)` 보유 | P2 | CONTEXT D6("FK 칼럼 인덱스는 접근 경로에 따라 설계")·docs 2절 index 규칙 자기 모순 | `X_PTL_CUS_CUST_CVLCPT_L_04 (SVC_MGMT_NO, CVLCPT_ACPT_DTM)` 추가 — JSON idx · `ddl/20_cus_constraints.sql` · docs 5절 표 동시 반영 |
| R2 | `FK_PTL_CUS_BILL_ACNT_H_02`(납부자번호, 부모 550만) 무인덱스인데 사유 누락 | 문서 | 같은 규칙 | 인덱스 대신 사유 기록 : 납부자→청구계정 경로는 청구계정기본 X_02 가 받고 이력은 청구계정번호(PK 선두)로만 읽음. JSON conventions.index · docs 5절 하단에 예외로 명시 |

## 3. 개선 과제(P3 — 통과에 영향 없음)

1. **하위 파티션 인덱스 자동 이름(전 영역 공통)** : 파티션 부모에 PK·인덱스를 만들면 PostgreSQL 이 하위 파티션마다 `<파티션>_pkey`·`<파티션>_<칼럼>_idx` 이름으로 자동 생성한다(CUS 실측 643개). 명명 규칙(§5 v2.5 — `_pkey`·`_idx` 금지)의 대상은 설계 객체(부모)이고 하위 파티션은 테이블 수에서도 빠지므로(D3) 이번엔 grandfathered(사유 : PG 자동 생성, 추적처 = 통합 리뷰 `05_integrate.md`). 규칙 적용이 필요하면 하위 인덱스를 `pk_<파티션>`·`x_<파티션>_NN` 으로 먼저 만들고 `ALTER INDEX … ATTACH PARTITION` 하는 생성기로 바꾼다 — 9개 영역 DDL 생성기 공통 수정이라 통합 단계 안건으로 상신.
2. **이력 파티션의 고객번호 조회 비용** : 이력 6개는 PK 선두(고객번호 등)로 읽을 때 19개 파티션 PK 를 모두 탐색한다(P1 결정 메모가 인정한 비용). 적재 후 dbms.pi 실행계획에서 고객 화면 응답이 나쁘면 해당 이력만 파티션 해제 검토 — 진단 교재 후보로 유지해도 무방.

## 4. 판정

- 테이블 30 · 칼럼 311 · 보조 인덱스 26 · FK 정의 51 · 파티션 9(하위 369) · 반정규화 1 · P1 0 · P2 1(수정 완료) · 문서 보완 1 · P3 2.
- **승인(FIXED)** — CUS DDL 은 적재(D14) 대상으로 확정.
