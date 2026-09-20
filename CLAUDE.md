# CLAUDE.md

이 파일은 Claude Code(claude.ai/code)가 이 저장소에서 작업할 때 참고하는 안내 문서입니다.

---

## ⭐ 프로젝트 핵심 가치 (최우선 — 절대 훼손 금지)

1. **Pi Browser에서 Pi 계정으로 로그인할 수 있어야 한다.**
2. **Pi Browser에서 Pi 계정으로 결제할 수 있어야 한다.**

인증·페이지·기능 변경은 **Pi Browser 실기기에서 로그인·결제·카페 접속을 검증**한 뒤에만 완료로 간주한다.

**치명적 제약 — Pi Browser WebView는 모든 방식(form POST·fetch·302/307 redirect·200 HTML)의 `Set-Cookie`를 저장하지 않는다.**
→ 인증이 필요한 페이지는 반드시 **쿠키 OR `X-Pi-Token` 헤더** 두 경로를 지원해야 한다.
→ `getSessionUser()`가 null일 때 **`redirect` 절대 금지** — Pi Browser 무한 루프 발생 → 클라이언트 게이트로 위임.

**치명적 제약 — Pi Browser 판정에 UA(`navigator.userAgent`)를 절대 신뢰/사전 차단하지 말 것.**
Pi SDK는 일반 브라우저에도 `window.Pi`를 주입하므로 `window.Pi` 존재 ≠ Pi Browser. 그러나 UA(`/PiBrowser/`)로 Pi 인증을 *사전 차단*하면 실기기 UA가 패턴과 달라 **모든 Pi 로그인이 systemic하게 깨진다**(2026-06-26 8bf8752 사고). **유일하게 신뢰 가능한 Pi Browser 신호는 `window.Pi.authenticate()` 성공뿐.**
→ `signIn()` 가드는 `if (!window.Pi)`만. authenticate를 무조건 시도하고 **성공 여부로만** `isInPiBrowser`를 판정한다. UI 표시 게이팅엔 UA 폴백 가능하나 *인증 시도 자체*는 UA로 막지 말 것.

---

## 빌드 및 개발 명령어

```bash
pnpm dev              # 개발 서버 (Turbopack, http://localhost:3000)
pnpm build            # 프로덕션 빌드 + 환경변수 검증
pnpm start            # 프로덕션 서버
pnpm lint             # ESLint
pnpm format           # Prettier (Tailwind 클래스 순서 자동 정렬)
pnpm format:check     # 포맷 검사 (수정 없음)
pnpm tsc --noEmit     # 타입 체크
pnpm dlx shadcn@latest add <컴포넌트명>
node scripts/promote-to-prod.mjs --yes   # 운영 승격 (master→production, ff-only)
```

**⚠️ 배포 검증 철칙 (2026-07-16 사고)**: Vercel은 빌드 실패 시 **이전 배포를 조용히 계속 서빙** — "서비스가 응답한다" ≠ 반영됨. 승격 후 반드시 `api.github.com/repos/anakinwon/loginpi/commits/<sha>/status`에서 **`Vercel – cafe: success` 개별 확인**(종합 state는 staging 선실패로 오판 가능, gh CLI 없음 — node fetch). 라우트 수정 커밋 전 최소 관문은 lint가 아니라 **`pnpm build`**(lint는 타입 에러를 못 잡음). 게이트를 함수로 추출하면 TS 내로잉이 끊긴다 — 타입 술어(`user is UserRow`)로 선언.

---

## 기술스택 주요 버전 (2026-06-09 기준)

> 버전 확인: `pnpm outdated` / 업그레이드 전략: `docs/UPGRADE_STRATEGY.md`

