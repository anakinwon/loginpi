# PRD: seminar.pi

> 버전 **v1.0(확정)** · 작성 2026-10-24 · 확정 2026-10-26 — [TBD] 는 **아소카 결정(마스터 위임 2026-10-26)** 으로 권장 기본값을 채웠다(11절, 마스터 아침 검토 대상)
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

## 5. 기능 요구사항 (v1.0)

| ID | 기능 | 우선순위 | 비고 |
|---|---|---|---|
| F-01 | Pi 로그인(@pi/auth) + Google 연동 | P0 | 공용 패키지 배선만 |
| F-02 | 세미나 개설(제목·일시·정원·입장료) | P0 | 개최자 = **ADMIN 만**(11절 D-1) |
| F-03 | 세미나 목록·상세 | P0 | 서버 페이지네이션(데이터 패칭 표준 ①), 탭 전체·내가 연 것·내가 참가한 것 |
| F-04 | Pi 입장 결제(U2A) | P0 | `pi_pymnt`(@pi/db baseline 010, `pymnt_tp_cd=SMN_ENT`) · DB 함수 `fn_join_smn` 이 결제(본인·COMPLETED·유형·금액·세미나)를 `smn_mst.ent_pi_amt` 로 재검증 |
| F-05 | 실시간 화상 룸 입장 | P0 | 자체 화상 엔진 — [PRD_01](PRD_01_MEDIA_ENGINE.md) M0~M5 |
| F-06 | 개최자 수익 정산(A2U) | P1 | 수수료율 9절 #3 |
| F-07 | VOD 다시보기 | P2 | R3 — 녹화 저장소 9절 #5 |

## 6. 화면

정본 = [UI 설계서 v1.0](ui-design/ui-design.md) 5절. 내 세미나는 목록 탭으로 합쳐 5화면이다.

| # | 화면 | 경로 | 핵심 |
|---|---|---|---|
| S1 | 목록 | `/[locale]` | 탭 전체·내가 연 것·내가 참가한 것, 서버 페이지네이션 |
| S2 | 상세 | `/[locale]/s/[id]` | 버튼 1개 — 무료 "입장" / 유료 "Pi 로 결제하고 입장" |
| S3 | 대기실 | `/[locale]/s/[id]/join` | 미리보기·토글·이름 |
| S4 | 룸 | S3 와 같은 경로(상태 전환) | 무대·하단 바·사이드 패널 |
| S5 | 개최 | `/[locale]/host/new` | 제목·일시·정원·입장료 (ADMIN 만) |

## 7. 데이터

- DB : **Supabase 프로젝트 1개**(seminar 전용, 같은 ref) 안에서 스키마로 tier 를 나눈다 — `public` = prod tier(앱 `SUPABASE_SCHEMA=public`) · `seminar_dev` = dev · `seminar_stg` = stg. [확인중 : 마스터 — 운영 전용 프로젝트 분리 여부]
- 마이그레이션 : `packages/pi-db/sql` baseline + `sitemap/seminar.pi/sql/NNN_*.sql` → `node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod --db-url <Session pooler>` (prod → `public`). `.env.local` 의 Direct 호스트는 IPv6 전용이라 Session pooler 사용(ROADMAP Phase 0)
- 명명 : DA 표준(docs/da/데이터표준규칙.md), 시스템 칼럼 4개·논리삭제
- 세미나 모델 : [`sql/004_seminar_smnr.sql`](../sql/004_seminar_smnr.sql) — 신규 접두사 `smn_`, 신규 표준단어 세미나 `SMN`·참가 `PTC`·입장 `ENT`·개최자 `HST`(아소카 결정, DA 사후 리뷰 — `ENT` 는 행안부 공통표준단어 '기업'과 동음)

| 테이블 | 1행 | 주요 칼럼 |
|---|---|---|
| `smn_mst` | 세미나 1건(`smn_id` = 화상 룸 ID) | `hst_usr_id`→sys_user · `smn_nm` · `start_dtm` · `end_dtm` · `cncl_dtm` · `max_cnt`(기본 30, 1~100) · `ent_pi_amt`(NUMERIC(18,7), 0=무료) · `smn_sts_cd` |
| `smn_ptc` | 참가(입장 등록) 1건 | `ptc_id` · `smn_id`→smn_mst · `usr_id`→sys_user · `pymnt_id`→pi_pymnt(무료 NULL) |

