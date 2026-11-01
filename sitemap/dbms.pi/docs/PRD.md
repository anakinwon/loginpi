# PRD: dbms.pi

> 버전 v0.2(마스터 결정 반영 초안) · 작성 2026-11-01 · `node scripts/tenant-env.mjs new` 생성 후 결정 2건 반영 — [TBD] 를 채워 v1.0 확정 후 앱 코드 착수
> 상위 플랜 : [PRD_28 멀티사이트](../../../docs/PRD_28_PI_MULTISITE.md) §8 · 데이터 플랫폼 7단계·앱 경계 : [schema.pi MASTER_ROADMAP](../../schema.pi/docs/MASTER_ROADMAP.md) §3-10 · 사업 근거 : [PRD_27](../../../docs/PRD_27_PI_FACTORY.md) 사이트 표 · 할 일 : [TODO 목록](../../multitenant_create_TODO-List.md)

## 1. 개요 (sitemap/sites.json)

| 항목 | 값 |
|---|---|
| 도메인 | dbms.pi |
| 카테고리 · 프리셋 | EDU · EDU |
| 웨이브 | W4 — **선착수 예외(마스터 2026-11-01, W4 게이트 M3 완료·W3 회고 전, seminar.pi 선례)** |
| 요금제(디렉터리 버블) | PRM1 |
| 보류 플래그 | 없음 |
| 로컬 포트 | 3004 |
| 한 줄 정의 | 담은 데이터를 **DB 엔진이 어떻게 빠르고 안전하게 돌리는지** 다루는 DBA·SQLP 작업 앱 — schema.pi(설계·DAP)의 짝 |

## 2. 핵심 가치 (절대 불가침)

1. Pi Browser 에서 Pi 계정으로 로그인할 수 있어야 한다.
2. Pi Browser 에서 Pi 로 결제할 수 있어야 한다.
3. **설계 정본은 schema.pi 하나** — 표준·모델·DBMS 프로파일·DB 접속 정보는 schema.pi 가 단일 출처이고 dbms.pi 는 연결 API 로 읽기만 한다(복제 금지, MASTER_ROADMAP §3-10).

## 3. 공통 규칙 — 상속(복제 금지)

- 등재 가드레일 9개 : PRD_28 §1.1 (사이트 간 데이터 교차 0 · 거래는 Pi만(Bean·토큰 어휘 금지) · 교차 프로모션 금지 · 템플릿 그대로 제출 금지 · 순차 제출)
- 구축 결함 재발 방지 R-P0~P6 : 루트 CLAUDE.md · 원장 [BUILD_DEFECTS](../../../docs/BUILD_DEFECTS.md) 1절 신규 시스템 체크리스트
- 로그인 3경로 : [LOGIN_PLAYBOOK](../../../docs/LOGIN_PLAYBOOK.md) — Google 연동은 마스터 예외 승인 사이트만
- 환경변수 : [ENV_GUIDE](../../../docs/ENV_GUIDE.md)

## 4. 로그인 방식

**Pi + Google 연동(예외, 마스터 2026-11-01)** — DBA 작업은 데스크톱 위주라 일반 브라우저 로그인이 필요. schema.pi 와 같은 방식(Pi Browser 에서 발급한 6자리 연동 코드로 Google 계정 결합, Google 단독 계정 생성 없음). PRD_28 §1.1-2·LOGIN_PLAYBOOK 예외 목록에 dbms.pi 등재 필요(schema.pi 등재도 함께 [확인중 : 마스터]).
계정은 사이트별 별도(사이트별 UUID, SSO·사이트 간 사용자 대조 없음 — PRD_28 §1.1-1).

## 5. schema.pi 연결 방식 — 별도 DB + 연결 API (마스터 2026-11-01, 선택지 B)

| 항목 | 결정 |
|---|---|
| DB | dbms.pi 전용(비운영 `dbms_dev`·`dbms_stg`, 운영 dbms.pi 전용 Supabase). schema.pi DB 를 직접 읽지 않는다 |
| 연결 | schema.pi 가 서버 간 연결 API 를 연다 — dbms.pi 서버만 호출(공유 서명 키 [TBD : env 이름], 브라우저 직접 호출 금지) |
| 읽는 것 | 분류체계(작업 단위)·DBMS 프로파일·타입 매핑(`sql/024` 정본)·DB 접속 목록(이름·DBMS·호스트 표시용만) |
| 접속 비밀 | **복호화는 schema.pi 한 곳에서만** — 비밀번호(`mdl_db_conn`, `DB_PROFILE_KEY` 봉인)는 API 로 내보내지 않는다. 대상 DB 에 대한 SQL 실행(실행계획·통계 조회)은 schema.pi 가 대신 실행하고 결과만 돌려준다(권장안, [확인중 : 1차 설계]) |
| 권한 | dbms.pi 사용자는 schema.pi 계정과 대조하지 않는다 → 연결 API 는 "dbms.pi 서버" 단위로 허가, 분류체계 접근 범위는 [확인중 : 마스터 — 분류체계 초대 방식] |

