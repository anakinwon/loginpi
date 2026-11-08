# 05 물리 관문 리뷰 — PRM 파트너(정산 STL 모듈 주 배치처) (masteragent_da_coordinator · 물리·성능 관문)

> 2026-11-07 · 대상 `model/physical/PRM.json`, `ddl/70_prm_tables.sql`, `ddl/70_prm_constraints.sql`, `docs/05_physical_PRM.md`(생성기 `tools/phy_PRM_build.js`, 작성 subagent_physical_modeler)
> 대조 `model/logical/*.json`(7) · `model/std/{domains,terms}.json` · `model/physical/{PRD,CUS,ORD,PAY,INV,COL}.json`(전 영역 물리 존재)
> 기준 `CONTEXT.md` D6·D7·D14·2절(규칙 8~10)·3절 형식·6절 관문. 마스터 위임 자동 승인 모드.
> 점검 도구 = 저장소 밖 `%TEMP%/pitel05prm/check.js`(PRD 관문 점검기를 PRM·부분 인덱스·파티션 PK 에 맞춰 변형) + 저장소 `tools/{review_phy_check,phy_check,physical_check}.js` 교차 실행 + `pitel_dev` 실제 실행
> **판정 : FIXED** — 설계 결함 0. FK 인덱스 미설계 14건의 근거가 문서에 없어(P3) 생성기에 결정 메모 F8 을 추가하고 재생성. JSON·DDL 은 바이트 동일.

## 1. 점검표 (범위 = 테이블 34 전부 · 칼럼 306 · PK 34 + 보조 인덱스 43 · FK 정의 63 · 파티션 테이블 1)

| # | 항목 | 기준 | 결과 | 판정 |
|---|---|---|---|---|
| Q1 | 이름 규칙 | 테이블 `PTL_PRM_<약어>_<tblSfx>`, PK `PK_<테이블>`, 인덱스 `X_<테이블>_NN` 2자리 연번, FK `FK_<테이블>_NN`, DDL 소문자, 63자 이내 | 위반 0. 최장 식별자 44자. DB 카탈로그 : 최상위 인덱스 = `pk_ptl_prm_*` 34 + `x_ptl_prm_*_NN` 43, 그 외 이름 0 | 통과 |
| Q2 | 논리 대비 누락 | 엔터티 34 ↔ 테이블 34(entId·tblNm 1:1), 속성 ↔ 칼럼 | 누락 테이블 0 · 누락 칼럼 0. 논리에 없는 칼럼 3 = 반정규화 표시 칼럼뿐(Q12). PK 플래그 차이 1 = 파티션 키 `STLM_YM` 을 PK 에 추가(Q11) | 통과 |
| Q3 | 타입 = 도메인 | 칼럼 dataTp = 논리 domNm 의 domains.json 정의, termNm 이 terms.json 에 있고 물리명 일치 | 306/306 일치, 미등재 용어 0 | 통과 |
| Q4 | 칼럼 순서 | PK → FK → 일반, seq 1..n | 위반 0 | 통과 |
| Q5 | 교차 FK 타입(PRM → 타 영역) | FK 칼럼 타입 = 부모 물리 PK 타입, refCols = 부모 PK 전체 | ORD(가입계약기본·해지신청내역)·PRD(상품·단말모델·유심상품·로밍국가)·CUS(지역)·INV(은행) 전부 일치, 부분 참조 0. 파티션 부모 참조 없음 | 통과 |
| Q6 | 교차 FK 타입(타 영역 → PRM) | PRD·ORD·COL 등의 PRM 참조 FK 20건 | 부모 존재·타입 일치·PK 전체 참조 20/20 | 통과 |
| Q7 | FK 정의 완전성 | 논리 fk 속성마다 fks 정의 | 63건, 누락 0 | 통과 |
| Q8 | 조인 FK 인덱스(D6) | FK 칼럼이 PK·인덱스 선두로 커버 | 49/63 커버. 미커버 14건 = 부모가 코드·기준·정책표(지역·은행·로밍국가·조직·상위통신사업자·단말모델·유심상품·상품·수수료정책·장려금정책) → 근거 문서 없음(R1) | 조건부 → 수정 후 통과 |
| Q9 | 중복 인덱스 | 보조 인덱스가 PK·다른 인덱스의 접두와 같음 | 0건 | 통과 |
| Q10 | 저선택도 | 상태 칼럼 단독·선두 인덱스 금지(S3) | 0건 — 재고 상태는 (파트너번호, 상태) 후행만 | 통과 |
| Q11 | 파티션 | 대용량(1천만+) RANGE 2010-01~2027-12 + DEFAULT, 키 ⊂ PK | 1천만+ 테이블 = `PTL_PRM_MGMT_FEE_L`(4천만) 1개뿐 → 연 RANGE(`STLM_YM`) 18개 + DEFAULT, 실측 경계 `'201001'`~`'202801'`, PK (MGMT_FEE_NO, STLM_YM). 900만급(재고·유치수수료·정산상세·정산확정이력) 비파티션은 T2 규모·참조 자식 존재로 타당 | 통과 |
| Q12 | 반정규화 | 칼럼마다 원천·사유 | 3건(정산기본 파트너번호·정산확정일시, 세금계산서 파트너번호) 원천·사유·갱신 부담 기록, 기각 1건 사유 기록. 반정규화 파트너번호 2건에 FK 정의(F6) | 통과 |
| Q13 | 시스템 칼럼(D7) | JSON 에 없음, DDL 맨 끝 `lst_mddtm`·`lst_mdfr_id`·`lst_rgdtm`·`lst_rgtr_id` | JSON 0, DB 실측 34/34 순서 일치 | 통과 |
| Q14 | FK 제약(D6)·적재 순서(D14) | DDL FK 0, tables = PK·인덱스 없음 | FK 제약 0(실측), 일반 테이블 = 유일 인덱스 → `PRIMARY KEY USING INDEX`, 파티션 = `PRIMARY KEY (…)` | 통과 |
| Q15 | DDL = JSON | 칼럼·타입·NULL·인덱스 칼럼 순서·부분 인덱스 WHERE | 34 테이블 일치, CREATE INDEX 문 76 = 일반 테이블 PK 유일 인덱스 33 + 보조 43(파티션 PK 1개는 `ALTER TABLE … PRIMARY KEY` 로 생성) | 통과 |
| Q16 | 재실행 안전 | `pitel_dev` 스키마 `rv_prm` 에 tables → constraints 2회씩 | 4회 모두 rc=0. 결과 테이블 34 · 하위 파티션 19 · PK 34 · FK 0 · 칼럼 442(=306+34×4) · 주석 476(=34+442) · 무효 인덱스 0. 검증 후 `DROP SCHEMA rv_prm CASCADE` | 통과 |
| Q17 | 문서 = JSON | docs 요약 수치(테이블 34·인덱스 43·FK 63·파티션 1·행 합계 122,054,500) | 일치 | 통과 |

