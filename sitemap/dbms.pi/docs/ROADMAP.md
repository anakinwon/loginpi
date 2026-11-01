# ROADMAP: dbms.pi

> 작성일 2026-11-01 · 요구사항 `PRD.md`(5~7단계 = 11절) · 선행 교훈 `TROUBLESHOOT.md` 1절 · 공통 단계 정본 [TODO 목록](../../multitenant_create_TODO-List.md) · 상위 7단계 [MASTER_ROADMAP](../../schema.pi/docs/MASTER_ROADMAP.md)
> **일정 원칙** : 순서·관문은 확정안, 착수일·완료일은 [TBD : 마스터]. 아래 작업일은 **추정**이며 근거는 schema.pi 2~4단계 1차(ModelPi·PiErd·DDL 실행·SQL 편집기)를 2026-10-17~10-21 의 5 작업일에 만든 실측이다. 고객 대기(포털·DB·Vercel·실기기·심사)는 작업일에 넣지 않았고, Phase 가 끝날 때마다 실측으로 보정한다.
> ⚠ 근거 실측은 DDL·화면 위주라 **행 이동 엔진(Phase 4·5 의 워커·인계·값 변환)에는 낙관적**이다 — Phase 4·5 는 근거 부족, **Phase 3 종료 후 재산정**.

## 진행률 요약

| Phase | 이름 | 7단계 대응 | 추정 작업일 | 상태 |
|---|---|---|---|---|
| 0 | 선결(결정·환경·포털·DB) | — | 1 + 고객 대기 | **진행중** |
| 1 | MVP — 로그인·schema.pi 연결 API·실행계획·결제 | 4단계 경계(F-01~F-03·F-05) | 5.5 | 대기 — PRD v1.0 확정 후 |
| 2 | 등재 — A-1~A-7·Pi Browser 실기기 | — | 2 + 심사 대기 | 대기 |
| 3 | 성능 모니터 + 모니터링 이전 | **7단계 일부**(ANL-R02~R05·R09) + F-04 | 6 + 수집 관찰 7일 | 대기 |
| 4 | PiMig 이행 실행 | **5단계** | 11 (+ schema.pi 선행 5) — 재산정 대상 | 대기 |
| 5 | PiCDC · PipeLine | **6단계** | 10 — 재산정 대상 | 대기 |
| 6 | PiAnal 레이크·AI 튜닝·대시보드 | **7단계 나머지**(ANL-R01·R06~R08) | 11 | 대기 |

**Phase ↔ 기능 트리(PRD 12절, 2026-11-01)** — 작업일 추정은 기존 범위 기준이며 ★ 신규 중분류는 미포함(채택 시 재산정)

