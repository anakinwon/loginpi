# ROADMAP: schema.pi

작성일 2026-10-15 · 요구사항 `PRD.md` · 일정은 단계 순서만 확정, 단계별 착수·완료일은 [TBD : 마스터 확정] · 진행 상태 점검 2026-10-15

## 진행 현황

| 단계 | 내용 | 상태 |
|---|---|---|
| 준비 | Wordict 분석(`requirement/reqst.md`), 설계 질의 결정 D1~D10, PRD v0.1 | ✅ 2026-10-15 |
| 0단계 | 선행 : `@pi/payments` 추출, schema.pi 정의 정정 | 🔶 진행 중(2026-10-15 착수, 브랜치 `feat/pi-payments`) |
| 1단계 | 사이트 골격·로그인·표준사전 이전·확장·승인 | ⬜ 미착수 |
| 2단계 | 과금·일괄 처리·이관 | ⬜ 미착수 |
| 3단계 | 확장(제안서 1단계 잔여 프로그램) | ⬜ 미착수 |

## 0단계 : 선행

- [x] `@pi/payments` 공용 패키지 추출(2026-10-15, `packages/pi-payments` : Pi API·`pi_pymnt` 원장·approve/complete/cancel 팩토리 + `metadata.type` 핸들러 레지스트리) : sitemap.pi `src/app/api/payments/{prepare,approve,cancel,complete}`·`src/lib/payments.ts` 기준, PRD_28 §4 핸들러 레지스트리 계약(`metadata.type`) 적용
- [x] sitemap.pi를 `@pi/payments` 의존으로 전환(2026-10-15, 유형 핸들러 `src/lib/payment-handlers.ts`) : 전환 전후 동치 검사 24건 일치(가짜 Pi API·DB, 응답·Pi 호출·DB 작업 기록 바이트 동일), `tsc --noEmit`·`pnpm build` 통과
- [ ] sitemap.pi 결제 1건 회귀 확인(Pi Browser 실기기, 스테이징 배포 후) [확인중 : 마스터 실기기]
- [x] `packages/pi-db/sql/010_pi_pymnt.sql` 결제 원장 공용 DDL : 기존 작성 확인(2026-10-11 마스터 승인, DA 사후 리뷰 대상), schema.pi는 그대로 승계
- [x] `sitemap/sites.json` schema.pi 항목 정정(ctgr TOOL, planCd PRM1 유지 : PRD §10 #5, 2026-10-15)
- [x] `sites.json` preset 유지 확정(EDU, 2026-10-15 마스터)
- [ ] `docs/PRD_27_PI_FACTORY.md` schema.pi 정의 정정
- [ ] 메타시스템 제안서 v0.7과 본 PRD 관계 정리(PRD §10 #6)
- 완료 기준 : sitemap.pi 결제 회귀 통과, `pnpm build` 통과

## 1단계 : 사이트 골격·표준사전

- [ ] 사이트 앱 생성 `sitemap/schema.pi/`(`@site/schema`, sitemap.pi 구조 준용 : `next.config.ts`·`src/env`·next-intl·CSP), 개발 포트 확정(PRD §10 #4)
- [ ] Supabase `pi-nonprod`에 `schema_dev`·`schema_stg` 스키마, `scripts/db-migrate.mjs --app schema --tier dev|stg` 적용
- [ ] 로그인 : `@pi/auth` 연동(Pi SDK + Google 연동, R1~R7), `sys_user`·연동 테이블 baseline 승계
- [ ] DDL : 표준분류체계·멤버·단어 관계·도메인그룹·용어 구성·타입·약어 신규, `std_dic`·`std_dom`·`std_term`·`approval_queue`·`std_audit_log` 이전·확장(da-ddl-guard 통과, da-governance-expert 검토)
- [ ] 기준 데이터 적재 : DA# SQLite의 DBMS 29종·논리 데이터타입·DBMS별 데이터타입 520건
- [ ] 화면·API : 분류체계 선택·관리·멤버, 표준 조회·동의어 조회, 단어·도메인·용어 등록·수정(중복 검사·도메인명 자동생성·단어 분해), 승인, 변경 이력, 설정 3종
- [ ] 업무 규칙 테스트(PRD §9-2)
- [ ] Vercel 프로젝트 생성·스테이징 배포, kisa-web-security-auditor 점검
- [ ] cafe.pi `/admin/std` 존치 여부 결정(PRD §10 #2)
- 완료 기준 : PRD §9 1~4·6, 로그인 Pi Browser 실기기 확인

## 2단계 : 과금·일괄 처리·이관

- [ ] 요금 설계 : 체험기간·기간 이용권·과금 단위(pricing-promo-manager, PRD §10 #1)
- [ ] `fee_plan`(요금제)·이용권 DDL(schema.pi 사이트 SQL, da-ddl-guard 통과)
- [ ] 이용권 테이블·만료 검사·쓰기 차단, 이용권 화면
- [ ] `@pi/payments` 연동 결제(Pi 직접 표기, 서버 정가 재계산), pi-mainnet-listing-auditor 점검
- [ ] 엑셀 일괄등록(단어·도메인·용어 : 중복·정합성·행 단위 오류), 단어집·용어집·도메인집 출력
- [ ] 가져오기 : DA# SQLite 표준 데이터, Wordict 엑셀 출력 양식(reqst.md 부록 B 열 정의)
- 완료 기준 : PRD §9 전 항목, 결제 1건 Pi Browser 실기기 확인, Wordict 엑셀 왕복 손실 0건

## 3단계 : 확장

- [ ] 표준코드(reqst.md FR-14 = 제안서 P04)
- [ ] 제안서 1단계 잔여 프로그램(PRD §2.3 : P08·P09·P10·P12·P13·P15·P16·P17·P18·P19·P23·P25) 우선순위 결정 후 순차 추가
- [ ] 자동 갱신 구독(Pi SDK 계약 호출 공식 지원 이후)
- [ ] 운영 Supabase 프로젝트·도메인 `schema.pi` 연결

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-15 | 최초 작성 |
| 2026-10-15 | 0단계 착수 : `@pi/payments` 추출·sitemap.pi 전환·sites.json ctgr 정정 |
