# PRD_27: Pi 앱 팩토리 — .pi 도메인 멀티테넌트 인큐베이팅

> **버전**: v1.0
> **작성일**: 2026-07-09 (마스터 승인)
> **상태**: 📝 기획 확정 — P1 설계·구현 대기
> **정본 연계**: `PRD_0_INT.md`(AI인큐베이터 컨셉) · `공개_라이선스_정책.md`(오픈코어 3계층) · `PRD_23_FUNC_TUNING.md`(등재 절제 프로필) · `TROUBLESHOOT.md` R-09(커넥션 풀)·[2026-07-02](uid scoped 사고)
> **결정 대기(마스터)**: ① 보유 .pi 도메인 20여 개 목록 ② 파일럿 1호 도메인 선정 ③ 도메인별 프리셋 매핑

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

### 2.1 데이터 모델 (초안 — DA 표준 준수, 구현 시 da-ddl-guard 통과 필수)

```sql
-- 사이트 마스터 (테넌트 정의)
CREATE TABLE site_mst (
  site_cd        TEXT PRIMARY KEY,              -- 'CAFE'·'SHOP'… (영대문자 코드)
  site_domain    TEXT NOT NULL UNIQUE,          -- 'cafe.pi 오리진 도메인' (Host 매칭 키)
  site_nm        TEXT NOT NULL,                 -- 표시 브랜드명
  brand_logo_url TEXT,
  ui_theme_cd    TEXT,                          -- ui_theme 연계
  preset_cd      TEXT NOT NULL,                 -- COMMERCE | COMMUNITY | CONTENT
  module_cfg     JSONB NOT NULL DEFAULT '{}',   -- 모듈 ON/OFF 오버라이드
  pi_app_ref     TEXT,                          -- Pi Developer Portal 앱 식별 참조
  use_yn         CHAR(1) NOT NULL DEFAULT 'Y',  -- 사이트 kill switch
  regr_id TEXT NOT NULL DEFAULT 'ADMIN', reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'ADMIN', mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn CHAR(1) DEFAULT 'N', del_dtm TIMESTAMPTZ
);

-- 사용자 사이트별 Pi uid 매핑 (pi_uid는 앱×네트워크 scoped — 2026-07-02 교훈)
CREATE TABLE usr_site_map (
  usr_id  TEXT NOT NULL,                        -- sys_user.id (전역 1행 유지)
  site_cd TEXT NOT NULL,
  pi_uid  TEXT NOT NULL,                        -- 해당 사이트 Pi 앱의 scoped uid
  frst_login_dtm TIMESTAMPTZ,
  regr_id TEXT NOT NULL DEFAULT 'ADMIN', reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'ADMIN', mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn CHAR(1) DEFAULT 'N', del_dtm TIMESTAMPTZ,
  PRIMARY KEY (site_cd, pi_uid)
);
```

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
| v1.0 | 2026-07-09 | 최초 작성 — 멀티테넌트 팩토리 채택 (마스터 승인), 아키텍처·SOP·졸업 모델·로드맵 확정. 결정 대기: 도메인 목록·파일럿 1호 |
