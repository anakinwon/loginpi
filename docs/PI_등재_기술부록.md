# PyCafé™ 기술 부록 — Pi Network 등재·심사용

> 본 문서는 cafe.pi(PyCafé™)를 **Pi Network 메인넷 등재/런치패드 심사**에 제출하기 위한
> 기술 부록입니다. 앱의 ① Pi 정책 준수, ② Pi Browser 호환성, ③ 결제·자금 무결성,
> ④ 보안(KISA 기준), ⑤ K-DATA 데이터 표준 준수를 **소스 코드 근거와 함께** 입증합니다.
>
> - 작성 기준일: 2026-07-16
> - 스택: Next.js 16 (App Router) · React 19 · TypeScript 6 · Supabase · Vercel(Pro)
> - 모든 주장은 저장소 내 실제 파일을 근거로 합니다.

---

## 1. 개요

PyCafé™는 **Pi 계정 로그인·결제를 1차 경로**로 하는 글로벌 커뮤니티·커머스 플랫폼입니다.

| 기능 | 공식 명칭 | 성격 |
|---|---|---|
| 커뮤니티(카페·채팅) | **PyCafé™** | 온라인 커뮤니티 |
| 마켓플레이스 | **PyShop™** | P2P·O2O 거래 |
| 자동번역 | **PyTranslate™** | 다국어 소통 |

**최우선 설계 가치** (저장소 `CLAUDE.md` 최상단 명시):
1. Pi Browser에서 Pi 계정으로 **로그인**할 수 있어야 한다.
2. Pi Browser에서 Pi 계정으로 **결제**할 수 있어야 한다.

이 두 가치는 인증·결제 변경 시 **Pi Browser 실기기 검증**을 완료 조건으로 삼아 회귀를 방지합니다.

---

## 2. Pi Network 정책 준수 — 등재 레드라인 대응 ⭐

Pi 메인넷/런치패드 심사의 4대 금지선을 모두 충족합니다.

### 2.1 Pi 계정 로그인 지원 (Pi 외 로그인 강제 없음)
- Pi SDK `authenticate()`를 1차 인증 경로로 사용. Google OAuth는 **선택적 보조 연동**일 뿐
  서비스 이용에 강제되지 않습니다.
- **Pi Sign-In (2026-07-08 추가)**: 일반 브라우저에서도 `accounts.pinet.com` OAuth로
  **Pi 공식 계정 로그인**이 가능합니다(PC QR·모바일 딥링크·Pi Browser SDK 3종 여정 실기기 검증 완료).
  Pi Browser 밖에서도 Pi 계정 우선 신원 체계를 강화합니다.
- 근거: `src/components/pi-auth-provider.tsx`(Pi 인증·세션), `src/auth.ts`(Google은 선택적 연동),
  `src/components/pi-oauth-login-button.tsx`(Pi Sign-In)

### 2.2 Pi 외 통화 없음 (법정화폐·외부 토큰 결제 경로 부재)
- 모든 실결제는 **Pi**로만 이루어집니다.
- **Bean**은 외부 환전이 불가능한 **내부 적립금(store credit)** 입니다.
  - `1 Pi = 100 Bean` 고정 환율, **정수 전용**, 소각 없음(오프체인 USER↔플랫폼 순환).
  - Bean은 Pi와 경쟁하는 통화가 아니라 Pi로 충전하는 내부 포인트입니다.