| 패키지 | 버전 | 비고 |
|---|---|---|
| next | `16.2.7` | stable (App Router) |
| react / react-dom | `19.2.7` | stable |
| typescript | `^6` (6.0.3) | stable |
| tailwindcss | `^4` | CSS-first, config 파일 없음 |
| **next-auth** | `5.0.0-beta.31` | **beta** — v5 stable 미출시, beta.31 유지 |
| next-intl | `^4.13.0` | stable |
| @supabase/supabase-js | `^2.107.0` | stable |
| @base-ui/react | `^1.5.0` | shadcn base-nova |
| zod | `^4.4.3` | stable |
| @anthropic-ai/sdk | `^0.101.0` | stable |
| @types/node | `^22` (22.19.20) | Node 22 Active LTS |
| tsconfig target | `ES2022` | Node 22 LTS 기준 |

---

## 아키텍처 핵심 사항

### shadcn/ui: base-nova (@base-ui/react)

**Radix UI가 아닌 `@base-ui/react`** 기반 — 동작 방식이 다르다.

- **`asChild` prop 없음** — `<Trigger asChild><Button/></Trigger>` 패턴 동작 안 함
- 대신 `className={cn(buttonVariants({ variant: 'outline' }))}` Trigger에 직접 적용
- `absolute` 아이콘 배치 시 Trigger에 `relative` 명시 필요

### Tailwind CSS v4 (CSS-first)

- `tailwind.config.*` **없음** — `src/app/globals.css`의 `@import 'tailwindcss'`가 진입점
- 테마: `@theme inline { ... }` CSS 변수 블록 | PostCSS: `@tailwindcss/postcss`
- 다크모드 연결 필수: `@custom-variant dark (&:where(.dark, .dark *));`
  이 줄 없으면 next-themes가 `<html class="dark">` 주입해도 `dark:` 클래스 미작동
- `layout.tsx`: `<html suppressHydrationWarning>` + `<ThemeProvider attribute="class">`

### 환경변수 (t3-env)

- 스키마: `src/env.ts` — `next.config.ts` 상단 `import './src/env'`로 빌드 시점 자동 검증
- 새 env 추가 시 `src/env.ts` + `.env.example` 동시 수정

### pnpm 11

네이티브 빌드 스크립트 허용은 `pnpm-workspace.yaml`의 `allowBuilds`로만 설정 (package.json `pnpm` 필드 무시됨). 새 패키지 차단 오류 발생 시 목록에 추가.

---

## 다국어 (next-intl v4)

- `src/i18n/routing.ts`의 `locales` 배열은 **빌드 시점 고정** — Vercel 런타임 수정 불가. 203개 선점 등록.
- locale 매핑 단일 소스: `src/lib/locale-currency.ts` / `src/lib/locale-country.ts` — 직접 정의 금지 (sync 버그)
- `locale_cd` 형식: `/^[a-z]{2,3}(-[A-Z]{2,3})?$/` (Admin 신규 추가 시 필수 검증)
- 번역 로딩: `import()` 대신 `readFile()` 사용 — Node.js 모듈캐시가 동기화 결과를 반영하지 않음
- `pnpm build` 시 `scripts/validate-locales.mjs`가 messages ↔ 통화 ↔ 국가 ↔ routing.ts 교차 검증 (수동: `pnpm validate:locales`)
- **활성 locale 189개** (2026-07-08 글로벌 대확장, 66개 언어 완역). 신규 locale 추가는 **7곳 체크리스트**(PRD_3_MUL_LAN v2.0 §0) — ⚠️ `i18n_cntry_mst` FK는 `i18n_lang_mst`(언어마스터) 참조, 국기 이모지 베이스 U+1F1E6, 국가코드≠언어코드(실제 주 언어는 `scripts/i18n-lang-map.mjs` 단일소스)
- **카페 테마명은 번역키** `themes.<theme_cd>` + `useThemeName` 훅(폐기 테마는 DB명 폴백) — theme_nm_en 직접 표시 금지. 번역키 폐기는 **삭제**(빈 값 "" 금지 — 99% 통계 사고)
- **번들 직렬화 노출 주의**: next-intl은 메시지 번들 **전체**를 모든 페이지 HTML에 직렬화 — 죽은 키·오버레이 `_comment`도 소스에 노출된다(등재 심사 스캔 대상, 2026-07-16 베팅 키 4,512행 사고). 폐기 키는 json+DB 동시 삭제. `i18n_message`는 del_yn이 없고 sync가 무필터 조회라 **유일하게 물리 DELETE가 정본**(sql/182 — 남기면 동기화 때 부활)

