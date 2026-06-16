# Pi Network 기반 풀스택 앱 플랫폼 — 개발 로드맵

Pi Browser + 일반 브라우저를 모두 지원하는 Next.js 16 기반 Pi Network 앱 플랫폼

> **기준일**: 2026-06-17
> **현재 버전**: Phase 7~12 완료 (PiCafé MVP · Pi 수익화 · 생태계 확장 · 사용자 프로필 · 통계 대시보드 · PiTranslate™ TASK-090~099 ✅) · **Phase 13 PiShop(MPS) Phase 1+2+3 완료 — P1+P2(TASK-100~111 ✅) + 후속 개선(A2U 환불·이미지 업로드) + Phase 3 O2O 오프라인 매장 커머스 완료 (TASK-113~120 ✅ 2026-06-16: 구글 카페 half-인증 등록·오프라인 주문 상태머신(주문중→준비중→상품대기중→10분 자동완료)·주문방법 3종·취소수수료·보이스 주문알림·지도 상품판매·IDOR 차단, `sql/050~060`) · PiRC3만 보류** · **Phase 14 PiVoice™ v3.0 권한 시스템 구현 완료 (TASK-120~125 ✅, `docs/PRD_9_VOICE_CHAT.md` v3.0 — 방장 보장 슬롯 + 멤버 자동 2/승인 2, S0 실기기 검증·TURN env 잔여)** · **Phase 15 LBS P0+P1 완료 (TASK-130~140 ✅, 상품 개별 위치 등록 포함)** · 횡단 개선: 무한 스크롤·지연 로딩 + SWR 캐싱·병렬 호출 성능 튜닝, Pi Tip→Bean 리브랜딩, 스티커 노출 개선 (2026-06-12) · **횡단 3차 (2026-06-13): Pi Browser admin 다국어 전환 무반응 수정(_pit 티켓 선발급) + 헤더 다국어 콤보 3계층 캐시 성능 개선** · **횡단 4차 (2026-06-14): CafePi 헤더 로고 교체·Pi Bet UI 아코디언·다국어 선택기 기억·PiShop 브랜드 통일·admin open redirect 방어 + 어드민 대시보드 고도화(coin360 트리맵·사용자 관리 통합·KST 집계 교정·결제내역 개선)** · **Phase 16 평가 엔진 정밀화 (2026-06-15): M2 상태형 양방향 멱등·평가엔진 select후분기 복구·CHAR→VARCHAR(sql/046)·CRON_SECRET 프로덕션 필수·재평가 안전망 cron·관리자 재평가 버튼** · **횡단 5차 (2026-06-15): i18n 전체 자동번역 서버 after() 백그라운드화 + 번역률 반올림 버그·콤보 캐시 키 v2 무효화** · **GTM 문서화 (2026-06-16): 제품소개서(단기 4목표 13장) + 공개·라이선스 정책(오픈코어 3계층) + 성능 리스크 레지스터(7종 병목 분석) + 운영 이슈 기록(Vercel Hobby cron·GitHub Webhook)** · **이벤트 보상 전환 (2026-06-17, TASK-156): 10미션 완주 보상을 Pi A2U 송금 → mps_seller_bond 1π 직접 적립으로 전환, 자동→관리자 수동 지급 버튼, 원자적 RPC `fn_evt_grant_bond_reward`(FOR UPDATE+reward_st_cd 게이트)로 이중지급 차단, M3 유료테마 게이트 결함 수정**
> **배포 URL**: https://loginpi.vercel.app
> **기술 스택**: Next.js 16 App Router · React 19 · TypeScript 6 · Tailwind CSS v4 · NextAuth.js · Supabase PostgreSQL

---

## ⚠️ 운영 인프라 제약사항 (필독)

> 개발·배포 시 반드시 확인해야 할 플랫폼 제약. 위반 시 배포 차단 또는 서비스 오동작 발생.

| 항목 | 제약 | 현재 설정 | 해결책 |
|---|---|---|---|
| **Vercel Hobby — Cron 주기** | 하루 1회(`0 H * * *`) 초과 불가 — 위반 시 배포 자체 차단, FAILED 로그도 미기록 | `0 0 * * *` (매일 자정) | Pro 플랜($20/월) 업그레이드 시 고빈도 가능 |
| **Pi Browser — Set-Cookie** | WebView에서 모든 방식의 Set-Cookie 저장 안 됨 | 쿠키 + `X-Pi-Token` 헤더 이중 경로 | `piFetch` 사용 필수, `redirect` 금지 |
| **NextAuth v5** | beta.31 유지 — stable 미출시 | `5.0.0-beta.31` | stable 출시 시 UPGRADE_STRATEGY.md 참조 |

> 상세 트러블슈팅: `docs/TROUBLESHOOT.md`

---

## 📊 전체 진행률 요약 (2026-06-17)

### Phase 완료 현황