참고 — 저장소 점검기 오탐 : `phy_check.js` 의 "테이블명 ≠ 논리 phyNm"(22건)은 논리 `tblNm` 이 정본인데 `phyNm` 과 비교한 것, "파티션 없음"(19건)은 DO 루프 생성을 못 읽은 것, `physical_check.js` 의 부분 인덱스 미인식 경고 — 모두 실측(Q11·Q16)으로 반증. 착수 시점 ORD 부모 미존재 4건은 ORD 물리가 같은 시간대에 `_M`·`_L` 규칙으로 교정돼 해소(재대조 일치).

## 2. 결함·조치

| # | 등급 | 결함 | 근거 | 조치 |
|---|---|---|---|---|
| R1 | P3 | FK 14건이 자식 쪽 선두 인덱스 없이 설계됐는데 문서 원칙 ⑥ 은 "1만 행 기준 테이블 자체의 인덱스 생략"만 다뤄, 대형 자식(관리수수료 4천만·유치수수료 900만·재고 900만 등) → 기준표 FK 의 미설계 근거가 없음 | CONTEXT D6 "FK 칼럼 인덱스는 접근 경로에 따라 설계" — 생략도 사유 기록 대상 | 생성기에 결정 메모 **F8** 추가 : 조인 방향이 자식→부모(부모 PK)뿐, 역조회는 정책 영향 분석 월 배치, DDL FK 없어 부모 변경 시 잠금 스캔 없음, 모델별 재고는 유통점 조건과 함께 X_01 로 처리. `node tools/phy_PRM_build.js` 재생성 → JSON·DDL 바이트 동일, docs 7절 1행 추가 |

## 3. 개선 과제(P3 — 통과 영향 없음)

1. **파티션 하위 인덱스 자동 이름** : PostgreSQL 이 하위 파티션에 `ptl_prm_mgmt_fee_l_p2010_pkey`·`…_agnc_no_stlm_ym_idx` 를 자동 부여 — 정본 §5 의 `_pkey` 금지는 설계 객체 기준이라 위반으로 보지 않으나, DB 전수 스캔에서 걸린다. PAY·INV·COL 파티션 테이블도 같은 원인 → 통합 관문에서 일괄 결정(전수조사 쿼리 하위 파티션 제외 조건 또는 하위 인덱스 선생성·ATTACH 방식).
2. **`X_PTL_PRM_MGMT_FEE_L_02`(SBSC_CTRT_NO)** : 파티션 키 없는 조회라 19개 하위 인덱스를 모두 훑는다. 계약별 관리수수료 이력은 해지 정산 때만 쓰여 허용, 데이터 적재 뒤 실행계획 확인.
3. **`X_PTL_PRM_ROAM_BZMN_M_01`(TADIG_CD)** 비유일 : 실무상 사업자당 유일이지만 S12 형식 함정 데이터 수용을 위해 비유일 유지 — 품질 진단(dbms.pi) 교재 후보.

## 4. 판정

- 테이블 34(STL 19) · 칼럼 306 · 보조 인덱스 43 · FK 정의 63 · 파티션 1(하위 19) · 반정규화 3 · P1 0 · P2 0 · P3 1(수정 완료) + 개선 3.
- **승인(FIXED)** — PRM DDL 은 적재(D14) 대상으로 확정.

## 5. 수정 파일

- `tools/phy_PRM_build.js` — 결정 메모 F8 1줄
- 재생성 `docs/05_physical_PRM.md`(7절 F8 행 추가) · `model/physical/PRM.json`·`ddl/70_prm_*.sql` 변경 없음(바이트 동일 확인)
