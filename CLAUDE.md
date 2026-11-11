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
node scripts/promote-to-prod.mjs --yes   # 운영 승격 (master→production, ff-only) — 아래 주석 참조
```

루트 명령은 `pnpm --filter @site/cafe …` 프록시(루트 `package.json` = 워크스페이스 전용) — `sitemap/cafe.pi` 에서 직접 실행해도 같다.
`promote-to-prod.mjs` 의 'cafe = production 브랜치' 전제는 낡았다 — Vercel cafe 운영 브랜치는 master(2026-11-04 확인, 2026-11-08 API 재확인)라 production 승격은 미리보기만 만든다. 스크립트 정비는 후속 [확인중 : 마스터].

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

- `tailwind.config.*` **없음** — `sitemap/cafe.pi/src/app/globals.css`의 `@import 'tailwindcss'`가 진입점
- 테마: `@theme inline { ... }` CSS 변수 블록 | PostCSS: `@tailwindcss/postcss`
- 다크모드 연결 필수: `@custom-variant dark (&:where(.dark, .dark *));`
  이 줄 없으면 next-themes가 `<html class="dark">` 주입해도 `dark:` 클래스 미작동
- `layout.tsx`: `<html suppressHydrationWarning>` + `<ThemeProvider attribute="class">`

### 환경변수 (t3-env)

- 스키마: `sitemap/cafe.pi/src/env.ts` — 앱 `next.config.ts` 상단 `import './src/env'`로 빌드 시점 자동 검증
- 새 env 추가 시 `sitemap/cafe.pi/src/env.ts` + `sitemap/cafe.pi/.env.example` 동시 수정
- **환경변수 질문·신규 테넌트 = `docs/ENV_GUIDE.md` 정본**(키별 구하는 곳·시스템 간 공유 규칙·질의 이력) — 질문엔 위치만 안내하고 새 답은 5절에 추가. 값 모음 `.env.multi`(gitignore), 신규 테넌트 설정 한 세트 `node scripts/tenant-env.mjs new <도메인>.pi`(env·docs 골격·CLAUDE.md), 모음 갱신 `… multi`, **신규 테넌트 전체 단계 = `sitemap/multitenant_create_TODO-List.md`**

### pnpm 11

네이티브 빌드 스크립트 허용은 `pnpm-workspace.yaml`의 `allowBuilds`로만 설정 (package.json `pnpm` 필드 무시됨). 새 패키지 차단 오류 발생 시 목록에 추가.

---

## 다국어 (next-intl v4)

- `sitemap/cafe.pi/src/i18n/routing.ts`의 `locales` 배열은 **빌드 시점 고정** — Vercel 런타임 수정 불가. 203개 선점 등록.
- locale 매핑 단일 소스: `sitemap/cafe.pi/src/lib/locale-currency.ts` / `sitemap/cafe.pi/src/lib/locale-country.ts` — 직접 정의 금지 (sync 버그)
- `locale_cd` 형식: `/^[a-z]{2,3}(-[A-Z]{2,3})?$/` (Admin 신규 추가 시 필수 검증)
- 번역 로딩: `import()` 대신 `readFile()` 사용 — Node.js 모듈캐시가 동기화 결과를 반영하지 않음
- `pnpm build` 시 `sitemap/cafe.pi/scripts/validate-locales.mjs`가 messages ↔ 통화 ↔ 국가 ↔ routing.ts 교차 검증 (수동: `pnpm validate:locales`)
- **활성 locale 189개** (2026-07-08 글로벌 대확장, 66개 언어 완역). 신규 locale 추가는 **7곳 체크리스트**(PRD_3_MUL_LAN v2.0 §0) — ⚠️ `i18n_cntry_mst` FK는 `i18n_lang_mst`(언어마스터) 참조, 국기 이모지 베이스 U+1F1E6, 국가코드≠언어코드(실제 주 언어는 `sitemap/cafe.pi/scripts/i18n-lang-map.mjs` 단일소스)
- **카페 테마명은 번역키** `themes.<theme_cd>` + `useThemeName` 훅(폐기 테마는 DB명 폴백) — theme_nm_en 직접 표시 금지. 번역키 폐기는 **삭제**(빈 값 "" 금지 — 99% 통계 사고)
- **번들 직렬화 노출 주의**: next-intl은 메시지 번들 **전체**를 모든 페이지 HTML에 직렬화 — 죽은 키·오버레이 `_comment`도 소스에 노출된다(등재 심사 스캔 대상, 2026-07-16 베팅 키 4,512행 사고). 폐기 키는 json+DB 동시 삭제. `i18n_message`는 del_yn이 없고 sync가 무필터 조회라 **유일하게 물리 DELETE가 정본**(sitemap/cafe.pi/sql/182 — 남기면 동기화 때 부활)

---

## DB 명명 규칙 (DA 표준)

**정본: `docs/da/데이터표준규칙.md`** (프레임워크 전체: `docs/da/README.md`)

- **시스템 컬럼 4개** 전 테이블 필수: `regr_id TEXT NOT NULL DEFAULT 'ADMIN'`, `reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`, `modr_id TEXT NOT NULL DEFAULT 'ADMIN'`, `mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
- **논리삭제**: `del_yn CHAR(1) DEFAULT 'N'` + `del_dtm TIMESTAMPTZ` — **물리 DELETE 절대 금지**
- **FK(외래키) — 현재는 유지, 전환은 반드시 단계적으로**: 이 프로젝트는 PostgREST 임베디드 조인(`.select('*, mps_shop(...)')`·`msg_theme(...)` 등)을 광범위하게 쓰며, 이는 **DB의 FK 관계에 의존**한다. 따라서 **FK를 일괄 제거하면 `PGRST200`으로 목록 조회가 붕괴**한다(2026-07-01 사고: FK 62개 제거 → 카페·매장·상품 목록 장애 → `sitemap/cafe.pi/sql/156`으로 전량 복구).
  무FK(앱 레벨 참조 무결성 + 별도 조회·Map 병합)가 성능·유연성 면에서 **더 나은 선택일 수 있다** — 신기술이 과거 방식을 능가하는 경우는 충분히 있다. 다만 전환 시 **반드시 "① 해당 임베디드 조인을 별도 조회+Map으로 대체 → ② 그 뒤 FK 제거" 순서**를 지킨다. ⛔ 코드 대체 없이 FK만 먼저 지우지 말 것(이번 사고의 근본 원인). 특정 FK의 성능이 우려되면 개별·점진 전환으로 접근한다.
