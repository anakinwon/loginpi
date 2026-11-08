# 05 물리 관문 — 수납(INV)

> 2026-11-07 · masteragent_da_coordinator(물리·성능 관문) · 마스터 위임 자동 승인 모드
> 대상 : `model/physical/INV.json` · `ddl/50_inv_tables.sql` · `ddl/50_inv_constraints.sql` · `docs/05_physical_INV.md`
> 대조 : `model/logical/*.json`(7) · `model/std/{domains,terms}.json` · `model/physical/{PRD,CUS,ORD,PAY,COL}.json`(PRM 물리 미작성 → 논리 PK 로 대조)
> 점검기 : `node tools/review_phy_check.js INV [catalog.json]`(읽기 전용, 이번 관문 신규 — 다른 주제영역에도 그대로 사용 가능)
>
> **판정 : FIXED** — 규칙 위반 0, 성능 보강 3건(FK 조인 인덱스 누락)을 리더가 직접 추가. 최종 점검 오류 0 · DDL 2회 실행 오류 0.

## 1. 점검 결과

점검 범위 = INV 전 객체(테이블 30 · 칼럼 305 · 인덱스 56 · FK 정의 71 · 파티션 테이블 6).

| 항목 | 결과 |
|---|---|
| 이름 규칙 | PK = `PK_<테이블>` 30/30, 인덱스 `X_<테이블>_NN` 연속 순번, FK `FK_<자식>_NN` 연속 순번, DDL 전부 소문자, 직접 정한 이름 최대 33자(63자 이하), 63자 객체는 PostgreSQL 자동 생성 하위 파티션 인덱스뿐 |
| 논리 대비 누락 | 테이블 0 · 칼럼 0(논리 엔터티 30 = 물리 30, 엔터티 ID·테이블명 1:1). 논리에 없는 칼럼 2개(수납배분상세.청구계정번호·자동이체출금결과내역.청구년월)는 전부 `denorm`(물리 추가) 기록 있음 |
| 타입 = 도메인 | 305 칼럼 전부 논리 도메인·표준용어 도메인과 일치, NULL 허용도 논리와 일치 |
| 교차 FK 타입 | 교차 FK(CUS 청구계정·납부자, PAY 청구기본, PRD 요금항목·요금항목분류) 칼럼 타입 = 부모 PK 타입(VARCHAR(20)·VARCHAR(10)) 전부 일치 |
| 파티션 키 ⊂ PK | 6/6 충족. 범위 월 2010-01~2027-12(216)+DEFAULT, 연 2010~2027(18)+DEFAULT — 실측 하위 파티션 510(=2×217+4×19) |
| 대용량 비파티션 | 1천만 행 2개(납부방법기본·자동이체신청내역)만 비파티션 — 현재 상태 기본 테이블·T3 하한, 결정 메모 P2 타당. 수용 |
| 조인 FK 인덱스 | 누락 3건 → 추가(2절). 나머지 미인덱스 FK 는 전부 소형 기준(은행·카드사·수납대행기관·채널·배분우선순위 ≤ 1만) 방향이거나 1만 행 테이블 — 문서 4절 근거대로 수용 |
| 중복 인덱스 | 0(같은 부분 조건에서 다른 인덱스·PK 선두 접두와 겹치는 비부분 인덱스 없음) |
| 반정규화 사유 | 9건 전부 사유·원천·구분(논리 인계 7 / 물리 추가 2) 기록 |
| 시스템 칼럼(D7) | JSON 없음, DDL 30개 테이블 모두 맨 끝 `lst_mddtm·lst_mdfr_id·lst_rgdtm·lst_rgtr_id` 순서(카탈로그 칼럼 번호로 확인) |
| 칼럼 순서(규칙 9) | PK → FK → 일반 어긋남 0 |
| DDL ↔ JSON | 카탈로그(칼럼 순서·타입·NULL, 인덱스 이름·칼럼, PK 제약, 하위 파티션 수) 대조 차이 0 |

## 2. 수정 내역

| # | 대상 | 결함 | 등급 | 조치 |
|---|---|---|---|---|
| R1 | PTL_INV_ATRF_WDRW_REQ_L(3,000만) | FK 납부방법번호 → 납부방법기본 조인 인덱스 없음 — 자동이체 해지·변경 시 진행 중 출금 확인, 납부방법별 월 출금 이력이 연 파티션 19개 전체 탐색 | P2 | `X_PTL_INV_ATRF_WDRW_REQ_L_05 (PAY_MTHD_NO, BILL_YM)` 추가 |
| R2 | PTL_INV_CARD_ATMT_PAY_APRV_L(1,500만) | FK 수납번호 인덱스 없음 — 형제 내역(출금요청 _04·지로 _03·가상계좌입금 _03)은 모두 있는 '수납 → 원천 역추적(수납취소)' 경로 누락 | P2 | `X_PTL_INV_CARD_ATMT_PAY_APRV_L_05 (RCV_NO) WHERE RCV_NO IS NOT NULL` 추가 |
| R3 | PTL_INV_UNIDNTF_DPST_L(50만) | 같은 원인(형제 경로 누락) | P3 | `X_PTL_INV_UNIDNTF_DPST_L_03 (RCV_NO) WHERE RCV_NO IS NOT NULL` 추가 |

반영 파일 : `model/physical/INV.json`(idx 3건, 기존 순번 뒤 이어 붙임) · `ddl/50_inv_constraints.sql`(같은 3건, `IF NOT EXISTS`) · `docs/05_physical_INV.md`(요약 인덱스 수 56, 테이블 표 인덱스 수, 4절 인덱스 표, 8절 검증 수치).

## 3. 수용한 관례(수정 안 함)

- **FK refCols = 부모 논리 PK** : 파티션 부모(수납기본 PK = 수납번호+수납일자, PAY 청구기본 PK = 청구번호+청구년월)를 참조하는 FK 가 논리 PK(수납번호·청구번호)만 참조. PAY·COL 물리도 같은 관례이고 DDL FK 가 없으므로(D6) 물리 유일 제약 불일치가 실행에 영향 없음. 주제영역 하나만 바꾸면 오히려 불일치가 생기므로 전 영역 공통 관례로 유지 — 바꾸려면 통합 관문에서 일괄 처리.
- 수납배분상세 X_02(RCV_NO)는 파티션 키 없는 조회라 217개 로컬 인덱스를 모두 탐색 — 수납취소·수납 상세 조회 빈도가 낮아 수용(문서 4절에 명시됨).

## 4. 검증

- `pitel_dev` 스키마 `rv_inv` : `50_inv_tables.sql` ×2 → 시험 행 2건 → `50_inv_constraints.sql` ×2 — 수정 전·후 각 1회, 종료 코드 0, 오류 0(재실행 안전 확인)
- 파티션 라우팅 : 수납일자 '20261015' → `ptl_inv_rcv_m_p202610`, '20300101' → `ptl_inv_rcv_m_pdflt`
- 수정 후 카탈로그 : 상위 테이블 30 · 상위 인덱스 86(PK 30 + 일반 56) · PK 제약 30 · 하위 파티션 510 · 점검기 오류 0
- 끝난 뒤 `DROP SCHEMA rv_inv CASCADE` — 잔존 0 확인