---

## DB 명명 규칙 (DA 표준)

**정본: `docs/da/데이터표준규칙.md`** (프레임워크 전체: `docs/da/README.md`)

- **시스템 컬럼 4개** 전 테이블 필수: `regr_id TEXT NOT NULL DEFAULT 'ADMIN'`, `reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`, `modr_id TEXT NOT NULL DEFAULT 'ADMIN'`, `mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
- **논리삭제**: `del_yn CHAR(1) DEFAULT 'N'` + `del_dtm TIMESTAMPTZ` — **물리 DELETE 절대 금지**
- **FK(외래키) — 현재는 유지, 전환은 반드시 단계적으로**: 이 프로젝트는 PostgREST 임베디드 조인(`.select('*, mps_shop(...)')`·`msg_theme(...)` 등)을 광범위하게 쓰며, 이는 **DB의 FK 관계에 의존**한다. 따라서 **FK를 일괄 제거하면 `PGRST200`으로 목록 조회가 붕괴**한다(2026-07-01 사고: FK 62개 제거 → 카페·매장·상품 목록 장애 → `sql/156`으로 전량 복구).
  무FK(앱 레벨 참조 무결성 + 별도 조회·Map 병합)가 성능·유연성 면에서 **더 나은 선택일 수 있다** — 신기술이 과거 방식을 능가하는 경우는 충분히 있다. 다만 전환 시 **반드시 "① 해당 임베디드 조인을 별도 조회+Map으로 대체 → ② 그 뒤 FK 제거" 순서**를 지킨다. ⛔ 코드 대체 없이 FK만 먼저 지우지 말 것(이번 사고의 근본 원인). 특정 FK의 성능이 우려되면 개별·점진 전환으로 접근한다.
- 복합어: REGR(등록자), MODR(변경자), PYMNT(결제), CTGR(카테고리)
- 도메인 약어: `_id`(식별자), `_nm`(이름), `_cd`(코드), `_yn`(여부), `_dtm`(일시), `_dt`(날짜)
- `sql/*.sql` 작성 시 `da-ddl-guard` Hook 자동 검사 → 위반 차단, DA 승인(`-- DA-APPROVED:` 주석) 필요
- 현재 테이블: `sys_user`, `pi_pymnt`, `auth_link_cd`, `brd_*`, `std_*`, `approval_queue`, `i18n_locale`, `i18n_message`, `i18n_cntry_mst`

---

## 인증 + 세션 구조

Pi Browser는 쿠키를 저장하지 않으므로 **쿠키(일반 브라우저) + `X-Pi-Token` 헤더(Pi Browser localStorage)** 이중 경로로 동작한다.

### Pi 세션 (쿠키 비의존 이중 경로)

- **발급** (`/api/auth/pi` POST): HMAC-SHA256 토큰을 `pi_session` 쿠키와 JSON `token` 필드로 **둘 다 반환**
- **클라이언트 저장**: `pi-auth-provider`가 `localStorage`(`pi_token`)에 저장
- **요청**: `fetch` 대신 **`piFetch`**(`src/lib/pi-fetch.ts`) 사용 → `X-Pi-Token` 헤더 자동 첨부 + `credentials: 'include'`
- **서버 검증**: `getSessionUser()`가 쿠키 우선 → `X-Pi-Token` 헤더 폴백 + `tokenValidUntil` 만료 검증
- **⭐사용자 매칭 철칙 (2026-07-02 uid 재발급 사고)**: `pi_uid`는 (포털 앱 × Testnet/Mainnet) **scoped 값**이라 sandbox 플립·메인넷 전환·포털 앱 변경 시 전원 재발급된다 → **영구 식별자로 쓰지 말 것**. 사람의 불변 키는 `pi_username`(전역 유일·`/v2/me` 검증). `upsertPiUser`가 `uid → username` 재바인딩 폴백 + 재가입 부활(`rejoin_dtm`·`del_rsn_cd`)을 수행하며, 활성 `pi_username`은 UNIQUE 인덱스(sql/162)로 강제 — 위반 에러 시 인덱스가 아니라 코드를 고칠 것. 계정 중복 발견 시 자산(seller_id 등) 이관 금지, 세션을 원본으로 복원(정본: `docs/TROUBLESHOOT.md` 2026-07-02 근본수정편).

### 클라이언트 게이트 패턴 (Pi Browser 필수 — 위반 시 무한 루프)

`getSessionUser()` null 시 **`redirect` 금지** → 클라이언트 게이트 렌더:

```tsx
if (!user) return <ClientChatRoom roomId={roomId} />
```

예: `ClientChatList`, `ClientChatRoom`, `ClientAdminGate`
데이터 API는 `getSessionUser()`만 쓰면 쿠키·헤더 양쪽 자동 지원.

### Pi Sign-In — 일반 브라우저 Pi 로그인 (OAuth implicit, 2026-07-08)

- `accounts.pinet.com/oauth/authorize` → 콜백 `/auth/pi/callback`(프래그먼트 토큰) → **기존 `/api/auth/pi` POST 재사용**
- state는 **localStorage+10분 만료**(sessionStorage는 탭 단위라 오탐 — TROUBLESHOOT 2026-07-08편)
- **Pi의 인가 페이지는 Pi Browser 내 미지원** → 버튼(`PiOAuthLoginButton`)은 클릭 시 SDK signIn() 선시도 후 실패 시에만 OAuth(시도 후 폴백 — UA 분기 금지 철칙)
- env `NEXT_PUBLIC_PI_OAUTH_CLIENT_ID` 환경별 필수(미설정=버튼 미노출) + Developer Portal Redirect URI 정확 일치 등록(호스트는 앱 도메인+루프백만 — staging 미지원, 운영·localhost만)
- ✅2026-07-08 실사용 검증 완료. state는 **성공 시에만 소거**(재마운트 경합)·콜백 경로는 locale 자동 전환 제외. 사용자 QR 스캔 경로=**파이지갑→Pay→"QR 코드 스캔 및 표시"→스캔 탭**
- **헤더 세션 표시 소유권**: Pi Sign-In 세션(NextAuth 아님)의 계정명은 `PiOAuthLoginButton`이 표시(Google 세션 존재 시 양보), Google 버튼은 NextAuth 세션 없이 Pi 세션만 있으면 숨김 — 두 세션 체계가 별개임을 전제로 게이팅할 것

### Google 세션 (NextAuth v5 beta)

- `session.user.sub` = Google OAuth raw sub | `session.user.id` = users row UUID

### 통합 체크

```ts
import { getSessionUser, isAdmin } from '@/lib/auth-check'
const user = await getSessionUser()  // Pi(쿠키/헤더) 또는 Google 세션 통합
if (!isAdmin(user)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
```

**⭐권한 최상위 = ADMIN** (2026-07-16 마스터 확정): DB `sys_user.role` 최고값은 ADMIN — **MASTER 행은 존재하지 않는다**(dev 세션·UI 라벨에만 존재). 초고위험 게이트(배포 승격·요금제 전환·DB 스위치 등)는 `isMaster()`(auth-check.ts, 타입 술어·ADMIN/MASTER 겸용)만 사용 — `role === 'MASTER'` 문자열 단독 비교는 전원 차단 사문화가 되므로 금지(6곳 사고 8d359cfd).

**"PC 정상·Pi Browser만 401" 증상 = 일반 `fetch` 잔존**: PC는 same-origin 쿠키로 통과하지만 Pi Browser는 쿠키가 없어 무인증. `fetch('/api/` grep으로 색출 후 `piFetch` 교체(admin 26화면 63건 사고 0d7aa24b).

---

## Supabase 사용 패턴

- RLS **비활성화** — 모든 접근은 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`
- `src/lib/supabase-admin.ts` — lazy init (빌드 시 SERVICE_ROLE_KEY 미설정 방지)
- anon key 클라이언트 직접 사용 금지 | 단건 조회: `.maybeSingle()` (`.single()`은 결과 없을 때 에러)
- **텍스트 부분일치 검색 표준**: `%검색어%`(substring) 검색엔 `pg_trgm` GIN 인덱스(`gin_trgm_ops`)를 표준으로 쓴다. PostgREST `.ilike`는 대소문자 무시로 GIN을 **자동 가속**(코드 변경 0), `lower() LIKE` RPC는 `lower()` 식 인덱스 필요. 활성행 부분 인덱스(`WHERE del_yn='N'`)·UI 최소 2글자 권장(trigram=3글자 단위). 적용: 카페 `sql/072`·상품·게시판 `sql/076`. 신규 검색 추가 시 동일 패턴 따를 것.

---

## PiRC2 스마트 컨트랙트 (Soroban — Pi Testnet)

반복 결제(구독) 시스템. 공식 문서: `https://github.com/PiNetwork/PiRC`

| 항목 | 값 |
|---|---|
| Contract ID | `CCUF75B6W3HRJTJD6O7OXNI72HGJ7DERZ5MUNOMFMSK23ME5GUIKPFYV` |
| Network passphrase | `"Pi Testnet"` |
| RPC URL | `https://rpc.testnet.minepi.com` |
| 단위 | **1 Pi = 10,000,000 units (i128)** |

**핵심 메서드**

| 메서드 | 호출 주체 |
|---|---|
| `register_service(merchant, name, price, period_secs, trial_period_secs, approve_periods)` | 판매자 서버 |
| `subscribe(subscriber, service_id, auto_renew)` | 구독자 (Pi Wallet 서명 필요) |
| `cancel(subscriber, sub_id)` | 구독자 |
| `process(merchant, service_id, offset, limit)` | 판매자 서버 (cron) |
| `extend_subscription` / `toggle_auto_renew` / `is_subscription_active` / `get_subscription` / `get_merchant_services` | 각각 구독자·누구나 |

**에러 코드**: `1`InvalidPrice · `2`InvalidPeriod · `3`AlreadySubscribed · `4`SubscriptionNotFound · `5`ServiceNotFound · `6`Unauthorized · `7`AlreadyCancelled · `11`SubscriptionExpired · `12`ServiceNotActive

```typescript
// 단위 변환 (1 Pi = 10_000_000 units)
const toUnits = (pi: number): bigint => BigInt(Math.round(pi * 10_000_000))
const toPi = (units: bigint): number => Number(units) / 10_000_000
```

> `subscribe()`는 Pi Wallet 서명 필요 — Pi SDK `invokeContract()` 공식 지원 전까지 U2A 결제(`metadata.type='CHAT_SUBSCR'`)로 앱 레벨 구독 관리.

---

## 디렉토리 구조

```
src/
├── app/
│   ├── [locale]/
│   │   ├── (admin)/admin/      # 대시보드·users·payments·links·board·std·i18n
│   │   ├── board/              # 통합 게시판 (4종)
│   │   ├── chat/               # 카페 목록·방
│   │   ├── link/               # Pi·Google 계정 연동
│   │   └── page.tsx
│   ├── api/
│   │   ├── admin/ auth/ board/ payments/
│   │   └── chat/ subscriptions/ tips/
│   ├── globals.css             # Tailwind v4 + @custom-variant dark
│   └── layout.tsx              # 루트 레이아웃 (ThemeProvider)
├── components/
│   ├── admin/ layout/ ui/      # shadcn/ui (@base-ui/react)
│   └── chat/                   # ClientChatList·Room, ChatRoomPanel 등
├── i18n/
│   ├── routing.ts              # defineRouting — 203개 locale
│   └── request.ts              # getRequestConfig — 3단계 fallback
├── lib/
│   ├── auth-check.ts           # Pi + Google 세션 통합 (server-only)
│   ├── chat-auth.ts            # PLAN_CAPS 권한 매트릭스
│   ├── locale-currency.ts      # LOCALE_CURRENCY 단일 소스
│   ├── locale-country.ts       # LOCALE_COUNTRY + getAlpha2
│   ├── pi-fetch.ts             # X-Pi-Token 헤더 자동 첨부 fetch
│   ├── supabase-admin.ts       # lazy init admin 클라이언트
│   ├── users.ts                # sys_user CRUD
│   └── utils.ts                # cn() = twMerge + clsx
├── messages/                   # 번역 파일 (ko.json이 source of truth)
├── types/
│   ├── next-auth.d.ts
│   └── pi-session.ts
├── auth.ts                     # NextAuth v5 설정
└── env.ts                      # t3-env 환경변수 스키마
```

---

## 코드 스타일

들여쓰기 2칸, 세미콜론 없음, 작은따옴표. `pnpm format`으로 Tailwind 클래스 순서 자동 정렬.

## 프론트엔드 데이터 패칭·목록 표준 (필수 — 2026-06-25 확정, 예외 없음)

성능(특히 Home·목록 체감 속도, DB 부하)이 핵심 리스크이므로 아래 3종을 **모든 신규·수정 코드에 강제**한다.

1. **목록(list)은 무조건 반응형 Page 네비게이션** — 데이터 행 전량 로드 금지. 페이지 단위 조회 + 화면 크기에 반응하는 페이지네이션 컨트롤(모바일 축약 / 데스크톱 확장).
2. **이벤트형 조회 트랜잭션은 비동기 처리** — 클릭·스크롤 등 이벤트로 트리거되는 조회는 렌더를 막지 않는 async(논블로킹)로. 렌더 경로의 동기 블로킹 await 금지, 로딩 상태로 처리.
3. **페이지 콘텐츠를 한 번에 전부 조회 금지** — 스크롤해서 포커스(뷰포트) 진입 *직전*에 비동기 조회. `LazySection`(onVisible·rootMargin) / IntersectionObserver on-visible 패턴 사용.

> ①은 행 단위(페이지네이션), ③은 섹션 단위(지연 fetch)로 층위가 다르며 둘 다 적용한다. 공개 집계 API는 캐시 헤더(`s-maxage`/`stale-while-revalidate`)와 병행하되 관리자 정확도(소프트게이트 admin 분기)는 유지한다.

## 공식 브랜드 표기 (2026-06-27 PyCafé™ 개명 — 구 PiCafé, Pi 접두 상표 회피)

모든 **사용자 표시 텍스트**(UI 라벨·제목·i18n 값·문서·메뉴얼·주석)는 다음 공식 표기를 사용한다:

| 기능 | 공식 표기 |
|---|---|
| PyCafe / PyCafé | **PyCafé™** (é=U+00E9, ™=U+2122) |
| PyShop | **PyShop™** |
| 자동번역 | **PyTranslate™** |

- ⛔ **원형 유지(™·é 금지)**: DB 코드값 `prod_ctgr_cd='PICAFE'/'PISHOP'/'PISHOP_SUBSCR'/'TRANSLATE'`, 변수·함수·컴포넌트 식별자, **Pi 결제 memo**(™ 특수문자가 결제 호환을 깨뜨릴 수 있음).
- ™ 중복 방지: 치환 시 `(?!™)` lookahead 사용. "자동번역" 한국어 서술은 맥락 보존, 명칭/제목/라벨만 PyTranslate™.

---

## 하네스: DA팀 (데이터 아키텍처)

**목표:** DA 다단계 작업(설계·표준·품질·이행)을 5인 에이전트 팀으로 수행하여 표준 준수 산출물을 생성한다.

**트리거:** 신규 테이블 설계·스키마 개편·마이그레이션·표준 등재·품질 전수조사 등 **다단계 DA 작업** 요청 시 `da-team` 스킬을 사용하라. 단건 DDL 리뷰·단순 명명 질의는 `da-governance-expert` 단독 호출로 충분(팀 미소집).

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-07-10 | 초기 구성 (에이전트 5: da-leader·da-standards·da-modeler·da-quality·da-migration, 오케스트레이터 da-team, 기존 스킬 da-naming-rules·da-qa-checklist 재사용) | 전체 | 마스터 지시 |
| 2026-07-10 | FK 정책 낡은 기술 정정 ("FK 설계 없음" → 현행 FK 유지·단계 전환 정책) | agents/da-governance-expert.md | 2026-07-01 사고 반영 드리프트 수정 |
| 2026-07-10 | 실전 1차 실행 완료(sys_cfg_chg_hist 설계→sql/176~178 확정) + 워크스페이스 잡별 하위 디렉토리 규칙·유휴/상충 판정 지침 추가 | skills/da-team | 타 세션 전수조사와 _workspace 충돌·완료 메시지 유실·읽기 경합 3건 실전 교훈 |
| 2026-07-18 | 스킬 da-naming-rules→da-standards, da-qa-checklist→da-quality 에이전트에 내재화 후 스킬 삭제. references 원문은 docs/da/references/로 이동 | agents/da-standards·da-quality, skills/da-team, docs/da/README | 마스터 지시 — 스킬·에이전트 이중 유지보수 제거 |

---

## 하네스: task-observer (스킬 관찰·개선)

**목표:** 작업 중 발생한 교정·판단·마찰을 포착해 재사용 가능한 스킬 개선안으로 축적한다.

**트리거 (필수):** **매 세션 첫 도구 호출 전, 그리고 계획을 세우거나 제안하기 전에** `task-observer` 스킬을 호출하라. 도구를 한 번이라도 쓸 턴이면 아무리 단순해 보여도 해당한다. 이 스킬은 description 매칭만으로는 활성화가 보장되지 않으므로 이 지시문이 유일한 강제 수단이다.

**관찰 로그 위치:** `~/.claude/projects/C--Users-anaki-workspace-loginpi/skill-observations/`
(cwd가 아니라 세션을 가로질러 유지되는 **고정 절대경로**를 쓴다. git worktree 등 임시 체크아웃 안이면 안 된다.)

**출처:** `rebelytics/one-skill-to-rule-them-all` (CC BY 4.0) — 실체는 `.agents/skills/task-observer/`

---

## 작업 수행 원칙 (2026-09-20 마스터 지시 — 모든 요청에 적용)

1. **요청 철저 검토** — 착수 전 목표·범위·완료 기준을 세운다. 읽기에 따라 결과가 달라지면 AskUserQuestion 1문항으로 확인.
2. **최적 다중 스킬·플러그인 선정** — 설치된 스킬(`.agents/skills`·OMC·GSD·superpowers)·플러그인·MCP 중 최적 조합을 먼저 고르고, 없으면 `find-skills`·skills.sh·`/plugin` 마켓에서 찾아 설치 후 사용. 기준은 **최고 성능 + 최저 토큰** — 단순 작업은 직접 수행(에이전트 오버헤드 금지), 다단계·다파일·조사·검증은 위임.
3. **에이전트 적극 활용** — 독립 작업은 한 메시지에 여러 `Agent` 호출로 병렬 처리하고 메인 세션은 총괄·통합만 맡는다. 코드=`executor`, 탐색=`explore`, 외부 문서=`document-specialist`, 검토=`code-reviewer`/`critic`, 검증=`verifier`.
4. **루핑 검증** — 결과가 최상인지 별도 패스(`verifier`/`critic`)로 검토하고 통과할 때까지 반복(`ralph` 패턴). 자기 승인 금지. 안전 상한(기본 10회) 도달 시 현황과 막힌 원인을 보고하고 지시를 받는다.

**해석 확정(마스터 승인 2026-09-20):** ① "최고 성능 + 최저 토큰"은 작업 크기로 조정 — 단순 작업은 직접 수행, 다단계·다파일·조사·검증은 위임. ② "무한 반복"은 verifier 통과까지 **안전 상한 10회** 내 반복 — 상한 도달 시 현황·막힌 원인을 보고하고 지시를 받는다. 전역 사본: `~/.claude/CLAUDE.md`의 `USER:START~END` 구간(OMC 관리 구역 밖).

## 워크스페이스 루트 전역변수 + 작업 이력 로그 (2026-09-20 마스터 지시)

- **`WORKSPACE_ROOT` = `C:/Users/anaki/workspace`** — 정의처 2곳: Windows 사용자 환경변수(`setx`, 새 프로세스부터 적용) + `.claude/settings.json`의 `env`. 프로젝트 루트는 `$WORKSPACE_ROOT/loginpi`.
- **절대경로 하드코딩 금지** — 참조 형식: bash/훅/statusLine `$WORKSPACE_ROOT`, `.mcp.json` 등 Claude JSON `${WORKSPACE_ROOT}`(공식 확장 지원), Node `process.env.WORKSPACE_ROOT`, 에이전트 프롬프트(.md) `${WORKSPACE_ROOT}/loginpi/...`(에이전트가 이 정의로 해석). 구 폴더명 `cafe-pi-claude` 경로는 전부 사문 — `loginpi`로 교정 완료.
- **작업 이력 로그 (v2, 2026-09-20 10인 평가 반영)**: `work-history/YYYY/MM/YYYY-MM-DD.log`(사람용) + `.jsonl`(통계용, 턴당 1레코드 `id=<session>:<turn>.<part>`, part>1은 구간 델타, `fix` 레코드로 늦게 도착한 훅·턴 소요 보정) — `.claude/hooks/work-history-logger.mjs`가 Stop·SessionEnd 훅에서 세션 기록을 바이트 오프셋 증분으로 읽어 생성. 공용 정의(카테고리 점수제·단가·마스킹·포맷)는 `scripts/work-history-core.mjs` 단일 소스. **`work-history/`·`work-statistics/`는 gitignore**(대화 전문 포함 — 저장소에 올리지 말 것). 회귀 테스트 `pnpm test`(node:test, test/work-history.test.mjs). 상태 파일 `.omc/state/work-history/`. **지표 정의 레지스트리** `core.METRICS`(+`KPI_TREE`, 보고서가 `<stem>.metrics.json` 동봉) — North Star는 `cost_per_request`(서브에이전트 비용 포함 ÷ distinct 요청), 후행 지표 첫 응답 대기·교정률, 선행 지표 컨텍스트 팽창률·재작업률·무검증률·오류 회복 배수. `cache_hit`·레코드 수·출력 토큰은 허영 지표. 서브에이전트 기록(`<transcript dir>/<sid>/subagents/`)은 로거가 Stop마다 스캔해 디스패치 턴에 `agent` 레코드로 귀속. **통계 파일·차트 보고서** (기간 4종 — 일별 `YYYY/MM/<날짜>`, 주별 `YYYY/weekly/<YYYY-Www>`(ISO 월~일), 월별 `YYYY/MM/<YYYY-MM>`, 년도별 `YYYY/<YYYY>`, 각각 이전 기간 대비 증감 포함): `pnpm work:report [--period day|week|month|year|all] [--date YYYY-MM-DD]` → `work-statistics/…/<stem>.{summary,tokens,usage,performance}.{json,csv,md}` + `turns.csv` + `report.html`(①토큰 ②agent/mcp/skill/plugin/hook ③성능 섹션) + 스크린샷 `charts.png`(agent-browser). 터미널 통계: `pnpm work:stats --type kpi|summary|tokens|usage|performance|all`(kpi = KPI 트리·경보·질문 판정). **지표 체계 문서 `docs/WORK_METRICS.md`는 `pnpm work:metrics-doc`로 레지스트리에서 생성** — 손으로 고치지 말고 `core.METRICS`를 고칠 것 [--month 2026-09] [--by category|tool|day|hour|weekday|session|skill|mcp|agent] [--csv] [--json] [--list]`. 카테고리는 요청문 키워드로 자동 판정(GIT·DEPLOY·INSTALL·FIX·TEST·DATA·REFACTOR·CONFIG·DOCS·FEATURE·QUERY·OTHER), 요청문에 `#cat:NAME`으로 강제 가능.