## 6. 기능 요구사항

| ID | 기능 | 우선순위 | 비고 |
|---|---|---|---|
| F-01 | Pi 로그인(@pi/auth) + Google 연동 코드 | P0 | 공용 패키지 배선만 |
| F-02 | schema.pi 연결 API — 분류체계·DBMS 프로파일·접속 목록 읽기 | P0 | schema.pi 쪽 API 추가 포함 |
| F-03 | 실행계획·성능 분석 — SQL 의 EXPLAIN(ANALYZE 선택)·느린 쿼리·테이블/인덱스 통계(PiAnal P35~P39 일부) | P1 | 대상 DB 실행은 schema.pi 대리 실행(5절). 현재 schema.pi SQL 편집기에는 실행계획 기능이 없다 |
| F-04 | 모니터링 이전 — schema.pi 임시 배치(`/areas/[id]/monitor`, sql/068~076, 약 3,500행)를 dbms.pi 로 | P2 | 수집 주소(`MON_INGEST_URL`, 현재 schem.vercel.app)를 보내는 모든 앱(cafe·sitemap·seminar·schema)에서 함께 변경(R-P0), 이력 데이터 이전 방식 [TBD] |
| F-05 | 결제(Pi U2A, @pi/payments) — 이용권 | P1 | 8절 |
| F-06 | 5~7단계 실행 엔진 — PiMig 실행·모니터, PiCDC·PipeLine, 레이크 저장·성능 | P3 | MASTER_ROADMAP §4.5~4.7, 실행 위치 [확인중 : 5단계 설계 시] |

## 7. 화면

첫 출시(Phase 1) — 화면 수 최소화 :
1. 홈(소개·로그인)
2. 연결 — schema.pi 분류체계·접속 목록(읽기)
3. 실행계획 — SQL 입력 → 대상 접속 선택 → 계획 트리·비용 표시(F-03)
4. 결제(이용권)

## 8. 데이터

- DB : 비운영 = pi-nonprod 프로젝트 `dbms_dev`·`dbms_stg` 스키마 / 운영 = dbms.pi 전용 Supabase 프로젝트 `public`
- 마이그레이션 : `packages/pi-db/sql` baseline + `sitemap/dbms.pi/sql/001_dbms_*.sql` → `node scripts/db-migrate.mjs --app dbms --tier dev|stg|prod`
- 명명 : DA 표준(docs/da/데이터표준규칙.md), 시스템 칼럼 4개·논리삭제
- 1차 테이블(초안) : 실행계획 분석 이력(SQL 해시·대상 접속 참조·계획 JSON·비용·소요), 연결 API 호출 이력 — 접속 비밀은 저장하지 않음

## 9. 수익 모델

[TBD : 마스터] — 거래는 Pi만. 초안 : schema.pi 와 같은 기간 이용권(체험 → 월 이용권), 원화는 표시용·결제는 Pi 금액(전 Pi 앱 원칙)

## 10. 확인 필요

| # | 질문 | 담당 | 상태 |
|---|---|---|---|
| 1 | 연결 API 의 분류체계 접근 범위 — dbms.pi 사용자가 어느 분류체계를 볼 수 있나(초대 코드·schema.pi 측 승인 등) | 마스터 | [확인중] |
| 2 | 대상 DB SQL 대리 실행(schema.pi)으로 갈지, 실행 전용 경로를 따로 둘지 | 서비스 설계 → 마스터 | [확인중] |
| 3 | 수익 모델·이용권 가격 | 마스터 | [확인중] |
| 4 | 모니터링 이전 시점(F-04)과 기존 이력 데이터 처리 | 마스터 | [확인중] |
| 5 | `Pi` 접두·`.pi` 이름 상표 점검(MASTER_ROADMAP §8-2) — 앱 생성 전 pi-mainnet-listing-auditor | 서비스 | [확인중] |

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-11-01 | 골격 생성(tenant-env.mjs new) |
| 2026-11-01 | v0.2 — 마스터 결정 2건 반영(연결 = 별도 DB + schema.pi 연결 API, 로그인 = Pi + Google 연동 예외), W4 선착수 예외, 한 줄 정의·핵심 가치 3·기능 F-01~F-06·화면·확인 필요 5건 |
