# 05 물리 모델 관문 리뷰 — PRD 상품 (masteragent_da_coordinator · 물리·성능 관문)

> 2026-11-07 · 대상 `model/physical/PRD.json`, `ddl/10_prd_tables.sql`, `ddl/10_prd_constraints.sql`, `docs/05_physical_PRD.md`(작성 subagent_physical_modeler) · 대조 `model/logical/PRD.json`·`model/std/{domains,words}.json`·`model/logical/PRM.json`(PRM 물리 미작성)·`model/physical/{CUS,ORD,PAY,INV,COL}.json`
> 기준 `CONTEXT.md` D2·D6·D7·D14·2절(규칙 8~10)·3절 형식·6절 관문. 마스터 위임 자동 승인 모드.
> 점검 도구 = 저장소 밖 `%TEMP%/pitel05prd/check.js`(JSON↔논리↔도메인↔DDL 자동 대조) + `pitel_dev` 실제 실행
> **판정 : APPROVED(수정 없음)** — PRD 소관 결함 0. 교차 영역 인계 1건(ORD 소관)

## 1. 점검표 (점검 범위 = 테이블 30 전부 · 칼럼 244 · 인덱스 PK 30 + 보조 27 · FK 정의 44)

| # | 항목 | 기준 | 결과 | 판정 |
|---|---|---|---|---|
| Q1 | 이름 규칙 | 테이블 `PTL_PRD_<약어>_<접미>`(words.tblSfx : _M·_D·_H·_R·_C), PK `PK_<테이블>`, 인덱스 `X_<테이블>_NN` 2자리 연번, FK `FK_<테이블>_NN`, DDL 소문자, 63자 이내 | 위반 0. 최장 식별자 29자(`x_ptl_prd_rtpln_excs_trf_d_02` 계열) | 통과 |
| Q2 | 논리 대비 누락 | 엔터티 30 ↔ 테이블 30(entId·tblNm 일대일), 속성 ↔ 칼럼 | 누락 테이블 0 · 누락 칼럼 0 · 추가 칼럼 0 · PK·NULL 여부·용어명 불일치 0 | 통과 |
| Q3 | 타입 = 도메인 | 칼럼 dataTp = 논리 속성 domNm 의 domains.json 정의 | 244/244 일치(일자 CHAR(8)·금액 NUMERIC(15)·율 NUMERIC(5,2)·일시 TIMESTAMP 등) | 통과 |
| Q4 | 칼럼 순서 | PK → FK → 일반, seq 1..n 연속 | 위반 0 | 통과 |
| Q5 | 교차 영역 FK 타입(PRD → 타 영역) | FK 칼럼 타입 = 부모 PK 타입 | 2건(`FK_PTL_PRD_ADSVC_M_02`→PRM 콘텐츠제공사, `FK_PTL_PRD_DSCNT_PROD_M_04`→PRM 파트너) — PRM 물리 미작성이라 PRM 논리 대조, VARCHAR(20)=번호V20 일치 | 통과(PRM 물리 확정 때 재대조) |
| Q6 | 교차 영역 FK 타입(타 영역 → PRD) | ORD·PAY·INV 의 PRD 참조 FK 27건 타입 | 27/27 타입 일치(코드V20 VARCHAR(20)·코드V10 VARCHAR(10)), 참조 칼럼 = 부모 PK 전체 | 통과. 단 ORD 20건은 부모 테이블명 오기 → 2절 H1 |
| Q7 | FK 정의 완전성 | 논리 fk 속성마다 fks 정의, 부모 PK 전체 참조 | 44건, 누락 0, 부분 참조 0 | 통과 |
| Q8 | FK 칼럼 인덱스(D6) | FK 칼럼이 PK 선두 또는 인덱스 선두로 커버 | 44/44 커버 | 통과 |
| Q9 | 중복 인덱스 | 보조 인덱스 칼럼이 PK·다른 인덱스의 접두와 같으면 중복 | 0건 | 통과 |
| Q10 | 저선택도 | 상태 칼럼 단독 인덱스 금지(S3) | 0건 — 상태는 `X_PTL_PRD_PROD_M_02`(유형, 상태) 후행만 | 통과 |
| Q11 | 파티션 | 대용량(T3·T4) 테이블 RANGE 2010-01~2027-12 + DEFAULT, 파티션 키 ⊂ PK | PRD 는 T1·T2 기준 테이블뿐(최대 공시지원금이력 300만·상품변경이력 200만) → 파티션 대상 없음(P1 결정 메모 타당). 파티션 키 ⊂ PK 점검 대상 0 | 통과 |
| Q12 | 반정규화 | 반정규화 칼럼마다 원천·사유 | 0건, 후보 5건 기각 사유 문서화(docs 6절) — 수천~수만 행 기준표라 정합 비용 > 조회 이득 판단 수용 | 통과 |
| Q13 | 시스템 칼럼(D7) | JSON 에 없음, DDL 맨 끝 `lst_mddtm`·`lst_mdfr_id`·`lst_rgdtm`·`lst_rgtr_id` 순 | JSON 0건, DDL 30/30 순서 일치(information_schema 실측) | 통과 |
| Q14 | FK 제약(D6)·적재 순서(D14) | DDL 에 FK 없음, tables = PK·인덱스 없음, constraints 에 PK·인덱스 | FK 제약 0(실측), tables 파일에 PK·인덱스 0, PK = 유일 인덱스 선생성 후 `USING INDEX` | 통과 |
| Q15 | DDL = JSON | 칼럼·타입·NULL·인덱스 칼럼 순서 | 30 테이블 전부 일치, 인덱스문 57 = PK 30 + 보조 27 | 통과 |
| Q16 | 재실행 안전 | `pitel_dev` 스키마 `rv_prd` 에 tables → constraints 를 2회씩 | 4회 모두 rc=0(오류 0). 결과 테이블 30·인덱스 57·PK 제약 30·FK 0·주석 394(=30+244+120)·무효 인덱스 0. 검증 후 스키마 삭제 | 통과 |
| Q17 | 문서 = JSON | docs 요약 수치(테이블 30·칼럼 244·인덱스 27·FK 44·파티션 0·행 합계) | 일치 | 통과 |