| Phase | 명칭 | 상태 | 완료도 |
|---|---|---|---|
| **0** | 스타터킷 현행화 | ✅ 완료 | 100% |
| **1** | Pi 인증 + Pi 결제 | ✅ 완료 | 100% |
| **2** | Google 로그인 + 계정 연동 | ✅ 완료 | 100% |
| **3** | 관리자 기능 | ✅ 완료 | 100% |
| **4** | 통합 게시판 | ✅ 완료 | 100% |
| **5** | 데이터 표준 시스템 | ✅ 완료 | 100% |
| **6** | 다국어 기초 | ✅ 완료 | 100% |
| **7** | PiCafé MVP | ✅ 완료 | 100% |
| **8** | 카페 수익화 1 | ✅ 완료 | 100% |
| **9** | 카페 생태계 확장 | ✅ 완료 | 100% |
| **10** | 사용자 프로필 | ✅ 완료 | 100% |
| **11** | 통계 대시보드 | ✅ 완료 | 100% |
| **12** | PiTranslate™ 동시통역 | ✅ 완료 | 100% |
| **13** | PiShop(MPS) | ✅ 완료 (P1+P2+P3 O2O) | 100% (P3 O2O 카페 커머스 완료 2026-06-16: 구글 매장 인증등록·오프라인 주문 상태머신·주문방법 3종·보이스 알림·지도 상품판매 · PiRC3만 보류) |
| **14** | PiVoice™ v3.0 | ✅ 완료 (v3.0 권한 시스템) | 100% (S0 실기기 검증 잔여) |
| **15** | LBS 위치기반서비스 | ✅ 완료 (P0+P1) | 100% (상품 개별 위치 포함 · 지도 UI 확장 예정) |
| **16** | 이벤트 미션 시스템 (Pi 요원 육성) | ✅ 완료 | 구현·운영 중 (참여 7·완주 1) · 2026-06-15 평가 엔진 정밀화(M2 상태형 양방향·select후분기 복구·CHAR→VARCHAR·재평가 버튼) · 2026-06-17 보상 전환(A2U→1π 보증금 적립·관리자 수동 지급·원자적 RPC 이중지급 차단·M3 유료테마 게이트, TASK-156) |
| **17** | BEAN 토큰 발행 (Pi Launchpad) | 📝 기획·문서 | PRD_12 v1.7 — 토큰명 BEAN(기존 Pi Bean 온체인화·`1 Pi=100 BEAN`)·세일 0.01 Pi·분배 40/25/15/12/8·발행주체 개인·유동성 Pi 단독(레드라인 #2). **발행 전 코드 0(문서 전용)**. 잔여: T05 증권성 법무자문·T01 개인 KYC·T02 Launchpad 신청(외부 회신 대기) |
| **횡단** | 성능 튜닝 | ✅ 완료 | 100% (무한 스크롤·지연 로딩·SWR 캐싱·리브랜딩·스티커) |
| **횡단3** | Pi Browser 안정화·콤보 성능 (2026-06-13) | ✅ 완료 | 100% (admin 다국어 전환 무반응 수정·헤더 콤보 3계층 캐시) |
| **횡단4** | Pi Browser 안정화 4차·MPS 후속·대시보드 고도화 (2026-06-14) | ✅ 완료 | 100% (A2U 환불·트리맵·Pi Bet UI·헤더 로고·다국어 기억·브랜드 등) |
| **문서화** | GTM 문서화 (2026-06-16) | ✅ 완료 | 100% (제품소개서 13장 + 공개·라이선스 정책 + 성능 리스크 레지스터 + 운영 이슈 기록) |
| **13-P3** | PiShop O2O 오프라인 매장 커머스 (2026-06-16) | ✅ 완료 | 100% (구글 카페 half-인증 등록·오프라인 주문 상태머신·주문방법 3종·취소수수료·보이스 알림·지도 상품판매·IDOR 차단 · TASK-113~120 · `sql/050~060`) |

### 통계
- **총 Phase**: 19개 (0~17 + 횡단 개선 + 문서화)
- **완료**: 18개 구현 완료 (Phase 16 이벤트 미션 시스템 포함 — 구현·운영 중)
- **진행 중**: 0개
- **기획·문서**: 1개 (Phase 17 BEAN 토큰 발행 — 문서 전용·앱 코드 0, T01/T02/T05 외부 회신 대기)
- **예정**: 확장 Phase (PiRC3 실 에스크로 보류 해제 대기, LBS 지도 UI 추가 확장, PiVoice TURN 운영, 이벤트 행위훅 전수 점검, StarterKit 패키지 제품화) · **O2O 후속**: 외부 알림 채널(Telegram/이메일/카카오 알림톡)로 사장님 화면 미접속 시 알림 확장

### 핵심 마일스톤

**완료된 주요 성취**:
- ✅ Pi Browser 이중 인증 경로 (쿠키 + X-Pi-Token) 완벽 구현
- ✅ 203개 locale 글로벌 배포 (다국어·통화 자동 매핑)
- ✅ 실시간 글로벌 동시통역 (Gemini Flash + Claude Haiku 하이브리드)
- ✅ P2P 직거래 에스크로 (Pi Coin 자동 정산)
- ✅ N:N 음성채널 (WebRTC Full Mesh, 방장 보장 슬롯 + 발언 승인 워크플로우, TURN 지원)
- ✅ 위치기반 커머스 (직거래 성사율 향상)
- ✅ 기업 수준 데이터 표준 (DA 시스템)
- ✅ GTM 준비: 제품소개서(단기 4목표 13장 슬라이드) + 공개·라이선스 정책(오픈코어 3계층) 완성

**다음 단계** (본문 Phase별 TASK 기준):
- ✅ MPS Phase 2 (TASK-108~111) 완료 (2026-06-13): 카테고리 시스템 · 매장 관리 · 양방향 주문 취소 · 거래 내역
- ✅ MPS 후속 개선 완료 (2026-06-14): A2U 자동 환불 · FR-10 교정 · 상품 이미지 업로드 · 상품 등록 위치 수집
- ✅ GTM 문서화 완료 (2026-06-16): 제품소개서 + 공개정책 + 성능 리스크 레지스터 + 운영 이슈 기록
- MPS Phase 3 (TASK-112~113): **TASK-112 PiRC3 실 에스크로 = 🔒 보류**(2026-06-13 공식 확인 — PiRC3 미존재·Pi SDK `invokeContract` 미지원 → 플랫폼 가상 에스크로 유지) · **TASK-113 Google Maps 연동**(`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` 필요) — *MPS는 배송 없는 직거래 전용*
- PiVoice 잔여 (S0~S3): Pi Browser 실기기 마이크 검증 · **TURN 운영 설정**(`TURN_HOST`/`TURN_SECRET`) · 품질 데이터 기반 coturn 전환 판단 · 5인+ LiveKit SFU/결제 게이팅 검토
- LBS 향후 Phase: Maps JavaScript API 지도 UI · Places API 매장 검색
- 이벤트 잔여: `recordUserAction` **행위 훅 전수 점검**(action_log 19 < 완료기록 34) — 일부 미션 트리거 누락 의심
- **StarterKit 패키지 제품화**: 베이직/프리미엄/플래티넘/인피니티 4계층 패키지 구성, 외주 연계 파이프라인 설계 (`docs/PRD_0_INT.md` 기반)

---

## ★ 핵심 기능 — 재사용 구현 가이드

> 이 플랫폼의 가장 중요한 두 기능. 다른 Pi Network 프로젝트 시작 시 이 두 SKILL 파일이 완전한 구현 매뉴얼이 된다.

### ① Pi + Google 계정 연동 ✅ 구현 완료

**위치**: `.claude/skills/pi_google_link/SKILL.md`

Pi Browser는 WebView 안에서 실행되어 외부 브라우저를 열 수 없다.
이 제약을 **6자리 OTP 코드 + URL 클립보드 복사** 방식으로 해결.

```
Pi Browser → "코드 생성" → 6자리 코드
Pi Browser → "연동 URL 복사" → 클립보드 (https://yourapp.com/link?code=123456)
사용자가 직접 일반 브라우저에 붙여넣기
일반 브라우저 → Google 로그인 → "연동 완료" → sys_user 테이블 합쳐짐
```

**핵심 설계 원칙**:
- `sys_user` 테이블 단일화 — Pi row를 원본으로, Google 필드를 덧씌움
- `session.user.sub` = Google OAuth raw sub (google_id 저장용)
- `session.user.id` = users row UUID (연동 후 변경됨 — 조회 불가)
- 브루트포스 방지: 최대 5회 시도 제한 (attempt_count)
- Pi Browser WebView 쿠키 실패 → X-Pi-Token 헤더 fallback

**재사용 시 필요 파일**:
```
src/auth.ts · src/lib/users.ts · src/lib/supabase-admin.ts
src/app/api/auth/link-start/ · link-complete/ · link-status/
src/app/link/page.tsx · src/components/account-link-card.tsx
```

---

### ② Pi 결제 시스템 (U2A) ✅ 구현 완료

**위치**: `.claude/skills/pi_pay/SKILL.md`

Pi Network 공식 SDK U2A(User-to-App) 결제 3단계 흐름 구현.
**`/complete` 미구현 시 해당 사용자의 모든 미래 결제가 영구 차단**되는 치명적 트랩 포함.

```
1. createPayment()           — 클라이언트: 결제 생성
2. onReadyForServerApproval  — 클라이언트 → POST /api/payments/approve
3. [사용자 Pi 지갑에서 승인]
4. onReadyForServerCompletion — 클라이언트 → POST /api/payments/complete  ← 반드시 구현
```

**핵심 설계 원칙**:
- Pi 사용자 정보 API: `Authorization: Bearer <accessToken>`
- Pi 결제 API: `Authorization: Key <PI_API_KEY>` ← 완전히 다름
- `onIncompletePayment` 핸들러로 미완료 결제 자동 복구 필수
- sandbox 모드: `NEXT_PUBLIC_PI_SANDBOX=true` 환경변수로 제어

**재사용 시 필요 파일**:
```
src/app/api/payments/approve/ · complete/
src/components/pi-pay-button.tsx · pi-product-card.tsx
```

---

## 개요

Pi Network 생태계를 위한 풀스택 웹 앱 플랫폼.
Pi Browser와 일반 브라우저를 완전히 분리 감지하여 각 환경에 최적화된 UI를 제공한다.
Pi 인증·결제 구현을 완료했고, Google 계정 연동까지 마쳤다.
관리자 시스템·게시판·다국어를 단계적으로 추가한다.

---

## 개발 워크플로우

1. 기능 구현 후 타입 체크 (`pnpm tsc --noEmit`) 통과 확인
2. 커밋 메시지는 한국어로 작성
3. **커밋·배포는 명시적 요청 시에만 수행** (자동 커밋·푸시 금지)
4. 새 Phase 시작 전 이 파일에 계획 수립

---

## Phase 0: 스타터킷 현행화 ✅ (완료)

> **목표**: 최신 Next.js 16 생태계 기반의 재사용 가능한 스타터킷 구축

- **TASK-001: Next.js 16 + Tailwind v4 + shadcn/ui base-nova 환경 셋업** ✅
  - ✅ Next.js 16 App Router + React 19 + TypeScript 6 strict mode
  - ✅ Tailwind CSS v4 (CSS-first, `tailwind.config` 없음, `@theme inline {}`)
  - ✅ shadcn/ui base-nova (`@base-ui/react` 기반, `asChild` 없음)
  - ✅ next-themes 다크모드 (`@custom-variant dark (&:where(.dark, .dark *))`)
  - ✅ t3-env + Zod 빌드 시점 환경변수 검증
  - ✅ pnpm 11 빌드 스크립트 허용 (`pnpm-workspace.yaml allowBuilds`)
  - ✅ Vercel 배포 파이프라인 구성

---

## Phase 1: Pi Network 인증 + 결제 ✅ (완료)

> **목표**: Pi Browser 자동 인증, 수동 로그인, Pi Coin 결제 U2A 구현

### TASK-002: Pi 계정 인증 ✅ 완료

- ✅ `types/pi-network.d.ts` — `window.Pi`, `PiUserDTO`, `PaymentDTO` 전역 타입
- ✅ `src/types/pi-session.ts` — `PiSessionUser` 공유 타입
- ✅ `src/app/api/auth/pi/route.ts` — GET(세션복원) / POST(HMAC 서명 쿠키) / DELETE(로그아웃)
- ✅ `src/components/pi-auth-provider.tsx` — React Context + 인증 로직
- ✅ `src/components/pi-login-button.tsx` — 헤더용 버튼
- ✅ `src/components/pi-user-card.tsx` — 사용자 정보 카드
- ✅ HMAC-SHA256 서명 세션 쿠키 (`httpOnly`, `sameSite: strict`, `tokenValidUntil` 기반 maxAge)
- ✅ `src/app/api/auth/dev/route.ts` — 개발 mock 로그인 (prod: 404)

### TASK-003: Pi Coin 결제 (U2A) ✅ 완료

- ✅ `src/app/api/payments/approve/route.ts` — Phase 1 서버 승인
- ✅ `src/app/api/payments/complete/route.ts` — Phase 3 서버 완료
- ✅ `src/components/pi-pay-button.tsx` — 수량 입력 + 결제 버튼
- ✅ `src/components/pi-product-card.tsx` — 상품 결제 카드
- ✅ 미완료 결제 자동 복구 핸들러 (`onIncompletePayment`)

---

## Phase 2: Google 계정 로그인 + Pi·Google 계정 연동 ✅ (완료)

> **목표**: Google OAuth 로그인, Pi+Google 계정 6자리 코드 기반 크로스 브라우저 연동

### TASK-004: Supabase DB 설계 + NextAuth.js 연동 ✅ 완료

- ✅ Supabase PostgreSQL `sys_user` 테이블 설계 (pi_uid, google_id, google_email, role, display_name) — 초기 `users`에서 Migration 003으로 리네이밍
- ✅ `src/auth.ts` — NextAuth.js v5 설정 (Google Provider + Supabase 연동)
- ✅ `src/app/api/auth/[...nextauth]/route.ts` — NextAuth 핸들러
- ✅ `src/types/next-auth.d.ts` — NextAuth 타입 확장 (sub, id 포함)
- ✅ `src/lib/supabase-admin.ts` — Supabase admin 클라이언트 (lazy init, 빌드 오류 방지)
- ✅ `src/lib/users.ts` — users 테이블 CRUD 헬퍼
- ✅ `src/lib/auth-check.ts` — Pi + Google 세션 통합 확인 (server-only)

### TASK-005: Google 로그인 UI ✅ 완료

- ✅ `src/components/google-login-button.tsx` — Google 로그인 버튼
- ✅ `src/components/google-user-card.tsx` — Google 사용자 정보 카드
- ✅ 일반 브라우저에서만 표시 (`!isInPiBrowser` 조건)
- ✅ Pi Browser에서 Google 관련 UI 완전 숨김

### TASK-006: Pi Browser 감지 안정화 ✅ 완료

UA 패턴 기반 감지 → `Pi.authenticate()` 성공 여부 기반으로 전환

- ✅ `detectPiBrowser()` 함수 완전 제거
- ✅ `Pi.authenticate()` + `Promise.race()` 5초 타임아웃 패턴 적용
  - Pi Browser: `authenticate()` 성공 → `isInPiBrowser = true`
  - 일반 브라우저: 5초 타임아웃 → `isInPiBrowser = false`
  - 에러: `isInPiBrowser = false` (타임아웃 메시지는 에러 표시 안 함)
- ✅ Pi SDK를 항상 전역 로드 (`strategy='beforeInteractive'`) → `window.Pi` 체크로 분기
- ✅ `piAccessToken` 상태 추가 (Pi Browser WebView 쿠키 미전송 시 헤더 fallback용)

### TASK-007: Pi + Google 계정 연동 ✅ 완료

Pi Browser WebView는 `target='_blank'`가 WebView 내에서 열려 Google 로그인 불가
→ URL 클립보드 복사 방식으로 일반 브라우저에 URL 전달

- ✅ `src/app/api/auth/link-start/route.ts` — Pi 세션으로 6자리 코드 생성 (10분 유효)
- ✅ `src/app/api/auth/link-complete/route.ts` — Google 세션으로 코드 검증 + DB 연동
- ✅ `src/app/api/auth/link-status/route.ts` — 연동 상태 조회
  - `google_id` 형식 불일치 대비 `google_email` fallback 조회 구현
  - 경로 1: Google 세션 → google_id → google_email fallback
  - 경로 2: pi_session 쿠키
  - 경로 3: `X-Pi-Token` 헤더 → Pi Network API 직접 검증
- ✅ `src/app/link/page.tsx` — 코드 생성(Pi Browser) / 코드 입력(일반 브라우저) 자동 분기
  - URL `?code=XXXXXX` 파라미터로 코드 자동 채우기
- ✅ `src/app/link/complete/page.tsx` — 연동 완료 처리
- ✅ `src/components/account-link-card.tsx` — 연동 상태 카드
  - "연동하러가기 → (URL 복사)" 버튼 (Pi Browser에서 일반 브라우저로 URL 전달)
  - 연동 완료 시 카드 상단에 초록색 완료 표시

### TASK-008: 브라우저별 UI 정리 ✅ 완료

- ✅ Pi Browser: Pi 카드 + Pi 로그인 버튼 + Pi 결제 섹션만 표시
- ✅ 일반 브라우저: Google 카드 + Google 로그인 버튼만 표시
- ✅ 감지 중: 스피너 표시 (Pi·Google 섹션 모두 숨김)
- ✅ 계정 연동 카드: 항상 표시 (양 환경 공통)
- ✅ `src/components/pi-login-button.tsx`: 일반 브라우저에서 `null` 반환

---

## Phase 3: 관리자 기능 ✅ (완료)

> **목표**: ADMIN/MASTER 역할 전용 관리자 대시보드, 사용자 관리

### TASK-009: 관리자 기반 구조 ✅ 완료

- ✅ `src/app/(admin)/layout.tsx` — route group 레이아웃 + ADMIN/MASTER 접근 제어
  - `getSessionUser()` + `isAdmin()` 체크, 미인가 시 `/?error=unauthorized` 리다이렉트
- ✅ `src/components/admin/admin-sidebar.tsx` — 5개 메뉴 네비게이션 (대시보드/사용자관리/결제내역/계정연동현황/게시판관리)
- ✅ `src/app/(admin)/admin/page.tsx` — `/admin` 대시보드
  - 전체/Pi전용/Google전용/연동완료 통계 카드 4종
- ✅ `src/app/(admin)/admin/users/page.tsx` — `/admin/users` 사용자 관리
  - 전체 사용자 목록 테이블 (Pi계정, Google계정, 역할, 가입일)
  - 역할 변경 버튼 (ADMIN/MASTER/MANAGER/USER)
- ✅ `src/app/api/admin/users/route.ts` — GET 전체 사용자
- ✅ `src/app/api/admin/users/[id]/route.ts` — PATCH 역할 변경
- ✅ `/admin` 404 오류 수정 — route group 내 `admin/` 서브디렉토리 구조로 이동

### TASK-010: 결제 내역 관리 ✅ 완료

- ✅ `payments` 테이블 마이그레이션 — `user_id` FK: `auth.users` → `public.users`, 인덱스 3개 추가
- ✅ `src/app/api/payments/approve/route.ts` — Pi API 승인 후 DB upsert (status=approved)
  - `PaymentDTO.user_uid` → `users.pi_uid` 조회로 세션 없이 사용자 식별
- ✅ `src/app/api/payments/complete/route.ts` — Pi API 완료 후 DB UPDATE (txid, status=completed)
- ✅ `src/app/api/admin/payments/route.ts` — GET 결제 목록 (users JOIN)
- ✅ `src/app/(admin)/admin/payments/page.tsx` — 상태 필터 5종, π 합계 표시

### TASK-011: 계정 연동 현황 ✅ 완료

- ✅ `src/app/api/admin/links/route.ts` — GET 연동 현황
- ✅ `src/app/(admin)/admin/links/page.tsx` — 통계 카드(클릭 필터), 연동완료/Pi전용/Google전용 분류

---

## Phase 4: 통합 게시판 ✅ (완료)

> **목표**: 공지/자료실/자유/Q&A 4종 게시판

### TASK-020: DB 스키마 + 기반 구조 ✅ 완료 (기존 DB 활용)

**기존 테이블 현황** (데이터 있음 — 신규 생성 불필요)
```
brd_ctgr  4행  — NOTICE(MASTER), ARCHIVE(MANAGER), FREE(USER), QNA(USER)
brd_post  33행 — del_yn 논리삭제, pin_yn 핀고정, answ_yn QNA답변여부
brd_cmnt  2행  — acpt_yn 채택여부, del_yn 논리삭제
brd_attch 8행  — fl_nm/fl_pth/fl_url/fl_sz/fl_tp, del_yn 논리삭제
```

**설계 핵심 사항**
- `rgst_usr_id` (uuid): `public.users.id` 참조 (FK 없음 — app 레벨 관리)
- `regr_id` / `modr_id`: `varchar(20)` — `user.display_name.slice(0,20)` 사용 (UUID 불가)
- `ctgr_cd` → `brd_ctgr.ctgr_cd` FK 존재
- `cmnt_yn='Y'`: FREE, QNA만 댓글 허용 / `attch_yn='Y'`: 전 카테고리 첨부 허용
- `wr_min_role_cd`: 카테고리별 최소 작성 역할 (MASTER/MANAGER/USER)

### TASK-021: 게시글 CRUD API ✅ 완료

- ✅ `src/lib/board.ts` — `CategoryRow`, `PostRow`, `hasMinRole()`, `getCategory()`
- ✅ `GET /api/board/[category]` — 목록 (페이지네이션, 검색, 핀 우선 정렬)
  - PostgREST `.or()` 인젝션 방지: `,()* 제거 + %_\ 이스케이프`
- ✅ `GET /api/board/[category]/[postId]` — 상세 + 조회수 비동기 increment + 댓글 + 첨부파일
- ✅ `POST /api/board/[category]` — 게시글 작성 (최소 역할 체크)
- ✅ `PATCH /api/board/[category]/[postId]` — 수정 (본인 또는 ADMIN/MASTER)
- ✅ `DELETE /api/board/[category]/[postId]` — 논리삭제 (본인 또는 ADMIN/MASTER)

### TASK-022: 댓글 + QNA 채택 API ✅ 완료

- ✅ `POST /api/board/[category]/[postId]/comments` — 댓글 작성 (cmnt_yn='Y' 체크)
- ✅ `DELETE /api/board/[category]/[postId]/comments/[cmntId]` — 논리삭제
- ✅ `POST /api/board/[category]/[postId]/accept` — QNA 채택 (질문 작성자 전용)
  - `{cmnt_id: null}` 전달 시 채택 취소, Promise.all로 이전 채택 초기화 + 신규 채택 병렬 처리

### TASK-023: 첨부파일 API (Supabase Storage) ✅ 완료

- ✅ `POST /api/board/[category]/[postId]/attachments` — 다중 파일 업로드
  - `attch_yn='Y'` 체크, 최대 5개, 파일당 20MB 제한
  - Storage `board-attachments` 버킷, `{postId}/{uuid}.{ext}` 경로
  - DB INSERT 실패 시 Storage 파일 롤백 (고아 파일 방지)
- ✅ `DELETE /api/board/[category]/[postId]/attachments/[attchId]` — DB 논리삭제 + Storage 물리삭제

### TASK-024: 게시판 UI ✅ 완료

- ✅ `/board` — 카테고리 인덱스 페이지
- ✅ `/board/[category]` — 게시글 목록 (URL searchParams 기반 검색/페이지네이션, 공지/채택 배지)
- ✅ `/board/[category]/write` — 게시글 작성
- ✅ `/board/[category]/[postId]` — 상세 (서버 컴포넌트) + 낙관적 업데이트 댓글/첨부 섹션 (클라이언트)
- ✅ `/board/[category]/[postId]/edit` — 수정 (서버에서 기존 데이터 pre-fill)
- ✅ 헤더에 '게시판' 링크 추가

### TASK-025: 관리자 게시판 관리 ✅ 완료

- ✅ `GET /api/admin/board` — 전 카테고리 게시글 조회 (카테고리/페이지 필터)
- ✅ `PATCH /api/admin/board/[postId]` — 공지 pin_yn 토글 (서버 응답값으로 상태 동기화)
- ✅ `DELETE /api/admin/board/[postId]` — 강제 논리삭제 (ADMIN/MASTER 전용)
- ✅ `/admin/board` — 게시판 관리 UI (카테고리 필터 chip, 핀 토글, 삭제 버튼)

---

## Phase 5: 데이터 표준 시스템 ✅ (완료 — 6/6)

> **목표**: 표준단어·도메인·용어 CRUD, DDL Export, DA 품질 표준화, 승인 워크플로우

### DA 품질 점검 표준화 ✅ 완료 (비정기 작업 — 2026-06-06)

한국 DA 표준에 따른 전체 Supabase 스키마 정비. 19개 위반 항목 해소. API Route 26개 코드 현행화.

- ✅ Migration 003: `users`→`sys_user`, `payments`→`pi_pymnt`, `link_codes`→`auth_link_cd` 리네이밍
- ✅ Migration 004: `std_dic_sync`→`std_dic`, `std_dom_sync`→`std_dom` 리네이밍
- ✅ Migration 005: `created_at/updated_at` → `reg_dtm/mod_dtm` 통일, 트리거 함수명 표준화
- ✅ Migration 006: `std_*` 테이블 `regr_id`, `modr_id`, `del_yn` 추가
- ✅ Migration 007: `reg_usr_id`→`regr_id`, `mod_usr_id`→`modr_id` 복합어 표준(REGR/MODR) 적용
- ✅ Migration 008: 전 테이블 시스템 컬럼 4개 `NOT NULL DEFAULT` 강제화 (33개 테이블)
- ✅ `docs/da/reports/2026-06-06_품질검토수행완료보고서.md` 신규 작성 (2026-06-08 ReORG에서 이동)
- ✅ `docs/da/데이터표준규칙.md` 표준 규칙 문서화 (2026-06-08 정본 승격 — 구 .claude/skills 경로에서 이동)
- ✅ 명명규칙 점검 가이드 — `docs/da/품질점검기준서.md`로 통합 (구 da-qa-naming-auditor.md 병합)

### TASK-030: 표준단어 관리 ✅ 완료

- ✅ `std_dic` 테이블 (Migration 004에서 리네이밍)
- ✅ `GET/POST /api/admin/std/words` — 검색·등록
- ✅ `PATCH/DELETE /api/admin/std/words/[id]` — 수정·논리삭제 (`del_yn='Y'`)
- ✅ `/admin/std/words` UI — 검색, 등록 모달, 수정/삭제

### TASK-031: 표준도메인 관리 ✅ 완료

- ✅ `std_dom` 테이블 (Migration 004에서 리네이밍)
- ✅ `GET/POST /api/admin/std/domains` — 구분 필터(코드/식별자/일반), 등록
- ✅ `PATCH/DELETE /api/admin/std/domains/[id]` — 수정·논리삭제
- ✅ `/admin/std/domains` UI — 도메인 구분 필터칩, 데이터타입/길이 표시

### TASK-032: 표준용어 관리 ✅ 완료

- ✅ `std_term` 테이블 신규 생성 + `std_dic` 복합어 41건 이관
- ✅ `GET/POST /api/admin/std/terms` — 검색·등록
- ✅ `PATCH/DELETE /api/admin/std/terms/[id]` — 수정·논리삭제
- ✅ `/admin/std/terms` UI — 표준단어+도메인 선택으로 물리명 자동 생성 (실시간 미리보기)
- ✅ 표준단어 구분(복합어) 필드 제거 — `dic_gbn_cd` 단일화

### TASK-033: DDL Export ✅ 완료

- ✅ `/admin/std/ddl` UI — 표준용어 검색으로 컬럼 선택 → `CREATE TABLE` DDL 자동 생성
- ✅ 도메인 약어(`nm/cd/id/dt/dtm` 등)로 SQL 타입 자동 추론
- ✅ PostgreSQL / MySQL 탭 전환 (`TIMESTAMP·NUMERIC·COMMENT ON` vs `DATETIME·DECIMAL`)
- ✅ 컬럼 PK·NOT NULL 체크, 순서 변경(↑↓), 타입 직접 수정
- ✅ DDL 복사 버튼 + `.sql` 파일 다운로드

### TASK-034: Audit Trail (변경 이력) ✅ 완료

- ✅ Migration 009: `std_audit_log` 테이블 + 공통 트리거 함수 `fn_std_audit_log()`
  - `tgt_tbl/tgt_id/action_cd/old_val(JSONB)/new_val(JSONB)/chgr_id/chg_dtm`
  - AFTER INSERT OR UPDATE OR DELETE 트리거 — `std_dic`, `std_dom`, `std_term` 각각 적용
  - JSONB key 추출(`dic_id/dom_id/term_id` COALESCE)로 단일 함수가 3개 테이블 처리
- ✅ `GET /api/admin/std/audit` — tbl/from/to/page 필터, 50건 페이지네이션
- ✅ `/admin/std/audit` UI — 테이블·날짜 필터, 행 클릭으로 old_val/new_val JSON 펼침

### TASK-035: 승인 워크플로우 ✅ 완료

- ✅ Migration 010: `approval_queue.apv_id` DEFAULT 추가, `apv_status` CHECK 제약, `std_dom.apv_status` 컬럼 추가
- ✅ `GET /api/admin/std/approvals` — 상태·엔터티 유형 필터, 30건 페이지네이션
- ✅ `POST /api/admin/std/approvals` — 승인 요청 생성 (entity_type/entity_id/req_data)
- ✅ `PATCH /api/admin/std/approvals/[apvId]` — 승인(approve)/반려(reject), MASTER 전용
  - 승인 시 `std_dic/dom/term.apv_status='APPROVED'` 동기화
  - 반려 시 사유 필수 입력, `apv_status='REJECTED'` 동기화
- ✅ `/admin/std/approvals` UI — 상태 필터칩, 인라인 반려 사유 입력, 요청 데이터 펼침

---

## Phase 6: 다국어 처리 ✅ (완료 — 7/7)

> **목표**: next-intl v4 기반 다국어 지원 (ko / en / zh / ja / hi / vi / af / fil / th / id / ms / es / fr / de / it / ru / pt / ar)

- ✅ **TASK-040**: next-intl v4 설치 + `[locale]` App Router 라우팅 재구성, `middleware.ts` 인터셉터, `i18n/routing.ts` 설정
- ✅ **TASK-041**: 번역 파일 + UI 적용 — ko.json 409키 정의, `useTranslations()` / `getTranslations()` 전 페이지·컴포넌트 적용, 3단계 fallback (locale → en → ko), `readFile()` 로 모듈캐시 우회
- ✅ **TASK-042**: 국가/언어 DB — `i18n_locale` / `i18n_message` Supabase 테이블, DB→JSON 동기화 API (`/api/admin/i18n/sync`), 관리자 번역 현황 대시보드 (`/admin/i18n`)
- ✅ **TASK-043**: AI 자동 번역 — Gemini 2.5 Flash 무료 API, 배치 50건 + 4.5초 rate-limit 대기, 배치별 즉시 upsert (부분실패 보존), 영어 차용어 역번역 프롬프트 규칙, 18개 언어 지원
- ✅ **TASK-044**: 다국어 안정성 강화 + 보안 패치 (2026-06-07)

**TASK-044 상세** (재발 방지 + 보안 개선):
- ✅ `src/lib/locale-currency.ts` — LOCALE_CURRENCY 단일 소스 (3개 파일 중복 제거)
- ✅ `src/lib/locale-country.ts` — LOCALE_COUNTRY + `getAlpha2()` + `ACTIVE_COUNTRY_CODES` 단일 소스
- ✅ `src/i18n/routing.ts` — 203개 국가 코드 선점 등록 (기존 20개 → 203개, 재배포 없이 신규 locale 활성화 가능)
- ✅ `src/app/api/admin/i18n/locale/route.ts` — `addLocaleToRouting()` 추가 (로컬 개발 시 routing.ts 자동 수정, Vercel 프로덕션은 read-only라 무시)
- ✅ `src/app/api/admin/i18n/locale/route.ts` — `LOCALE_CD_RE = /^[a-z]{2,3}(-[A-Z]{2,3})?$/` 검증 추가 (코드 인젝션 방지 HIGH 취약점 해소)
- ✅ `src/app/api/admin/i18n/translate/route.ts` — `Intl.DisplayNames` 도입으로 정적 언어명 맵 제거 (새 locale 추가 시 수정 불필요)
- ✅ `messages/il.json` — 히브리어(이스라엘) 번역 파일 생성

**버그 수정 이력** (근본 원인 → 해결책):
| 버그 | 원인 | 해결 |
|---|---|---|
| USD/AUD Pi 시세 동일 | `pi-price-chip.tsx`의 로컬 LOCALE_CURRENCY에 `au` 누락 | locale-currency.ts 단일 소스 |
| 이스라엘 ⚠ 라우팅 미등록 | routing.ts에 `il` 미등록, 3개 파일에 중복된 맵 | 203개 선점 등록 + 단일 소스 |
| 이스라엘 번역 "지원하지 않는 언어입니다" | translate API의 정적 LOCALE_NAMES에 `il` 누락 | Intl.DisplayNames 도입 |
| 에티오피아 ⚠ 라우팅 미등록 | 동일한 근본 원인 | 203개 선점 등록으로 구조적 해결 |

**핵심 설계 결정**:
- next-intl v4의 `getTranslations()` (서버) / `useTranslations()` (클라이언트) 분리
- `ko.json`이 source of truth — DB 통계도 ko.json 파일 기준 키 수 계산
- `readFile()` 사용 (동적 `import()` 는 Node 모듈캐시로 동기화 결과 미반영)
- 3단계 fallback: 미번역 콘텐츠는 영어 → 한국어 순으로 표시 (키명 노출 방지)
- Gemini 무료 15 RPM 제한 대응: 배치 50개 + 4.5초 sleep 패턴
- `routing.ts`는 컴파일 타임 정적 — Vercel 소스 파일은 런타임 수정 불가 (read-only)

---

## Phase 7: PiCafé MVP ✅ (완료)

> **목표**: 테마 기반 1:1·그룹 카페 + Supabase Realtime + Pi 결제 연동 + 구독 시스템
> **상세 스펙**: `docs/PRD_4_CHAT.md` (v1.6)

### TASK-050: DB 마이그레이션 (`msg_*` 13개 테이블) ✅ 완료

- ✅ `sql/012_msg_tables.sql` 작성 — DA 표준 시스템 컬럼 4개 전 테이블 필수
- ✅ `msg_theme` — 테마 마스터 (`theme_tp_cd`: BASIC/PREMIUM)
- ✅ `msg_subscr_plan` — 구독 플랜 정의 (`mth_cnt` DA 표준 컬럼명)
- ✅ `msg_stkr_pack` / `msg_stkr` — 스티커 팩·개별 항목
- ✅ `msg_theme_stkr` — 테마 기본 스티커팩 매핑
- ✅ `msg_room` — 카페 (`room_tp_cd`: D/G/E, `entry_fee_pi`, `is_public_yn`)
- ✅ `msg_room_mbr` — 카페 멤버 (`mbr_role_cd`: OWNER/ADMIN/MEMBER/GUEST)
- ✅ `msg_msg` — 메시지 (`msg_tp_cd`: TEXT/IMAGE/FILE/VOICE/STICKER/TIP_NOTI/SYSTEM)
- ✅ `msg_msg_reac` — 메시지 이모지 반응
- ✅ `msg_attch` — 카페 첨부파일
- ✅ `msg_subscr` — 사용자 구독 현황
- ✅ `msg_usr_stkr` — 사용자 보유 스티커팩
- ✅ `msg_tip` — Pi Tip 내역 (`tip_cont` DA 표준 컬럼명)
- ✅ Realtime RLS 정책: `msg_msg` 카페 멤버만 구독 가능 (service_role bypass 유지)

### TASK-051: 테마 마스터 데이터 세팅 ✅ 완료

- ✅ `sql/013_msg_seed.sql` — 20개 테마 INSERT (BASIC 6개 + PREMIUM 14개)
- ✅ 테마별 기본 스티커팩 3종(이모지팩·일러스트팩·인사/응원팩) × 20개 = 60개 `msg_stkr_pack` INSERT
- ✅ `msg_theme_stkr` 60개 매핑 (DO 블록 + RETURNING으로 원자적 처리)
- ✅ `msg_subscr_plan` 5개 INSERT: FREE / PREMIUM_MONTHLY·ANNUAL / BUSINESS_MONTHLY·ANNUAL
- 🔜 `/api/admin/chat/themes` — 관리자 테마 CRUD API (TASK-052 이후 별도 구현)

### TASK-052: 1:1 카페 API + Supabase Realtime ✅ 완료

- ✅ `src/lib/chat.ts` — MsgRoom·MsgMsg·MsgRoomMbr 타입 + CRUD 헬퍼
- ✅ `src/lib/supabase-client.ts` — 클라이언트 Realtime용 Supabase 인스턴스 (publishable key)
- ✅ `GET /api/chat/rooms` — 내 카페 목록, `POST` — 1:1 Direct Room 생성
- ✅ `GET /api/chat/rooms/[roomId]` — 상세 + 멤버 목록 + 내 역할
- ✅ `GET /api/chat/rooms/[roomId]/messages` — cursor 페이지네이션 (scroll-up 무한로드)
- ✅ `POST /api/chat/rooms/[roomId]/messages` — 메시지 전송 + rate limiting (1초 5건)
- ✅ `POST /api/chat/rooms/[roomId]/join` — 공개 그룹방 입장 (정원 확인)
- ✅ `src/hooks/use-chat-room.ts` — `postgres_changes` + `presence` 구독 훅, 중복 방지 + scroll-up prepend
- ✅ `src/components/chat/chat-message-list.tsx` — 실시간 렌더링, scroll-up 무한로드, 시스템 메시지 분기
- ✅ `src/components/chat/chat-input.tsx` — Enter 전송, Shift+Enter 줄바꿈, 높이 자동조절, rate limit 복원
- 🔜 E2E 암호화 — Pi 지갑 키 기반 (Phase 8 이후 적용)

### TASK-053: 그룹 카페 생성 (테마 선택 UX + Pi 결제) ✅ 완료

```
카페 생성 UX:
Step 1: 테마 선택 (BASIC 자유 / PREMIUM 🔒 → 단건 0.2 Pi 또는 구독)
Step 2: 카페 이름·설명 (테마 이모지 자동 제안)
Step 3: 공개/비공개 + 정원 설정 (10/30/50/100명)
Step 4: Pi 결제 (BASIC 0.1 π / PREMIUM 0.3 π)
```

- ✅ `src/app/api/chat/themes/route.ts` — GET 테마 목록 (msg_theme 조회)
- ✅ `src/components/chat/inline-purchase-prompt.tsx` — 인라인 구매 트리거 공통 컴포넌트
- ✅ `src/components/chat/theme-selector.tsx` — 테마 선택 그리드 (BASIC 자유 / PREMIUM 🔒 InlinePurchasePrompt)
- ✅ `src/components/chat/group-room-creator.tsx` — 4단계 마법사 Dialog (테마→이름→설정→Pi결제)
- ✅ `src/components/chat/chat-room-panel.tsx` — ChatMessageList + ChatInput 래퍼 (Realtime 단일 구독)
- ✅ `/api/payments/complete` — `CHAT_ROOM_CREATE` 분기 추가 (결제완료 시 msg_room + msg_room_mbr 원자 생성)
- ✅ `src/app/[locale]/chat/page.tsx` — 카페 홈 (내 카페 + 공개방 탐색 + GroupRoomCreator)
- ✅ `src/app/[locale]/chat/[roomId]/page.tsx` — 카페 (초기 50건 서버 프리페치 + Realtime)
- ✅ Header에 '카페' 링크 추가

### TASK-055: Pi Browser 쿠키 비의존 인증 (X-Pi-Token) ✅ 완료 (2026-06-08)

> **핵심 가치 직결** — Pi Browser WebView는 모든 방식(form POST·fetch·redirect·HTML)의
> `Set-Cookie`를 저장하지 않아, 쿠키 기반 페이지 보호로는 카페·관리자 접속 시
> 무한 리다이렉트 루프가 발생했다(로그인 자체 불가). CLAUDE.md "인증 + 세션 구조"의
> 쿠키↔X-Pi-Token 이중 경로 + 클라이언트 게이트 패턴으로 근본 해결.

#### 구현 파일

- ✅ `src/lib/pi-fetch.ts` — `piFetch`(X-Pi-Token 헤더 자동 첨부) + 토큰 localStorage 저장/조회
- ✅ `src/lib/auth-check.ts` — `getSessionUser()` 쿠키 OR X-Pi-Token 헤더 + `tokenValidUntil` 만료 검증
- ✅ `src/app/api/auth/pi/route.ts` — POST 응답에 세션 `token` 이중 반환
- ✅ `src/components/pi-auth-provider.tsx` — 로그인 흐름 fetch POST + setPiToken 통일, 보호 페이지 router.push
- ✅ `chat-list-view` · `client-chat-list` · `client-chat-room` — 클라이언트 게이트
- ✅ `chat/page.tsx` · `chat/[roomId]/page.tsx` — 쿠키 미인식 시 클라이언트 게이트 폴백
- ✅ `use-chat-room.ts` · `chat-message-list.tsx` — 메시지 송신/로드 `piFetch` 전환
- ✅ `client-admin-gate.tsx` + admin layout — 무한 루프 차단 안내

#### 후속 과제

- 🔜 admin 12개 페이지 클라이언트 데이터 로드 전환 (현재는 PC 브라우저 권장 안내)
- 🔜 dead route 정리: `pi-code` · `pi-callback` · `pi-redirect` (쿠키 흐름 제거로 미사용)

### TASK-054: 구독 시스템 (플랜 + Pi 결제 + PiRC2 Soroban) ✅ 완료 (2026-06-09)

> **PiRC2 컨트랙트** (Pi Testnet): `CCUF75B6W3HRJTJD6O7OXNI72HGJ7DERZ5MUNOMFMSK23ME5GUIKPFYV`
> 공식 문서: https://github.com/PiNetwork/PiRC (PiRC2 디렉토리, 9개 섹션)
> CLAUDE.md의 "PiRC2 스마트 컨트랙트" 섹션 참고

#### 구현 파일

- ✅ `src/lib/chat-auth.ts` — `getChatPlan()`·`canCreateRoom()`·`canSendTip()`·`getAiQuota()` (server-only). 등급별 한도를 `PLAN_CAPS` 단일 매트릭스로 관리(무제한 = `-1` 센티넬)
- ✅ `GET /api/subscriptions/plans` — 플랜 목록 + 현재 사용자 등급
- ✅ `POST /api/subscriptions` — 구독 결제 준비. 서버가 `price_pi`로 amount를 권위 있게 확정해 `createPayment` 파라미터 반환(metadata.type=`CHAT_SUBSCR`)
- ✅ `DELETE /api/subscriptions` — 구독 취소. `auto_renew_yn='N'`만 해제하고 `expire_dtm`까지 이용 유지(만료 시 `getChatPlan`이 자동 FREE 강등). 즉시 논리삭제는 환불정책+PiRC2 `cancel()` 연동 시로 보류
- ✅ `GET /api/subscriptions/check` — 기능별 권한 매트릭스 `{ tier, canTip, canUsePremiumTheme, canCreateEventRoom, canCreateRoomFree, aiQuota... }`
- ✅ `/api/payments/complete` — `CHAT_SUBSCR` 분기 추가. 결제 amount ≥ `price_pi` 서버 재검증 후 `mth_cnt` 기반 만료일 계산 + `msg_subscr` UPSERT(`usr_id` UNIQUE)
- ✅ `src/components/chat/subscription-gate.tsx` — 유료 기능 접근 게이트(piFetch 권한확인 → 잠금 시 InlinePurchasePrompt 구독 결제)

#### PiRC2 통합 전략

**단기 (TASK-054)**: 기존 U2A 결제 흐름 유지 — Pi SDK `createPayment()` → `/payments/complete`에서 `msg_subscr` UPSERT. PiRC2 컨트랙트 없이 앱 레벨 구독 관리.

**중기 (Pi SDK Soroban 지원 시)**: `subscribe()` 직접 통합 (구독자 Pi Wallet 서명). `process()` cron job은 판매자 서버 키로 즉시 실행 가능.

```
플랜 ID          가격      기간    PiRC2 price (units)
PREMIUM_MONTHLY  1 Pi/월  30일    10_000_000
PREMIUM_ANNUAL   10 Pi/년 365일   100_000_000
BUSINESS_MONTHLY 5 Pi/월  30일    50_000_000
BUSINESS_ANNUAL  50 Pi/년 365일   500_000_000
```

#### `msg_subscr` 테이블 분기 처리 (`payments/complete/route.ts`)

```typescript
if (meta?.type === 'CHAT_SUBSCR') {
  const planDays = meta.plan_cd === 'PREMIUM_ANNUAL' ? 365
    : meta.plan_cd === 'BUSINESS_ANNUAL' ? 365 : 30
  const expireDtm = new Date(Date.now() + planDays * 86400_000)
  await db.from('msg_subscr').upsert({
    usr_id: owner.id,
    plan_cd: String(meta.plan_cd),
    pymnt_id: paymentId,
    start_dtm: new Date().toISOString(),
    expire_dtm: expireDtm.toISOString(),
    auto_renew_yn: 'Y',
    regr_id: slug, modr_id: slug,
  }, { onConflict: 'usr_id' })
}
```

---

## Phase 8: PiCafé 수익화 기능 ✅ (완료, 2026-06-11)

> **목표**: Pi Tip·스티커 마켓·AI 봇·이벤트방·인라인 구매 트리거 8종 구현
> **빌드 검증**: `pnpm tsc --noEmit` 통과 · `pnpm lint` 0 errors · `pnpm build` 성공

### TASK-060: Pi Tip (인라인 결제 + TIP_NOTI 메시지) ✅ 완료

- ✅ `src/components/chat/pi-tip-button.tsx` — 카페창 내 Tip 버튼 (Pi SDK U2A 결제 연동)
- ✅ `POST /api/tips/route.ts` — Tip 기록 (metadata.type=`PI_TIP`, 금액 서버 재검증)
- ✅ Pi Tip 수신 시 `TIP_NOTI` 타입 메시지 자동 발송 → 수신자 실시간 알림
- ✅ 트리거 2 구현: TIP_NOTI "나도 팁 보내기" → Free 사용자 단건/구독 업셀 선택
- ✅ 차트 테마 레이블 한국어화 + Tip 결제 완료 처리 (Pi payments/complete 분기)

### TASK-061: 스티커 마켓 (테마별 팩 + 인라인 업셀) ✅ 완료

- ✅ `src/components/chat/sticker-picker.tsx` — 스티커 선택 UI (기본 3개 팩 + 하단 업셀 배너)
- ✅ `GET /api/stickers/packs` — 테마별 스티커 팩 마켓 (msg_sticker_pack 조회)
- ✅ `POST /api/stickers/packs` — 스티커 팩 구매 (metadata.type=`STICKER_PACK`, Pi U2A)
- ✅ `chat-input.tsx` 스티커 전송 통합 (STICKER 타입 메시지)
- ✅ 트리거 1 구현: 스티커 메뉴 하단 업셀 배너 (미구매 팩 자동 하이라이트)

### TASK-062: 인라인 구매 트리거 8종 구현 ✅ 완료

| 트리거 | 발동 조건 | 구현 상태 |
|---|---|---|
| 1 스티커 업셀 | 스티커 메뉴 열 때 | ✅ `sticker-picker.tsx` 하단 배너 |
| 2 Tip 수신→보내기 | TIP_NOTI "보내기" 클릭 | ✅ `inline-purchase-prompt.tsx` |
| 3 AI 한도 초과 | AI 사용 한도 도달 | ✅ `chat-input.tsx` AI 응답 실패 시 |
| 4 메시지 만료 경고 | 7일 내 만료 메시지 존재 | ✅ 카페 입장 시 상단 배너 |
| 5 정원 초과 | 멤버 수 = max_mbr_cnt | ✅ 방장 대상 알림 팝업 |
| 6 프리미엄 테마 잠금 | PREMIUM 테마 클릭 | ✅ `theme-selector.tsx` 잠금 팝업 |
| 7 배지 강화 | 테마 배지 수여 시 | ✅ Trigger 7 테마 활동 배지 시스템 (`50d12d2`) |
| 8 이벤트방 알림 | 팔로우 테마 이벤트 개설 | ✅ 카페 홈 배너 (`8448284`) |

### TASK-063: 이벤트 카페 (유료 입장 + 방장 수익 분배) ✅ 완료

- ✅ `room_tp_cd='E'` 이벤트방 생성 — `entry_fee_pi`, `entry_expire_dtm` 설정
- ✅ 입장 시 Pi 결제 (metadata.type=`EVENT_ROOM_JOIN`)
- ✅ `msg_room_mbr(GUEST, expire_dtm=이벤트종료)` — 임시 멤버십
- ✅ 방장 Pi 수익 분배 로직 (플랫폼 수수료 0% 초기 3년 정책)
- ✅ 카페 만들기 다이얼로그에 "이벤트방" 탭 추가 (`c532607`)
- ✅ 트리거 8 구현: 테마 팔로우 사용자 이벤트 알림

### TASK-064: AI 카페 비서 (`@ai` 멘션 + 테마별 프롬프트) ✅ 완료

- ✅ `src/lib/chat-ai-prompts.ts` — 테마별 Claude 시스템 프롬프트 매핑
  - 골프방: 골프 코치 · 먹방방: 칼로리·영양 전문가 · 여행방: 여행 플래너·번역
- ✅ 메시지 내 `@ai` 멘션 파싱 → Anthropic API 호출 → `AI_REPLY` 타입 메시지 발송
- ✅ AI 사용 한도 체크 (Free: 불가/0.05 Pi · Premium: 10회/월 · Business: 무제한)
- ✅ 트리거 3 구현: AI 한도 초과 인라인 구매 프롬프트

### TASK-065: 파일·이미지·음성 메시지 (Supabase Storage) ✅ 완료

- ✅ `msg_attch` 테이블 활용 — `IMAGE`/`FILE`/`VOICE` 타입 메시지
- ✅ 파일 업로드: MIME 화이트리스트, 크기 강제 (Premium: 100MB/월, Business: 1GB/월)
- ✅ 음성 메시지 녹음: Free 30초 / Premium 1분 / Business 5분
- ✅ Supabase Storage `chat-attachments` 버킷 연동

---

## Phase 9: PiCafé 생태계 확장 ✅ (완료, 2026-06-11)

> **목표**: 마켓플레이스·Webhook·분석 대시보드·커스텀 스티커로 Pi 커뮤니티 생태계 구축
> **DB**: `sql/022_chat_ecosystem.sql` — 신규 5개 테이블 + RPC 3종 + msg_msg CHECK 확장 (Supabase 적용 완료)
> **빌드 검증**: `pnpm tsc --noEmit` 통과 · `pnpm lint` 0 errors · `pnpm build` 성공 (신규 라우트 12종 확인)
> ⚠️ **버그 수정 포함**: `msg_msg` CHECK 제약에 `AI_REPLY` 누락 — TASK-064 AI 응답 INSERT가 조용히 실패하던 잠재 버그를 022 마이그레이션에서 해소

### TASK-070: 카페 마켓플레이스 (테마별 공개방 디렉토리) ✅ 완료

- ✅ `GET /api/chat/marketplace?theme=` — 공개 그룹·이벤트방 디렉토리 (테마 필터)
- ✅ `fn_chat_marketplace` RPC — 인기 랭킹 (점수 = 멤버수×2 + 주간 메시지×0.5 + 주간 Tip×10)
- ✅ `msg_theme_follow` 테이블 + `POST/DELETE /api/chat/themes/[themeCd]/follow` (UPSERT 재팔로우 안전)
- ✅ `chat-marketplace.tsx` — 테마 필터 칩 + 🥇🥈🥉 랭킹 + 팔로우 토글 (낙관적 업데이트), 카페 홈 통합

### TASK-071: Pi Bet 투표 ✅ 완료

- ✅ `msg_bet` / `msg_bet_optn` / `msg_bet_entry` 테이블 (UNIQUE(bet_id, usr_id) — 1인 1회)
- ✅ `GET/POST /api/chat/rooms/[roomId]/bets` — 목록(옵션·참가 현황·내 참가) + 생성(방장 전용, 옵션 2~10개)
- ✅ `POST .../bets/[betId]/entries` — 참가 준비 (서버가 금액 결정, /api/tips 패턴)
- ✅ `payments/complete` PI_BET 분기 — 금액 서버 재검증 + OPEN 상태 확인 + entry INSERT + BET_NOTI
- ✅ `POST .../bets/[betId]/settle` — 생성자 정산: 풀 균등 분배(소수 4자리 절사), 조건부 UPDATE로 동시 정산 race 방지
- ✅ `msg_tp_cd='BET_NOTI'` 추가 (CHECK 확장 + 중앙 정렬 알림 렌더)
- ✅ `pi-bet-panel.tsx` — 카페 헤더 🎲 버튼 → 생성·참가(Pi U2A)·정산 패널
- ℹ️ 승자 Pi 분배는 `payout_pi` 장부 기록 — 실송금(A2U)은 Pi SDK 지원 시 후속 (PiRC2 구독과 동일 전략)

### TASK-072: 카페 봇·Webhook 연동 (Business 전용) ✅ 완료

- ✅ `msg_webhook` 테이블 (api_key UNIQUE, bot_nm, webhook_url nullable)
- ✅ `GET/POST/DELETE /api/chat/rooms/[roomId]/webhooks` — 방장+BUSINESS 게이트, 방당 5개 제한, api_key 등록 시 1회만 전체 노출
- ✅ SSRF 이중 방어 — `validateWebhookUrl()`: https 강제 + DNS 해석 후 loopback·사설(10/8, 172.16/12, 192.168/16)·link-local(169.254 메타데이터)·IPv6 내부 대역 차단, 등록·발송 양 시점 재검증(DNS rebinding 대비) + `redirect: 'manual'`(302 우회 차단)
- ✅ 신규 메시지 Webhook push — `chat-webhook.ts`, messages POST `after()` 백그라운드 (5초 타임아웃, 개별 실패 격리)
- ✅ `POST /api/chat/bot/messages` — `Authorization: Bot <api_key>` 인증 봇 전송 (분당 30건 rate limit)
- ✅ `GET /api/admin/chat/webhooks` — 어드민 전체 현황 (api_key 마스킹)

### TASK-073: 분석 대시보드 (Business 전용) ✅ 완료

- ✅ `fn_room_analytics` RPC — 일별 메시지·활성 사용자·Tip 수익·신규 멤버 (generate_series 빈 날짜 0 채움)
- ✅ `fn_room_mau` RPC — 기간 고유 발신자 (일별 합산 아닌 중복 제거)
- ✅ `GET /api/chat/rooms/[roomId]/analytics?days=7|30|90` — 방장+BUSINESS 게이트
- ✅ `src/app/[locale]/chat/[roomId]/analytics/page.tsx` + `room-analytics.tsx` — 요약 카드 4종 + plotly 차트 2종 (기존 plotly-plot ssr:false 래퍼 재사용), 카페 헤더 📊 진입
- ✅ redirect 없는 클라이언트 위임 (Pi Browser 무한 루프 방지 패턴 준수)

### TASK-074: 커스텀 스티커 제작 (Business 전용) ✅ 완료

- ✅ `POST /api/stickers/custom` — multipart 이미지 1~10장 (png/jpg/gif/webp 2MB, SVG 제외 — XSS), BUSINESS 게이트, 사용자당 팩 10개 제한
- ✅ `msg_stkr_pack.ownr_usr_id`(제작자) + `mkt_yn`(마켓 판매 여부) 컬럼 추가
- ✅ 노출 규칙: 플랫폼 기본팩 + 마켓 판매팩(mkt_yn='Y') + 내 팩만 — `/api/stickers/packs` 필터 확장
- ✅ 제작자 자동 보유(msg_usr_stkr) — 마켓 판매 시 구매자는 기존 STICKER_PACK 결제 흐름 재사용
- ✅ `custom-sticker-creator.tsx` — 스티커 피커 🎨 버튼 → 제작 다이얼로그 (미리보기·판매 옵션)
- ℹ️ PRD의 제작비 0.5 Pi는 **Business 플랜 포함**으로 처리 (BUSINESS 전용 기능 — 별도 결제 흐름 생략)

### Phase 9 후속 — Pi Bet UI 개선 ✅ 완료 (2026-06-14)

- ✅ Pi Bet 패널 아코디언 구조 (`c490fb7`) — 항목별 접기/펼치기, OPEN 상태 기본 펼침
- ✅ 선택지 색상 팔레트 4종 순환 (cyan·purple·amber·emerald) + 상태별 헤더 색상 구분
- ✅ 당첨자 황금 스포트라이트 글로우 애니메이션 (`bet-spotlight` CSS keyframe, 1.6s 맥동)
- ✅ 당첨 배너 shimmer 효과 (`bet-shimmer`) — 아코디언 밖 항상 표시, 획득 Pi 금액 표기
- ✅ `globals.css`에 3종 `@keyframes` 추가 (bet-spotlight·bet-confetti·bet-shimmer)

---

## Phase 10: 사용자 프로필 관리 (마이페이지) ✅ 완료 (2026-06-09)

> **목표**: 개인정보 수정 · 결제 내역 · 구독 현황 — Pi Browser 실기기 동작 보장 최우선
> **상세 스펙**: `docs/PRD_5_USERS.md` | **담당 에이전트**: `.claude/agents/user-profile-manager.md`
> **빌드 검증**: `pnpm tsc --noEmit` 통과 · `pnpm lint` 0 errors · `pnpm build` 성공

### TASK-056: DB 마이그레이션 — sys_user 프로필 컬럼 추가 ✅

- ✅ `sql/014_user_profile_columns.sql` 작성
- ✅ `real_nm TEXT`, `nick_nm TEXT`, `phone_no TEXT`, `addr TEXT`, `addr_dtl TEXT` 컬럼 추가
- ✅ DA 표준 준수 (시스템 컬럼 4개 기존 보유, 논리삭제 del_yn='Y' 정책 유지)
- ✅ Supabase 적용 완료 확인

### TASK-057: API — GET /api/profile ✅

- ✅ `src/app/api/profile/route.ts` (GET) 구현
- ✅ `getSessionUser()` — 쿠키/X-Pi-Token 이중 인증 자동 지원
- ✅ sys_user 조회 → UserRow(프로필 확장 포함) 반환
- ✅ `src/lib/users.ts` — `UserRow` 타입 확장 (5개 컬럼 추가)

### TASK-058: API — PATCH /api/profile ✅

- ✅ `src/app/api/profile/route.ts` (PATCH) 구현
- ✅ Zod v4 스키마 검증 (real_nm, nick_nm, phone_no, addr, addr_dtl, display_name)
- ✅ `src/lib/users.ts` — `updateUserProfile()` 함수 추가
- ✅ `modr_id`, `mod_dtm` 자동 갱신 (DA 표준)

### TASK-059: API — GET /api/profile/payments ✅

- ✅ `src/app/api/profile/payments/route.ts` (GET) 구현
- ✅ pi_pymnt 테이블 — user_id 기준 최신순 20건 조회
- ✅ status·amount·memo·reg_dtm 포함 응답

### TASK-060: 컴포넌트 — ProfileTabs + ClientProfileGate ✅

- ✅ `src/app/[locale]/profile/page.tsx` — Server Component
  - `getSessionUser()` null 시 `<ClientProfileGate />` 반환 (**redirect 절대 금지**)
- ✅ `src/app/[locale]/profile/_components/client-profile-gate.tsx` — Pi Browser 게이트
  - localStorage `pi_token` → `piFetch('/api/profile')` → 프로필 로드
  - 실패(401) → "로그인이 필요합니다" 표시
- ✅ `src/app/[locale]/profile/_components/profile-tabs.tsx` — 탭 전환 UI

### TASK-061: 컴포넌트 — ProfileForm · PaymentHistory · SubscriptionStatus ✅

- ✅ `src/app/[locale]/profile/_components/profile-form.tsx`
  - `piFetch()` PATCH 호출 — X-Pi-Token 헤더 자동 첨부
  - FormData 기반 6개 필드 + 저장 피드백 메시지
- ✅ `src/app/[locale]/profile/_components/payment-history.tsx`
  - `piFetch('/api/profile/payments')` + 빈 상태 UI
- ✅ `src/app/[locale]/profile/_components/subscription-status.tsx`
  - 기존 `/api/subscriptions/check` + `/api/subscriptions` DELETE 재사용
  - PLAN_CAPS 기반 플랜 배지(FREE/PREMIUM/BUSINESS) 표시

### TASK-062: 번역 + 3단계 검증 ✅

- ✅ `messages/ko.json` — `profile` 네임스페이스 추가
- ✅ 빌드 검증: `pnpm tsc --noEmit` 통과 · `pnpm lint` 0 errors · `pnpm build` 성공
  - `ƒ /[locale]/profile`, `ƒ /api/profile`, `ƒ /api/profile/payments` 라우트 확인
- ⏳ 2단계: Playwright — X-Pi-Token 헤더 시뮬레이션 인증 경로 검증 (Pi Browser 배포 후 권장)
- ⏳ 3단계: Pi Browser 실기기 — ClientProfileGate 동작 + 편집 저장 + 결제/구독 탭 전환

---

## Phase 11: 어드민 통계 대시보드 ✅ (완료)

> **목표**: DAU/WAU/MAU 사용자 활동 추이 + 테마(카테고리)별 매출 시각화
> **상세 스펙**: `docs/PRD_6_CHART.md` | **담당 에이전트**: `.claude/agents/chart/dashboard-stats-builder.md`
> **핵심 결정**: ① 차트 = **react-plotly.js**(순수 JS, `ssr:false` dynamic) ② 활동집계 = **신규 활동 로그**(하루 1행 UPSERT) ③ 집계방식 = **중간집계(Rollup) 테이블 사전 집계 → 대시보드 직접 조회**

### TASK-080: 활동 로그 마이그레이션 (`sql/015`) ✅

- ✅ `sql/015_user_activity_log.sql` — `sys_user_actvty_log` (`UNIQUE(usr_id, actvty_dt)` 하루 1행)
- ✅ `fn_record_activity(usr_id, type)` — `ON CONFLICT DO UPDATE` UPSERT RPC
- ✅ DA 표준: 시스템 컬럼 4개 + `del_yn`, `-- DA-APPROVED:` 주석

### TASK-081: 활동 계측 (원천 적재 시작) ✅

- ✅ `src/lib/activity-log.ts` — `recordActivity()` fire-and-forget 헬퍼
- ✅ `/api/auth/pi` GET(세션 복원) · POST(로그인) 양쪽 계측 삽입
- ⚠️ **소급 불가** — 배포 즉시 데이터 축적 시작

### TASK-082: 중간집계 테이블 + 집계 RPC (`sql/016`) ✅

- ✅ `stat_actvty_dly` — 일별 DAU/WAU/MAU 사전 집계
- ✅ `stat_revenue_dly` — 일별 × 테마별 매출 (PK `stat_dt, theme_cd`)
- ✅ `fn_build_daily_stats(p_dt date)` — **멱등** 집계(백필·보정 안전). 매출 4경로 UNION(방·팁·스티커·구독 `SUBSCR`)

### TASK-083: 집계 배치 + 백필 ✅

- ✅ `POST /api/admin/stats/aggregate` — `CRON_SECRET` Bearer 보호 + 어드민 세션 이중 인증, `fn_build_daily_stats` 호출
- ✅ `vercel.json` Vercel Cron 등록 — `0 0 * * *` (Hobby: 매일 UTC 자정), 전일분 자동 집계
- ✅ 백필 모드 지원 — `{ backfill: true }` 요청 시 `sys_user_actvty_log` 최초일 ~ 어제 자동 루프
- ✅ 실데이터 확인: `stat_actvty_dly` 5일치 (2026-06-05~09), `stat_revenue_dly` 4일치 (2026-06-06~09) 적재 완료

### TASK-084: 통계 API ✅

- ✅ `src/types/stats.ts` — `ActivityStatsResponse` / `RevenueStatsResponse`
- ✅ `GET /api/admin/stats/activity?period=` — rollup SELECT + Top-3 활성 사용자 (COALESCE nick_nm/pi_username/google_email)
- ✅ `GET /api/admin/stats/revenue?period=` — rollup SELECT (테마 라벨·이모지 `msg_theme` 조인) + Top-3 매출 테마 + Top-3 최고 지출 사용자
- ✅ `sql/017_stats_ranking_rpcs.sql` — `fn_top_active_users` / `fn_top_revenue_themes` / `fn_top_spenders` RPC 3종 (Supabase 배포 완료)
- ✅ `getSessionUser()` + `isAdmin()` 인증

### TASK-085: 차트 라이브러리 + 컴포넌트 3종 ✅

- ✅ `react-plotly.js` + `plotly.js-basic-dist-min` 설치 (경량 번들)
- ✅ `src/components/charts/plotly-plot.tsx` — `dynamic ssr:false` 래퍼 (`window/document` 접근 차단)
- ✅ `src/components/charts/dau-wau-mau-chart.tsx` — MAU→WAU→DAU 렌더 순서 + `legendrank` 범례 분리
- ✅ `src/components/charts/revenue-donut-chart.tsx` — 테마별 매출 비중 도넛 차트
- ✅ `src/components/charts/revenue-timeline-chart.tsx` — 테마별 누적 바 차트

### TASK-086: 대시보드 페이지 + 메뉴 ✅

- ✅ `StatsCard`(스켈레톤 로딩) · `StatsDateFilter`(7/30/90/365) · `StatsDashboard`(병렬 fetch)
- ✅ 그래프 아래 **Top-3 활성 사용자 목록** (activity_days 내림차순)
- ✅ 그래프 아래 **Top-3 테마별 매출 순위 목록** + Top-3 지출 사용자
- ✅ `src/app/[locale]/(admin)/admin/stats/page.tsx`
- ✅ 어드민 사이드바에 "통계" 메뉴 추가 (ko.json + en.json)

### TASK-087: 검증 ✅

- ✅ `pnpm tsc --noEmit` 통과 (0 errors) — plotly.d.ts 선언으로 암묵적 any 해결
- ✅ `npx next build` 통과 — Plotly `dynamic ssr:false` 빌드 정상
- ✅ `fn_build_daily_stats` 멱등성 확인 — `stat_actvty_dly` 5일치, `stat_revenue_dly` 4일치 실데이터 Supabase 적재 완료
- ⏳ Pi Browser 어드민 piFetch 인증 (PC 브라우저 권장 안내 — 실기기 검증 후 최종 완료)

### Phase 11 후속 고도화 ✅ 완료 (2026-06-11)

#### 버그픽스 4건 (`6170b4d`) ✅

- ✅ `activity-log.ts` lazy thenable 버그 수정 — `recordActivity()` Promise 미await으로 집계 누락 방지
- ✅ Vercel Cron GET 핸들러 추가 — `vercel.json` Cron은 GET 요청 발송, 기존 POST 전용 핸들러 누락 수정
- ✅ WAU/MAU 슬라이딩 윈도우 쿼리 수정 — `stat_actvty_dly` 기준 7일/30일 범위 off-by-one 해소
- ✅ 오늘 온디맨드 집계 — 당일 데이터는 rollup 테이블 없어 직접 집계 fallback 추가

#### 활성 사용자 Top 3 가중치 점수제 개편 (`bf29103`) ✅

- ✅ 단순 활동일수 → 종합 가중치 점수제로 전환
  - 점수 = 활동일수 × 0.2 + 콘텐츠활동수 × 0.3 + 결제건수 × 0.5
  - 결제 활성 사용자를 상위로 부상시켜 수익화 기여도 반영
- ✅ `fn_top_active_users` RPC 수정 — Supabase 재배포 완료

### Phase 11 후속 고도화 2차 ✅ 완료 (2026-06-14)

#### 어드민 대시보드 고도화 4종

- ✅ coin360 스타일 테마별 매출 비중 트리맵 추가 (`3738ffc`) — Plotly squarify 트리맵, 영역 크기=매출액, 색상=테마별 고정. 기존 도넛 차트와 나란히 배치
- ✅ 관리자 대시보드 → 사용자 관리 통합 + 대시보드 메뉴 제거 (`b5611bf`) — 사용자 관리가 대시보드 기능 흡수, 메뉴 단순화
- ✅ 매출 차트 색상 도넛·트리맵 일치 + 테마별 고정색 구분 (`cacba8e`) — 동일 테마는 모든 차트에서 동일 색상 보장
- ✅ 통계 집계 시간대 UTC→KST 통일 (`c46d9c3`) — DAU/WAU/MAU·매출 날짜 경계를 KST 기준으로 교정(자정 오프셋 -9h 해소)

#### 관리자 결제내역 개선

- ✅ 거래구분 통합 + 취소내역 포함 + 사용자표시·검색 개선 (`6172020`) — 결제 유형별 필터·취소 내역 별도 탭·사용자명/Pi UID 표시 및 검색

---

## Phase 12: PiTranslate™ 글로벌 동시통역 ✅ 완료 (2026-06-12 — TASK-090~099 전체)

> **목표**: 카페에서 어떤 언어로 보내도, 각 사용자의 선택 언어로 실시간 자동 번역 — 언어 장벽 제로
> **상세 스펙**: `docs/PRD_4_CHAT.md` (v1.6, Section 1-4) | **담당 에이전트**: 전용 에이전트 없음
> **핵심 결정**: ① 번역 엔진 = **Gemini 2.0 Flash**(주력) + **Claude Haiku**(fallback) 하이브리드 (비용 ~76% 절감) ② 캐시 = `msg_trans` 테이블 `UNIQUE(msg_id, locale_cd)` ③ 동시성 = in-memory pending map ④ 실시간 = Supabase Realtime broadcast `msg_trans` 이벤트
> **빌드 검증**: `pnpm tsc --noEmit` 통과 · `pnpm lint` 0 errors · `pnpm build` 성공 (`/api/.../translate` 라우트 확인)

### TASK-090: DB 마이그레이션 + 환경변수 ✅ 완료

- ✅ `sql/020_msg_trans.sql` — `msg_trans` 번역 캐시 테이블 신설 (**018·019 선점으로 020으로 번호 조정**)
  - PK `trans_id UUID`, UNIQUE `(msg_id, locale_cd)`, `trans_cont TEXT NOT NULL`, `model_ver`(모델 추적)
  - 시스템 컬럼 4개 + `del_yn`/`del_dtm` DA 표준 준수 (`-- DA-APPROVED:` 주석)
- ✅ `msg_msg.src_lang_cd VARCHAR(20)` 컬럼 추가 (원본 언어 코드 — Gemini Flash 감지)
- ✅ `sys_user.display_locale_cd VARCHAR(20)` 컬럼 추가 (서버 번역 큐 대상 — TASK-096 선반영)
- ✅ Supabase 적용 완료 (`apply_migration` — 테이블·컬럼 3종 검증 확인)
- ✅ `GEMINI_API_KEY` — `src/env.ts` Phase 6에서 기등록 확인

### TASK-091: Gemini Flash 번역 라이브러리 ✅ 완료

- ✅ `src/lib/chat-translate.ts` — `translateMessage(text, targetLocale)`
  - **Gemini 2.5 Flash** REST API (SDK 불필요 — admin i18n translate 라우트와 동일 패턴): 번역 + 언어감지 단일 호출, `responseMimeType: application/json` + temperature 0
  - ⚠️ PRD의 `gemini-2.0-flash`는 2026-06-10 기준 **단종**(generateContent 404) — `gemini-2.5-flash`로 전환 (실호출 검증 완료)
  - 10초 타임아웃(`AbortSignal.timeout`) · 실패 시 Claude Haiku fallback 자동 전환 (`ANTHROPIC_API_KEY` 재사용)
  - 반환: `{ translated, srcLangCd, modelVer }` · `LOCALE_CD_RE` 화이트리스트 + `baseLang()` 헬퍼 export

### TASK-092: 동시성 dedup 처리 ✅ 완료

- ✅ `src/lib/chat-translate-dedup.ts` — in-memory pending map
  - key: `${msgId}:${localeCd}`, value: `Promise<TranslationOutcome>`
  - 동일 (msgId, locale) 동시 요청 시 API 1회만 호출, 나머지는 첫 Promise await
  - 서버 재시작·멀티 인스턴스는 DB 캐시 + UPSERT(`onConflict: msg_id,locale_cd`)로 보완
  - broadcast를 dedup job 내부에 배치 — fresh 번역 1회에만 발송 (대기자 N명이어도 중복 발송 없음)

### TASK-093: 번역 API 라우트 ✅ 완료

- ✅ `POST /api/chat/rooms/[roomId]/messages/[msgId]/translate`
  - Body: `{ locale_cd: string }` (`LOCALE_CD_RE` 검증)
  - 인증: `getSessionUser()` + `getRoomMember()` 방 참가 확인 (`piFetch` 쿠키/헤더 이중 지원)
  - 흐름: `msg_trans` DB 캐시 조회 → 캐시 히트 즉시 반환 → pending map → Gemini Flash → DB UPSERT → Realtime broadcast
  - `src_lang_cd`가 대상 locale과 같으면 번역 생략 (`same_lang: true` 반환)

### TASK-094: 메시지 전송 시 번역 큐 연동 ✅ 완료

- ✅ `POST /api/chat/rooms/[roomId]/messages` 확장
  - 저장 + broadcast 후 **Next.js 16 `after()`** 로 백그라운드 번역 큐 실행 (서버리스 freeze에도 완료 보장 — `void`보다 안전)
  - `getDistinctRoomLocales(roomId)` — `msg_room_mbr` ⨝ `sys_user.display_locale_cd` 방 참가자 locale 목록
  - `src_lang_cd` 첫 감지 시 `msg_msg` 조건부 UPDATE(`.is('src_lang_cd', null)` — race 안전)
  - 감지된 원본 언어와 같은 locale은 건너뜀
- ✅ `GET .../messages?locale=` — `msg_trans` 캐시된 번역 `trans_cont` pre-populate (scroll-up·초기 로드)

### TASK-095: 클라이언트 broadcast 구독 확장 ✅ 완료

- ✅ `src/hooks/use-chat-room.ts` — `msg_trans` broadcast 이벤트 구독 (`locale_cd === userLocale`일 때만 적용)
- ✅ `applyTranslation(msgId, transCont)` — 메시지 번역 텍스트 교체 함수
- ✅ `ChatMessage` 타입에 `trans_cont?` · `src_lang_cd?` 추가
- ✅ 수신 메시지 자동 번역 요청(`requestTranslation`) — `display_locale_cd` 미설정 사용자도 URL locale 기준 번역 수신 (서버 dedup으로 중복 호출 차단, `requestedTransRef`로 클라이언트 중복 POST 방지)
- ✅ `chat-room-panel.tsx` — `useLocale()`(next-intl)로 표시 언어 전달
- ✅ `client-chat-room.tsx` · `chat/[roomId]/page.tsx` — 초기 50건에 캐시 번역 병합

> **P0 완료 = MVP**: TASK-090 → 091 → 092 → 093 → 094 → 095 ✅ — PiTranslate™ 기본 동작

### TASK-096: 사용자 표시 언어 설정 UI ✅ 완료

- ✅ 프로필 페이지 (`/profile`) — "표시 언어 (카페 자동 번역)" 드롭다운 추가 (`routing.locales` 203개 단일 소스, `Intl.DisplayNames` 한국어 라벨 자동 파생)
- ✅ `sys_user.display_locale_cd` 컬럼 (sql/020) + `UserRow`/`updateUserProfile` 타입 확장
- ✅ `PATCH /api/profile` — Zod `display_locale_cd` regex 검증 (locale 코드 인젝션 방지)
- ℹ️ `use-user-locale.ts` 별도 훅은 생략 — 카페 표시 언어는 next-intl URL locale을 직접 사용 (이 앱은 203개 locale 라우팅을 이미 보유, localStorage 캐시 불필요)

### TASK-097: 원문 보기 토글 UI ✅ 완료

- ✅ `src/components/chat/translated-message.tsx` — 번역/원문 전환 컴포넌트 (`[원문 보기]` ↔ `[번역 보기]`)
- ✅ `chat-message-list.tsx` MessageBubble — `trans_cont`가 원문과 다를 때만 번역 표시 + 토글 (동일하면 원문 그대로)

### 추가 고도화: 방별 번역 언어 콤보 + 카페 레이아웃 고정 ✅ 완료 (2026-06-10)

> 카페 헤더 제목 옆 언어 콤보에서 선택한 언어로 **그 방의 모든 메시지를 강제 번역** — 방마다 독립 적용

- ✅ `src/components/chat/chat-locale-select.tsx` — 제목 옆 콤보 (🌐 자동 + 203개 locale)
- ✅ `src/lib/locale-options.ts` — locale 드롭다운 옵션 단일 소스 (profile-form 중복 제거)
- ✅ 방별 독립 저장 — `localStorage['chat_view_locale:{roomId}']` (다른 방에 영향 없음, 재입장 시 복원)
- ✅ `POST /api/chat/rooms/[roomId]/translate-batch` — 일괄 번역 (캐시 일괄 조회 → 미스만 최신순 순차 번역, 50건 제한, 개별 실패 스킵)
- ✅ `use-chat-room.ts` `forceTranslate` 모드 — 로드된 전체 메시지(본인 과거 메시지 포함)·scroll-up·신규 수신을 단일 effect로 일괄 번역, 언어 변경 시 기존 번역 wipe 후 재번역. fresh 번역은 broadcast로 점진 도착(진행형 UX)
- ✅ 헤더를 `ChatRoomPanel`로 통합 (page.tsx·client-chat-room 중복 제거) — **제목 섹션·입력 섹션 고정(`shrink-0`), 본문만 스크롤(`min-h-0 overflow-y-auto`)**
- ✅ 방금 보낸 내 메시지는 번역 제외(`requestedTransRef` 선등록 — DB 저장 전 404 race 방지)

### TASK-098: 어드민 번역 통계 ✅ (2026-06-12)

- ✅ 어드민 통계 대시보드에 "번역 (PiTranslate™)" 섹션 추가 (`translate-stats-section.tsx` — LazySection 지연 로드)
- ✅ 일별 번역 건수 · 캐시 히트율 · 예상 비용 (Gemini 토큰 추정: 1 token ≈ 4 chars) · 모델별 분포 · 피드백 합계
- ✅ `msg_trans.hit_cnt` 캐시 히트 카운터 + `fn_msg_trans_hit`(원자적 증가) + `fn_translate_stats` RPC (sql/034, Supabase 적용 완료)
- ✅ `GET /api/admin/stats/translate?period=7|30|90|365` (admin 전용)

### TASK-099: 번역 품질 피드백 ✅ (2026-06-12)

- ✅ 메시지별 번역 👍/👎 피드백 UI (`translated-message.tsx` — 원문 토글 옆, 선택 상태 하이라이트)
- ✅ `msg_trans.feedback_yn CHAR(1)` 컬럼 추가 (sql/034 — 향후 fine-tune 데이터)
- ✅ `POST /api/chat/rooms/[roomId]/messages/[msgId]/translate/feedback` (멤버 검증 + locale 화이트리스트)

---

## Phase 13: PiShop(MPS) ✅ (Phase 1 MVP + Phase 2 확장 완료 — 2026-06-13, Phase 3 고도화 예정)

> **목표**: Pi Coin 전용 P2P 직거래 마켓플레이스 — 에스크로 기반 안전 거래, 재고 관리, 매장 등록
> **상세 스펙**: `docs/PRD_8_MPS.md` (v1.1) | **담당 에이전트**: `.claude/agents/commerce/mps-prd-architect.md`
> **핵심 결정**: ① 에스크로 = **PiRC2 U2A 가상 에스크로** (운영자 Pi 계정 중간 보관, `metadata.type='MPS_ESCROW'`) ② 재고 = `stock_qty = reg_qty - ordered_qty` CHECK 제약 + 원자적 차감 ③ DB = `mps_` 접두사 6개 테이블 ④ 3단계 마일스톤 (Phase 1 MVP → Phase 2 확장 → Phase 3 PiRC3 마이그레이션)

### TASK-100: DB 마이그레이션 `sql/029_mps.sql` ✅ (2026-06-11)

> 파일 번호 확정 (2026-06-11): 025~028 병렬 점유(last_login·revenue·kakao·voice) → MPS는 029. 6개 테이블 + `fn_mps_order_create`/`fn_mps_order_cancel` RPC, Supabase 적용 완료

> `mps_` 접두사 신규 주제영역 — DA 표준 시스템 컬럼 4개 + `del_yn` 논리삭제 전 테이블 적용 (`-- DA-APPROVED:` 주석 필수)

- 🔜 `mps_ctgr` — 카테고리 (계층형, `parent_ctgr_id`, `depth_no`)
- 🔜 `mps_shop` — 매장 (`shop_type_cd`: ONLINE/OFFLINE/BOTH, `lat`/`lng NUMERIC(9,6)`, `place_id TEXT NULL` ← Google Maps Phase 3 확장 포인트)
- 🔜 `mps_item` — 상품 (`reg_qty`, `ordered_qty`, `stock_qty` + `CHECK(stock_qty = reg_qty - ordered_qty)` DB 불변 조건)
  - `item_cnd_cd`: NEW/USED/HANDMADE | `item_st_cd`: DRAFT/OPEN/CLOSED/SOLD
  - `reg_qty = 9999` 센티널: 무제한 재고 → 자동 SOLD 전환 억제 (음료·피자 등)
- 🔜 `mps_item_img` — 상품 이미지 (`sort_ord`, `thumbnail_yn`)
- 🔜 `mps_order` — 주문 (`order_st_cd`: PENDING/ESCROW/TRADING/SELLER_DONE/DONE/CANCELLED, `escrow_txid`, `release_txid`, `fee_pi`, `fee_payer_id`)
- 🔜 `mps_txn_hist` — 거래내역 (`txn_type_cd`: ESCROW_IN/RELEASE_OUT/REFUND/FEE)

### TASK-101: lib 헬퍼 3종 ✅ (2026-06-11)

- 🔜 `src/lib/mps-item.ts` — 상품 CRUD, 재고 원자적 차감 (`UPDATE ... WHERE stock_qty > 0 RETURNING`)
- 🔜 `src/lib/mps-order.ts` — 주문 생성·상태 전이·에스크로 흐름
- 🔜 `src/lib/mps-shop.ts` — 매장 CRUD

### TASK-102: 상품 API (FR-01·FR-02·FR-04) ✅ (2026-06-11 — 이미지 업로드 엔드포인트 2026-06-14 완료)

- ✅ `GET /api/store/items` — 목록 조회 (카테고리·상태·키워드 필터, 커서 페이지네이션)
- ✅ `POST /api/store/items` — 상품 등록 (판매자 인증, Zod 검증)
- ✅ `GET /api/store/items/[itemId]` — 상세 조회 (이미지 포함)
- ✅ `PATCH /api/store/items/[itemId]` — 수정 (소유자 확인)
- ✅ `DELETE /api/store/items/[itemId]` — 논리삭제 (`del_yn='Y'`, 물리 DELETE 금지)
- ✅ `POST /api/store/items/[itemId]/images` — 이미지 업로드 (Supabase Storage, 3cd0bc8)

### TASK-103: 재고 관리 (FR-07) ✅ (2026-06-11 — RPC 단일 트랜잭션 + 9999 센티널 + CHECK 이중 안전장치)

> **핵심 불변 조건**: `stock_qty = reg_qty - ordered_qty` — CHECK 제약 + 원자적 UPDATE

- 🔜 원자적 재고 차감: `UPDATE mps_item SET ordered_qty = ordered_qty + 1, stock_qty = stock_qty - 1 WHERE item_id = $1 AND stock_qty > 0 RETURNING item_id`
  - 반환 없으면 → 재고 부족 409 응답 (race condition 안전)
- 🔜 `reg_qty = 9999` 센티널 처리 — `stock_qty < 10` 임박 경고만, SOLD 자동전환 생략
- 🔜 주문 취소 시 재고 복원: `ordered_qty - 1, stock_qty + 1`

### TASK-104: 주문 + 에스크로 API (FR-08·FR-09·FR-11·FR-13) ✅ (2026-06-11 — 에스크로 완료는 별도 endpoint 대신 기존 `/api/payments/complete`의 `MPS_ESCROW` 분기로 통합, 양방향 확인 confirm/release + 취소 cancel 포함)

> **에스크로 흐름**: 구매자 Pi 송금 → 운영자 계정 보관 → 거래 완료 후 판매자 송금

- 🔜 `POST /api/store/orders` — 주문 생성 (재고 원자적 차감 + PENDING 상태)
- 🔜 `POST /api/store/orders/[orderId]/escrow` — Pi U2A 에스크로 완료 처리 (`metadata.type='MPS_ESCROW'`, PENDING → ESCROW)
- 🔜 `POST /api/store/orders/[orderId]/confirm` — 판매자 거래 완료 선언 (ESCROW → SELLER_DONE)
- 🔜 `POST /api/store/orders/[orderId]/release` — 구매자 최종 확인 (SELLER_DONE → DONE) + 판매자 Pi 송금 (`metadata.type='MPS_RELEASE'`)
- 🔜 `GET /api/store/orders` — 내 주문 목록 (판매자/구매자 분리 조회)
- 🔜 `GET /api/store/orders/[orderId]` — 주문 상세

### TASK-105: 상품 목록·상세 UI (SCR-01·SCR-02) ✅ (2026-06-11)

- 🔜 `src/app/[locale]/store/page.tsx` — 상품 목록 (카테고리 필터, 검색바, 무한 스크롤)
- 🔜 `src/app/[locale]/store/[itemId]/page.tsx` — 상품 상세 (이미지 갤러리, 구매 버튼, 재고 표시)
- 🔜 `ClientStoreGate` — `getSessionUser()` null 시 클라이언트 게이트 (`redirect` 금지 — Pi Browser 무한 루프 방지)
- 🔜 `piFetch` 의무 — 모든 API 호출에 `X-Pi-Token` 헤더 자동 첨부

### TASK-106: 내 상품 관리 UI (SCR-03·SCR-04) ✅ (2026-06-11 — 등록 폼 완료, 이미지 업로드 2026-06-14 완료)

- ✅ `src/app/[locale]/store/my/items/page.tsx` — 내 상품 목록 (상태별 탭: DRAFT/OPEN/CLOSED/SOLD)
- ✅ `src/app/[locale]/store/my/items/new/page.tsx` — 상품 등록/수정 폼 + 이미지 업로드 (product-image-uploader.tsx)

### TASK-107: 주문 관리 UI (SCR-05·SCR-06) ✅ (2026-06-11)

- ✅ `src/app/[locale]/store/my/sales/page.tsx` — 판매 주문 관리 (거래 완료 선언 버튼 + 취소 버튼)
- ✅ `src/app/[locale]/store/my/orders/page.tsx` — 구매 주문 관리 (최종 확인 버튼 + 취소 버튼 — 7b2203a 개선)

> **P0 완료 = Phase 1 MVP**: TASK-100 → 101 → 102 → 103 → 104 → 105 → 106 → 107

---

### Phase 2 — 확장

### TASK-108: 카테고리 시스템 (FR-03) ✅ (2026-06-12)

- ✅ `sql/039_mps_ctgr_seed.sql` — 기본 카테고리 2단계 시드(대분류 6 + 소분류 14, 고정 UUID + `ON CONFLICT DO NOTHING` 멱등). 테이블 `mps_ctgr`는 sql/029에 기 정의
- ✅ `src/lib/mps-ctgr.ts` — 인접 리스트(`parent_ctgr_id`) → 앱 레벨 트리 빌드, `listCategoryTree()`(공개·use_yn='Y')·`listAllCategories()`(어드민·부모명 부착)·create/update/softDelete
- ✅ `GET /api/store/categories` — 계층형 카테고리 트리 조회 (Guest 허용, 상품 목록 `?ctgr=` 필터와 연동)
- ✅ 어드민 CRUD API — `GET·POST /api/admin/store/categories` + `PATCH·DELETE /api/admin/store/categories/[ctgrId]` (isAdmin 게이트, 논리삭제)
- ✅ 논리삭제 안전장치 — 하위 카테고리 존재 시 409 거부, 연결 상품은 `ctgr_id=NULL`(미분류)로 보존
- ✅ 어드민 UI `/admin/store/categories` — 대분류 그룹 + 들여쓴 소분류, 부모 선택·정렬순서·사용여부 폼 (`std/words` 패턴)
- ✅ `admin-sidebar.tsx` 스토어 관리 섹션 + `ko·en` 번역(`admin.store.categories`)
- ✅ `sql/039` Supabase 적용 완료 — 대분류 6 + 소분류 13 = 19건 (supabase-js upsert, 멱등)
- ✅ 상품 등록/수정 폼 카테고리 드롭다운 연결 — `store-item-form.tsx` 대분류 `<optgroup>` + 소분류 select, 등록(키 생략)·수정(null=미분류) payload 분기, 수정 모드 기존 `ctgr_id` 로드. 백엔드(`createItem`·`updateItem`·POST/PATCH 스키마)는 기존재 활용. `store.form.category` ko·en 번역
- ✅ 상품 목록 카테고리 필터 UI — `store-item-list.tsx` 정렬 옆 `<optgroup>` select(대분류·소분류), `?ctgr=` 파라미터 전달 + 기존 `cnd`/검색/거리순과 조합, SWR 캐시 `isDefaultView` 조건에 `!ctgr` 추가(캐시 오염 방지). `store.allCategories` ko·en 번역

### TASK-109: 매장 관리 (FR-06·SCR-08) ✅ (2026-06-13)

- ✅ `GET·POST /api/store/shops` — 내 매장 목록 조회 + 매장 등록 (zod 검증, `getSessionUser` 인증)
- ✅ `PATCH·DELETE /api/store/shops/[shopId]` — 본인 매장만 수정·논리삭제 (`seller_id` 일치 조건, 소속 상품 `shop_id=NULL` 보존)
- ✅ `src/components/store/client-my-shops.tsx` — 목록 + 인라인 등록/수정 폼(매장명·유형 ONLINE/OFFLINE/BOTH·소개·주소·영업시간·연락처·SNS·대표이미지), usePiAuth 클라이언트 게이트
- ✅ `src/app/[locale]/store/my/shops/page.tsx` (SCR-08) — redirect 금지·서버 세션 OR Pi 로그인 게이트, 내 상품 관리에서 `매장 관리` 링크 진입
- ✅ 상품 폼 매장 선택 — `store-item-form.tsx` 내 매장 드롭다운(등록 매장 있을 때만 노출, N:1 선택), 등록/수정 payload `shop_id` 분기. 백엔드(`mps-item` create/update·PATCH 스키마 `shop_id`)·상품 상세 매장 노출은 기존재 활용
- ✅ DB 변경 없음 — `mps_shop`(place_id 예약 포함)·`mps-shop.ts` lib는 sql/029에서 기 완비. 신규 마이그레이션 불필요
- ✅ i18n — `store.shop.*`·`store.form.shop/shopNone` ko.json + en.json + i18n_message DB en upsert(is_auto='N', sync 안전)

### TASK-110: 양방향 주문 취소 (FR-10) ✅ (구현 확인 — 2026-06-13)

> 기존 구현이 FR-10을 이미 충족함을 검증해 🔜→✅ 정정. 환불은 별도 `MPS_CANCEL_REFUND` 결제 대신 `fn_mps_order_cancel` RPC 단일 트랜잭션(재고 복원 원자성 + 보증금 수수료)으로 통합 구현됨.

- ✅ `POST /api/store/orders/[orderId]/cancel` — 취소 사유 필수(zod), `getSessionUser` 인증, `cancelOrder(orderId, userId, reason, isAdmin)` 위임
- ✅ 양방향 취소 UI — 구매·판매 모두 `ClientMyOrders`(role prop) 공유, 취소 버튼이 구매자·판매자 양쪽 노출. FR-10 상태 규칙: `PENDING`·`TRADING`(레거시 `ESCROW` 포함) 당사자·관리자 취소, 레거시 `SELLER_DONE`은 구매자·관리자만, `DONE` 불가
- ✅ `fn_mps_order_cancel` RPC — 취소 시 재고 원자적 복원(`stock_qty += 1`) + 보증금 활성 판매자 거래의 거래중 취소에 한해 0.1π 취소수수료(피해 상대방 보상, v1.9) + 환불 처리. `cancel_req_id`·`cancel_reason` 기록
- ✅ 취소 사유 입력(prompt) + 취소된 주문에 사유 표시

### TASK-111: 거래 내역 (FR-12·SCR-07) ✅ (2026-06-13)

- ✅ `src/lib/mps-txn.ts` — `listTxns(userId, {from,to,limit})` — `mps_txn_hist` + `mps_order`→`mps_item` 2단계 조인(상품명·주문상태 부착), `txnCategory()`(BUY/SELL/ETC 매핑)
- ✅ `GET /api/store/txns` — 내 거래 내역(`?from=&to=` 날짜 범위), 관리자 `?all=1` 전체 조회(FR-12 관리자 요건), `to`는 당일 23:59:59 보정
- ✅ `src/components/store/client-my-history.tsx` — 구매/판매/기타 탭(건수 배지) + 날짜 범위 필터 + 입출금 부호(+/−) 색상, usePiAuth 게이트, 미정의 유형코드 `t.has()` 안전 폴백
- ✅ `src/app/[locale]/store/my/history/page.tsx` (SCR-07) — redirect 금지 게이트, `/store` nav에 `거래 내역` 링크 추가
- ✅ DB 변경 없음 — `mps_txn_hist`(ESCROW_IN·RELEASE_OUT 등 적재 중)는 sql/029에서 기 완비
- ✅ i18n — `store.history.*`·`store.navHistory` ko.json + en.json + i18n_message DB en upsert(is_auto='N', 거래유형 라벨 7종 포함)

---

### Phase 13 후속 개선 ✅ 완료 (2026-06-14)

#### A2U 자동 환불 구축 (FR-10 확장)

- ✅ 구매자 취소 시 결제액-수수료 실송금 A2U 자동 환불 (`512a4a5`) — Pi 플랫폼 계정→구매자 계정 실송금, 환불 거래유형 `MPS_CANCEL_REFUND` 신규
- ✅ A2U 환불 거래유형 제약 확장 + 송금 후 장부기록 실패 안전화 (`a619378`) — DB 기록 실패가 송금 성공을 롤백하지 않도록 단계 분리
- ✅ 판매자 취소 시 구매자 환불 누락 수정 (`76e2fb7`) — 통합 환불 공식 적용, 양방향 취소 모두 환불 처리(FR-10)
- ✅ FR-10 ADMIN 게이트 버그 교정 (`c8829c4`) — 취소수수료 판정 기준을 관리자 여부→거래 당사자 여부로 교정

#### 주문 관리 UI 개선

- ✅ 주문관리 취소 버튼 구매자/판매자 역할 구분 표시 (`7b2203a`) — 역할별 버튼 레이블 분리, 취소 중(CANCELLING) 상태 시각화

#### 상품 이미지 업로드

- ✅ 상품 이미지 업로드 구현 (`3cd0bc8`) — 갤러리/촬영 소스 선택, 클라이언트 1MB 자동 압축(`image-resize.ts`), 최대 3장, 썸네일 지정
- ✅ `POST /api/store/items/[itemId]/images` 신규 엔드포인트 + `product-image-uploader.tsx` 컴포넌트
- ✅ Supabase Storage `mps-images` 버킷 활용, `mps_item_img` 테이블(`sql/042_mps_item_images.sql`)

#### 상품 등록 시 위치 자동수집

- ✅ 상품 등록 시 동의자 현재 위치 자동수집 + 게시 위치 필수화 (`23bf3ba`) — LBS 동의 사용자 상품 등록 시 `loc_tp_cd='04'` GPS 좌표 자동 기록

---

### Phase 3 — 고도화

### TASK-112: PiRC3 실 에스크로 마이그레이션 🔒 보류 (2026-06-13 공식 확인 — 선결 조건 미충족)

> **결정**: 플랫폼(운영자 Pi 계정) 가상 에스크로를 **공식 지원 확인 시점까지 정식 방식으로 유지**. 임시방편이 아니라 현 Pi 생태계에서 유일하게 동작 가능한 올바른 설계.
> **2026-06-13 웹 직접 확인 (블로킹 사유)**:
> - `github.com/PiNetwork/PiRC` — **PiRC1·PiRC2만 존재** (PiRC3·에스크로 컨트랙트 디렉토리 없음)
> - `pi-apps/pi-platform-docs` — Pi SDK 공식 메서드는 `authenticate()`·`createPayment()` **2개뿐** (`invokeContract`·컨트랙트 호출·에스크로 미노출)
> - `minepi.com/blog/rpc-server` — 스마트 컨트랙트 RPC는 **Testnet 한정**(2026-04-08), 사용자 지갑 서명 컨트랙트 호출 수단 미문서화
> **재개 트리거 (둘 다 충족 시)**: ⓐ PiRC 저장소에 에스크로 컨트랙트(또는 PiRC3) 공개 **AND** ⓑ Pi SDK가 사용자 서명 컨트랙트 호출 메서드 제공

- 🔒 (재개 시) PiRC2 U2A 가상 에스크로 → 스마트 컨트랙트 실 에스크로로 전환
- 🔒 (재개 시) `mps_order.escrow_txid` → Contract transaction hash로 교체
- 🔒 (재개 시) Pi Wallet 서명 기반 에스크로 잠금

### TASK-113~120: O2O 오프라인 매장 커머스 ✅ (2026-06-16) — Phase 3 Maps 연동 완료

> PRD §15.8 상세. 직거래(중고)와 별개로 **구글 지도의 실제 카페를 인증 등록 → Pi 메뉴 판매 → 픽업/배달**하는 O2O 커머스. PiChat(온라인 커뮤니티)에서 시작한 cafe.pi가 오프라인 실물 카페로 흐르는 교두보.

- ✅ **TASK-113 구글 카페 반자동 인증 등록** (`sql/050~052`, `/api/store/shops/claim`) — half-인증: place_id 전체 직접타이핑(복사차단·대소문자) + 전화번호 구글 Place Details 서버대조 + 현장 GPS≤100m + 매장명·대표자명·주소·이메일 필수입력. place_id 부분 유니크(한 카페 한 주인). 구글 Place 전체정보 보관(구조화 5컬럼 + `google_place_json` JSONB). ✅인증 배지 + 배달가능 토글
- ✅ **TASK-114 매장 관리 구글 정보 표시·수정** — 매장 카드/폼에 구글 필드 노출·수정, 원본 JSON 펼침 보기
- ✅ **TASK-115 주문방법 3종** (`sql/054`) — 매장이용(DINE_IN)·픽업(PICKUP)·배달(DELIVERY, 배달가능 매장만 + 배달위치 필수)
- ✅ **TASK-116 오프라인 주문 상태머신** (`sql/056~058`) — 주문중(ORDERED)→준비중(PREPARING)→상품대기중(READY)→10분 자동 판매완료(DONE). 직거래 TRADING과 분리(`shop_id` 판정, `markEscrow` 분기). 상품접수·상품완료 액션 + on-demand sweep·cron 백스톱
- ✅ **TASK-117 취소 규칙·수수료** (`sql/057·059·060`) — 주문중만 취소 가능(접수 후 양측 불가). 구매자 0.9π(수수료 공제·미송금)/판매자 1.1π(보증금 보상). 취소 화면 역할(SELLER/BUYER) 명시로 self-purchase 구분, 비-self는 id 강제(보안)
- ✅ **TASK-118 사장님 보이스 주문알림** — 결제완료 시 `seller:{id}` 토픽 broadcast → 차임(Web Audio)+TTS×3(로케일별)+토스트. PiAuthProvider 전역 리스너, 오디오 잠금해제 1탭
- ✅ **TASK-119 지도 상품 판매 + 동선** — InfoWindow 영업시간 자리에 상품 썸네일 그리드→에스크로 거래. 카페/음료 카테고리(`sql/053`) + 메뉴추가 동선(`?shop=` 프리셀렉트) + 길찾기(구글/카카오/네이버)
- ✅ **TASK-120 관리자 본인상품 테스트결제** (`sql/055`, `p_allow_self`) + **보안: 상품 `shop_id` IDOR 차단**(커밋 자동 리뷰 적발)
- 🔒 TASK-112 PiRC3 실 에스크로 = **보류**(invokeContract 공식 미지원 — 플랫폼 가상 에스크로 유지)

---

## Phase 14: PiVoice™ — WebRTC N:N 음성채널 ✅ (v3.0 권한 시스템 구현 완료 — 2026-06-12)

> **목표**: 카페 멤버 간 브라우저 기반 N:N 다:다 음성채널(1~4명) — 추가 인프라 0(시그널링 재사용), 서버 미디어 비용 0(P2P Full Mesh)
> **상세 스펙**: `docs/PRD_9_VOICE_CHAT.md` (**v3.0**) | **담당 에이전트**: `.claude/agents/chat/voice-chat-architect.md`
> **v2.0 확정 결정 (2026-06-12)**: ① 1:1 MVP 폐기 → **N:N 다:다 기본**(1명도 입장 가능, 혼자 대기) ② **동시 마이크 최대 4명**(초과 시 청취 전용) ③ **방장(OWNER/ADMIN) 마이크 원격 제어**(mic_mute_force/mic_unmute_allow) ④ TURN = 관리형(HMAC, 미설정 시 STUN 폴백) ⑤ 베타 완전 무료
> **v3.0 권한 정책 (2026-06-12, PRD_9 v3.0 R1~R7)**: ① **방장 슬롯 무조건 보장**(입장 즉시 CONNECTED, 정원과 무관) ② **멤버 자동 슬롯 2명**(`VOICE_AUTO_SLOTS`) → 이후 입장자는 **PENDING(방장 승인 대기)** ③ 발언 정원 4명(`VOICE_MAX_MEMBER_SLOTS`) 초과 시 **청취 전용(LISTEN_ONLY)** ④ 마이크 상태 머신 `mic_st_cd`: CONNECTED·PENDING·LISTEN_ONLY ⑤ 방장 승인 흐름: approve/deny/revoke/grant ⑥ 청취 전용자 **발언 신청**(request → PENDING + 방장 알림) ⑦ env 오버라이드 지원
> **핵심 재사용**: `broadcastToCall`(시그널링 — `room:{id}:call` 전용 토픽) · `getSupabaseClient`(수신) · `piFetch`/`getSessionUser`(인증) · `getRoomMember`(권한) · DA DDL 표준

### TASK-120: 데이터 모델 `sql/032_voice_channel.sql` ✅ (2026-06-12 — Supabase 적용 완료)

- ✅ `msg_call_participant` 신규 — 참여자별 `mic_yn`·`join_dtm`/`leave_dtm`·`duration_sec`, 활성 중복 입장 차단 partial unique
- ✅ `msg_call_log` — caller/callee 제거 → room 레벨 세션 메타 (첫 입장 시작·마지막 퇴장 종료, `end_rsn_cd` ALL_LEFT/TIMEOUT/FAILED)
- ✅ `msg_call_quality_stat` — room+usr 기준 upsert로 전환 (`rtt_ms`·`packet_loss_pct`·`jitter_ms`·`relay_yn`)
- ✅ DA 표준 + RLS 활성화 (anon 차단, 서버 service role만 접근)

### TASK-121: TURN 자격증명 발급 API ✅

- ✅ `POST /api/voice/turn-credentials` — Pi 토큰 검증 → HMAC-SHA256 임시 자격증명(TTL 1h), TURN over TLS 443 경로 포함
- ✅ TURN 미설정 시 STUN 전용 폴백 (개발·동일 네트워크 테스트용)

### TASK-122: 음성채널 API 5종 ✅

- ✅ `POST /api/voice/rooms/[roomId]/join` — 1인 대기 허용, 활성 마이크 4명 초과 시 `mic_yn='N'` 강제, 중복 join 멱등
- ✅ `POST .../leave` — 품질 메트릭 적재 + 마지막 퇴장 시 세션 종료
- ✅ `POST .../signal` — offer/answer/candidate 피어 지정 중계 (서버 `broadcastToCall` 경유 신원 보증)
- ✅ `POST .../mic-control` — 방장(OWNER/ADMIN) 검증 + unmute 시 4명 상한 재확인
- ✅ `GET .../participants` — 입장 전 채널 점유 현황
- ✅ broadcast 이벤트: `call_participant_join`/`leave` · `webrtc_offer`/`answer`/`candidate` · `mic_mute_force`/`mic_unmute_allow`

### TASK-123: WebRTC 훅 + UI ✅

- ✅ `src/hooks/use-voice-channel.ts` — 피어별 RTCPeerConnection Map, 신규 입장자 단방향 offer(glare 차단), ICE candidate 큐잉, ICE restart(Wi-Fi↔LTE), `getStats()` 전체 피어 평균 품질, 언마운트 keepalive 퇴장
- ✅ `voice-channel-panel.tsx` — 참여자 목록(마이크 상태)·본인 음소거·방장 "마이크 차단/허용" 버튼·청취 전용 안내
- ✅ `chat-room-panel.tsx` — 헤더 🎙️ 버튼 + 참여 인원 배지, 원격 오디오는 패널 밖 렌더(패널 닫아도 통화 유지)
- ✅ 방장 mute 흐름: 서버 검증 → broadcast → 클라이언트 `track.enabled=false` 자가 처리 (서버 진실 원본 + 협조적 집행)

### TASK-124: v3.0 권한 시스템 — 방장 보장 슬롯 + 자동 2/승인 2 ✅ (2026-06-12 — PRD_9 v3.0 R1~R7)

- ✅ `sql/035_voice_permission.sql` — `msg_call_participant.mic_st_cd`(CONNECTED/PENDING/LISTEN_ONLY) 컬럼 추가 (Supabase 적용 완료)
- ✅ `src/lib/voice.ts` — 슬롯 설정값(`VOICE_AUTO_SLOTS=2`·`VOICE_MAX_MEMBER_SLOTS=4`, env 오버라이드), 방장 판정, `decideMicStateOnJoin()` 상태 머신
- ✅ `join` — 방장 무조건 CONNECTED, 멤버 자동 2명 → 이후 PENDING(방장 승인 대기) → 정원 초과 시 LISTEN_ONLY(청취 전용)
- ✅ `mic-control` — approve/deny/revoke/grant (+ mute/unmute 하위 호환), 승인 시 멤버 정원 재검증, `mic_st_change` broadcast
- ✅ `POST .../request` 신설 — 청취 전용 → 발언 신청(PENDING) + 방장 알림(`mic_request` broadcast)
- ✅ 훅·패널 — 본인 상태 머신 안내(승인 대기/청취 전용), 발언 신청 버튼, 방장 승인/거절/회수/허용 버튼, 👑 방장 표시
- ✅ `src/env.ts` — `VOICE_AUTO_SLOTS`·`VOICE_MAX_MEMBER_SLOTS` 환경변수 추가

### TASK-125: S0 진단 메시지 — 음성채널 입장 실패 사유 화면 표시 ✅ (2026-06-12)

- ✅ `use-voice-channel.ts` — `getUserMedia`·시그널링·피어 연결 실패 사유를 단계별 진단 메시지로 캡처
- ✅ `voice-channel-panel.tsx` — 입장 실패 시 사유 화면 노출 (Pi Browser 실기기 마이크 권한 디버깅용)
- ✅ `chat-room-panel.tsx` — 진단 상태 전달
- ✅ S0 Go/No-Go 검증 가속화 — iOS WKWebView `getUserMedia` 미지원/권한 거부 사유 즉시 식별

### 단계별 Go/No-Go (잔여)

- ✅ **S0 스파이크 — 음성 전달 검증 완료 (2026-06-12)**: Pi Browser 실기기 2대 간 입장·마이크·**음성 전달 정상 확인**. 무음 원인 2종(① TURN relay 부재 → 모바일 CGNAT P2P 불가 ② RemoteAudio `display:none`+autoplay 재생 차단) 해결. 상세 트러블슈팅 → `docs/PRD_9_VOICE_CHAT.md` §11
- 🔜 **TURN 운영 설정**: 현재 무료 공개 TURN(Metered Open Relay) 임시 폴백으로 동작 중 — 운영은 `TURN_HOST`/`TURN_SECRET` 전용 TURN(자체 coturn `static-auth-secret` HMAC 호환 또는 관리형) 설정 필요 (무료 공개 TURN은 대역폭·가동률 무보장)
- 🔜 **S2 품질 검증**: TURN 경유율·packet loss 데이터로 자체 coturn 전환 판단
- 🔜 **S3 확장**: (데이터 기반) 5인+ LiveKit 오디오 SFU / 결제 게이팅(`VOICE_CALL_CREDIT` + `voiceDailyFreeMinutes`) 활성화

---

## Phase 15: LBS 위치기반서비스 🚧 (P0 MVP 구현 완료)

> **목표**: 동의 기반 위치 수집 + 주변 탐색 + MPS 직거래 거리 표시로 거래 성사율 향상
> **상세 스펙**: `docs/PRD_10_GPS.md` (v1.2) | **담당 에이전트**: `.claude/agents/gps/lbs-consulting-architect.md`
> **핵심 결정**: ① 동의 게이트 = `lbs_consent_yn` 컬럼 기반 이중 제어(UI + API 403) ② 거리 계산 = Haversine SQL(PostGIS 불필요) ③ mps_shop.lat/lng 재활용(이중 저장 금지) ④ 법적 근거 = `docs/law/agreement/위치기반서비스이용약관...kor.md`

### TASK-130: DB 마이그레이션 `sql/033_lbs.sql` ✅

- ✅ `sys_user_consent` — 동의 이력 (`consent_tp_cd`: 'LBS'/'MKT'/'PUSH', 6개월 보관 의무, client_ip/user_agent 감사 로그)
- ✅ `usr_loc_hist` — 위치 수집 이력 (`loc_tp_cd`: '01'가입/'02'로그인/'03'매장/'04'상품, `latd_crd`/`lngt_crd NUMERIC(11,8)` — DA 표준용어(037), `ref_id`)
- ✅ `sys_user` 컬럼 추가: `lbs_consent_yn CHAR(1) DEFAULT 'N'`, `lbs_consent_dtm TIMESTAMPTZ`, `lbs_consent_ver TEXT`
- ✅ `fn_haversine_km(lat1, lng1, lat2, lng2)` DB 함수 — Haversine 거리 계산 (PostGIS 불필요)
- ✅ DA 표준: 시스템 컬럼 4개 + del_yn/del_dtm + `-- DA-APPROVED:` 주석
- ✅ `src/lib/users.ts` `UserRow` 타입에 lbs_* 컬럼 추가

### TASK-131: 환경변수 + Google Maps API 설정 ✅

- ✅ `src/env.ts` + `.env.example` — `GOOGLE_MAPS_API_KEY`(서버 전용), `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`(지도 뷰 클라이언트)
- ✅ Geocoding/Reverse Geocoding/Places API — 서버 API Route에서만 호출 (클라이언트 직접 호출 금지)

### TASK-132: 동의 API (`/api/location/consent` GET/POST/DELETE) ✅

- ✅ GET — 현재 동의 상태 조회 (`sys_user.lbs_consent_yn`)
- ✅ POST — 동의 등록: `sys_user.lbs_consent_yn='Y'` + `sys_user_consent` INSERT (client_ip/user_agent 감사 로그)
- ✅ DELETE — 동의 철회: `lbs_consent_yn='N'` + `usr_loc_hist.del_yn='Y'` 즉시 파기 (Rule LBS-03, 위치정보법 제5조)

### TASK-133: 위치 저장 API (`POST /api/location/save`) ✅

- ✅ 미동의 시 403 즉시 반환 (Rule LBS-02 서버 재검증)
- ✅ WGS84 좌표 범위 검증 (lat -90~90, lng -180~180)
- ✅ loc_tp_cd 분기: '01'(가입) / '02'(로그인) / '03'(매장) / '04'(상품거래)
- ✅ `piFetch()` 사용 — X-Pi-Token 헤더 이중 경로 지원

### TASK-134: Google Maps 서버 프록시 API ✅

- ✅ `src/lib/google-maps.ts` — `geocodeAddress()`·`reverseGeocode()` (Geocoding API 단일 호출 양방향), `import 'server-only'` 키 보호
- ✅ `POST /api/location/geocode` — 주소 → 좌표 (로그인 필수·동의 불필요, 유료 API 남용 방지)
- ✅ `POST /api/location/reverse-geocode` — 좌표 → 주소 + 한국 행정구역(시도/시군구/동) 파싱
- ✅ 한국 주소 type 우선순위 fallback (administrative_area_level_1/2 → locality → sublocality_*)
- ✅ Next.js fetch 캐시 1일(`revalidate: 86400`) — 동일 좌표/주소 반복 변환 비용 절감
- ✅ status별 처리: OK·ZERO_RESULTS(404)·그 외(REQUEST_DENIED 등 502, error_message 서버 로그)

### TASK-135: 주변 탐색 API (`/api/location/nearby/*`) ✅

- ✅ `GET /api/location/nearby/rooms?lat=&lng=&radius=` — 주변 채팅방 (Haversine + `usr_loc_hist` 채팅방 위치)
- ✅ `GET /api/location/nearby/shops?lat=&lng=&radius=` — 주변 MPS 매장 (`mps_shop.lat/lng` 활용)
- ✅ `GET /api/location/history` — 내 위치 이력 열람 (위치정보법 제16조 정보주체 열람권, 최근 50건)
- ✅ Rule LBS-01: 미동의 사용자 403 반환

### TASK-136: MPS 상품 목록 거리 표시 (Rule LBS-04) ✅

> **직거래 핵심**: MPS는 배송 없음 → 거리 = 구매 가능성 판단 기준

- ✅ `/api/store/items` 파라미터 확장: `?lat=&lng=&radius=&sort=distance`
- ✅ 상품 위치 소스: `mps_shop.lat/lng` — mps_shop JOIN + JS Haversine 계산 (초기 MVP)
- ✅ 동의 확인: sort=distance 요청 시 서버에서 `lbs_consent_yn='Y'` 재검증 (미동의 시 위치 파라미터 무시)
- ✅ 거리 기준 오름차순 정렬 + 반경(기본 10km) 필터
- ✅ `mps-item.ts` `ItemListFilter`에 `userLat/userLng/radiusKm` 추가
- ✅ `haversineKm()` 유틸 함수 추가 (6371km 지구 반지름)

### TASK-137: 클라이언트 동의 플로우 UI ✅

- ✅ `LbsConsentDialog` — @base-ui/react 기반 동의 다이얼로그 (약관 요약 + 목적 + 전문 링크)
- ✅ `store-item-list.tsx` 미동의 CTA 버튼 — `lbsConsent === 'N'`일 때 `📍 주변순` 클릭 시 다이얼로그 오픈
- ✅ 동의 완료 시 `setLbsConsent('Y')` 업데이트 → GPS 즉시 요청 → `sort='distance'` 자동 전환
- ✅ `lbs-settings.tsx` 마이페이지 위치 서비스 탭 — 동의 상태 카드 + 이력 열람 (LbsConsentDialog 통합)
- ✅ `profile-tabs.tsx` `📍 위치 서비스` 탭 추가

### TASK-138: MPS 상품 카드 거리 UI + 반경 필터 UI ✅

- ✅ `store-item-list.tsx` — LBS 동의 여부 조회 + GPS 위치 수집 + 거리순 정렬 버튼 (동의자만 노출, Rule LBS-01)
- ✅ 상품 카드 우하단 거리 배지 `📍 xxx m / x.x km` (동의자 + distance_km 있는 경우만, Rule LBS-04)
- ✅ `formatDistance(km)`: 1km 미만 → `"xxx m"`, 이상 → `"x.x km"`
- ✅ 거리순 활성화 표시 바 + "해제" 버튼 → sort='latest' 복귀
- ✅ 위치 없는 경우 "주변 10km 내 상품이 없습니다" 메시지

### TASK-139: `touchLastLogin()` 연동 + Pi Browser GPS 검증 ✅

- ✅ `pi-auth-provider.tsx` `signIn()` — 기존 세션 복원·신규 로그인 완료 시 `saveLoginLocation()` side-effect 호출
- ✅ `saveLoginLocation()` — GPS `getCurrentPosition()` → `POST /api/location/save` (`loc_tp_cd='02'`) fire-and-forget
- ✅ 미동의(403) 포함 모든 실패 무시 — 서비스 차단 없음 (Rule LBS-02 서버 재검증)
- 🔜 GPS 실패 시 서비스 차단 없음 → 위치 저장만 스킵, 나머지 기능 정상

### TASK-140: 상품 개별 위치 등록 — 등록 시 판매자 GPS 저장 + 목록 거리 기준 전환 ✅ (2026-06-12)

- ✅ `sql/036_item_location.sql` — `mps_item`에 위치 컬럼 추가 (매장 단위 → 상품 단위 위치로 세분화)
- ✅ `store-item-form.tsx` — 상품 등록 폼에 GPS 좌표 수집(판매자 현재 위치) + `loc_tp_cd='04'`(상품거래) 위치 이력 저장
- ✅ `/api/store/items` — 상품 위치 소스를 `mps_shop.lat/lng` → **상품 개별 좌표** 우선으로 전환 (매장 없는 개인 판매자 대응)
- ✅ `mps-item.ts` — 거리 계산 기준을 상품 좌표로 확장 (TASK-136 거리 표시와 연동)

> **P0 완료 = LBS MVP**: TASK-130 → 131 → 132 → 133 → 136 → 138 ✅ (동의 게이트 + MPS 거리 표시)
> **P1 완료 (주변 탐색)**: TASK-134 → 135 → 137 → 139 ✅ (Geocoding 프록시 + 주변 탐색 API + 동의 UI + 로그인 위치 저장)
> **P1 확장 완료**: reverse-geocode를 `/api/location/save`에 연결(좌표→행정구역 서버 자동 보강) + 주변 탐색 화면 `/nearby`(매장·채팅방 탭 + 반경 1/5/10km)
> **남은 작업**: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` + Maps JavaScript API(지도 UI)·Places API(매장 검색)는 향후 Phase

---

## 마일스톤 요약

| 마일스톤 | Phase | 완료일 | 주요 산출물 | 상태 |
|---------|-------|-------|-----------|------|
| M0: 스타터킷 | Phase 0 | 2026-06-05 | Next.js 16 + Tailwind v4 + shadcn/ui | ✅ 완료 |
| M1: Pi 인증 | Phase 1 | 2026-06-05 | Pi SDK 인증, HMAC 세션 | ✅ 완료 |
| M2: Pi 결제 | Phase 1 | 2026-06-05 | U2A 결제 3단계 흐름 | ✅ 완료 |
| M3: Google 로그인 | Phase 2 | 2026-06-05 | NextAuth.js + Supabase | ✅ 완료 |
| M4: 계정 연동 | Phase 2 | 2026-06-05 | 6자리 코드 크로스 브라우저 연동 | ✅ 완료 |
| M5: Pi Browser 감지 안정화 | Phase 2 | 2026-06-05 | authenticate() 기반 감지 | ✅ 완료 |
| M6: 관리자 대시보드 + 사용자 관리 | Phase 3 | 2026-06-05 | /admin, /admin/users, RBAC | ✅ 완료 |
| M7: 관리자 결제·연동 현황 | Phase 3 | 2026-06-05 | /admin/payments, /admin/links | ✅ 완료 |
| M8: 통합 게시판 | Phase 4 | 2026-06-05 | 4종 게시판 CRUD + 관리자 관리 | ✅ 완료 |
| M8.5: DA 품질 표준화 | Phase 5 | 2026-06-06 | Migration 003~008, 19개 위반 해소 | ✅ 완료 |
| M9: 데이터 표준 CRUD | Phase 5 | 2026-06-06 | 표준단어·도메인·용어·DDL Export | ✅ 완료 |
| M10: Audit Trail + 승인 워크플로우 | Phase 5 | 2026-06-06 | 변경 이력 추적, 승인 프로세스 | ✅ 완료 |
| M11: 다국어 | Phase 6 | 2026-06-07 | next-intl v4, 18개 언어, Gemini 자동번역, 3단계 fallback | ✅ 완료 |
| M12: 다국어 안정성 | Phase 6 | 2026-06-07 | 단일 소스 분리, 203개 locale 선점, 코드 인젝션 보안 패치 | ✅ 완료 |
| M13: Next.js 16 + TypeScript 6 | 기술 업그레이드 | 2026-06-07 | Next.js 16.2.7, TypeScript 6.0.3, eslint-config-next@16, FlatCompat 제거 | ✅ 완료 |
| M14: PiCafé DB + 테마 마스터 | Phase 7 | 2026-06-08 | msg_* 13개 테이블, 테마 20개, 플랜 5개, 스티커팩 60개 | ✅ 완료 |
| M15: PiCafé MVP | Phase 7 | 2026-06-08 | 그룹 카페 생성 4단계 마법사 (테마 선택 + Pi 결제), 카페 홈, 카페 페이지 | ✅ 완료 |
| M16: Pi 수익화 | Phase 8 | 2026-06-11 | Pi Tip, 스티커 마켓, 인라인 트리거 8종, AI 봇, 이벤트방 | ✅ 완료 |
| M17: 미디어 메시지 | Phase 8 | 2026-06-11 | 파일·이미지·음성 메시지 (Supabase Storage) | ✅ 완료 |
| M18: PiCafé 생태계 | Phase 9 | 2026-06-11 | 마켓플레이스, Pi Bet, Webhook, 분석 대시보드, 커스텀 스티커 (sql/022 + API 12종 + UI 4종) | ✅ 완료 |
| M19: 사용자 프로필 | Phase 10 | 2026-06-09 | 마이페이지 (개인정보·결제내역·구독현황), Pi Browser ClientGate | ✅ 완료 |
| M20: 어드민 통계 대시보드 | Phase 11 | 2026-06-09 | DAU/WAU/MAU·테마별 매출 (react-plotly.js + 중간집계 rollup) | ✅ 완료 |
| M21: PiTranslate™ 완성 | Phase 12 | 2026-06-12 | sql/020 + chat-translate.ts + dedup + translate API + broadcast 확장 + 표시언어 설정 + 원문 토글 + 어드민 번역 통계 + 품질 피드백 (TASK-090~099) | ✅ 완료 |
| M22: PiShop(MPS) Phase 1 MVP | Phase 13 | 2026-06-11 | sql/029_mps.sql (mps_ 6개 테이블) + lib 헬퍼 3종 + 상품·주문·에스크로 API 12종 + 화면 6종 + 판매자 보증금 (TASK-100~107) | ✅ 완료 (Phase 2·3 확장 예정) |
| M23: PiVoice™ v3.0 N:N 음성채널 + 권한 시스템 | Phase 14 | 2026-06-12 | sql/032 (msg_call_participant 신규·call_log room 레벨 전환) + sql/035 (mic_st_cd 3상태) + TURN 발급 + 음성채널 API 6종(join/leave/signal/mic-control/participants/request) + use-voice-channel 훅(Full Mesh) + 방장 보장 슬롯·자동 2/승인 2 권한 UI + S0 진단 메시지 (TASK-120~125) | ✅ 구현 완료 (S0 실기기 검증·TURN env 잔여) |
| M24: LBS P0+P1 MVP | Phase 15 | 2026-06-12 | sql/033_lbs.sql (sys_user_consent·usr_loc_hist·fn_haversine_km) + 동의 API(GET/POST/DELETE) + 위치저장 API + 주변탐색 API(rooms/shops/history) + `/nearby` 화면 + MPS 거리 표시 + 동의 다이얼로그 CTA + 약관 페이지(`/docs/agreement/lbs`) + 로그인 위치 저장 (TASK-130~139) | ✅ 완료 |
| M25: 횡단 개선 — 성능·리브랜딩 | — | 2026-06-12 | 무한 스크롤(Cafe·Shop)·대시보드 지연 로딩(use-infinite-scroll·LazySection) + Pi Tip→Bean 리브랜딩(표시명·이미지, 식별자 유지) + pi_pymnt 트리거 수리 + 21개 언어 번역 동기화 | ✅ 완료 |
| M26: 횡단 2차 — SWR 캐싱·상품 위치·스티커 | — | 2026-06-12 | HOME·Shop·관리자·카페 목록 SWR 캐싱(localStorage) + 병렬(비동기) 호출 일괄 적용(`client-cache.ts`·`chat-room-list.ts`·`/api/admin/dashboard`) + 상품 개별 위치 등록(sql/036, store-item-form GPS) + 스티커 노출 개선(sql/038 골프·응원팩 최우선 정렬·2배 확대·저장 방지) + 다국어 동기화(LBS·카페 목록 키) | ✅ 완료 |
| M28: MPS Phase 2 확장 | Phase 13 | 2026-06-13 | 카테고리(108 검증)·매장 관리(109 신규: shops API 2종+관리 UI+상품폼 매장선택)·양방향 취소(110 검증)·거래 내역(111 신규: txns API+history UI+날짜필터) — 신규 라우트 3종, DB 마이그레이션 0(기존 테이블 활용), i18n ko/en+DB upsert | ✅ 완료 |
| M27: 횡단 3차 — Pi Browser 안정화·콤보 성능 | — | 2026-06-13 | ① **admin 다국어 전환 무반응 수정**: `language-switcher.tsx` admin 분기에서 `piFetch`로 `_pit` 티켓 선발급 후 URL(`?_pit=`)에 실어 하드 네비게이션 → 첫 요청부터 인증(게이트 왕복·soft-nav 의존 제거) ② **헤더 다국어 콤보 3계층 캐시**: `/api/i18n/countries` revalidate=600(서버), sessionStorage+메모리 TTL 10분(클라이언트, lazy initializer 즉시 반영), requestIdleCallback 프리페치 — 재열기·페이지 이동 시 지연 0 | ✅ 완료 |
| M29: MPS 후속 개선 | Phase 13 | 2026-06-14 | A2U 자동 환불(MPS_CANCEL_REFUND · 512a4a5·a619378·76e2fb7)·FR-10 ADMIN 게이트 버그 교정(c8829c4)·주문관리 취소 버튼 역할 구분(7b2203a)·상품 이미지 업로드 3장·1MB·썸네일(3cd0bc8·sql/042)·상품 등록 시 위치 자동수집(23bf3ba) | ✅ 완료 |
| M30: 대시보드 고도화 | Phase 11 | 2026-06-14 | coin360 트리맵(3738ffc)·사용자 관리 통합+대시보드 메뉴 제거(b5611bf)·차트 색상 통일(cacba8e)·KST 집계 교정(c46d9c3)·결제내역 거래구분 통합+취소내역(6172020) | ✅ 완료 |
| M31: 횡단 4차 — Pi Browser 안정화 | 횡단 | 2026-06-14 | CafePi 헤더 로고 교체(12118e7)·Pi Bet UI 아코디언+스포트라이트(c490fb7)·다국어 선택기 기억(d52d7ef)·PiShop 브랜드 전면 치환(04c9350)·admin 게이트 open redirect 방어(43ab342·8f419ee) | ✅ 완료 |

---

## 기술 업그레이드 모니터링

> `docs/UPGRADE_STRATEGY.md` 참조. 아래 항목은 외부 조건 해소 시 즉시 진행.

| 항목 | 현재 | 대기 조건 |
|---|---|---|
| **next-auth v5 stable** | beta.31 유지 | npm `latest` 태그가 5.x가 되면 `pnpm add next-auth@^5` |
| **ESLint 10** | 9.39.4 유지 | `eslint-plugin-react/import/jsx-a11y`가 ESLint 10 peerDep 추가 시 |
| **middleware.ts → proxy.ts** | middleware.ts 유지 | next-intl이 Next.js 16 proxy (nodejs runtime) 지원 시 |
| **react-hooks/set-state-in-effect** | warn 20개 | 별도 리팩토링 이슈 — useEffect 내 setLoading 패턴 정리 |

---

## 알려진 이슈 및 결정 사항

| 항목 | 결정 내용 | 이유 |
|---|---|---|
| Pi Browser 감지 | `Pi.authenticate()` 성공/실패 기준 | UA 패턴은 신뢰도 낮음, 실제 SDK 동작으로 판단 |
| 연동 URL 전달 | 클립보드 복사 | Pi Browser WebView에서 `target='_blank'` = WebView 내 열림 (외부 브라우저 강제 불가) |
| google_id 불일치 | `google_email` fallback 조회 | NextAuth가 UUID 형식, Google OAuth sub는 숫자 형식 불일치 |
| Admin 라우팅 | `(admin)/admin/page.tsx` 구조 | Route group은 URL 세그먼트 없음, `admin/` 서브디렉토리 필요 |
| Supabase admin 초기화 | lazy init 패턴 | 빌드 시점 SERVICE_ROLE_KEY 미설정으로 빌드 실패 방지 |
| DB 테이블 리네이밍 | `users→sys_user`, `payments→pi_pymnt`, `link_codes→auth_link_cd` 완료 | 한국 DA 도메인 접두사 표준 — Migration 003~008 (2026-06-06) |
| 시스템 컬럼 규칙 | `regr_id/reg_dtm/modr_id/mod_dtm` 4개 `NOT NULL DEFAULT` 전 테이블 강제화 | DA 표준: 복합어 REGR(등록자)/MODR(변경자), `CURRENT_TIMESTAMP` 표준 표기 |
| routing.ts locale 등록 | 203개 국가 코드 선점 등록 | next-intl `defineRouting()`은 빌드 타임 정적 — Vercel 런타임 수정 불가 |
| locale 단일 소스 | `src/lib/locale-currency.ts`, `src/lib/locale-country.ts` | 3+ 파일에 중복된 맵이 sync 버그 반복 유발 |
| locale_cd 보안 검증 | `LOCALE_CD_RE = /^[a-z]{2,3}(-[A-Z]{2,3})?$/` | routing.ts 파일 쓰기 전 화이트리스트 필터 (코드 인젝션 HIGH 취약점) |

---

## Phase 16: 이벤트 미션 시스템 (Pi 요원 육성) ✅ 구현 완료·운영 중 (2026-06-15)

> 상세 요구사항: **`docs/PRD_11_EVENT.md` v2.x** · `PRD.md` 섹션 18

10가지 미션을 실제 비즈니스 로직 트리거에서 멱등 자동 감지 → 전부 완료 시 화이트리스트 → 미션 수행 합계(sum) 내림차순 랭킹. 첫 완료 **선착순 10명**에게 카카오 선물. 컨셉: "Pi 요원 육성"(요원 등급 5단계 Recruit→Master Agent), Footer 'Event' 탭 신설.
**운영 현황(2026-06-15)**: 참여자 7 · 완료기록 34 · 10미션 완주 1 · 제외 0 · `evt_action_log` 19건.

### TASK-150: 이벤트 DB 스키마 ✅
- `sql/044_event_mission.sql`(`evt_event`·`evt_action_log`·`evt_mission`·`evt_user_mission`·`evt_exclude`·`evt_gift_log` 6테이블 + M1~M10 시드) · `sql/045_event_mission_guide.sql`(안내문/정정). DA 표준 시스템 컬럼 4개 + 논리삭제, Supabase 적용 완료.

### TASK-151: 미션 완료 자동 감지(평가 엔진) ✅
- `src/lib/event.ts` — `recordUserAction()`(evt_action_log 기록) + `evaluateUserMissions()`(SINGLE/MULTI_AND/MULTI_OR/SEQUENCE 4종 판정 + 멱등 upsert). M10은 `checkCancelWithFee`(M9 완료 후 `CANCEL_FEE_IN`+동일 order `REFUND_IN`). ⚠️ 행위 훅(`recordUserAction`)의 일부 API 미삽입 정황 — 전수 점검 권장.

### TASK-152: Footer Event 탭 + 이벤트 페이지 ✅
- `/[locale]/event`(`src/app/[locale]/event/page.tsx` + `ClientEventGate`) — 미션 진행도·요원 등급·랭킹. `piFetch`(Pi Browser 쿠키 미저장 대응) + 클라이언트 게이트(redirect 금지).

### TASK-153: 랭킹 + 선착순 선물 관리 ✅
- `/api/event/ranking`(sum 내림차순·✓ 매트릭스·제외 필터·tie-break `last_complete_dtm`) · `/api/event/my-progress` · `/api/event/top-10-gifts`(**선착순 = 전체 10미션 완주자** `count===10`) · `/admin/event/gifts`. 카카오 선물(`gift.kakao.com/product/11105359`)·`evt_gift_log` 추적.

### TASK-154: 관리자 제외 관리 ✅
- `/api/admin/event/exclude`(`isAdmin` 게이트, `evt_exclude` 논리삭제 토글) + `ClientEventGate` 내 관리자 전용 제외 UI.

✅ **확인 필요 항목 해소**: 선착순 = 전체 10미션 완주 확정 · M10 = `checkCancelWithFee` 구현 · i18n 키 `event.missions.M1~M10.{name,desc}`(ko=ko.json 정본, en=i18n_message). **잔여**: 행위 훅 전수 점검.

### TASK-155: 평가 엔진 정밀화 ✅ (2026-06-15, `4f623d9`)
운영 신뢰도(고객 신뢰 직결)를 위한 **양방향 멱등** 재작성.
- **M2 상태형 전환**: `profile_update` 행위 로그 의존 폐기 → `sys_user.nick_nm` + `kakao_id` 유무로 판정(`hasNickAndKakao`), 미충족 시 완료 취소(양방향). 행위형(M1·M3~M10)은 이벤트 전 수행 오판 방지 위해 단방향 유지.
- **평가 엔진**: `upsert(onConflict)` → `select` 후 `insert`/`update` 분기(부분 unique 인덱스 `WHERE del_yn='N'` 충돌 회피 + 논리삭제 미션 `del_yn='Y'`→`'N'` 복구).
- **SEQUENCE(M10)**: 선행 미션 조회에 `del_yn='N'` 필터 + `mission_ord` 순 평가.
- **프로필 빈값 저장**: 선택 필드 빈값(`''`) 전송(필수 `display_name` 제외) + 서버 빈문자열→`null` 정규화(`kakao_id` 삭제 반영).
- **관리자 재평가 버튼**: `/event` 랭킹 옆 '🔄 미션 재평가' + `POST /api/admin/event/reeval`(온디맨드 전체 재평가).
- **인프라 안정화**: `evt` 미션코드 `CHAR(3)`→`VARCHAR(10)`(`sql/046`) · `CRON_SECRET` 프로덕션 필수 강제(`d9f0f78`) · 재평가 안전망 cron(`e9ba9f2`) · `voice_join` 트리거 현행 경로 연결(`8fa087d`) · M3 자동번역 트리거 누락 수정(`ccedddd`) · `recordUserAction` `after()` 보장(`15fcaa4`) · 랭킹 미참여자 `UNION ALL` 표시(`236ba28`).
- ⚠️ **후속 권장(코드 리뷰 식별)**: `reevaluateAllActiveUsers`가 `evt_action_log` 보유자만 재평가 대상으로 삼아, M2 상태형(행위 로그 무관)과 불일치 → 프로필(`nick_nm`/`kakao_id`) 보유자 UNION 권장.

### TASK-156: 10미션 완주 보상 전환 — A2U → 1π 보증금 적립 + 관리자 수동 지급 ✅ (2026-06-16~17)
실 보상 신뢰도(고객 자금 직결)를 위해 Pi A2U 송금을 폐기하고 판매보증금 직접 적립으로 전환.
- **보상 매체 전환**: Pi A2U 직접 송금(시드 미설정·실패 시 PENDING) → `mps_seller_bond` 보증금 **1π 직접 적립**(`grantBondReward`, `src/lib/mps-bond.ts`). `event.ts`에서 `triggerPiReward`·`reward_pi_amt`/`reward_pi_memo` 의존 제거(`5f5e6b9`·`d540f68`).
- **자동 → 수동 지급 전환**(`a277b80`): 미션 평가의 자동 보상 호출 제거 → 이벤트 화면(`client-event-gate.tsx`) **'1Pi 판매보증금 지급'** 버튼(재평가 버튼 옆, 관리자 전용) + `POST /api/admin/event/bond-reward`(`isAdmin` 이중검증). 10미션 완주(`count===10`)·미지급·`evt_exclude` 제외자만 대상.
- **원자적 중복방지** `fn_evt_grant_bond_reward`(`sql/061`): 단일 트랜잭션 + `FOR UPDATE` 행잠금 + `reward_st_cd`('BONDED'/'PAID') 게이트 → 앱레벨 check-then-act의 TOCTOU race + A2U-보증금 교차 이중지급 차단. `grantBondReward`를 RPC 호출 래퍼로 교체(race-free).
- **추적 테이블** `evt_pi_reward_log`(`sql/048`) — `UNIQUE(event_id, user_id)` 멱등 + `reward_st_cd` 지급 상태.
- **M3 우회 결함 수정**: `premium_cafe_create` 행위 기록을 **유료 테마로 게이트** — 무료 FITNESS 테마로 M3 부정 완료하던 경로 차단(`group/route.ts`).
- **병합 부작용 정리**(`6a648b5`): `group/route.ts` LBS 위치 저장 블록(`validLat`/`validLng`) 이중 삽입 제거(로직 변경 없음).

### 횡단 5차: i18n 자동번역 백그라운드화 ✅ (2026-06-15)
- 전체 자동번역을 서버 `after()` 백그라운드 작업으로 전환(`b65b163`·`bbfd809`) — 요청 타임아웃 회피, 순차 번역.
- 번역률 pct **반올림 버그** 수정(`d3146b0`) — 미완료를 완료로 오표기하던 문제 해소.
- 언어 콤보 캐시 키 `v1`→`v2` 무효화(`410aab3`) — `mx` 등 신규 활성 locale 미표시 해소.
- `validate-locales`에 ko 기준 초과 키 차단 검증 추가(`2c65cc9`).

---

## GTM 문서화 ✅ (2026-06-16)

> **목표**: 외부 공개·파트너 제안용 GTM 자료 완성 + 운영 리스크 proactive 관리

### 제품소개서 (단기 4목표 13장 슬라이드) — `cd9b19c`

- ✅ `docs/제품설명서_202060615.pptx` — cafe.pi 직영 광장 + 단기 4목표 기준 13장 슬라이드
  - 훈민정음 철학(모든 Pi 사용자가 콘텐츠를 쉽게) + 핵심기술 7가지 별표 등급 분류
  - 단기 4목표: ① PiChat 무료→소액수수료 ② PiShop 오프라인 교두보·매집 ③ StarterKit $100~500 ④ 외주연계
  - 북극성 지표: **활성 사용자 수** (홈 StatsDashboard 첫 화면)
- ✅ `docs/.pptx-build/build.js` + `package.json` — 재생성 스크립트(pptxgenjs 기반)
- ✅ `.gitignore` — 빌드 부산물(`node_modules/`) 제외

> **비고**: 글로벌 5단계 비전 로드맵(온라인 커뮤니티→O2O 오프라인 카페 완전 순환)은 대외비 — 제품소개서·공개 자료 어디에도 미포함

### 공개·라이선스 정책 — `cd9b19c`

- ✅ `docs/공개_라이선스_정책.md` — 오픈코어 3계층 전략 정의
  - **미끼층(공개 MIT)**: 스타터킷, 인증/결제 스켈레톤, DA 거버넌스 템플릿
  - **상품층(BSL/시간제한)**: 카페/마켓 기능, i18n 엔진, LBS, PiVoice
  - **금고층(비매, 직영 전용)**: PiChat 실시간 엔진 + PiShop 에스크로 코어 + 코어 5종
  - 왕관보석(PiChat·PiShop 직영) 비매 원칙 — 목적=선점 창·단기 시장점유, 영구 비밀유지 아님

### 성능 리스크 레지스터 + 운영 이슈 기록 — `TROUBLESHOOT.md`

- ✅ **A. 성능 리스크 레지스터** (proactive) — 7종 기능의 병목 사전 분석
  - 🔴 최우선: 실시간 채팅(동접 연결 한도·팬아웃) + LBS 위치기반 직거래(공간 인덱스 풀스캔)
  - 🟠 주의: 에스크로(상태 경합·앱 레벨 정합성) + 구독(cron 배치 집중)
  - 🟡 관리: 결제(체인 RPC 지연) + 계정통합(요청당 권한 검증)
  - 🟢 양호: 다국어(번역 I/O·빌드 검증 비용)
  - **공통 천장**: service_role 커넥션 풀 — 모든 부하가 수렴, PgBouncer 풀 사이즈가 숨은 한계
- ✅ **B. 운영 이슈 기록** (reactive) — 실제 발생 2건
  - `[2026-06-15]` Vercel Hobby 플랜 Cron 주기 제약: `*/5 * * * *` 배포 자체 차단 → `0 0 * * *` 적용
  - `[2026-06-15]` Vercel GitHub Integration Webhook 누락: cron 실패 반복→webhook 비활성 추정 → `vercel deploy --prod --yes` 수동 배포로 해결

---

## Phase 17: BEAN 토큰 발행 (Pi Launchpad) 📝 기획·문서 (2026-06-17)

> 상세 요구사항: **`docs/PRD_12_TOKEN.md` (v1.7)**
> ⚠️ **발행 전 앱 코드 0 — 문서 전용.** 레드라인 정책(자체 토큰=Pi 외 자산)상 BEAN은 공식 Pi Launchpad 경유로만 발행하며, 발행 전까지 토큰 관련 코드는 앱에 미포함하고 PRD_12는 git 비추적 유지.

### 확정 결정 (의사결정 닫힘)

- ✅ 토큰명 **BEAN** — 기존 인앱 Pi Bean 팁(🫘) 온체인화, `1 Pi = 100 BEAN` 리베이스
- ✅ 발행량 10억 개 · 세일가 0.01 Pi/BEAN · 초기 FDV 10M Pi
- ✅ 분배: 세일 40% / 리저브 25% / 유동성 15% / 마케팅 12% / 팀 8% (인사이더 최소화 = 심사 신뢰도)
- ✅ 발행 주체 = 개인(아나킨 마스터님) · 유동성 BEAN/Pi 단독(레드라인 #2: Pi 외 자산 페어 배제)

### 잔여 선결과제 (외부 회신 대기 — 코드 없음)

| ID | 과제 | 상태 |
|---|---|---|
| TASK-160 | T05 토큰 증권성 법무 자문 (질의서 8항 작성 완료) | 🔶 변호사 회신 대기 |
| TASK-161 | T01 개인 KYC 통과 상태 확인 | 🔶 본인 확인 (1~4주 병목 → 1순위) |
| TASK-162 | T02 Launchpad 공식 신청양식 (영문 이메일 초안 작성) | 🔶 Pi 재단 회신 대기 |
| TASK-163 | T03 Mainnet/Launchpad 출시 일정 확인 | 🔶 Pi 재단 회신 대기 |
| TASK-164 | (발행 전) Pi Bean 리베이스 코드 정렬 — `pi-tip-button.tsx`·`tips/route.ts` | ⏳ 발행 전 별도 PR (운영 결제 UI → Pi Browser 실기기 검증 후) |

### 규제 경고

- 🔴 **증권성**: 개인 발행은 책임이 개인 명의로 집중(유한책임 없음). 법무 자문에서 법인화 필요성 재확인(PRD_12 §8-1-1).
- 🔴 **레드라인 #2**: BEAN은 Pi 외 자산 → 반드시 공식 Launchpad 경유 발행. 자체 발행·USDT 등 비-Pi 페어 금지.

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|---------|-------|
| v10.3 | 2026-06-17 | **Phase 17 BEAN 토큰 발행 기획 추가** — `docs/PRD_12_TOKEN.md` v1.7 수용. Pi Launchpad 통한 Cafe.pi 생태계 유틸리티 토큰 10억 개 발행 기획. 확정: 토큰명 BEAN(기존 Pi Bean 팁 온체인화·`1 Pi=100 BEAN` 리베이스)·세일 0.01 Pi·분배 세일40/리저브25/유동성15/마케팅12/팀8·발행주체 개인(아나킨)·유동성 BEAN/Pi 단독(레드라인 #2). 잔여(외부 대기): TASK-160 증권성 법무자문·TASK-161 개인 KYC·TASK-162 Launchpad 신청양식·TASK-163 Mainnet 일정·TASK-164 Bean 리베이스 코드 정렬(발행 전). Phase 완료 현황 표·통계(총 19개·기획 1개) 갱신. ⚠️ **발행 전 앱 코드 0(문서 전용)** — 레드라인 정책상 PRD_12 git 비추적. PRD.md v11.6 동기화. | anakin |
| v10.2 | 2026-06-17 | **Phase 16 TASK-156 — 이벤트 10미션 완주 보상 전환 (A2U → 1π 보증금 적립 + 관리자 수동 지급)** — ① 보상 매체 전환: Pi A2U 직접 송금(시드 미설정·실패 시 PENDING)을 폐기하고 `mps_seller_bond` 보증금 1π 직접 적립으로 전환(`5f5e6b9`·`d540f68`), `event.ts`의 `triggerPiReward`·`reward_pi_*` 의존 제거. ② **자동 → 관리자 수동 지급**(`a277b80`): 미션 평가의 자동 보상 호출 제거 + 이벤트 화면 '1Pi 판매보증금 지급' 버튼 + `POST /api/admin/event/bond-reward`(isAdmin 이중검증), 10미션 완주·미지급·비제외자만. ③ **원자적 중복방지** `fn_evt_grant_bond_reward`(`sql/061`) — 단일 트랜잭션 + `FOR UPDATE` 행잠금 + `reward_st_cd`('BONDED'/'PAID') 게이트로 TOCTOU race·A2U-보증금 교차 이중지급 차단, `grantBondReward` RPC 래퍼 교체. ④ 추적 `evt_pi_reward_log`(`sql/048`). ⑤ M3 우회 결함 수정(`premium_cafe_create` 유료테마 게이트) + 병합 부작용 LBS 블록 중복 제거(`6a648b5`). `PRD.md` v11.5·`PRD_11_EVENT.md` v2.1 동기화. | anakin |
| v10.1 | 2026-06-16 | **GTM 문서화 + 성능 리스크 레지스터 현행화** — ① **`docs/공개_라이선스_정책.md` 신규**: 오픈코어 3계층(미끼/상품/금고), 왕관보석(PiChat·PiShop 직영) 비매 원칙, 목적=선점 창·단기 시장점유. ② **`docs/제품설명서_202060615.pptx` 신규**: 단기 4목표(PiChat 무료→수수료·PiShop 오프라인 교두보·StarterKit $100~500·외주연계) 13장 슬라이드. ③ **`docs/TROUBLESHOOT.md` 갱신**: A. 성능 리스크 레지스터(7종 — 채팅🔴·LBS🔴·에스크로🟠·구독🟠·결제🟡·계정통합🟡·다국어🟢, 공통 천장=service_role 커넥션 풀 한계) + B. 운영 이슈 기록(Vercel Hobby cron 제약·GitHub Webhook 누락 대응). ④ 기준일·진행률 요약·다음 단계 2026-06-16 갱신. PRD.md v11.4 동기화. | anakin |
| v10.0 | 2026-06-15 | **Jun 15 후속 현행화** — ① **Phase 16 TASK-155 평가 엔진 정밀화(`4f623d9`)**: M2 상태형 양방향 멱등(별명+카톡ID 유무, 미충족 취소)·평가엔진 `upsert`→`select`후 `insert`/`update`(부분 unique 회피 + 논리삭제 복구)·SEQUENCE `del_yn='N'` 필터·`mission_ord` 순 평가·프로필 빈값 저장(빈문자열→null)·관리자 재평가 버튼 + `/api/admin/event/reeval`·`CHAR(3)`→`VARCHAR(10)`(sql/046)·`CRON_SECRET` 프로덕션 필수·재평가 안전망 cron·`voice_join` 트리거 연결. ② **횡단 5차 i18n 자동번역 백그라운드화**: 서버 `after()` 전환·번역률 반올림 버그·콤보 캐시 키 v2 무효화·validate-locales 초과 키 차단. ③ 헤더 기준일·진행률 요약 2026-06-15 갱신. PRD.md v11.3 동기화. **후속 권장**: `reevaluateAllActiveUsers` 대상 선정(행위 로그 기반)이 M2 상태형과 불일치 — 프로필 보유자 UNION. | anakin |
| v9.0 | 2026-06-15 | **Phase 16 이벤트 미션 시스템 ✅ 구현 완료·운영 중 현행화** — 기획(📋)→구현 완료로 상태 전환. TASK-150~154 전부 ✅ + 실제 구현 파일 매핑(`sql/044`·`045`·`src/lib/event.ts`·`ClientEventGate`·`/api/event/*`·`/api/admin/event/*`). 확인 필요 3건 해소(선착순=전체 10미션 완주 `count===10` · M10=`checkCancelWithFee` · i18n 키 구조). 운영 통계 반영(참여 7·완주 1·제외 0·action_log 19). **미션 명칭/순서 현행화**: M4↔M5 순서 교환(Bean을 M4로·PiBet을 M5로, DB 완료기록·i18n_message·sql 시드 전 계층 정합) + M3/M5/M7/M8/M9 PiRC 표기 정비(PiRC1 위치·PiRC2·에스크로서비스;PiRC3). PRD.md v11.2 동기화(섹션 18 미션표·상태 갱신). **잔여**: `recordUserAction` 행위 훅 전수 점검(action_log 19 < 완료기록 34). | anakin |
| v8.0 | 2026-06-14 | **Jun 14 전체 개선 현행화** — ① Phase 13 MPS 후속: A2U 자동 환불(512a4a5·a619378·76e2fb7)·FR-10 ADMIN 게이트 버그 교정(c8829c4)·주문관리 취소 UI(7b2203a)·상품 이미지 업로드(3cd0bc8·sql/042)·상품 등록 위치 자동수집(23bf3ba) ② Phase 11 후속 2차: coin360 트리맵(3738ffc)·대시보드 사용자 관리 통합(b5611bf)·차트 색상 통일(cacba8e)·KST 집계 교정(c46d9c3)·결제내역 개선(6172020) ③ Phase 9 후속: Pi Bet UI 아코디언·스포트라이트(c490fb7) ④ 횡단4차: 헤더 로고(12118e7)·다국어 기억(d52d7ef)·PiShop 브랜드 치환(04c9350)·admin open redirect 방어(8f419ee·43ab342). M29~M31 마일스톤 추가. 기준일·버전 헤더 2026-06-14 갱신. | anakin |
| v7.0 | 2026-06-14 | **Phase 16 이벤트 미션 시스템(Pi 요원 육성) 로드맵 추가** — `docs/PRD_11_EVENT.md` v1.2 수용. 10미션 게이미피케이션(M1 계정통합~M10 보증금 활성 취소수수료 경험)·미션 완료 멱등 자동감지·화이트리스트·요원 등급 5단계·sum 내림차순 랭킹·관리자 제외·보상 3계층(전원 뱃지/선착순 10명 카카오 선물·M2 카톡ID 발송/Phase2+ Pi A2U). TASK-150~154. 데이터모델 `evt_mission`·`evt_user_mission`·`evt_exclude`·`evt_gift_log`. Phase 완료 현황 표·통계 갱신(총 17개). PRD.md v11.0 동기화(섹션 18 신설). ⚠️ 확인 필요: 선착순 기준·M10 판정 로직. | anakin |
| v1.0 | 2026-06-05 | 초안 작성 — Pi Network 플랫폼 기준으로 전면 재작성. Phase 0~2 완료, Phase 3 진행 중 반영 | anakin |
| v1.1 | 2026-06-05 | Phase 3 완료(관리자 결제·연동현황), Phase 4 완료(통합 게시판 TASK-021~025), 보안 수정(PostgREST ilike 인젝션) | anakin |
| v1.2 | 2026-06-06 | Phase 5 TASK-030~033 완료 반영 (표준단어·도메인·용어·DDL Export), M9 달성 | anakin |
| v1.3 | 2026-06-06 | DA 품질점검 표준화 완료 — Migration 003~008 (19개 위반 해소), 전 테이블 시스템 컬럼 강제화, `users→sys_user` 등 리네이밍 이력 반영 | anakin |
| v1.4 | 2026-06-06 | Phase 5 완료 — TASK-034 Audit Trail (Migration 009 + std_audit_log 트리거), TASK-035 승인 워크플로우 (Migration 010 + approval_queue 활용) | anakin |
| v1.5 | 2026-06-07 | Phase 6 완료 — next-intl v4 다국어, Gemini 2.5 Flash 자동번역, 18개 언어 지원, 3단계 fallback, Supabase 1000행 제한 해소, 모듈캐시 우회(readFile) | anakin |
| v1.6 | 2026-06-07 | TASK-044: 다국어 안정성 강화 — locale 단일 소스(locale-currency/country.ts), routing.ts 203개 선점 등록, Intl.DisplayNames 도입, 코드 인젝션 보안 패치(LOCALE_CD_RE) | anakin |
| v1.7 | 2026-06-07 | 기술 업그레이드: Next.js 16→16.2.7, TypeScript 5→6.0.3, eslint-config-next@16, FlatCompat 제거. 기술 업그레이드 모니터링 섹션 추가. | anakin |
| v1.8 | 2026-06-07 | Phase 7~9 PiCafé 로드맵 추가: TASK-050~074 (카페 MVP·수익화·생태계). 마일스톤 M14~M18 추가. PRD.md v4.0 통합 반영. | anakin |
| v1.9 | 2026-06-08 | TASK-050·051 완료 — sql/012_msg_tables.sql (msg_* 13개 테이블, Realtime RLS), sql/013_msg_seed.sql (테마 20개, 구독플랜 5개, 스티커팩 60개). M14 달성. | anakin |
| v2.0 | 2026-06-08 | TASK-052 완료 — 1:1 카페 API (rooms·messages·join), supabase-client.ts, use-chat-room 훅(Realtime+presence), ChatMessageList(scroll-up 무한로드), ChatInput(rate limit 복원). tsc 통과. | anakin |
| v2.1 | 2026-06-08 | TASK-053 완료 — 그룹 카페 생성 4단계 마법사 (ThemeSelector·InlinePurchasePrompt·GroupRoomCreator), payments/complete CHAT_ROOM_CREATE 분기, /chat 홈·/chat/[roomId] 페이지, Header 카페 링크. M15 달성. | anakin |
| v2.2 | 2026-06-08 | PiRC2 Soroban 스마트 컨트랙트 통합 문서화 — CLAUDE.md PiRC2 섹션 추가 (Contract ID·메서드·구독 매트릭스), TASK-054 PiRC2 기반 상세 업데이트, PRD_CHAT.md 구독 API 현행화, pi_pay SKILL.md PiRC2 구독 결제 섹션 추가. | anakin |
| v2.3 | 2026-06-09 | TASK-054 완료 — 구독 시스템(앱 레벨 U2A). chat-auth.ts(PLAN_CAPS 권한 단일 소스), /api/subscriptions(plans·POST결제준비·DELETE취소·check), payments/complete CHAT_SUBSCR 분기(amount 서버 재검증 + msg_subscr UPSERT), subscription-gate.tsx. tsc·lint(0 errors) 통과. M16 구독 기반 완성. | anakin |
| v2.4 | 2026-06-09 | Phase 7 완료 현행화. Phase 10 사용자 프로필 관리(마이페이지) 신규 추가 — TASK-056~062 (sys_user 프로필 컬럼 마이그레이션·GET/PATCH /api/profile·결제내역 API·ProfileTabs·ClientProfileGate·번역+검증). M19 마일스톤 추가. PRD.md v5.0 통합(섹션 12 신설). | anakin |
| v2.5 | 2026-06-09 | Phase 10 완료 — TASK-056~062 전체 구현 완료. DB 마이그레이션(Supabase 적용)·users.ts 타입 확장+updateUserProfile()·GET/PATCH /api/profile·GET /api/profile/payments·page.tsx+5개 컴포넌트·ko.json 번역. pnpm build 성공, /[locale]/profile ∙ /api/profile ∙ /api/profile/payments 라우트 확인. M19 달성. | anakin |
| v2.6 | 2026-06-09 | Phase 11 어드민 통계 대시보드 계획 추가 — TASK-080~087 (`PRD_CHART.md` 수용). react-plotly.js 채택, 활동 로그 `sys_user_actvty_log`(하루 1행 UPSERT) + 계측, 중간집계 rollup `stat_actvty_dly`/`stat_revenue_dly` + `fn_build_daily_stats` 멱등 집계, 일배치/백필/당일보정 하이브리드, 테마별 매출 4경로 UNION. M20 마일스톤 추가. PRD.md v6.0 통합(섹션 13 신설). | anakin |
| v2.7 | 2026-06-09 | Phase 11 완료 현행화 — TASK-083/084/085/087 구현 완료 확인 후 🔜→✅ 업데이트. TASK-083: `POST /api/admin/stats/aggregate` CRON_SECRET+어드민 이중인증·백필 모드(`backfill:true`)·`vercel.json` Cron(`0 0 * * *`) 등록. TASK-084: `fn_top_active_users`/`fn_top_revenue_themes`/`fn_top_spenders` RPC 3종 Supabase 배포. TASK-085: `plotly-plot.tsx`(ssr:false)·`dau-wau-mau-chart`·`revenue-donut-chart`·`revenue-timeline-chart` 4종 구현. 실데이터 적재 확인: `stat_actvty_dly` 5일치(2026-06-05~09)·`stat_revenue_dly` 4일치(2026-06-06~09). M20 완료일 2026-06-09 반영. | anakin |
| v2.8 | 2026-06-10 | Phase 12 PiTranslate™ 글로벌 동시통역 로드맵 추가 — TASK-090~099 (`PRD_4_CHAT.md` v1.6 수용). Gemini 2.0 Flash 주력 + Claude Haiku fallback 하이브리드, `msg_trans` 번역 캐시, in-memory dedup(`chat-translate-dedup.ts`), broadcast 기반 실시간 전달. M21 마일스톤 추가. `PRD_4_CHAT.md` 버전 참조 v1.2→v1.6 업데이트. 기준일 2026-06-10 갱신. `PRD.md` v7.0 통합(섹션 14 신설·섹션 15~18 재번호화). | anakin |
| v3.0 | 2026-06-10 | Phase 12 추가 고도화 — 방별 번역 언어 콤보(`chat-locale-select.tsx`, 방 헤더 제목 옆, localStorage 방별 독립 저장) + `translate-batch` API(캐시 우선 일괄 번역) + `forceTranslate` 모드(전체 메시지 강제 번역·언어 변경 시 재번역) + 카페 레이아웃 고정(헤더·입력창 `shrink-0`, 본문만 `min-h-0` 스크롤) + 헤더 ChatRoomPanel 통합 + `locale-options.ts` 단일 소스. tsc·build 통과. | anakin |
| v2.9 | 2026-06-10 | Phase 12 PiTranslate™ MVP 구현 완료 — TASK-090~097. `sql/020_msg_trans.sql`(018·019 선점으로 번호 조정, Supabase 적용 완료), `chat-translate.ts`(Gemini 2.0 Flash REST + Claude Haiku fallback), `chat-translate-dedup.ts`(pending map + 번역 큐 + broadcast 내장), translate API 라우트, 메시지 POST `after()` 번역 큐 + GET locale pre-populate, `use-chat-room.ts` msg_trans 구독 + 수신 자동 번역 요청, 프로필 표시 언어 드롭다운(203 locale), `translated-message.tsx` 원문 토글. tsc·lint(0 errors)·build 통과. M21 달성. TASK-098(어드민 번역 통계)·099(품질 피드백)는 후속. | anakin |
| v4.0 | 2026-06-10 | Phase 13 PiShop(MPS) 로드맵 추가 — TASK-100~113 (`PRD_8_MPS.md` v1.1 수용). PiRC2 U2A 가상 에스크로·`stock_qty` 원자적 차감 불변 조건·`mps_` 6개 테이블(sql/021_mps.sql)·lib 헬퍼 3종·API 12종·화면 6종(SCR-01~06) Phase 1 MVP / TASK-108~111 Phase 2 확장 / TASK-112~113 Phase 3 PiRC3 마이그레이션. M22 마일스톤 추가. 현재 버전 헤더 갱신. | anakin |
| v5.2 | 2026-06-11 | Phase 14 PiVoice™ 음성통화 설계 추가 — `docs/PRD_9_VOICE_CHAT.md` v1.0 수용. WebRTC P2P 1:1 MVP, Supabase Realtime 시그널링 재사용(추가 인프라 0), 관리형 TURN으로 시작, 베타 무료. TASK-120~123(데이터모델·TURN발급·시그널링/통화API·WebRTC훅+UI) + S0~S3 Go/No-Go 로드맵. M23 마일스톤 추가. `voice-chat-architect` 에이전트 기준선 반영. | anakin |
| v5.1 | 2026-06-11 | Phase 9 PiCafé 생태계 완료 — TASK-070~074 전체 구현. `sql/022_chat_ecosystem.sql`(msg_theme_follow·msg_bet·msg_bet_optn·msg_bet_entry·msg_webhook + fn_chat_marketplace·fn_room_analytics·fn_room_mau RPC). 마켓플레이스(테마 필터+가중 랭킹+팔로우), Pi Bet(생성·U2A 참가·균등 분배 정산·BET_NOTI), Webhook·봇(API Key 인증·메시지 push·어드민 현황), 분석 대시보드(일별 통계+MAU+plotly), 커스텀 스티커(ownr_usr_id·mkt_yn·노출 규칙). **msg_msg CHECK AI_REPLY 누락 버그 수정**. M18 달성. tsc·lint(0 errors)·build 통과. | anakin |
| v5.0 | 2026-06-11 | Phase 8 수익화 전체 완료 현행화 — TASK-060~065 전체 🔜→✅. Pi Tip(`/api/tips` + `pi-tip-button.tsx`), 스티커 마켓(`sticker-picker.tsx` + `/api/stickers/packs`), 인라인 트리거 8종(Trigger 1~8 전체 구현 — 배지 시스템·이벤트방 알림 포함), 이벤트 카페(이벤트방 탭 다이얼로그 + `room_tp_cd='E'` API), AI 어시스턴트(`@ai` 멘션→Anthropic API→`AI_REPLY`), 파일·이미지·음성 메시지(Supabase Storage + IMAGE/VOICE/FILE 타입). Phase 11 후속 고도화 섹션 추가 — DAU/WAU/MAU 통계 버그 4건(activity-log lazy thenable·Vercel Cron GET·슬라이딩 윈도우·오늘 온디맨드), Top3 가중치 점수제(활동일수×0.2 + 콘텐츠×0.3 + 결제×0.5). M16·M17 ✅ 완료 처리. 기준일·버전 헤더 갱신. | anakin |
| v5.3 | 2026-06-11 | 마이그레이션 번호 충돌 정리 — TASK-100 MPS `sql/021_mps.sql`→`sql/029_mps.sql`(021은 msg_usr_badge 점유), TASK-120 PiVoice `sql/024_voice_call.sql`→`sql/026_voice_call.sql`(024는 sys_batch_log 점유). M22 마일스톤 파일명 동기화, `PRD_9_VOICE_CHAT.md` 파일명 참조 갱신, `PRD_8_MPS.md` 헤더 버전 v1.0→v1.1 불일치 해소. 어드민 배치 실행 이력(`sys_batch_log` + `/api/admin/batch/logs` + 이력 테이블 UI)·결제 내역 테마 컬럼(통계와 동일 분류 규칙) 추가 반영. | anakin |
| v5.5 | 2026-06-12 | Phase 15 LBS 위치기반서비스 로드맵 추가 — `docs/PRD_10_GPS.md` v1.2 수용. 동의 게이트 Rule LBS-01~04(UI·API·철회·MPS 거리), `sql/030_lbs.sql`(sys_user_consent·usr_loc_hist·sys_user 컬럼 3개), Google Maps API 서버 프록시, Haversine SQL 거리 계산, `/api/store/items` 거리 파라미터 확장(Rule LBS-04). TASK-130~139. M24 마일스톤 추가. 헤더 현재 버전 갱신. `PRD.md` v9.0 통합(섹션 16 신설). | anakin |
| v5.6 | 2026-06-12 | **Phase 15 LBS P0 MVP 구현** — TASK-130~133·136·138 완료. `sql/033_lbs.sql`(sys_user_consent·usr_loc_hist·fn_haversine_km·sys_user 컬럼 3개·DA-APPROVED), `src/env.ts`·`.env.example`(GOOGLE_MAPS_API_KEY·NEXT_PUBLIC_GOOGLE_MAPS_API_KEY), `/api/location/consent`(GET/POST/DELETE — 동의 등록·철회·즉시파기 Rule LBS-03), `/api/location/save`(동의 서버 재검증 Rule LBS-02), `mps-item.ts` haversineKm() + sort=distance 확장, `store-item-list.tsx` GPS 위치 수집 + 📍 거리 배지(Rule LBS-04). tsc(0 errors) 통과. | anakin |
| v5.7 | 2026-06-12 | **Phase 15 LBS P1 주변탐색 완료** — TASK-135·137·139 완료. `/api/location/nearby/rooms`(방 생성자 최근 위치 기반 Haversine)·`/api/location/nearby/shops`(mps_shop.lat/lng 활용)·`/api/location/history`(열람권 50건), `lbs-consent-dialog.tsx`(동의 다이얼로그·약관 요약+전문링크), `store-item-list.tsx` `LbsConsentDialog` 통합(미동의 CTA 버튼 → 동의 후 GPS 즉시 요청), `lbs-settings.tsx`+`profile-tabs.tsx`(마이페이지 위치 서비스 탭), `pi-auth-provider.tsx` `saveLoginLocation()` side-effect(로그인 완료 시 `loc_tp_cd='02'` fire-and-forget). M24 ✅ 달성. tsc(0 errors) 통과. | anakin |
| v5.8 | 2026-06-12 | **Phase 15 TASK-134 Google Maps 서버 프록시 완료** — `src/lib/google-maps.ts`(`geocodeAddress()`·`reverseGeocode()` — Geocoding API 단일 호출 양방향, `import 'server-only'` 키 보호, 한국 행정구역 type 우선순위 fallback 파서, fetch 캐시 1일), `POST /api/location/geocode`(주소→좌표)·`POST /api/location/reverse-geocode`(좌표→주소+시도/시군구/동) — 로그인 필수·동의 불필요·유료 API 남용 방지, status별 처리(OK/ZERO_RESULTS 404/REQUEST_DENIED 등 502). `GOOGLE_MAPS_API_KEY` `.env.local` 기존 배치 확인(AIzaSy 39자). tsc·lint(0 errors) 통과. M24 P1 전체(TASK-134~139) 완료. | anakin |
| v5.9 | 2026-06-12 | **Phase 15 LBS P1 확장 — 행정구역 자동 보강 + 주변 탐색 화면** — `reverseGeocode()`를 `/api/location/save`에 연결(클라이언트가 행정구역 미전송 시 서버가 좌표→시도/시군구/동 자동 채움, best-effort·실패 시 좌표만 저장). `reverseGeocode` 좌표 4자리 반올림으로 fetch 캐시 적중률↑(비용 절감). `nearby-explorer.tsx`(동의 게이트+GPS 수집+반경 1/5/10km+매장/채팅방 탭, 거리순) + `/[locale]/nearby/page.tsx`(클라이언트 게이트, redirect 금지) + 스토어 헤더 `📍 주변` 진입점. tsc(0 errors)·lint(신규 경고는 set-state-in-effect 보류 카테고리). | anakin |
| v6.1 | 2026-06-12 | **위경도 컬럼 DA 표준화 + 재발방지** — 품질감사로 `lat`/`lng`(mps_shop·usr_loc_hist·mps_item)의 표준단어·도메인·용어 3대 미준수 적발. §0 Top-down 절차로 정정: 표준사전 등재(`std_dom` CRD=NUMERIC(11,8) / `std_dic` LATD·LNGT·CRD / `std_term` latd_crd·lngt_crd) → `sql/037_coord_standardize.sql`(3테이블 rename + NUMERIC(11,8) 통일 + 인덱스 재생성, Supabase 적용) → 코드 5곳 별칭 매핑(DB는 표준명, JS/API는 보편표기 `lat`/`lng` 유지). **재발방지**: `da-ddl-guard.mjs`에 ALTER ADD COLUMN 도메인 검사 추가(R7 사각지대 해소)·CRD 화이트리스트, `da-qa-checklist` skill에 정기 전수조사 쿼리·사례 등재, `데이터표준규칙.md` v2.1. 전수조사 리포트 `docs/da/reports/2026-06-12_*`(잔여 운영 위반·레거시 drop 후보 분류). tsc 0 errors. | anakin |
| v5.4 | 2026-06-11 | **Phase 13 PiShop(MPS) Phase 1 MVP 1차 구현** — TASK-100~107 🔜→✅. `sql/029_mps.sql`(mps_ 6개 테이블 + fn_mps_order_create/fn_mps_order_cancel 원자적 재고 RPC, Supabase 적용), lib 3종(mps-item·mps-order·mps-shop), 상품 API(/api/store/items CRUD + 검색·필터·정렬), 주문 API(생성·취소·confirm·release + 당사자 403), 에스크로는 기존 `/api/payments/complete`에 `MPS_ESCROW` 분기 통합(PENDING→ESCROW + ESCROW_IN 이력 + 금액 서버 재검증), UI 6페이지(/store 목록·상세·my/items·new·sales·orders — usePiAuth 클라이언트 게이트, redirect 금지), store 번역 ko/en. tsc·lint(0 errors) 통과. **후속**: 이미지 업로드(Storage)·상품 수정 폼·SELLER_DONE 자동 DONE cron·실 Pi 정산(A2U)·Pi Browser 실기기 결제 검증. | anakin |
| v6.0 | 2026-06-12 | **Phase 14 PiVoice™ v2.0 N:N 음성채널 구현 완료** — PRD_9 v2.0 확정(1:1 MVP 폐기 → N:N 1~4명·1인 대기·방장 마이크 제어·동시 마이크 4명 제한) 후 TASK-120~123 전체 구현. `sql/032_voice_channel.sql`(msg_call_participant 신규·call_log room 레벨 전환·quality_stat room upsert·RLS, Supabase 적용), 음성채널 API 5종(join/leave/signal/mic-control/participants — broadcastToCall 전용 토픽), `use-voice-channel.ts`(Full Mesh·단방향 offer glare 차단·candidate 큐·ICE restart), `voice-channel-panel.tsx`(방장 제어 UI). M23 달성(S0 실기기 검증·TURN env 잔여). | anakin |
| v6.1 | 2026-06-12 | **횡단 개선 4종** — ① 화면 성능 튜닝: `use-infinite-scroll`(IntersectionObserver)·`LazySection` 공용 인프라, Home 대시보드 매출 API·Plotly 차트 뷰포트 진입 시 지연 로드, Cafe 마켓플레이스·내카페·Shop 목록 무한 스크롤 전환 ② **Pi Tip → Pi Bean 리브랜딩**: 사용자 노출 명칭·이미지(public/bean.png·bean-noti.png) 전면 교체, 기존 DB 메시지·결제 memo 일괄 변경, `fn_top_revenue_themes` 라벨 '빈(Bean)' 동기화 — 식별자(canTip·PI_TIP·msg_tip)는 호환성 유지 ③ LBS 약관 페이지 `/docs/agreement/lbs` 신설(react-markdown 서버 렌더 + outputFileTracingIncludes) — 동의 다이얼로그 404 해소 ④ **pi_pymnt 트리거 수리**: 구버전 updated_at 참조로 UPDATE 전면 실패하던 버그 → mod_dtm 갱신 교체(sql/034). TASK-098(번역 통계)·099(품질 피드백) 완료로 Phase 12 종결. M21 완성·M25 추가. PRD.md v10.0 동기화(섹션 16 PiVoice 신설·17~21 재번호). | anakin |
| v6.2 | 2026-06-12 | **Phase 14 PiVoice™ v3.0 권한 시스템 + 횡단 2차 현행화** — ① **PiVoice v3.0**(PRD_9 v3.0 R1~R7, TASK-124): `sql/035_voice_permission.sql`(`mic_st_cd` CONNECTED/PENDING/LISTEN_ONLY 3상태, Supabase 적용), `lib/voice.ts` 슬롯 설정값(`VOICE_AUTO_SLOTS=2`·`VOICE_MAX_MEMBER_SLOTS=4` env 오버라이드)·`decideMicStateOnJoin()`, join(방장 무조건 CONNECTED·멤버 자동 2명→PENDING→정원초과 LISTEN_ONLY), mic-control(approve/deny/revoke/grant + mute/unmute 하위호환), `/request` API 신설(청취전용→발언신청 + `mic_request` 알림), 훅·패널 상태 머신 UI(발언 신청·방장 승인/거절/회수·👑). ② **S0 진단 메시지**(TASK-125): `use-voice-channel.ts` 입장 실패 사유 단계별 캡처 + 패널 화면 노출(Pi Browser 마이크 권한 디버깅). ③ **상품 개별 위치**(TASK-140): `sql/036_item_location.sql`, `store-item-form.tsx` 등록 시 판매자 GPS 저장(`loc_tp_cd='04'`), `/api/store/items` 위치 소스를 상품 개별 좌표 우선으로 전환. ④ **SWR 성능 튜닝 2차**: HOME·Shop·관리자·카페 목록 localStorage SWR 캐시 + 병렬 호출(`client-cache.ts`·`chat-room-list.ts`·`/api/admin/dashboard`·`admin-dashboard-stats.tsx`). ⑤ **스티커 노출 개선**: `sql/038_stkr_pack_sort.sql`(골프 인사·응원팩 최우선 정렬)·2배 확대·길게눌러 저장 방지(`sticker-img.tsx`). ⑥ 다국어 동기화(en·zh·ja·et·il·mx — LBS·카페 목록 키). M23 v3.0 갱신·M26 추가. **주의: `sql/035` 번호가 `035_bean_rebrand.sql`·`035_voice_permission.sql` 두 파일에 중복 — 적용 순서 무관(상이 테이블)하나 향후 번호 정리 권장.** | anakin |
| v6.5 | 2026-06-13 | **Phase 13 MPS Phase 2 확장 완료 — TASK-108~111** — ① TASK-108 카테고리: 기 구현 검증(시드 19행 적용·상품폼 드롭다운 연결 완료 확인). ② **TASK-109 매장 관리(신규)**: `GET·POST /api/store/shops` + `PATCH·DELETE /api/store/shops/[shopId]`(본인 매장만·소속 상품 shop_id=NULL 보존), `client-my-shops.tsx`(목록+인라인 등록/수정 폼·유형 ONLINE/OFFLINE/BOTH), `/store/my/shops` 페이지(SCR-08), 상품 폼 매장 선택 드롭다운, 내 상품→매장관리 링크. `mps_shop`·`mps-shop.ts`는 sql/029 기 완비라 DB 변경 없음. ③ **TASK-110 양방향 취소**: 기존 구현이 FR-10 충족 검증(`ClientMyOrders` role 공유·구매자/판매자 양쪽 취소 버튼·`fn_mps_order_cancel` RPC 재고복원+보증금 수수료) → 🔜→✅ 정정. ④ **TASK-111 거래 내역(신규)**: `mps-txn.ts`(`listTxns` txn_hist+order+item 조인·BUY/SELL/ETC 분류), `GET /api/store/txns`(날짜필터·관리자 all=1), `client-my-history.tsx`(탭+날짜범위+부호색상), `/store/my/history` 페이지(SCR-07)·nav 링크. `mps_txn_hist` 기 완비. i18n: `store.shop.*`·`store.history.*` ko/en JSON + i18n_message DB en upsert(is_auto='N'). tsc·**pnpm build 통과**(신규 라우트 3종·locale 검증). Phase 13 P2 종결, M28 추가. | anakin |
| v6.4 | 2026-06-13 | **횡단 3차 — Pi Browser admin 다국어 전환 무반응 수정 + 헤더 콤보 성능 캐시(M27)** — ① `language-switcher.tsx` admin 분기: 티켓 없는 하드 네비게이션이 Pi Browser(쿠키 미저장)에서 미인증 게이트로 빠지고 게이트의 soft `router.replace` 재렌더가 WebView에서 안정적으로 잡히지 않아 'checking' 멈춤(무반응)이던 문제를, locale 전환 시점에 `piFetch('/api/admin/pit-ticket')`로 `_pit` 티켓 선발급 후 `?_pit=`에 실어 하드 네비게이션 → 미들웨어가 첫 요청부터 `x-pit-ticket` 헤더로 변환해 인증된 admin UI 즉시 렌더(게이트 왕복 제거, 일반 브라우저는 쿠키 인증 호환) ② 헤더 다국어 콤보 매 열기 재조회 지연 제거: `/api/i18n/countries` `revalidate=600`(서버 CDN 캐시·환율은 기존 900 유지) + `language-switcher.tsx` sessionStorage+모듈 메모리 TTL 10분 캐시(`useState` lazy initializer 첫 렌더 즉시 반영·닫을 때 초기화 제거) + 캐시 미적중 시 `requestIdleCallback` 백그라운드 프리페치 → 재열기·페이지 이동·세션 첫 클릭 지연 0. tsc·lint·prettier 통과, 2건 커밋·배포(70bfaac·9c62512). | anakin |
| v6.3 | 2026-06-12 | **Phase 13 MPS Phase 2 — TASK-108 카테고리 시스템 구현** — `mps_ctgr` 테이블·`mps_item.ctgr_id` FK·상품 API `?ctgr=` 필터는 기존재, 비어있던 시드·API·UI를 구현. `sql/039_mps_ctgr_seed.sql`(대분류 6 + 소분류 14, 고정 UUID + ON CONFLICT 멱등), `src/lib/mps-ctgr.ts`(인접 리스트→앱 레벨 트리 빌드 + CRUD + 논리삭제 — 하위 카테고리 있으면 거부·상품은 미분류 보존), `GET /api/store/categories`(공개 트리), 어드민 CRUD API 2종(`/api/admin/store/categories` + `[ctgrId]`), 어드민 UI `/admin/store/categories`(대분류 그룹+소분류 들여쓰기, std/words 패턴), `admin-sidebar.tsx` 스토어 관리 섹션, ko·en 번역(`admin.store.categories`). tsc(0 errors)·prettier 통과. **잔여: sql/039 Supabase 적용 + 상품 폼 카테고리 드롭다운 연결.** | anakin |
