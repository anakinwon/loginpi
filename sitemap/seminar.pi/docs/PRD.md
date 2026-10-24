# PRD: seminar.pi

> 버전 v0.1(골격) · 작성 2026-10-24 · `node scripts/tenant-env.mjs new` 생성 — [TBD] 를 채워 v1.0 확정 후 앱 코드 착수
> 상위 플랜 : [PRD_28 멀티사이트](../../../docs/PRD_28_PI_MULTISITE.md) §8 · 사업 근거 : [PRD_27](../../../docs/PRD_27_PI_FACTORY.md) 사이트 표 · 할 일 : [TODO 목록](../../multitenant_create_TODO-List.md)

## 1. 개요 (sitemap/sites.json)

| 항목 | 값 |
|---|---|
| 도메인 | seminar.pi |
| 카테고리 · 프리셋 | COMMUNITY · COMMUNITY |
| 웨이브 | W3 — 선착수 예외(마스터 2026-10-24, W2 회고 전) |
| 요금제(디렉터리 버블) | PRM2 |
| 보류 플래그 | 없음 |
| 한 줄 정의 | Pi 커뮤니티 **비디오 웨비나** — 개최자가 세미나를 열고 참가자가 Pi 로 입장해 실시간 화상으로 참여한다(PRD_27 사이트 표 seminar.pi) |

## 2. 핵심 가치 (절대 불가침)

1. Pi Browser 에서 Pi 계정으로 로그인할 수 있어야 한다.
2. Pi Browser 에서 Pi 로 결제할 수 있어야 한다.
3. 개최자가 세미나를 열고, 참가자가 Pi Browser 안에서 실시간 화상 세미나에 들어갈 수 있어야 한다.

## 3. 공통 규칙 — 상속(복제 금지)

- 등재 가드레일 9개 : PRD_28 §1.1 (사이트 간 데이터 교차 0 · 거래는 Pi만(Bean·토큰 어휘 금지) · 교차 프로모션 금지 · 템플릿 그대로 제출 금지 · 순차 제출)
- 구축 결함 재발 방지 R-P0~P6 : 루트 CLAUDE.md · 원장 [BUILD_DEFECTS](../../../docs/BUILD_DEFECTS.md) 1절 신규 시스템 체크리스트
- 로그인 3경로 : [LOGIN_PLAYBOOK](../../../docs/LOGIN_PLAYBOOK.md) — Google 연동은 마스터 예외 승인 사이트만
- 환경변수 : [ENV_GUIDE](../../../docs/ENV_GUIDE.md)

## 4. 로그인 방식

**Pi + Google 연동 (마스터 예외 2026-10-24)** — sitemap.pi 와 같은 방식(LOGIN_PLAYBOOK 경로 ①②③).

- Google 만으로 신규 계정 생성 금지 — Pi 계정 연동이 전제, 연동 코드는 Pi Browser 로그인 사용자만 발급(sitemap.pi `sql/003` 기준)
- 메인넷 등재 A-4(Pi 외 로그인) 리스크 — 제출 전 pi-mainnet-listing-auditor 재점검 [TBD]

## 5. 기능 요구사항 (초안 — 9절 확정 후 v1.0)

| ID | 기능 | 우선순위 | 비고 |
|---|---|---|---|
| F-01 | Pi 로그인(@pi/auth) + Google 연동 | P0 | 공용 패키지 배선만 |
| F-02 | 세미나 개설(제목·일시·정원·입장료) | P0 | 개최자 |
| F-03 | 세미나 목록·상세 | P0 | 서버 페이지네이션(데이터 패칭 표준 ①) |
| F-04 | Pi 입장 결제(U2A) | P0 | `pi_pymnt`(@pi/db baseline 010) · 서버 금액 재검증 |
| F-05 | 실시간 화상 룸 입장 | P0 | 자체 미디어 서버(DECISION_01 7절) — S0~S4 단계 |
| F-06 | 개최자 수익 정산(A2U) | P1 | 수수료율 9절 #3 |
| F-07 | VOD 다시보기 | P2 | R3 — 녹화 저장소 9절 #5 |

## 6. 화면

[TBD] — 초안 : 목록 · 상세(입장 결제) · 화상 룸 · 개최(작성) · 내 세미나(개최·참가) 5화면. 9절 #2 첫 출시 범위로 확정

## 7. 데이터

- DB : 비운영 = pi-nonprod 프로젝트 `seminar_dev`·`seminar_stg` 스키마 / 운영 = seminar.pi 전용 Supabase 프로젝트 `public`
- 마이그레이션 : `packages/pi-db/sql` baseline + `sitemap/seminar.pi/sql/001_seminar_*.sql` → `node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod`
- 명명 : DA 표준(docs/da/데이터표준규칙.md), 시스템 칼럼 4개·논리삭제

## 8. 수익 모델

거래는 Pi만(Bean·토큰 어휘 금지). 근거 PRD_27 사이트 표 seminar.pi :

| 코드 | 수익원 | 구조 |
|---|---|---|
| R1 | 유료 웨비나 입장료 수수료 | 입장료는 개최자 수익, 플랫폼은 수수료만(A2U 정산) |
| R2 | 룸 프리미엄 개설료 | 정원·시간·기능 확장 [TBD] |
| R3 | VOD 다시보기 구독 | [TBD] |

## 9. 확인 필요

| # | 질문 | 담당 | 상태 |
|---|---|---|---|
| 1 | 화상 방식 — **결정(2026-10-24) : 자체 구축, 영상 중계 엔진(SFU)까지 직접** — [DECISION_01_VIDEO](DECISION_01_VIDEO.md) 7절(안전 원칙 S-1 암호 계층은 검증 라이브러리·S-2 REA 합법 범위). 남은 결정 : 안전 원칙 S-1·S-2 동의(범위 축소)·언어·호스팅·코드 위치 | 마스터 | 결정됨 · 세부 [확인중 : 마스터] |
| 2 | 첫 출시 범위 — 무료 세미나만 / 유료 입장(R1) 포함 | 마스터 | [확인중 : 마스터] |
| 3 | 플랫폼 수수료율·정산 주기(A2U) | 마스터 | [확인중 : 마스터] |
| 4 | 세미나 정원·동시 접속 상한 | 마스터 | [확인중 : 마스터] |
| 5 | VOD 녹화 저장소·보관 기간(R3, P2) | 마스터 | [확인중 : 마스터] |
| 6 | Google 연동 예외의 등재 A-4 영향 | pi-mainnet-listing-auditor | [확인중 : pi-mainnet-listing-auditor] |
| 7 | 교육 공통 모듈과의 경계 — PRD_27 은 seminar 를 웨비나·강사 정산 공통 모듈(7개 사이트 재사용) 대상으로 기록. F-02(개설)·F-06(정산)을 공용 패키지로 만들지 여부 | 마스터 | [확인중 : 마스터] |

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-24 | 골격 생성(tenant-env.mjs new) |
| 2026-10-24 | 화상 방식 결정 반영 — 자체 구축(엔진까지), 9절 #1·F-05 |
| 2026-10-24 | 1차 보강 — 한 줄 정의·핵심 가치 3·로그인(Google 연동 예외)·기능 초안 F-01~07·수익 R1~R3·확인 질문 7 (근거 PRD_27·PRD_28) |