- **PK·인덱스 이름 (정본 §5 v2.5, 2026-10-20 마스터 재정의)**: PK = `pk_<테이블>`(이름 없는 PRIMARY KEY 금지), 인덱스·유일 제약 = `x_<테이블>_NN` — 구 `_pkey`·`_key`·`idx_`·`ux_` 금지. schema.pi 는 소급 완료(`sitemap/schema.pi/sql/066`)·Hook R9 강제, **cafe.pi DB 소급은 [확인중 : 마스터]**(기존 cafe.pi 객체는 구 이름 유지 중). FK 이름은 PostgREST 임베디드 조인 힌트라 범위 밖
- 복합어: REGR(등록자), MODR(변경자), PYMNT(결제), CTGR(카테고리)
- 도메인 약어: `_id`(식별자), `_nm`(이름), `_cd`(코드), `_yn`(여부), `_dtm`(일시), `_dt`(날짜)
- `sql/*.sql`(cafe.pi = `sitemap/cafe.pi/sql/`) 작성 시 `da-ddl-guard` Hook 자동 검사 → 위반 차단, DA 승인(`-- DA-APPROVED:` 주석) 필요
- 현재 테이블: `sys_user`, `pi_pymnt`, `auth_link_cd`, `brd_*`, `std_*`, `approval_queue`, `i18n_locale`, `i18n_message`, `i18n_cntry_mst`

---

## 인증 + 세션 구조

Pi Browser는 쿠키를 저장하지 않으므로 **쿠키(일반 브라우저) + `X-Pi-Token` 헤더(Pi Browser localStorage)** 이중 경로로 동작한다.

### Pi 세션 (쿠키 비의존 이중 경로)

- **발급** (`/api/auth/pi` POST): HMAC-SHA256 토큰을 `pi_session` 쿠키와 JSON `token` 필드로 **둘 다 반환**
- **클라이언트 저장**: `pi-auth-provider`가 `localStorage`(`pi_token`)에 저장
- **요청**: `fetch` 대신 **`piFetch`**(`sitemap/cafe.pi/src/lib/pi-fetch.ts`) 사용 → `X-Pi-Token` 헤더 자동 첨부 + `credentials: 'include'`
- **서버 검증**: `getSessionUser()`가 쿠키 우선 → `X-Pi-Token` 헤더 폴백 + `tokenValidUntil` 만료 검증
- **⭐사용자 매칭 철칙 (2026-07-02 uid 재발급 사고)**: `pi_uid`는 (포털 앱 × Testnet/Mainnet) **scoped 값**이라 sandbox 플립·메인넷 전환·포털 앱 변경 시 전원 재발급된다 → **영구 식별자로 쓰지 말 것**. 사람의 불변 키는 `pi_username`(전역 유일·`/v2/me` 검증). `upsertPiUser`가 `uid → username` 재바인딩 폴백 + 재가입 부활(`rejoin_dtm`·`del_rsn_cd`)을 수행하며, 활성 `pi_username`은 UNIQUE 인덱스(sitemap/cafe.pi/sql/162)로 강제 — 위반 에러 시 인덱스가 아니라 코드를 고칠 것. 계정 중복 발견 시 자산(seller_id 등) 이관 금지, 세션을 원본으로 복원(정본: `docs/TROUBLESHOOT.md` 2026-07-02 근본수정편).

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
- `sitemap/cafe.pi/src/lib/supabase-admin.ts` — lazy init (빌드 시 SERVICE_ROLE_KEY 미설정 방지)
- anon key 클라이언트 직접 사용 금지 | 단건 조회: `.maybeSingle()` (`.single()`은 결과 없을 때 에러)
- **텍스트 부분일치 검색 표준**: `%검색어%`(substring) 검색엔 `pg_trgm` GIN 인덱스(`gin_trgm_ops`)를 표준으로 쓴다. PostgREST `.ilike`는 대소문자 무시로 GIN을 **자동 가속**(코드 변경 0), `lower() LIKE` RPC는 `lower()` 식 인덱스 필요. 활성행 부분 인덱스(`WHERE del_yn='N'`)·UI 최소 2글자 권장(trigram=3글자 단위). 적용: 카페 `sitemap/cafe.pi/sql/072`·상품·게시판 `sitemap/cafe.pi/sql/076`. 신규 검색 추가 시 동일 패턴 따를 것.

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

