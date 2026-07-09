# PRD_27: Pi 앱 팩토리 — .pi 도메인 멀티테넌트 인큐베이팅

> **버전**: v1.1
> **작성일**: 2026-07-09 (마스터 승인) · **갱신**: 2026-07-09 도메인 목록·파일럿 확정
> **상태**: 📝 기획 확정 — **파일럿 1호 = yea.pi** · P1 구현 착수
> **정본 연계**: `PRD_0_INT.md`(AI인큐베이터 컨셉) · `공개_라이선스_정책.md`(오픈코어 3계층) · `PRD_23_FUNC_TUNING.md`(등재 절제 프로필) · `TROUBLESHOOT.md` R-09(커넥션 풀)·[2026-07-02](uid scoped 사고)

---

## 1. 목적·배경

마스터는 cafe.pi 외 **.pi 도메인 20여 개**를 보유. 도메인마다 독립 프로젝트를 만드는 방식(리포 복제)은 유지보수 비용이 도메인 수에 비례해 폭증하므로, **cafe.pi를 모선(母船)으로 하는 멀티테넌트 팩토리**로 전환한다.

**전략 모델: 입주 → 검증 → 졸업 (인큐베이터)**
- **입주**: 신규 .pi 도메인 = DB 행 1개 + 도메인 연결 (목표: **1일 1사이트**)
- **검증**: 모듈 프리셋으로 MVP 운영, 시장 반응 실험 (실험 비용 1/20)
- **졸업**: 임계(MAU·매출) 도달 사이트만 독립 리포+전용 DB 분리
- **확장**: 타인 .pi 도메인 입주 SaaS화 (입주비·수수료 — 기존 요금 인프라 재사용) → "Pi 생태계의 Shopify" 포지션

### 1.1 접근 방식 비교 (결정 근거)

| 방식 | 신규 1건 | 유지보수 | 판정 |
|---|---|---|---|
| 리포 복제 ×20 | 며칠 | 패치 ×20회, 코드 분화 | ❌ |
| 모노레포 core 추출 | 반나절 | 양호 (전면 리팩토링 선행 수주) | 보류 (졸업 단계에서 재검토) |
| **멀티테넌트 팩토리** | **몇 시간** | **1곳 수정→20개 반영** | ✅ **채택 (2026-07-09 승인)** |

핵심 판단: 20개 도메인의 목적은 20개 풀 서비스가 아니라 **도메인 선점 가치 실현 + 빠른 실험**. 역방향 효과가 본질 — 한 사이트에서 검증된 기능·수익모델이 즉시 나머지 19개의 무기가 된다.

---

## 2. 아키텍처

```
shop.pi ─┐
game.pi ─┤  ① middleware: Host 헤더 → site_mst 조회 → 사이트 컨텍스트 주입
 ...     ┼─►  cafe.pi 코드베이스 (Vercel 1프로젝트 · 도메인 20개 연결)
xxx.pi  ─┤      ② 브랜딩: 로고·명칭·테마 (기존 ui_theme 재사용)
cafe.pi ─┘      ③ 모듈: 채팅/상점/음성/LBS/이벤트/게시판 ON·OFF (사이트 축)
                ④ 데이터: 단일 Supabase + 콘텐츠 테이블 site_cd 축
                ⑤ 요금: bean_fee_plan·fee_mode·promo — 사이트 축 확장
```

**재사용 자산 (이미 있는 것)**: `withAuthGuard` Host 기준 same-origin(2026-07-01) · `ui_theme` 런타임 테마 · `fee_mode_config`/`promo_fee_config` OneKey 런타임 스위치 문화 · `detectSandbox()` 런타임 판정 패턴 · i18n 189 locale · DA 표준 · 법무 문서 v1.1 체계 · 이중 인증 경로 · A2U 정산.

### 2.1 데이터 모델 — **확정 DDL 정본: `sql/173_site_factory.sql`** (da-ddl-guard 통과, 2026-07-09)

| 테이블 | 역할 | 핵심 |
|---|---|---|
| `sys_site_mst` | 사이트(테넌트) 마스터 | `site_cd` PK · `site_domain_nm` UNIQUE(Host 매칭 키) · `preset_cd`(COMMERCE/COMMUNITY/CONTENT) · `module_cfg_json` 오버라이드 · `use_yn` kill switch(기본 N — 실기기 검증 후 Y) |
| `sys_site_usr_map` | 사이트×사용자 Pi uid 매핑 | PK `(site_cd, pi_uid)` · `usr_id`→sys_user 전역 1행 · 활성 매핑 부분 인덱스 |

- **명명 결정**: 사이트 설정은 `sys_` 주제영역(선례 `sys_quick_menu`) — 신규 접두사 신설 대신 표준 준수(da-ddl-guard R2 통과). 시드: CAFE(활성)·YEA(파일럿, 대기).