- 인덱스 : `x_smn_mst_01`(시작일시, **예정·진행 중만** 부분 인덱스 — S1 전체 탭 `ORDER BY start_dtm LIMIT` 를 정렬 없이) · `_02`(개최자+시작일시) · `x_smn_ptc_01`(유일 세미나+사용자, 정원 집계) · `_02`(내 참가) · `_03`(유일 결제ID) — 활성행 부분 인덱스
- 입장 등록은 `fn_join_smn(smn_id, usr_id, pymnt_id)` 한 곳 — 세미나 행 잠금 후 판정, 결과 `OK·ALREADY·NOT_FOUND·CLOSED·FULL·PAY_REQUIRED·PAY_INVALID`(R-P5). 유료 approve 단계 정원 확인은 `fn_chk_smn_cap(smn_id, usr_id, pymnt_id)` → `OK·FULL·CLOSED·NOT_FOUND·ALREADY`(11절 D-6)
- 두 함수 `search_path` = 생성 스키마 고정(한 프로젝트 안 다중 스키마라 호출자 경로에 흔들리지 않게)
- FK 유지(PostgREST 임베디드 조인 전제, 루트 CLAUDE.md FK 정책)
- 적용 : dev·stg·prod(`public`) 적용 완료(2026-10-26, 각 2회 실행 멱등 확인) · 롤백 전용 기능 시험 3스키마 전부 통과
- ⚠ 1회성 재설정(2026-10-26) : 004 첫 판(`smn_smnr`·`smn_ptcp`·`fn_join_smn_smnr`)을 표준단어 통일로 같은 파일에서 다시 썼다. `seminar_dev`·`seminar_stg` 는 **행 0건 확인 후** 한 트랜잭션으로 첫 판 객체를 DROP 하고 `schema_migrations` 의 004 1행만 지워 재적용(`public` 은 첫 판 미적용). 이후 004 변경은 새 NNN 파일로

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
| 1 | 화상 방식 — **결정(2026-10-24) : 자체 구축, 영상 중계 엔진(SFU)까지 직접** — [DECISION_01_VIDEO](DECISION_01_VIDEO.md) 7절(안전 원칙 S-1 암호 계층은 검증 라이브러리·S-2 REA 합법 범위). 기준점 10절 확정(S-1·S-2 동의·Go+pion). 남은 결정 : 호스팅 | 마스터 | 결정됨 · 호스팅 [확인중 : 마스터] |
| 2 | 첫 출시 범위 — 무료 세미나만 / 유료 입장(R1) 포함 | 마스터 | **아소카 결정(마스터 위임) : 무료 + 유료 입장(R1) 포함** — 핵심 가치 2(Pi 결제). 자동 환불은 v1.0 제외(11절 D-7) |
| 3 | 플랫폼 수수료율·정산 주기(A2U) | 마스터 | [확인중 : 마스터] |
| 4 | 세미나 정원·동시 접속 상한 | 마스터 | **아소카 결정(마스터 위임) : 기본 30(M4 목표)·최대 100**(11절 D-3) |
| 5 | VOD 녹화 저장소·보관 기간(R3, P2) | 마스터 | [확인중 : 마스터] |
| 6 | Google 연동 예외의 등재 A-4 영향 | pi-mainnet-listing-auditor | [확인중 : pi-mainnet-listing-auditor] |
| 7 | 교육 공통 모듈과의 경계 — PRD_27 은 seminar 를 웨비나·강사 정산 공통 모듈(7개 사이트 재사용) 대상으로 기록. F-02(개설)·F-06(정산)을 공용 패키지로 만들지 여부 | 마스터 | [확인중 : 마스터] |
| 8 | 세션 전 미완료 결제 복구(U7) — Pi `onIncompletePaymentFound` 는 `@pi/auth` 의 인증 부트스트랩(pi-auth-root) 안에서 세션 발급 **전**에 불릴 수 있어, complete·cancel 호출이 401 로 실패하고 결제가 APPROVED 로 남을 수 있다. 인증 부트스트랩은 이번 범위 밖(공용 패키지 변경 금지) — 세션 확보 후 재시도(대기열)를 `@pi/auth` 에 넣을지. 그 전까지 완화 = 다음 approve 의 이전 결제 정리(D-17)·상세 조회 복구(D-16) | 마스터 | [확인중 : 마스터] |

## 10. 화상 엔진 기준점 (마스터 확정 2026-10-24)

| # | 기준 |
|---|---|
| 1 | 참고모델 3개 확정 — **LiveKit · Galène · mediasoup** ([DECISION_02](DECISION_02_REA_TARGET.md)) |
| 2 | 안전 원칙 **S-1·S-2 동의** — 연결·암호 계층은 검증 라이브러리(pion), REA 는 합법 범위 ([DECISION_01](DECISION_01_VIDEO.md) 7.1) |
| 3 | **Galène 으로 처음 짠다** — 같은 Go·pion 위에서 우리 엔진을 처음부터 작성(언어 Go + pion 확정) |
| 4 | **mediasoup 구조로 다듬는다** — Router·Transport·Producer·Consumer 경계 |
| 5 | **LiveKit 과 비교해 품질을 맞춘다** — 같은 망 조건 측정 |