cafe.pi 앱 = `sitemap/cafe.pi`(`@site/cafe`, 2026-11-08 이동) — 루트 = 공용 도구·문서·하네스(`scripts/`·`docs/`·`.claude/`·`packages/`). 앱의 `messages/`(번역 파일, ko.json 이 source of truth)·`scripts/`(cafe 전용)·`sql/`·`docs/law/`(약관 런타임 자산)는 `sitemap/cafe.pi/` 바로 아래.

```
sitemap/cafe.pi/src/
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

## 구축 결함 재발 방지 R-P0~P6 (전 시스템 상속 정본 — 2026-10-24 마스터 부탁, 예외 없음)

**적용 범위 = 이 저장소의 모든 시스템**(cafe.pi `sitemap/cafe.pi`·`sitemap/sitemap.pi`·`sitemap/schema.pi`, 이후 추가 앱 포함). 정본은 이 절 하나 — 하위 시스템 CLAUDE.md 는 "R-P0~P6 상속 + 그 시스템의 예시·공용 함수"만 적고 규칙 문구를 복제하지 않는다. 출처 사례 : `sitemap/schema.pi/docs/TROUBLESHOOT.md` TS-01(운영 느림·오류 22건이 전부 구축 결함 — 구현·발견·해결을 모두 서비스가 하면서 고객 결재 27회).

원격 DB·외부 API 호출은 1회마다 네트워크 왕복이고, 로컬 시험(PGlite·목업)은 이 지연을 못 본다 → **코드를 쓸 때** 지킨다.

- **R-P0 서비스 결함은 고객 결재로 넘기지 않는다** — 같은 원인은 해당 시스템 전체 grep 으로 형제까지 한 커밋에 고치고 '패턴 · 매치 N · 처리 N' 보고. AI 수정안·PR 결재 흐름은 운영 데이터·환경에서만 생기는 문제용
- **R-P1 직렬 조회 금지** — 앞 결과를 쓰지 않는 `await` 연속은 `Promise.all`, 모든 요청이 거치는 공용 함수(권한·세션 확인 등)부터
- **R-P2 반복 조회 금지** — 한 요청에서 같은 조회·계산 2번 금지(결과를 인자로 넘김), 입력마다 부르는 API 는 캐시·디바운스
- **R-P3 과다 조회 금지** — `select` 는 쓰는 칼럼만, 정확 건수(`count:'exact'`)는 화면이 쓸 때만, 필터는 서버(쿼리 조건)에서
- **R-P4 외부 호출** — 요청 경로 안 외부 HTTP 는 타임아웃 ≤ 2초 + 캐시, 없어도 되는 값이면 비동기 (예외 값 = 원장 `docs/BUILD_DEFECTS.md` 2.7 : Pi 인증 5초·결제 10초 등 — 새 예외는 원장에 먼저 적고 쓴다)
- **R-P5 실패 경로 먼저** — 순번·유일값은 충돌 재시도, 중복·잠금 상태는 화면이 먼저 막고 서버도 막는다
- **R-P6 개발 전용 코드** — dev 전용 호출·라우트는 운영 가드(`NODE_ENV`·`VERCEL_ENV`)가 첫 줄

완료 기준 : `pnpm build` 통과 + 바꾼 API·서버 함수의 R-P1~P6 자기 점검(검토 워크플로가 있으면 '운영 지연·실패 경로' 관점 포함).

- **자동 장치** : `.claude/hooks/build-defect-guard.mjs` — Write·Edit 때마다 방금 쓴 코드의 R-P1·P3·P4·P6 을 경고(PostToolUse), `--scan <앱>/src` 로 전수 검사. 경고가 뜨면 고치거나 의도 사유를 보고에 남긴다. 떨어진 직렬·N+1·경합은 못 잡으므로 검토 몫
- **원장** : `docs/BUILD_DEFECTS.md` — 시스템별 점검 결과·등급(A 즉시 / B 인증·결제 실기기 / C 설계)·수정 이력. **앞으로 구축할 15개+ 시스템은 원장 1절 '신규 시스템 체크리스트'를 첫 운영 배포 전에 통과**하고 원장에 절을 추가한다

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
| 2026-10-10 | 팀 실행을 현행 Claude Code 방식으로 전환 — TeamCreate/TeamDelete(현행 버전 부재) 대신 이름 붙인 Agent 소집 + SendMessage·ListAgents·TaskStop, 공유 작업 목록 TaskCreate/TaskGet/TaskList/TaskUpdate 활성화(env `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` 추가, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 유지). 폴백은 비대화형 실행 한정 | skills/da-team, .claude/settings.json | 마스터 지시 — "팀 기능 당장 추가", 서브 에이전트 폴백이 상시화되던 문제 해소 |

---

## 하네스: task-observer (스킬 관찰·개선)

**목표:** 작업 중 발생한 교정·판단·마찰을 포착해 재사용 가능한 스킬 개선안으로 축적한다.

**트리거 (필수):** **매 세션 첫 도구 호출 전, 그리고 계획을 세우거나 제안하기 전에** `task-observer` 스킬을 호출하라. 도구를 한 번이라도 쓸 턴이면 아무리 단순해 보여도 해당한다. 이 스킬은 description 매칭만으로는 활성화가 보장되지 않으므로 이 지시문이 유일한 강제 수단이다.

**관찰 로그 위치:** `~/.claude/projects/C--Users-anaki-workspace-loginpi/skill-observations/`
(cwd가 아니라 세션을 가로질러 유지되는 **고정 절대경로**를 쓴다. git worktree 등 임시 체크아웃 안이면 안 된다.)

**출처:** `rebelytics/one-skill-to-rule-them-all` (CC BY 4.0) — 실체는 `.agents/skills/task-observer/`

---

## 하네스: teamAnakin (턴 내 단계별 모델 운용)

**목표:** 단계(수집 → 결론 → 산출 → 검수 → 커밋)에 맞는 모델·effort 서브에이전트를 필요할 때만 쓴다. 소규모 작업은 메인이 직접 한다(2026-11-12 개정).

**구성:** 정의 `.claude/agents/teamAnakin/` — `anakin_phase-collect`(수집·Sonnet) · `anakin_phase-decide`(결론·Fable) · `anakin_phase-build`(산출·Opus, 로컬 검사·`pnpm build` 관문 포함) · `anakin_phase-review`(문서 검수·Opus) · `anakin_phase-commit`(커밋·Haiku 4.5) · `teamanakin-admin`(팀장·Opus, 고위험 변경만). 운용 기준서 `.claude/skills/anakin-skills/anakins-ClaudeModel-for-Work.md`. UserPromptSubmit 훅 `model-advisor.mjs` 의 `[모델 단계 계획]` 줄은 참고용 — 아래 R1~R4 와 다르면 R1~R4 가 우선.

**2026-11-12 개정 R1~R5** (마스터 원문 "1번부터 5번까지 모두 지금 적용해 줘. 필요없는 관련파일도 과감하게 지워줘." — 근거 2026-11-12 점검 : 강제 위임 뒤 요청당 비용 $2.02 → $3.60~4.30, p90 15 → 45분, 5분 이상 작업 시간의 73% 가 하네스 자체 변경, c4 판정은 평균 29초)
- **R1 소규모 = 메인 직접** — 파일 1~3개이고 인증·결제·페이지 라우트·SQL·env 가 아닌 변경과 조회는 메인이 직접 한다. 위임은 다파일·30분 이상·병렬 독립 작업·대량 수집일 때만. 문서·i18n 검수 단계(`anakin_phase-review`)도 선택. 폐지 : 2026-11-07 "메인 직접 작업 금지", 문서 산출물 검수 의무, 2026-11-11 일감 크기 상한(build 1회 3파일)·간소 절차.
- **R2 Codex c4 판정 유지** — 파일을 바꾼 서브에이전트가 끝나면 SubagentStop 훅 `.claude/hooks/codex-gate.mjs` 가 원장 `c4-<주제>-<agentId 앞 6자>` 로 자동 판정한다(종료 0 PASS / 1 FAIL / 2 BLOCKED, 결과는 메인의 다음 도구 호출·요청 때 `[CDX 자동 판정]`). FAIL 은 그 에이전트에 회송(같은 원장 다음 회차, 상한 5회), BLOCKED 는 원인 해소 후 재실행. **FAIL(N) = 실제 결함만**(로직·동작·보안·비밀·회귀·데이터 손실·쓰기 범위 밖 변경) — 보고 누락·문구·증거 서식은 참고 지적(N 아님). 메인 직접 변경은 이 훅의 판정 대상이 아니다. 메인·서브에이전트는 판정을 직접 실행하지 않는다(시험은 `CODEX_JS` 대역). 커밋 = 결정적 검사 `node scripts/precommit-check.mjs --commit`. 절차 정본 `.claude/engineering/40. loop/codex_procedure.md` 13절.
- **R3 팀장 승인 = 고위험만** — `teamanakin-admin` 은 인증·결제·페이지 라우트·SQL·env·배포 변경 턴에만 부른다. 승인 전제 = 그 턴 c4 원장 PASS, 인증·결제·페이지 변경은 Pi Browser 실기기 미검증이면 최대 CONDITIONAL. 폐지 : `anakin_phase-graph` 에이전트·자동 그래프 갱신 훅·Stop 훅 `turn-gate.mjs`·응답 끝 '종료 승인' 줄. 요청 그래프 생성기 `scripts/request-graph.mjs` 는 수동 실행용으로 남는다.
- **R4 하네스 동결 2026-11-12 ~ 2026-11-26** — 하네스 파일(`.claude/hooks/**`·`.claude/settings*.json`·`.claude/agents/teamAnakin/**`·판정·그래프 스크립트) 변경은 결함 수정·보안만. 나머지 요청은 대기 목록 `.claude/engineering/40. loop/harness-window.md` 에 적고 마스터에게 알린다(동결 중에는 주 1회 변경 창도 열지 않음). 동결 끝에 work-history KPI(`cost_per_request`·p90 소요·제품 커밋 수)로 재측정.
- **R5 지표 사각지대** — work-history 재작업률·무검증률이 서브에이전트 쓰기를 포함하도록 고친다(코드는 별도 build 담당).

**git push 훅 차단 (2026-11-07 마스터 결정):** Claude(메인·서브에이전트)의 `git push`(전역 옵션·연결 명령·`bash -c`·`promote-to-prod.mjs --yes` 포함, `--dry-run` 만 허용)는 PreToolUse 훅 `.claude/hooks/push-guard.mjs`가 막는다(루트·하위 앱 settings 등록) — 해제는 마스터만 `! node .claude/hooks/push-guard.mjs --allow [분] [원격] [브랜치]`(1회용·push 1건짜리 명령만, 기본 10분) 또는 `! git push` 직접, Claude 는 승인 파일(`.omc/state/push-allow.json`)·훅 실행 불가, 시험 `--selftest`. **실수 방지 장치** — 의도적 우회(외부 alias·config·`.git/hooks`·훅·settings 수정)는 범위 밖(마스터 git 자격 공유로 서버 측 구분 불가, 승인 파일 HMAC 비밀도 같은 OS 사용자라 실익 없음).

**ultrathink·ultracode 자동 선별 (2026-10-09 마스터 지시):** ultrathink는 `model-advisor.mjs`가 설계·결정·원인 분석 요청에만 같은 성격의 컨텍스트 지시를 자동 주입(조회·커밋 제외 — 실측 FEATURE 소요 차이 없음, QUERY 7배). ultracode는 훅으로 켤 수 없는 공식 설정이라 `.claude/settings.local.json` `"ultracode": true`(개인 설정)로 상시 켜고, Claude가 실질적 작업에만 워크플로를 고른다 — 워크플로 안에서도 teamAnakin 단계 에이전트·팀장 승인 규칙 적용, 끄기 `/effort ultracode off`.

**상태 표시·이력:** `.claude/subagent-statusline.mjs`(subagentStatusLine, 에이전트 행 `[단계] · 모델 · effort · 경과` + statusline.sh ▶ 단계) / 대시보드 `node scripts/my-claude-model-dashboard.mjs`(모델 운용) · `node scripts/model-change-dashboard.mjs`(요청별 모델·effort 흐름) → `work-statistics/mywork/`(gitignore). 정기 재평가 2026-10-22(팀장 모드 2).

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-10-09 | 타 프로젝트(장표·공문서·DR) 팀 이식 — 정의 6종을 loginpi 규칙(pnpm build 관문·Pi Browser 실기기·브랜드 표기·DA 표준)으로 변형, korean-law MCP·read-hwp·check-doc-style·DRM 절차 제외, subagent-statusline 신규, 훅 2종·subagentStatusLine·refreshInterval 등록, 공용 work-history 스크립트의 `npm run` 회귀를 `pnpm`으로 복원, 요청별 변경 대시보드 기준 시각을 loginpi 도입 시점으로 | agents/teamAnakin·skills/anakin-skills·hooks·settings.json·scripts | 마스터 지시 — teamAnakin 팀으로 프로젝트 진행 |
| 2026-10-09 | ultrathink 자동 선별(model-advisor)·ultracode 상시(settings.local)·통계/mywork 자동 갱신(Stop async)·sitemap.pi 세션 기록 | hooks·settings·sitemap/.claude | 마스터 지시 — 모든 작업 이력·실시간 통계·변경이력 |
| 2026-11-07 | 산출 단계 에이전트 `anakin_phase-build`(Opus·high) 신설, `model-advisor` 단계 계획·운용 기준서·팀장 정의의 '산출 → 메인'·'메인 직접'을 build·위임으로 개정(selftest 회귀 assert 추가) | agents/teamAnakin·hooks·skills/anakin-skills·CLAUDE.md | 마스터 지시 — 메인 직접 작업 금지(정본 `.claude/engineering/10. prompt/anakins_prompt.md`) |
| 2026-11-08 | 그래프 분석 에이전트 `anakin_phase-graph`(Sonnet·medium) 신설 — 요청 흐름 그래프(`scripts/request-graph.mjs`) 갱신·판독(엔지니어링 N/5·미수행·비정상 흐름), `model-advisor` 산출 턴 계획에 검증 뒤·팀장 승인 앞 단계 추가(selftest 회귀 assert 갱신), 상태줄 [그래프] 라벨, 팀장 정의·운용 기준서·엔지니어링 노드 카드 반영 | agents/teamAnakin·hooks·subagent-statusline·skills/anakin-skills·engineering·CLAUDE.md | 마스터 결정 — "그래프 분석의 담당 서브에이전트 추가"(컨텍스트 분석 = collect 확정) |
| 2026-11-09 | Codex 판정을 모든 산출 턴 필수로 연결 — `model-advisor` 산출 턴 계획 '산출 → 검증(로컬+Codex, verify) → FAIL 회송(상한 5) → 그래프 분석 → 팀장 승인'(selftest 갱신), verify 루프 절차(계약·--init·증거·--confirm-real·종료코드 0/1/2)·build FAIL 회송 입력·팀장 승인 전제(Codex PASS·maxGrade 상한), 요청 그래프 Codex1~6 칸 검수 대상 정의·원장 id 접두 `c<N>-` 매핑, 워크플로 에이전트(`subagents/workflows/`) 재귀 스캔 | agents/teamAnakin·hooks·skills/anakin-skills·engineering·scripts·CLAUDE.md | 마스터 결정 — "Codex 는 모든 산출 턴 필수", "그래프 Codex1~6 칸은 마스터 설계 유지 + 칸별 검수 대상 정의" |
| 2026-11-10 | 검증 단계 에이전트(verify) 폐지·정의 삭제, Codex 판정 실행 주체 = SubagentStop 훅 `codex-gate.mjs`(자동 계약·증거·scope → `--init` → `--confirm-real`, 결과는 PostToolUse·UserPromptSubmit `--flush` 로 메인에 전달, selftest·node:test), `model-advisor` 단계 계획의 CDX 줄 = 훅 자동(selftest 갱신), 요청 그래프 순차 연결(정지·차단 배지 폐지)·에이전트 = 칸 안 줄·CDX 칸 안 회차·쌍 표시 조건(하네스 = 도구 사용 · 루프 = 반복)·SA-CDX 자식 배치(세로 = 바로 아래 들여쓰기)·하네스 사용 목록·프롬프트 원문 축약·컨텍스트 전후좌우(graph 요약 캐시) | agents/teamAnakin·hooks·settings.json·subagent-statusline·skills/anakin-skills·engineering·scripts/request-graph·CLAUDE.md | 마스터 결정 — "Codex 목적이 검수인데 클로드가 검수를 또 하는 의도가 뭘까 … 삭제 바람"(실행 주체 = 훅 자동), "모든 프로세스는 순차적으로 연결", "SA 와 CDX 는 항상 쌍", "내가 요청한 게 아닌데 왜 있나" |
| 2026-11-10 | 턴 끝 관문 신설 — Stop 훅 `turn-gate.mjs`(턴 묶음 판정 : 보이는 CDX 칸 중 Y 아닌 칸을 `codex-verify.mjs --bundle` Codex 1회 → 칸 원장 `c<N>-turn-<요청키>`, N·BLOCKED 차단, 판정자 미가용·실기기·마스터 권한 1회 차단 후 보류, 종료 승인 줄 강제·연속 차단 3회 상한 = 승인 강제 실패 기록), 그래프 승인 칸 1.2 = 종료 승인 줄로 완료·턴 원장 칸 매칭, `model-advisor` 단계 계획 끝 = 턴 묶음 판정 → 종료 승인(selftest 갱신), codex-gate 잔여 결함(계약 브리프 앞뒤 보존·pending 바이트 불변 단정 삭제 검출·request.md 범위 = 마지막 전달 지시까지) | hooks·settings.json·scripts/codex-verify·scripts/request-graph·engineering·skills/anakin-skills·agents/teamAnakin·test·CLAUDE.md | 마스터 원문 "각 CDX마다 왜 검증이 누락되었는지 확인하고, 반드시 검증단계를 누락시키지 말고, 총괄검수가 끝나면 반드시 파다완 아소카의 종료 승인이 있어야 모든 프로세스를 종료", 선택 "아소카(메인) 직접 승인"·"턴 묶음 1회 판정" |
| 2026-11-10(개정) | Codex 판정 = 파일을 바꾼 에이전트의 c4 원장 하나(하네스 파일 포함 — 계약 AC-4·마스터 요청 원문 구획, c1·c2·c3·c5·c6 칸 폐지, 비대상 `NO_GATE`), turn-gate = 종료 승인 줄 기록기(비차단 — 턴 묶음 판정·차단 폐지, settings 등록 유지), 커밋 = `scripts/precommit-check.mjs --commit`(결정적 검사, 신설), `model-advisor` 단계 계획 = 산출 → Codex 루프 판정(훅) → 그래프 → 승인 → 종료 승인(기록용), 요청 그래프 CDX 칸 = CDX-루프 하나(설계도 15 → 10칸, 루프 쌍 = c4 판정·파일 변경 실행·반복·되돌림, 과거 원장 집계 제외 `isLoopLedger`) | hooks·scripts/request-graph·scripts/precommit-check·test·engineering·skills/anakin-skills·agents/teamAnakin·CLAUDE.md | 마스터 원문 "프롬프트+컨텍스트+그래프+총괄=>제거, 루프 유지+하네스는 루프에 흡수로 결론내고 바로 수정해 줘" — 턴 묶음 판정이 P·X·T '확인 불가' N 반복·실행 중 '결과 없음' N 으로 차단 상한(3/3) 반복, 실제 결함은 c4 에서 잡힘 |
| 2026-11-10 | 요청 그래프 1.1.5.2 '총괄승인' 칸 삭제(설계도 10 → 9칸, 생성기 실행 기록 runs.jsonl 폐지 — 최종 종료 승인 = 1.2), Obsidian 볼트를 루트 `.claude/engineering` 단일 볼트로 정리(설정 폴더 이동·`graph.json` 시드·전역 등록 path 변경) | scripts/request-graph·test·engineering·skills/anakin_arch_4_claude·CLAUDE.md | 마스터 원문 "총괄승인 칸 삭제하고, 볼트는 루트로 정리해 줘" |
| 2026-11-11 | 간소 절차 신설(소규모 하네스·문서 산출 턴 ①~⑤ 전부 충족 시 c4 PASS 뒤 그래프 분석·팀장 승인 생략, `model-advisor` 단계 계획 조건부 문구·selftest), `codex-verify` 묶음 판정(`--bundle`) 코드 삭제(보안 지적), 요청 그래프 원장 귀속을 agentId 로 매칭(같은 build 가 이어받은 원장 — 앞 요청 칸 검증 누락 오탐 수정), 원장 귀속 근본 수정(셸 2차 귀속에 실행 시각 조건, 귀속 기록 rulesVer 2026-11-11a 로 낡은 기록 재계산)·판정 이어받기(앞 FAIL·뒤 PASS 면 최종 판정 반영), 새 PC 이관 가이드에 `.omc` 원장 백업 추가, 요청 흐름 그래프 범례 삭제·오른쪽 상세 창 폴더블, 간소 절차 조건 보완(팀장 지적 — ② 금지 목록 확대 : 훅 전체·판정·배포 스크립트·teamAnakin 정의·CLAUDE.md 핵심 가치·teamAnakin 절, ④ 판정 주체 `judge.kind = codex`) | hooks/model-advisor·scripts/codex-verify·scripts/request-graph·test·agents/teamAnakin·skills/anakin-skills·이관 가이드 `.claude/setup/pgm_list.md`·CLAUDE.md | 마스터 원문 "1번 부터 6번까지 모두 승인하니까 바로 Nonstop으로 진행해 줘!" |
| 2026-11-11 | 작업 지연 분석(순수 5분 이상 작업 59건 중 하네스 자체 변경 40건·1,320분 = 72.5%, 색상 한 줄 변경 9.8분·서브에이전트 4명) 결과 반영 — M1 하네스 변경 창(결함 수정 아닌 하네스 변경은 주 1회 창에 모아 처리, 창 밖 요청은 대기 목록 `.claude/engineering/40. loop/harness-window.md`, 보안·판정 결함·"지금" 명시는 즉시 ; 정본 운용 기준서), M2 간소 절차 ① 확대(인증·결제·페이지 라우트·SQL·env 가 아닌 앱 파일 포함, 제외 경로 패턴 명시, 앱 변경 시 `pnpm build` 관문 유지·Pi Browser 실기기 대상은 정식 절차, `model-advisor` `LITE_RULE`·selftest, 팀장 정의 참조 문구) ; 같은 날 다른 묶음 — codex-flush 얇은 진입·증거 끝줄·재판정 생략, ECC 계측 훅 4종 끄기, refreshInterval, 생성기 잠금 | hooks/model-advisor·agents/teamAnakin·skills/anakin-skills·engineering/40. loop·CLAUDE.md (다른 묶음 : hooks/codex-flush·codex-gate·settings.json·생성기) | 마스터 원문 "최근 AI 엔지니어링 관련 튜닝작업 후, 시스템 작업수행시간이 매우 느려진 느낌을 받아서, 문제를 파악하고자 해. … subagent05 - 작업지연문제 해결 전문가 : 각각의 구조적 문제점들을 해결해 줘.", 선택 M1 "변경 창 도입 (권장)"·M2 "확대 (권장)"·P2 "1단계만 끄기 (권장)" |
| 2026-11-11 | 하네스 작업 지연 원인 분석(5분 이상 하네스 작업 40건·1,320분 = build 1회 작업 775분 59%·FAIL 회송 318분 24%·메인 대기·조율 122분 9%·Codex 55분 4%, 메인 nonstop 후속 과제 7건·439분, 최장 연쇄 15건·778분, 동시 지명 결함 D-006) 결과 반영 — 일감 크기·위임 규칙(build 1회 = 산출물 하나·3파일 이하·30분 이하, 파일 단독 소유, 메인 연쇄 차단 = 발견한 하네스 결함·개선 거리는 대기 목록으로·판정·보안 결함·"지금" 명시는 즉시), 대기 목록에 오늘 확정 대기 3건 등재 | skills/anakin-skills·engineering/40. loop/harness-window.md·CLAUDE.md | 마스터 원문 "하네스를 누가 왜 고치느라 오래 걸리지? 그 부분을 분석해서 오래걸리지 않게 수정하는데 포커스를 맞춰줘", 선택 "일감 크기 상한 (권장)"·"메인 연쇄 차단 (권장)" |
| 2026-11-12 | 효율 점검 개선 R1~R5 — R1 소규모(1~3파일, 인증·결제·페이지 라우트·SQL·env 아님)·조회 = 메인 직접(2026-11-07 메인 직접 작업 금지·2026-11-11 일감 크기 상한·간소 절차 폐지), R2 Codex c4 판정 유지·FAIL = 실제 결함만, R3 팀장 승인 = 고위험만·`anakin_phase-graph`·자동 그래프 갱신·`turn-gate`·종료 승인 줄 폐지(생성기는 수동), R4 하네스 동결 2026-11-12 ~ 11-26, R5 지표 사각지대 수정 ; teamAnakin 절 축약 | CLAUDE.md·skills/anakin-skills·agents/teamAnakin·engineering/10. prompt·40. loop·skills/anakin_arch_4_claude·setup/pgm_list (훅·settings·scripts·test 는 별도 build) | 마스터 원문 "1번부터 5번까지 모두 지금 적용해 줘. 필요없는 관련파일도 과감하게 지워줘." — 2026-11-12 점검(요청당 비용 $2.02 → $3.60~4.30, p90 15 → 45분, 11-07 이후 제품 커밋 15 vs 하네스 45) |

---

## 작업 수행 원칙 (2026-09-20 마스터 지시 — 모든 요청에 적용)

1. **요청 철저 검토** — 착수 전 목표·범위·완료 기준을 세운다. 읽기에 따라 결과가 달라지면 AskUserQuestion 1문항으로 확인.
2. **최적 다중 스킬·플러그인 선정** — 설치된 스킬(`.agents/skills`·OMC·GSD·superpowers)·플러그인·MCP 중 최적 조합을 먼저 고르고, 없으면 `find-skills`·skills.sh·`/plugin` 마켓에서 찾아 설치 후 사용. 기준은 **최고 성능 + 최저 토큰** — 단순 작업은 직접 수행(에이전트 오버헤드 금지), 다단계·다파일·조사·검증은 위임.
3. **에이전트 적극 활용** — 독립 작업은 한 메시지에 여러 `Agent` 호출로 병렬 처리하고 메인 세션은 총괄·통합만 맡는다. 코드=`executor`, 탐색=`explore`, 외부 문서=`document-specialist`, 검토=`code-reviewer`/`critic`, 검증=`verifier`.
4. **루핑 검증** — 결과가 최상인지 별도 패스(`verifier`/`critic`)로 검토하고 통과할 때까지 반복(`ralph` 패턴). 자기 승인 금지. 안전 상한(기본 5회) 도달 시 현황과 막힌 원인을 보고하고 지시를 받는다(2026-11-08 마스터 10→5).

**해석 확정(마스터 승인 2026-09-20):** ① "최고 성능 + 최저 토큰"은 작업 크기로 조정 — 단순 작업은 직접 수행, 다단계·다파일·조사·검증은 위임. ② "무한 반복"은 verifier 통과까지 **안전 상한 5회** 내 반복 — 상한 도달 시 현황·막힌 원인을 보고하고 지시를 받는다(2026-11-08 마스터 10→5).

**2026-11-12 마스터 개정(R1) — 소규모 변경(파일 1~3개, 인증·결제·페이지 라우트·SQL·env 아님)과 조회는 메인이 직접 수행하고, 위임은 다파일·30분 이상·병렬 독립 작업·대량 수집일 때만 한다. 2026-11-07 개정 "메인(아소카) 직접 작업 금지"는 폐지 — 해석 확정 ①의 작업 크기 조정이 다시 유효. 세부 = '하네스: teamAnakin' 절 R1~R5, 정본 `.claude/engineering/10. prompt/anakins_prompt.md` 0절.**

## 워크스페이스 루트 전역변수 + 작업 이력 로그 (2026-09-20 마스터 지시)

- **`WORKSPACE_ROOT` = `C:/Users/anaki/workspace`** — 정의처 2곳: Windows 사용자 환경변수(`setx`, 새 프로세스부터 적용) + `.claude/settings.json`의 `env`. 프로젝트 루트는 `$WORKSPACE_ROOT/loginpi`.
- **절대경로 하드코딩 금지** — 참조 형식: bash/훅/statusLine `$WORKSPACE_ROOT`, `.mcp.json` 등 Claude JSON `${WORKSPACE_ROOT}`(공식 확장 지원), Node `process.env.WORKSPACE_ROOT`, 에이전트 프롬프트(.md) `${WORKSPACE_ROOT}/loginpi/...`(에이전트가 이 정의로 해석). 구 폴더명 `cafe-pi-claude` 경로는 전부 사문 — `loginpi`로 교정 완료.
- **작업 이력 로그 (v2, 2026-09-20 10인 평가 반영)**: `work-history/YYYY/MM/YYYY-MM-DD.log`(사람용) + `.jsonl`(통계용, 턴당 1레코드 `id=<session>:<turn>.<part>`, part>1은 구간 델타, `fix` 레코드로 늦게 도착한 훅·턴 소요 보정) — `.claude/hooks/work-history-logger.mjs`가 Stop·SessionEnd 훅에서 세션 기록을 바이트 오프셋 증분으로 읽어 생성. **Stop 훅은 `로거 && work-stats-refresh.mjs`를 동기로 실행**(갱신 본체는 분리 프로세스라 훅은 0.2초에 반환, SessionEnd 로거와 직렬화) → 매 응답마다 `work-statistics/`(일·주·월·년 통계·main-dashboard HTML)와 `work-statistics/mywork/`(요청별 모델·effort 변경이력·모델 운용 대시보드) 자동 갱신, 오류는 `%TEMP%/work-stats-refresh.err`. 하위 앱 `sitemap/sitemap.pi/.claude/settings.json`도 같은 훅을 호출하고 env `WORK_HISTORY_PROJECT=sitemap.pi`로 project만 구분(같은 work-history에 기록). 공용 정의(카테고리 점수제·단가·마스킹·포맷)는 `scripts/work-history-core.mjs` 단일 소스. **`work-history/`·`work-statistics/`는 gitignore**(대화 전문 포함 — 저장소에 올리지 말 것). 회귀 테스트 `pnpm test`(node:test, test/work-history.test.mjs). 상태 파일 `.omc/state/work-history/`. **지표 정의 레지스트리** `core.METRICS`(+`KPI_TREE`, 보고서가 `<stem>.metrics.json` 동봉) — North Star는 `cost_per_request`(서브에이전트 비용 포함 ÷ distinct 요청), 후행 지표 첫 응답 대기·교정률, 선행 지표 컨텍스트 팽창률·재작업률·무검증률·오류 회복 배수. `cache_hit`·레코드 수·출력 토큰은 허영 지표. 서브에이전트 기록(`<transcript dir>/<sid>/subagents/`)은 로거가 Stop마다 스캔해 디스패치 턴에 `agent` 레코드로 귀속. **통계 파일·차트 보고서** (기간 4종 — 일별 `YYYY/MM/<날짜>`, 주별 `YYYY/weekly/<YYYY-Www>`(ISO 월~일), 월별 `YYYY/MM/<YYYY-MM>`, 년도별 `YYYY/<YYYY>`, 각각 이전 기간 대비 증감 포함): `pnpm work:report [--period day|week|month|year|all] [--date YYYY-MM-DD]` → `work-statistics/…/<stem>.{summary,tokens,usage,performance}.{json,csv,md}` + `turns.csv` + `report.html`(①토큰 ②agent/mcp/skill/plugin/hook ③성능 섹션) + 스크린샷 `charts.png`(agent-browser). 터미널 통계: `pnpm work:stats --type kpi|summary|tokens|usage|performance|all`(kpi = KPI 트리·경보·질문 판정). **지표 체계 문서 `docs/WORK_METRICS.md`는 `pnpm work:metrics-doc`로 레지스트리에서 생성** — 손으로 고치지 말고 `core.METRICS`를 고칠 것 [--month 2026-09] [--by category|tool|day|hour|weekday|session|skill|mcp|agent] [--csv] [--json] [--list]`. 카테고리는 요청문 키워드로 자동 판정(GIT·DEPLOY·INSTALL·FIX·TEST·DATA·REFACTOR·CONFIG·DOCS·FEATURE·QUERY·OTHER), 요청문에 `#cat:NAME`으로 강제 가능.