- **정체성 원칙**: 사람의 전역 불변 키 = `pi_username` (기존 철칙 그대로). `sys_user`는 전역 1행, 사이트별 scoped uid는 `usr_site_map`으로 흡수 → **어느 .pi에 가입해도 같은 계정·같은 Bean** = 네트워크 효과.
- **콘텐츠 테이블 site_cd 축**: `msg_room`·`mps_shop/item`·`brd_post` 등에 `site_cd TEXT NOT NULL DEFAULT 'CAFE'` 추가(기존 데이터 무손실). 조회 헬퍼에 사이트 필터 일괄 적용.

### 2.2 Pi 인증·결제 멀티앱

| 항목 | 설계 |
|---|---|
| Pi 앱 등록 | 도메인당 Developer Portal 개별 등록·도메인 검증 (유일한 도메인별 수작업) |
| API 키 | env 네이밍 규칙 `PI_API_KEY__<SITE_CD>` (+ OAuth `NEXT_PUBLIC_PI_OAUTH_CLIENT_ID__<SITE_CD>` → 런타임 제공 방식으로 전환, §2.3) |
| 로그인 | `/api/auth/pi`가 Host→site_cd 판정 후 해당 앱 키로 `/v2/me` 검증, `usr_site_map` upsert + `pi_username` 재바인딩 폴백 유지 |
| 결제 | approve/complete가 site_cd별 키 사용, `pi_pymnt.site_cd` 축 추가 (매출 사이트별 집계) |
| 심사 | PRD_23 절제 프로필을 **심사용 표준 프리셋**으로 재사용 (레드라인 4종 대응 포함) |

### 2.3 선결 기술 과제 — `NEXT_PUBLIC_*` 런타임화 ⚠️

`NEXT_PUBLIC_*`는 빌드 인라인이라 도메인별 분기 불가. 도메인별로 달라야 하는 클라이언트 값(OAuth CLIENT_ID·APP_URL·딥링크 도메인 등)은 **서버가 Host 기반으로 내려주는 사이트 컨텍스트**(RSC props 또는 `/api/site-config`)로 이전한다. `detectSandbox()` 런타임 판정 패턴 준용. **P1 최우선 작업.**

### 2.4 모듈 프리셋 3종

| 프리셋 | 활성 모듈 | 대상 도메인 성격 |
|---|---|---|
| **COMMERCE** | 상점(MPS)+LBS+후기+텔레그램 알림 | 커머스·마켓형 |
| **COMMUNITY** | 카페(채팅)+음성+이벤트+스티커 | 커뮤니티·모임형 |
| **CONTENT** | 게시판+구독+번역 | 콘텐츠·랜딩형 |

공통 기본: Pi 로그인·결제·다국어·관리자·법무 문서(브랜드 변수 치환).

---

## 2.5 도메인 포트폴리오 및 온보딩 웨이브 (2026-07-09 마스터 제공, 19개)

> 컨셉·프리셋은 제안값 — 각 사이트 입주 시점에 마스터가 확정. ⚠️ = 사전 검토 필요 항목.

| 도메인 | site_cd(안) | 프리셋(안) | 컨셉 제안 | 웨이브 |
|---|---|---|---|---|
| cafe.pi | CAFE | (모선) | 현행 플랫폼 — 팩토리 본체 | — |
| **yea.pi** | **YEA** | **VOTE(전용 경량)** | **⭐파일럿 1호 — "Yea or Nay" Pi 1인1표 투표 + 응원 화력** (2026-07-09 컨셉 확정): 무료 투표=성장 엔진(Pi 인증 1인1표=봇·중복 원천 차단), 수익 R1 프리미엄 개설료·R2 응원 결제 수수료(⛔표-돈 분리: 승패=1인1표만, 응원금=별도 화력 랭킹·상금 배분 절대 금지=도박 레드라인 회피)·R3 설문+리워드(Phase 2). MVP=화면 3개·신규 테이블 3개·응원은 pi_pymnt 재사용. 검증 후 투표 모듈을 cafe.pi에 역이식 | **W1** |
| gifticon.pi | GIFTICON | COMMERCE | 모바일 상품권·기프티콘 P2P (MPS+카카오 선물 경험 직결, 수익성 최상) ⚠️상품권 재판매 규제 검토 | W2 |
| barista.pi | BARISTA | COMMERCE | 카페·바리스타 O2O (cafe.pi 커피 버티컬 시너지) | W2 |
| bluemountain.pi | BLUEMTN | COMMERCE | 원두·커피용품 직거래 (barista와 커피 버티컬 묶음) | W2 |
| seminar.pi | SEMINAR | COMMUNITY | 음성 세미나·강연 (PyVoice™ 킬러 유스케이스) | W3 |
| teamkorea.pi | TEAMKR | COMMUNITY | 국가대표 응원 커뮤니티 (프리미엄 스포츠 테마 시너지) | W3 |
| expedition.pi | EXPEDITION | COMMUNITY | 여행·탐험 카페 (기존 '여행' 테마 시너지) | W3 |
| omok.pi | OMOK | COMMUNITY(게임) | 오목 대전 커뮤니티 ⚠️게임+금전 결합 금지(도박 레드라인) — 순수 대전·입장료만 | W3 |
| lan.pi | LAN | COMMUNITY | 온라인 모임·랜파티 커뮤니티 | W3 |
| sitemap.pi | SITEMAP | CONTENT | ⭐**.pi 생태계 디렉토리·포털** — 팩토리 전 사이트의 관문(전략적 가치 높음) | W4 |
| dbms.pi | DBMS | CONTENT | 개발자 콘텐츠 — DA 표준·DB 지식 자산 상품화 | W4 |
| schema.pi | SCHEMA | CONTENT | DA 표준사전·스키마 도구 (dbms와 개발자 번들) | W4 |
| webserver.pi | WEBSERVER | CONTENT | 웹서버·인프라 개발자 콘텐츠 | W4 |
| was.pi | WAS | CONTENT | WAS·백엔드 개발자 콘텐츠 (개발자 번들) | W4 |
| fondation.pi | FONDATION | CONTENT | 기부·후원 플랫폼 (Pi 결제 중심) ⚠️기부금품법 검토 | W4 |
| yoda.pi | YODA | CONTENT | 멘토링·조언 콘텐츠 ⚠️**상표권(Lucasfilm) 검토 필수** — 통과 전 보류 | W4 |
| anakin.pi | ANAKIN | CONTENT | 마스터 개인 브랜드·포트폴리오 | W5 |
| youngrok.pi | YOUNGROK | CONTENT | 개인 브랜드 | W5 |