- 근거: `sql/067_bean_wallet.sql`(상단 주석 L4–7: "Bean Token은 오프체인 내부 잔액(store credit),
  1 Pi = 100 Bean 고정, 정수 전용"), `src/lib/bean-shared.ts`(`BEAN_PER_PI = 100`)

### 2.3 도박·베팅 없음
- 베팅 기능은 완전히 제거되었고 시세 노출 요소도 숨김 처리되어, 현재 코드에 도박 로직이 없습니다.

### 2.4 브랜딩 준수
- 사용자 표시 텍스트는 공식 표기(PyCafé™·PyShop™·PyTranslate™)를 일관 적용합니다.
  (단, DB 코드값·변수·**Pi 결제 memo**는 결제 호환을 위해 원형 유지)
- 근거: `CLAUDE.md` "공식 브랜드 표기" 섹션

### 2.5 Pi 결제는 Pi Browser 전용
- 결제 진입 전 `window.Pi` 존재를 **선검사**하여 일반 브라우저에서의 결제 시도를 차단합니다.
- 근거: `src/components/pi-pay-button.tsx`(결제 직전 `window.Pi` 가드)

---

## 3. Pi Browser 호환성 (기술 핵심)

Pi Browser WebView는 **모든 방식의 `Set-Cookie`를 저장하지 않는** 치명적 제약이 있습니다.
PyCafé™는 이를 구조적·암호학적으로 우회합니다.

### 3.1 쿠키 미저장 제약 극복 — 쿠키 OR `X-Pi-Token` 헤더 이중 인증
- 토큰 발급 시 `pi_session` **쿠키**와 JSON **토큰 필드**를 **둘 다** 반환합니다.
- 클라이언트는 `localStorage`에 토큰을 저장하고, `piFetch`가 모든 요청에 `X-Pi-Token` 헤더를
  자동 첨부합니다(+ `credentials: 'include'`).
- 서버 `getSessionUser()`는 **쿠키 우선 → `X-Pi-Token` 헤더 폴백 + 만료 검증** 순으로 인증합니다.
- 근거: `src/app/api/auth/pi/route.ts`(쿠키+토큰 동시 반환), `src/lib/pi-fetch.ts`(헤더 자동 첨부),
  `src/lib/auth-check.ts`(이중 경로 검증)

### 3.2 토큰 보안 — HMAC-SHA256 + 상수시간 비교
- 세션 토큰은 HMAC-SHA256으로 서명되어 위·변조가 불가능하며, 검증 시 `timingSafeEqual`
  상수시간 비교로 타이밍 공격을 방어합니다.
- 근거: `src/lib/pi-session-crypto.ts`

### 3.3 클라이언트 게이트 — 무한 루프 방지
- `getSessionUser()`가 null일 때 서버에서 `redirect`를 호출하면 Pi Browser에서 **무한 루프**가
  발생합니다. 이를 막기 위해 **redirect 대신 클라이언트 컴포넌트로 위임**합니다(예: `ClientChatRoom`).
- 근거: `src/app/[locale]/chat/[roomId]/page.tsx`, `src/components/chat/client-chat-room.tsx`

### 3.4 미완료 결제 자동 복구
- 앱 하이드레이션 시 `getIncompleteServerPayments()`로 미완료 결제를 조회해
  txid가 있으면 complete, 없으면 cancel하는 베스트에포트 복구를 수행합니다.
- 근거: `src/components/pi-auth-provider.tsx`

---

## 4. 결제·자금 무결성 ("자금 누수 무관용")

자금 관련 데이터는 **누락 0·이중지급 0**을 원칙으로 다층 방어합니다.

### 4.1 Pi 결제 상태 머신 + 멱등성
- `createPayment → approve → complete`의 비동기 콜백 흐름을 명확한 상태 전이로 처리합니다.
- 승인 단계는 `already_approved`를 예상해 멱등 처리하며, 완료 단계는 결제 메타타입별로
  비즈니스 로직을 분기합니다(MPS_ESCROW / MPS_BOND / BEAN_CHARGE).
- 근거: `src/app/api/payments/approve/route.ts`, `src/app/api/payments/complete/route.ts`

### 4.2 판매자 자동 정산(A2U) — 이중 송금 원천 차단
- 주문 완료 시 판매자 지갑으로 App→User(A2U) Pi 송금을 자동 수행합니다.
- **멱등성 다층 보호**: `release_txid` 존재 확인 + `mps_txn_hist`의 `RELEASE_OUT`·`pi_txid` 확인 →
  이미 정산된 주문은 재송금하지 않습니다. A2U 비활성 시 PENDING으로 마크(graceful degradation).
- 근거: `src/lib/mps-order.ts`(`settleOrder`), `src/lib/pi-a2u.ts`

### 4.3 Bean 경제 — 회계 보존 항등식
- 보존 항등식: **발행(ΣCHARGE + Σmint) = 유통(ΣUSER) + 회수(PLATFORM + REWARD_POOL + FOUNDATION)**
- `fn_bean_balance_check()`가 이 항등식을 상시 검증하며, 정상 상태의 차이(diff)는 **반드시 정확히 0**
  이어야 합니다(허용 오차 없음).
- 근거: `sql/088_bean_accounting_p0_p1_fix.sql`, 균형 판정 `diff === 0` 엄격화:
  `src/app/api/admin/token/stats/route.ts`

### 4.4 과발행 차단 + 음수 잔액 불가
- 보상 지급 시 출처 지갑을 차감하되, 재원 부족이면 침묵 클램프 대신 `CHECK(bean_amt >= 0)` 위반으로
  **전체 트랜잭션 롤백**합니다(무에서 토큰 창조 불가). 모든 지갑은 음수가 될 수 없습니다.
- 근거: `sql/088_bean_accounting_p0_p1_fix.sql`, `sql/069_bean_token_wallet.sql`(`CHECK(bean_amt >= 0)`)

### 4.5 Append-only 원장 + 원자적 동기화
- `bean_txn`(append-only 원장)이 **진실의 원천**이고, `bean_wlt`는 빠른 조회용 잔액 캐시입니다.
  `fn_bean_apply`가 둘을 동일 트랜잭션에서 `FOR UPDATE` 잠금으로 원자적 동기화합니다.
- 근거: `sql/067_bean_wallet.sql`

### 4.6 이중지급 방지
- 이벤트 보상: 보상 로그 행 `FOR UPDATE` 잠금 + 상태 게이트(`PAID`면 즉시 반환).
- P2P 전송: 송신·수신 지갑을 정렬 순서로 잠가 데드락을 방지합니다.
- 근거: `sql/095_fn_evt_grant_bean_reward.sql`, `sql/078_bean_p2p_transfer.sql`

---

## 5. 보안 (KISA 21개 항목 기준)

정본 평가 문서: `docs/PRD_2_SECURITY.md` (행정안전부/KISA 21개 웹 취약점 항목 상세 평가)

| 영역 | 대응 |
|---|---|
| SQL 인젝션 | Supabase PostgREST 파라미터 바인딩, `.or()` 필터 입력 sanitize |
| XSS | React 자동 이스케이프, Markdown 렌더링 `skipHtml` |
| 인증 | HMAC-SHA256 Pi 토큰(32자+ SECRET) · NextAuth JWT |
| 인가 | RBAC(ADMIN/MASTER/USER), `isAdmin` 서버 게이트 |
| CSRF/세션 | SameSite 쿠키, 32자+ SECRET(`src/env.ts` t3-env 검증) |
| 파일 업로드 | Magic Byte 검증 + 확장자 화이트리스트, Supabase Storage 격리 |
| 전송 암호화 | HTTPS 강제(Vercel) |

> **Supabase RLS 비활성화 정당화**: 모든 데이터 접근은 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`로만
> 이루어지며, anon key의 클라이언트 직접 사용을 금지합니다. 권한 검증은 서버 `getSessionUser()`/
> `isAdmin()`에 집중됩니다(`docs/PRD_2_SECURITY.md`에 모델 명시).

---

## 6. K-DATA(한국데이터산업진흥원) 데이터 아키텍처 표준 채택 ⭐

> **정부 공인 데이터 표준 준수** — 한국데이터산업진흥원(K-DATA)의 공식 데이터 관리 방법론을
> 신생 단계부터 **전면 적용**하고 자동화 도구로 강제합니다. 데이터 표준은 사후 정비가 가장 어려운
> 영역으로, 이를 출범 시점부터 지킨다는 것은 장기 운영·감사·이관 신뢰도의 결정적 차별점입니다.
>
> 정본 프레임워크: `docs/da/README.md` · `docs/da/데이터표준규칙.md` · `docs/da/품질점검기준서.md`

K-DATA 4대 데이터 관리 영역을 모두 구현합니다.

### 6.1 데이터 표준화 (표준사전)
- **표준단어·표준도메인·표준용어** 사전을 운영하고, 컬럼명은 `단어(_단어)_도메인` 형식을 강제합니다
  (예: `bean_amt`, `reg_dtm`, `del_yn`).
- 복합어 약어 통일: REGR(등록자)·MODR(변경자)·PYMNT(결제)·CTGR(카테고리).
- 도메인 접두사 강제: `bean_`(Bean 경제)·`sys_`(시스템)·`msg_`(메시지)·`std_`(표준)·`mps_`(마켓).
- 운영 화면: `/admin/std/words`·`/admin/std/domains`·`/admin/std/terms`

### 6.2 데이터 모델링 (Top-down)
- 개념(주제영역) → 논리(표준사전 기반) → 물리(DDL)의 **하향식 모델링** 절차를 따릅니다.
- 주제영역별 도메인을 분리해 설계합니다.

### 6.3 데이터 품질
- `docs/da/품질점검기준서.md` 기반 **P1/P2/P3 체크리스트**로 표준 준수·명명규칙 정합성을 점검합니다.
- 전 테이블 **시스템 컬럼 4개 필수**: `regr_id`(등록자)·`reg_dtm`(등록일시)·`modr_id`(변경자)·
  `mod_dtm`(변경일시) → **감사 추적 100%**.
- **논리삭제(`del_yn` + `del_dtm`) 원칙, 물리 DELETE 절대 금지** → 데이터 영구 보존.

### 6.4 데이터 거버넌스 (자동 강제)
- `da-ddl-guard` Hook이 `sql/*.sql`·DDL 작성 시점에 표준 위반을 **자동 차단**합니다.
- 예외는 `-- DA-APPROVED:` 승인 주석으로만 허용하며 영구 추적됩니다.
- 전담 검토 거버넌스(데이터 표준 검토·품질 감사 역할)로 표준을 운영합니다.

> **의의**: cafe.pi는 첫 테이블부터 K-DATA 표준을 적용하고 Hook으로 강제하여 데이터 기술 부채를
> 원천 차단합니다. 이는 확장·감사·이관 단계에서 직접적인 신뢰도로 환산됩니다.

---

## 7. 성능 최적화 (Performance Engineering)

Core Web Vitals 목표(LCP < 2.5s · CLS < 0.1 · INP < 200ms) 아래 다층 최적화를 적용합니다.
(보안을 위해 정확한 임계값·캐시 수명·인덱스 구조·실행 스케줄·시크릿은 본 문서에서 의도적으로 생략합니다.)

### 7.1 서버 우선 렌더링 + 병렬 데이터 페칭
- RSC(React Server Components)로 서버에서 데이터를 선로딩해 클라이언트 워터폴을 제거합니다.
- `Promise.all` 병렬 조회와 멤버수 통합 1회 조회로 N+1 쿼리를 없앱니다.
- 응답 반환 후 비핵심 작업(미션 평가 등)은 `after()`로 백그라운드 실행합니다.
- 근거: `src/lib/chat-room-list.ts`, `src/lib/event.ts`

### 7.2 Stale-While-Revalidate 클라이언트 캐싱
- 캐시를 즉시 표시한 뒤 백그라운드에서 재검증하는 SWR 패턴을 localStorage 기반으로 적용합니다
  (Pi Browser는 HTTP 캐시를 신뢰할 수 없어 앱 레벨 캐싱을 채택).
- 동시에 발생하는 동일 요청은 in-memory dedup으로 1회로 합쳐 중복 호출을 차단합니다.
- 근거: `src/lib/client-cache.ts`, `src/lib/chat-translate-dedup.ts`

### 7.3 위치(GPS) 최적화
- 거리 배지에는 캐시 우선·짧은 타임아웃·고정밀 재시도를 생략한 "quick 모드"를 적용해 목록 로딩을
  막지 않습니다.
- 실시간 추적은 의미 있는 이동 임계값 미만의 미세 이동을 무시해 불필요한 재조회를 차단합니다.
- 근거: `src/lib/geo.ts`

### 7.4 데이터베이스 최적화
- 부분일치 검색에 trigram(pg_trgm) GIN 인덱스를 표준으로 채택해 앞·중간·뒤 와일드카드를 가속합니다.
- 활성행 부분 인덱스(논리삭제 제외)로 인덱스 크기·캐시 효율을 높입니다.
- 단건 조회는 `.maybeSingle()`로 불필요 행 페칭을 막고, 서버 전용 클라이언트 lazy init와
  연결 풀링으로 콜드스타트·동시성을 개선합니다.

### 7.5 번들·렌더링 최적화
- Next.js 16 Turbopack과 무거운 차트 라이브러리의 `dynamic` import(`ssr: false`)로 초기 번들을 줄입니다.
- `next/image` 최적화 + 허용 origin 제한, 뷰포트 진입 시 로드(IntersectionObserver), 입력 디바운싱을 적용합니다.
- 빌드 시점 검증(환경변수·locale 교차검증)으로 배포 후 런타임 실패(500)를 차단합니다.
- 근거: `scripts/validate-locales.mjs`

### 7.6 부하·남용 방어 (보안 결합)
- 경로별로 차등화된 rate limiting(슬라이딩 윈도우), 요청 본문 크기 상한, 차단 시 `Retry-After` 응답을
  적용합니다.
- 무거운 집계는 정기 배치(cron)로 사용자 요청 경로 밖에서 처리합니다.
- *구체 임계값·실행 스케줄·시크릿은 보안상 본 문서에 공개하지 않습니다.*

---

## 8. 인프라·운영 안정성

- **환경변수 타입 검증**: `src/env.ts`(t3-env)로 빌드 시점에 누락·타입 오류를 차단합니다.
- **다국어**: 189개 활성 locale(66개 언어 완역, 2026-07-08 기준)을 단일 소스(`src/lib/locale-currency.ts`·`locale-country.ts`)로 관리하고,
  빌드 시 `scripts/validate-locales.mjs`가 messages ↔ 통화 ↔ 국가 ↔ 라우팅을 교차검증합니다(불일치 시 빌드 실패).
- **graceful fallback**: 런타임 설정이 DB 미적용 상태여도 코드 상수로 폴백해 무중단 운영합니다
  (예: 선물 프리셋 `getTipPresets` → `src/lib/bean.ts`).
- **단일 출처(Single Source of Truth)**: UI와 서버 검증이 동일 함수를 참조하여 검증 불일치를
  구조적으로 차단합니다(예: 선물 금액 검증 — UI 버튼과 `api/tips`가 같은 `getTipPresets()` 사용).

---

## 9. 결론

PyCafé™는 Pi Network의 까다로운 제약(쿠키 미저장·비동기 결제 콜백·모바일 NAT)을 구조적·암호학적
설계로 해결하고, 자금 무결성을 **회계 보존 항등식 + CHECK 제약 + 멱등성**의 3중 방어로 보장하며,
Pi 등재 레드라인 4종(Pi 로그인·Pi 결제 전용·도박 없음·브랜딩)을 모두 충족합니다.
나아가 K-DATA 정부 공인 데이터 표준을 출범 단계부터 자동화로 강제하여, 단기 등재 요건을 넘어
**장기 운영·감사·확장 신뢰도**까지 갖춘 플랫폼임을 입증합니다.

---

### 부록 A. 핵심 근거 파일 색인

| 주제 | 파일 |
|---|---|
| Pi 인증(쿠키/헤더 이중) | `src/lib/pi-fetch.ts` · `src/lib/auth-check.ts` · `src/app/api/auth/pi/route.ts` |
| 토큰 서명/검증 | `src/lib/pi-session-crypto.ts` |
| Pi 결제 | `src/components/pi-pay-button.tsx` · `src/app/api/payments/approve/route.ts` · `.../complete/route.ts` |
| 미완료 결제 복구 | `src/components/pi-auth-provider.tsx` |
| 자동 정산(A2U) | `src/lib/mps-order.ts` · `src/lib/pi-a2u.ts` |
| Bean 회계 | `sql/088_bean_accounting_p0_p1_fix.sql` · `sql/067_bean_wallet.sql` · `sql/069_bean_token_wallet.sql` |
| 멱등 보상/전송 | `sql/095_fn_evt_grant_bean_reward.sql` · `sql/078_bean_p2p_transfer.sql` |
| 보안 평가 | `docs/PRD_2_SECURITY.md` |
| K-DATA DA 표준 | `docs/da/README.md` · `docs/da/데이터표준규칙.md` · `docs/da/품질점검기준서.md` |
| 성능 최적화 | `src/lib/client-cache.ts` · `src/lib/geo.ts` · `src/lib/chat-room-list.ts` · `scripts/validate-locales.mjs` |
| 환경변수/i18n 검증 | `src/env.ts` · `scripts/validate-locales.mjs` |