엔진 기획 정본 = [PRD_01_MEDIA_ENGINE](PRD_01_MEDIA_ENGINE.md)(구조·품질 지표·M0~M5).

## 11. v1.0 확정 결정 — 아소카 결정(마스터 위임 2026-10-26)

마스터가 2026-10-26 밤 승인 권한을 위임("권장 사항으로 무조건 진행") — 권장·보수적 값으로 채웠다. **아침 검토 후 뒤집을 수 있다.**

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| D-1 | 개최자 자격(F-02) | **ADMIN 만** — 개최자 역할(USER 개설) 결정 전까지 | UI 13절 #8(발표자 = 관리자만)과 같은 범위, 남용 위험 최소 |
| D-2 | 입장료 | **Pi 단위, 0 = 무료**, 저장 NUMERIC(18,7)(pi_pymnt.pi_amt 와 같은 정밀도) | 결제 원장과 정밀도가 같아야 서버 재검증이 정확히 일치 |
| D-3 | 정원 | **기본 30·최대 100**, 청중(참가 등록)만 셈 | ROADMAP M4 목표 30 |
| D-4 | 상태 | **SCHEDULED → LIVE → ENDED**, 개최자 취소 = **CANCELED** | 최소 4상태. ENDED·CANCELED 는 입장 불가 |
| D-5 | 입장 등록 | 무료 = "입장" 클릭 시 / 유료 = 결제 **COMPLETED** 시 `smn_ptc` 1행 — `fn_join_smn` 이 결제를 본인·COMPLETED·`SMN_ENT`·금액(`ent_pi_amt`)·세미나(meta `smn_id`) 모두 일치할 때만 인정, 아니면 `PAY_INVALID` | 사용자당 세미나 활성 1건(유일 인덱스) |
| D-6 | 정원 경합 | 무료 = `fn_join_smn` 이 세미나 행 잠금 후 판정(FULL). 유료 = **approve 단계 `fn_chk_smn_cap`** 이 같은 행 잠금 아래 [활성 참가 + 10분 안의 APPROVED `SMN_ENT` 결제 점유(자기 결제 제외)] 를 정원과 비교 → OK·FULL·CLOSED. 앱 순서 : pi_pymnt APPROVED 기록 → `fn_chk_smn_cap` → FULL 이면 결제 취소. complete 단계(`fn_join_smn`)는 결제가 유효하면 정원을 다시 막지 않음 | 결제가 끝난 사람을 막으면 환불 경로가 없음. 초과 등록 상한 = 점유 10분을 넘겨 complete 된 결제 수(실무상 0) |
| D-7 | 환불 | **v1.0 자동 환불 없음** — 개최자 취소 시 수동 환불 [TBD : 환불 절차] | A2U 정산(F-06) 전 자동 환불은 위험 |
| D-8 | 룸 ID | **룸 ID = smn_id** | 별도 매핑 불필요 |
| D-9 | 청중 입장권 | 유료 세미나는 **참가 등록이 있어야** 발급, 무료는 클릭 시 등록 후 발급 | UI 12절 M5(입장권 = 결제 확인 후) |
| D-10 | 결제 유형코드 | `pymnt_tp_cd = SMN_ENT`, SDK metadata = `{ type: 'SMN_ENT', smn_id }` | pi_pymnt 유형 분기 + 함수가 meta `smn_id` 로 세미나 일치 검증 |
| D-12 | 이중 결제 인덱스 | `x_pi_pymnt_01` = **(usr_id, meta smn_id)** APPROVED SMN_ENT 부분 유일(sql/006) — `approvedTargetIndexSql` 출력(smn_id 단독)은 세미나당 동시 결제 1명이 되어 쓰지 않음 | 같은 대상 = 사람 × 세미나(fn_chk_smn_cap 사용자당 점유 1개와 같은 단위) |
| D-13 | approve 정원 확인 위치 | `approvePayment`(원장 APPROVED → Pi approve) **뒤** `fn_chk_smn_cap` → OK 아니면 `cancelPayment` | 패키지 흐름에 원장 기록과 Pi approve 사이 끼울 자리 없음. 서명 전이라 취소 가능, 취소 거부 시 초과 1석(D-6 상한과 같은 성격) |
| D-14 | 입장권 게이트 | uuid 방 = 세미나 존재·종료/취소 아님(404·409), 청중은 무료 또는 참가 등록(402), 정원 = max_cnt+1. uuid 아닌 실험실 방 코드는 개발 또는 `LAB_ENABLED=1` 만(R-P6) | D-8·D-9 |
| D-15 | 홈·카드 | 홈 = S1 목록, 제작 현황은 `/progress`(헤더 링크). 카드는 정원만(남은 좌석은 상세) — 목록마다 참가 집계 조회를 피함(R-P3) | UI 설계서 5절 |
| D-11 | 주제영역 접두사 | 신규 `smn_`(세미나) — 테이블 `smn_mst`·`smn_ptc`, 신규 표준단어 SMN·PTC·ENT·HST | DA 표준 2-1 신규 접두사 = DA 승인 필요 → 위임 승인, DA 사후 리뷰 |
| D-16 | 결제 완료 원자화(보안 검토 S1) | complete 는 `completePayment({ finalize })` 의 finalize = **`fn_cmpl_smn_ent`(sql/007)** — 세미나 행 잠금 아래 원장 COMPLETED(본인·SMN_ENT·APPROVED 또는 같은 tx 재호출) + `fn_join_smn` 을 한 트랜잭션. 등록 거부여도 원장 COMPLETED 는 남김(돈은 이미 이동, 수동 환불 D-7). 재호출(이미 COMPLETED)은 `fn_join_smn` 으로 등록만 재시도. **복구** : 상세 GET 이 "내 COMPLETED SMN_ENT 결제 + 참가 없음" 을 보면 `fn_join_smn` 으로 등록 — 두 번 결제를 요구하지 않음 | 원장·참가 갈라짐 차단 |
| D-17 | 이전 APPROVED 결제 정리(S2) | approve 검증기가 같은 세미나의 내 다른 APPROVED SMN_ENT 를 최대 3건 Pi 조회(병렬) — 취소·만료(404)면 원장 CANCELED, 진행 중·판정 불가면 `ALREADY_PAID`. 3건 초과도 `ALREADY_PAID`. Pi 조회 타임아웃은 패키지 값(10초, BUILD_DEFECTS 2.7 예외)을 따름 | 서명 전 이탈한 결제가 sql/006 인덱스를 막아 다시 결제 못 하는 문제 |
| D-18 | 정원 ≠ 동시 접속 상한(S4) | `max_cnt` 는 **참가 등록 수** 상한(유료 = 결제 등록, 무료 = 입장 클릭 등록). 화상 엔진의 동시 접속 상한(입장권 cap = max_cnt+1)은 **별개** — 등록자가 나가도 등록은 남고, 무료 세미나 청중 입장권은 등록 없이도 발급되므로(D-9) 무료 세미나의 실제 동시 시청 인원은 엔진 cap 이 막는다. 등록 정원이 찼다고 엔진 자리가 찬 것은 아니며 그 반대도 같다 | 두 수를 같은 것으로 안내하지 않기 |
| D-19 | 입력·표시 보강 | 시작일시 = 지금 이후 **1년 안**(S5, 서버·화면 같은 규칙) · uuid 방 ID 는 소문자로 통일(S3) · 세미나 없음 approve = `SMN_CLOSED`(U6) · 개최자는 상세에서 룸 링크만(U1) · 지갑 대기 120초 = 오류 대신 '아직 기다리는 중' 안내(U8) | 보안·Pi/UX 검토 반영 |

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-24 | 골격 생성(tenant-env.mjs new) |
| 2026-10-24 | 1차 보강 — 한 줄 정의·핵심 가치 3·로그인(Google 연동 예외)·기능 초안 F-01~07·수익 R1~R3·확인 질문 7 (근거 PRD_27·PRD_28) |
| 2026-10-24 | 화상 방식 결정 반영 — 자체 구축(엔진까지), 9절 #1·F-05 |
| 2026-10-24 | v0.2 — 10절 화상 엔진 기준점(마스터 확정), F-05 → PRD_01 |
| 2026-10-26 | v1.0 보정(T1 검토 반영) — 7절 DB 표기 정정(프로젝트 1개·스키마 3개, prod = `public`), 표준단어 통일(`smn_mst`·`smn_ptc`·`fn_join_smn`), 결제 검증 `PAY_INVALID`·approve 정원 확인 `fn_chk_smn_cap`(D-5·D-6), D-10 `SMN_ENT`, 1회성 재설정 기록, prod 적용 |
| 2026-10-27 | S1·S2·S5 + 세미나·결제 API 구현에 따른 아소카 결정(마스터 위임 2026-10-26) D-12~D-15 추가(sql/006 적용 dev·stg·public) |
| 2026-10-27 | 보안·Pi/UX 검토 반영 — 아소카 결정(마스터 위임 2026-10-26) D-16~D-19(결제 완료 원자화 sql/007 dev·stg·public 적용·이전 결제 정리·정원≠동시 접속·입력 보강), 9절 #8 세션 전 미완료 결제 복구 [확인중 : 마스터] |
| 2026-10-26 | **v1.0 확정** — 아소카 결정(마스터 위임) D-1~D-11(11절), 6절 화면 5종(UI 설계서 v1.0), 7절 세미나 모델(sql/004 smn_smnr·smn_ptcp·fn_join_smn_smnr), 9절 #2·#4 결정 |