**웨이브 전략**: W1 파일럿(yea.pi — 팩토리 자체 검증) → W2 수익 버티컬(커머스 3종 — MPS 재사용도 최고) → W3 커뮤니티(카페·음성 재사용) → W4 콘텐츠·개발자(sitemap.pi는 전 사이트 오픈 후 관문으로) → W5 개인.

---

## 3. 신규 사이트 SOP (목표: 1일 1사이트)

1. Pi Developer Portal 앱 등록 + 도메인 검증 (수작업)
2. Vercel 프로젝트에 도메인 추가
3. `/admin/sites`에서 사이트 행 생성 (브랜드·테마·프리셋)
4. 사이트별 키 등록 (`PI_API_KEY__<SITE_CD>`) + 재배포
5. **실기기 P0 검증**: Pi Browser 로그인·결제 (핵심가치 — 완료 조건)
6. 법무 문서 브랜드 변수 확인·공지 게시

## 4. 졸업 파이프라인

- **임계 기준(안)**: MAU N명 또는 월 매출 N Pi 도달 (수치는 운영 데이터로 확정)
- **절차**: 템플릿 추출(코드) + `site_cd` 데이터 pg_dump 분리(컷오버 경험 재사용) + 전용 Vercel/Supabase + Pi 앱 그대로 승계(uid 불변 — usr_site_map이 원장)
- 졸업 후 모선과의 계정 연동은 Pi Sign-In(OAuth)으로 유지 가능

## 5. 리스크·완화

| 리스크 | 완화 |
|---|---|
| 단일 장애점 (모선 다운=전체) | staging 선검증 문화 유지 + `site_mst.use_yn` 사이트별 kill switch + 졸업으로 대형 사이트 분리 |
| 커넥션 풀 공통 천장 (R-09 가속) | pooler 사이즈 모니터링을 P1 포함·사이트별 부하 메트릭(/admin/monitor 확장) |
| Pi 등재 심사 ×N | 절제 프로필 표준화·심사 통과 프리셋 고정 |
| 테넌트 데이터 누수 | site_cd 필터 헬퍼 단일화 + 조회 계층 코드리뷰 체크리스트 |
| NEXT_PUBLIC 빌드 인라인 | §2.3 런타임화 선행 (P1) |

## 6. 로드맵

| 단계 | 내용 | 규모 |
|---|---|---|
| **P1** | site_mst·usr_site_map DDL + Host 분기 미들웨어 + NEXT_PUBLIC 런타임화 + 콘텐츠 site_cd 축 | 1~2주 |
| **P2** | `/admin/sites` 관리 화면 + **파일럿 1호 입주** + 실기기 P0 검증 + SOP 문서 확정 | 1주 |
| **P3** | 프리셋 3종 확정 → 20개 순차 온보딩 (1일 1사이트) | 도메인 우선순위대로 |
| **P4** | 졸업 파이프라인 + 외부 입주 SaaS화 (입주비·수수료 과금) | 성과 확인 후 |

## 7. 변경 이력

| 버전 | 일자 | 내용 |
|---|---|---|
| v1.0 | 2026-07-09 | 최초 작성 — 멀티테넌트 팩토리 채택 (마스터 승인), 아키텍처·SOP·졸업 모델·로드맵 확정 |
| v1.1 | 2026-07-09 | §2.5 신설 — 도메인 19개 목록·프리셋 매핑·온보딩 웨이브 W1~W5 확정. **파일럿 1호 = yea.pi** (마스터 지정). ⚠️플래그 4건(yoda 상표·gifticon 규제·omok 도박 레드라인·fondation 기부금품법) |