## 2. 교차 영역 인계 (PRD 소관 아님 — 수정하지 않음)

| # | 결함 | 등급 | 근거 | 조치 |
|---|---|---|---|---|
| H1 | `model/physical/ORD.json` 의 PRD 참조 FK 20건 refTbl 이 존재하지 않는 테이블명(`PTL_PRD_PROD_BAS`·`PTL_PRD_USIM_PROD_BAS`·`PTL_PRD_EQP_MDL_BAS`·`PTL_PRD_AGRMT_PROD_BAS`·`PTL_PRD_CMBN_PROD_BAS`·`PTL_PRD_ADSVC_BAS`) — 실제는 `_M`. ORD 자기 테이블도 `_BAS`·`_DTL`·`_HIST`·`_DTLS` 접미로 words.json tblSfx(_M·_D·_H·_L) 위반 | P2(ORD) | CONTEXT 2절 규칙 4(tbl_sfx_txt)·6절 "관계 양끝 존재" | ORD 물리 관문(05_physical_ORD)에서 테이블명·refTbl 일괄 교정. 칼럼·타입은 이미 일치하므로 이름만 바꾸면 된다. PRD 측 변경 불필요 |

## 3. 개선 과제(P3 — 통과에 영향 없음)

1. **PRM 물리 확정 후 재대조** : Q5 의 PRM 부모 2건은 논리 기준 대조. PRM 물리 테이블명(`PTL_PRM_CNTS_PRVD_CO_M`·`PTL_PRM_PRTNR_M`)·PK 타입이 바뀌면 PRD fks 2건을 함께 고친다.
2. **`X_PTL_PRD_PROD_SALE_CHNL_R_01`(SALE_CHNL_TY_CD 단독)** : 채널 유형 값이 수 개라 선택도가 낮다(10만 행). 데이터 생성 후 실행계획에서 쓰이지 않으면 (SALE_CHNL_TY_CD, PROD_CD) 커버링으로 바꾸거나 제거 검토 — dbms.pi 진단 교재 후보로 유지해도 무방.

## 4. 판정

- 테이블 30 · 칼럼 244 · 보조 인덱스 27 · FK 정의 44 · 파티션 0 · 반정규화 0 · P1 0 · P2 0(PRD) · 인계 1(ORD) · P3 2.
- **승인** — PRD DDL 은 적재(D14) 대상으로 확정.