| Phase | 중분류 |
|---|---|
| 1 | 1-1 연결 API · 1-2 대리 실행 · 1-4 접속 상태판★(미산정) · 2-1 실행계획 뷰어(F-03 기본) · 결제(F-05) |
| 3 | 3-1~3-5 성능 관측 · 2-1 GENERIC_PLAN(ANL-R04) · 4-1~4-4 모니터링 이전(4-3 = P44 알림 앞당김) · 5-1·5-2(schema.pi 선행 PHY-3·PHY-4 — dbms 는 수집 지원·결과 연계) · 2-3 안티패턴★ · 9-1·9-2★(채택 시) |
| 4 | 1-3 워커 에이전트 · 6-1~6-4 PiMig · 5-3 DDL 적용 대조★ · 5-4 인덱스 효과 측정★ · 9-3★(채택 시) |
| 5 | 7-1~7-4 PiCDC·PipeLine · 9-4 복제·DR★(채택 시) |
| 6 | 8-1~8-3 레이크·대시보드 · 2-4 AI 튜닝 · 2-2 계획 비교★(P43) |
| 2 이후 | 10-1~10-3 DBA 학습★(채택·범위 = PRD 10절 #13·#14) |

합계 추정 약 46.5 작업일(schema.pi 선행 5일 별도). 7단계의 성능 부분을 Phase 3 으로 앞당긴 이유 : 레이크와 무관하고(PRD 11.3 ANL-R02), 실행계획(F-03)과 같은 접속·권한 기반을 쓰며, 이행·파이프라인 검증 때 대상 DB 성능을 재는 도구가 먼저 필요하다.

```
Phase 0 ─▶ 1 MVP ─▶ 2 등재
              │
              └─▶ 3 성능·모니터링 이전 ─▶ 4 PiMig ─▶ 5 PiCDC·PipeLine ─▶ 6 PiAnal
                                           ▲
              schema.pi 선행 : PHY-3 카탈로그 수집 · MIG-1 매핑 정의서 (Phase 3 과 병행)
```

## 공통 관문 (모든 Phase 의 분석 → 설계 → 구축 → 검증)

| 단계 | 산출물 | 관문(통과해야 다음 단계) |
|---|---|---|
| 분석 | 요구 ID 확정(PRD), 데이터 흐름도, PRD 10절 해당 확인 필요 해소 | 마스터 결정 필요 항목 0건 또는 [확인중] 사유·채널 명기 |
| 설계 | DDL 초안(DA 표준·`DA-APPROVED`·da-ddl-guard), API 계약(요청·응답·오류 코드), 실패 경로(R-P5 : 중복·잠금·재시도·타임아웃), **TROUBLESHOOT 1절 해당 영역 점검표** | DA 승인 + 팀장 승인 |
| 구축 | 코드·`sql/NNN`·시험 | `tsc` · `pnpm test` · `pnpm build` · `node .claude/hooks/build-defect-guard.mjs --scan sitemap/dbms.pi/src` 0건(또는 사유) · R-P1~P6 자기 점검 |
| 검증 | 시나리오 결과·실측 수치·원장 | 인증·결제 변경 = Pi Browser 실기기, `docs/BUILD_DEFECTS.md` 2절 dbms.pi 절, 운영 배포 = `Vercel – dbms` 개별 success, 실측 작업일로 이 문서 추정 보정 |

## Phase 0 — 선결

- [x] 설정 한 세트 생성 — `node scripts/tenant-env.mjs new dbms.pi --port 3004` (2026-11-01)
- [x] 결정 2건 — 연결 = 별도 DB + schema.pi 연결 API, 로그인 = Pi + Google 연동 예외(마스터 2026-11-01), W4 선착수 예외 기록(ROADMAP_MULTISITE)
- [x] 5~7단계 요구사항(PRD 11절)·일정(이 문서)·선행 교훈(TROUBLESHOOT 1절) 초안 (2026-11-01)
- [ ] PRD v1.0 확정 — 확인 필요 14건 중 Phase 1 차단 항목 : #1 분류체계 접근 범위 · #2 대리 실행 · #3 수익 · #5 상표 점검 · #12 DBA 역할표
- [ ] 비운영 스키마(`dbms_dev`·`dbms_stg`) 유지 여부 — seminar.pi 406 폐지 결정 적용 확인(PRD §8 점검, TROUBLESHOOT L14)
- [ ] (고객) Pi Developer Portal testnet 앱 등록 · API 키 · 도메인 검증 (ENV_GUIDE 3.2)
- [ ] (고객) pi-nonprod Exposed schemas `dbms_dev`·`dbms_stg` → (서비스) `db-migrate.mjs --app dbms --tier dev`
- [x] (고객) Vercel 프로젝트 `dbms` 생성(Root Directory `sitemap/dbms.pi`, 주소 https://dbmspi.vercel.app) · GitHub 연동(커밋 상태 `Vercel – dbms` 기록 확인) — 2026-11-01
- [x] (서비스) 운영 브랜치 `prod/dbms` 생성(`promote-to-prod.mjs --app dbms`, 2026-11-01)
- [x] (고객) Vercel Production Branch = `prod/dbms` · 환경변수 등록 → `Vercel – dbms: success`(8063c0ac, 2026-11-01)
- [x] (고객) Google OAuth 클라이언트 — 운영 signin 302 → accounts.google.com, redirect_uri `https://dbmspi.vercel.app/api/auth/callback/google` 확인(2026-11-01)
- [x] (서비스) DB 적용 — 전용 Supabase public 에 baseline 2 + sql/001~003 (`db-migrate.mjs --app dbms --tier prod`, DA 조건부 승인 2026-11-01), 재실행 "변경 없음" 확인
- [ ] (고객) Pi Developer Portal 앱 등록 → Pi 로그인·연동 코드 발급 → Google 로그인 + 코드 입력 실기기 확인
- [ ] PRD_28 §1.1-2·LOGIN_PLAYBOOK Google 예외 등재(dbms.pi, schema.pi 함께)

**완료 기준** : PRD v1.0 · Pi 앱 ID · 비운영 DB · 스테이징 URL

## Phase 1 — MVP (추정 5.5 작업일)

| 단계 | 할 일 | 작업일 |
|---|---|---|
| 분석 | 연결 API 범위(읽기 대상·대리 실행 여부)·실행계획 화면 흐름 확정, **실행계획 role(스테이징 한정)·PG 버전(GENERIC_PLAN 16+) 확인**(제안서 P39) | 0.5 |
| 설계 | schema.pi 연결 API 계약(서버 간 서명 키·호출 이력), dbms.pi `sql/001`(사용자·연동 코드·실행계획 이력·결제 baseline), 실패 경로 | 1 |
| 구축 | 앱 골격(sitemap.pi 복제 지점 — TODO 3단계, `regions: icn1` L04, lazy 클라이언트 L16) · F-01 로그인 · F-02 연결 API(schema.pi 쪽 포함) · F-03 실행계획(EXPLAIN FORMAT JSON 트리 — **범위 = schema.pi 자체 DB·스테이징, ANALYZE 없음**, 운영 DB 는 Phase 3 이후) · F-05 결제 · 모니터링 연결(TODO 7단계) | 3 |
| 검증 | 역할별 API 시나리오, `pnpm build`, Pi Browser 실기기 로그인·결제, 원장 | 1 |

**완료 기준** : 스테이징에서 schema.pi 접속 1개를 골라 EXPLAIN 결과 표시 + Pi Browser 실기기 로그인·결제 성공

진행 기록 :
- [x] 앱 골격 1차(2026-11-01, `0a1c87a0`) — seminar.pi 기준(TODO §3 의 sitemap.pi 는 @pi/i18n 표준 이전 문서라 대체), 로그인 3경로·@pi/i18n·워프·프록시·홈. 로컬 build(Google 끔)·tsc·HTTP·360/1440 화면 통과
- [ ] 미결 : `.env.local` Google 키(채움 vs 끔) · sql/001~003 DA 리뷰 후 적용 · 신규 문구 9키 번역 · Google 끈 상태 SessionProvider 콘솔 오류 4건 판정 · Pi Browser 실기기

## Phase 2 — 등재 (추정 2 작업일 + 심사 대기)

- [ ] pi-mainnet-listing-auditor A-1~A-7(Google 연동 예외라 A-4 재점검), 상표 점검(PRD 10절 #5)
- [ ] 순차 제출(PRD_28 §1.1-7), `sites.json` appSts → LIVE

## Phase 3 — 성능 모니터 + 모니터링 이전 (추정 6 작업일 + 수집 관찰 7일)

| 단계 | 할 일 | 작업일 |
|---|---|---|
| 분석 | 수집 대상 결정(PRD 10절 #9), **워커 위치·실행 지시 경로 결정(#6·#2 — 수집 배치를 워커 주기로 돌리려면 여기서 필요)**, 통계 전용 role 발급 가능 여부·`pg_stat_statements` 확인, 모니터링 이전 시점(#4) | 1 |
| 설계 | `prf_*` 6테이블 — 접두사 `prf_`·신규 단어·도메인 `ms` 를 schema.pi 표준 등재(P01·P02 → P20) 선행, 수집 배치를 워커 주기로(L08), 모니터링 수집 주소 이전 계획(모든 앱 `MON_INGEST_URL` 동시 변경, R-P0) | 1 |
| 구축 | ANL-R02 수집 · R03 Top-N·통계·용량 · R04 실행계획 확장 · R05 활동·락 · R09 권한 · P44 임계치 알림(ANL-R07 일부, 4-3), F-04 화면·API 이전(schema.pi 메뉴 제거는 이전 확인 뒤) | 3 |
| 검증 | 7일 수집 → 느린 쿼리 Top-10·미사용 인덱스 산출(제안서 §6 2단계 기준), 누적치 reset 보정 확인 | 1 |

**완료 기준** : 대상 DB 통계 7일 수집 + Top-10·미사용 인덱스 목록, 모든 앱 모니터링이 dbms.pi 로 수집

## Phase 4 — PiMig 이행 실행 (5단계, 추정 11 작업일 + schema.pi 선행 5)

선행(schema.pi, Phase 3 과 병행) : **PHY-3 카탈로그 수집**(`mdl_tbl_hist` 등) · **MIG-1 매핑 정의서**(원천 ↔ 대상 칼럼·변환 규칙·엑셀 왕복) — 둘 다 미구현, 추정 5 작업일

| 단계 | 할 일 | 작업일 |
|---|---|---|
| 분석 | 워커 위치(Phase 3 결정) 반영, 알림 채널(#10)·승인자 역할표(#12) 결정, 샘플 원천·대상 선정·원천 문자셋·LOB·키 없는 테이블 조사(MIG-R09~R11·A6), 대량 기준·처리량 목표 [TBD] | 1 |
| 설계 | 워커 프로토콜(outbound 폴링·작업 임대·하트비트·결과 업로드)·**워커 보안(A10 서명 지시서·범위 토큰·읽기 전용 원천)**, 작업 → 단계 → 청크 체크포인트(A6), 적재 순서 = `mdl_rel` 위상 정렬(L09), CDC 인계 지점(MIG-R08), 검증·롤백 절차, 실행 스냅샷(A4), DDL | 2 |
| 구축 | MIG-R01~R14, 에이전트 확장(schema.pi `agent/` 1.3.0 → 실행 워커, 현 DDL 화이트리스트 밖 DML 경로 신설), 대상 쪽 오류 행 격리(A3)·로그 마스킹(A11) | 6 |
| 검증 | 이행 1회 검증 통과 · 롤백 1회 · **강제 중단 후 재실행 누락·중복 0건(키 기준)** · 시퀀스 재동기화·문자셋 넘침 0건 · 리허설 소요 기록 | 2 |

## Phase 5 — PiCDC · PipeLine (6단계, 추정 10 작업일)

| 단계 | 할 일 | 작업일 |
|---|---|---|
| 분석 | **원천 사전 점검(CDC-R00 : 변경일시 칼럼·갱신 방식·삭제 방식)**, 캡처 방식(폴링 1차·논리 복제, Realtime 은 보조 신호), 복제 권한, Oracle·Tibero 범위(PRD 10절 #8) | 1 |
| 설계 | 워터마크 겹침 창·키 중복 제거(CDC-R02), DAG 정의 형식, 키별 순서 보장, 슬롯 보호(CDC-R06), 스키마 변화 연동(CDC-R05) | 2 |
| 구축 | CDC-R00~R06, PiMig 변환 규칙 재사용, MIG-R08 인계 지점부터 시작 | 5 |
| 검증 | 원천 변경 → 대상 반영 지연 측정, 중단 후 재처리 누락 0건, 긴 트랜잭션 늦은 커밋 회수 시험 | 2 |

## Phase 6 — PiAnal 레이크·AI 튜닝·대시보드 (7단계 나머지, 추정 11 작업일)

| 단계 | 할 일 | 작업일 |
|---|---|---|
| 분석 | 레이크 저장소·행 데이터 위치 결정(PRD 10절 #7 → legal-compliance-advisor), AI 모델·월 토큰 상한·외부 전송 승인(#11) | 2 |
| 설계 | 레이크 3층 구조·표준 적용 규칙(A8), AI 입력 마스킹·출력 zod 스키마, 권고 → 승인 → schema.pi P10 DDL 산출 경로 | 2 |
| 구축 | ANL-R01 · R06(P40~P42) · R07(P43 — P44 알림은 Phase 3 으로 앞당김) · R08 대시보드 | 5 |
| 검증 | 레이크 3층 적재 1회, KPI 5종, 튜닝 권고 1건 적용·효과 측정(측정 없으면 APPLIED 불가) | 2 |

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-11-01 | 골격 생성(tenant-env.mjs new) |
| 2026-11-01 | 결정 2건·W4 선착수 예외 |
| 2026-11-01 | Phase 0~6 재편 — 5~7단계(PiMig·PiCDC·PiAnal)를 Phase 3~6 으로 배치(성능 모니터 앞당김), Phase 별 분석·설계·구축·검증 작업일 추정(근거 schema.pi 2~4단계 1차 실측 5일), 공통 관문, schema.pi 선행 과제(PHY-3·MIG-1) |
| 2026-11-01 | 검수 반영 — Phase 1 실행계획 범위 축소·role 확인 앞당김, 워커 위치 결정 Phase 3 으로, Phase 4·5 재산정 표시, MIG-R08~R14·CDC-R00·A10·A11 배치, 비운영 스키마 점검 |
