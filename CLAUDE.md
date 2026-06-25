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
```

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

---

## DB 명명 규칙 (DA 표준)

**정본: `docs/da/데이터표준규칙.md`** (프레임워크 전체: `docs/da/README.md`)

- **시스템 컬럼 4개** 전 테이블 필수: `regr_id TEXT NOT NULL DEFAULT 'ADMIN'`, `reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`, `modr_id TEXT NOT NULL DEFAULT 'ADMIN'`, `mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
- **논리삭제**: `del_yn CHAR(1) DEFAULT 'N'` + `del_dtm TIMESTAMPTZ` — **물리 DELETE 절대 금지**
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

### 클라이언트 게이트 패턴 (Pi Browser 필수 — 위반 시 무한 루프)

`getSessionUser()` null 시 **`redirect` 금지** → 클라이언트 게이트 렌더:

```tsx
if (!user) return <ClientChatRoom roomId={roomId} />
```

예: `ClientChatList`, `ClientChatRoom`, `ClientAdminGate`
데이터 API는 `getSessionUser()`만 쓰면 쿠키·헤더 양쪽 자동 지원.

### Google 세션 (NextAuth v5 beta)

- `session.user.sub` = Google OAuth raw sub | `session.user.id` = users row UUID

### 통합 체크

```ts
import { getSessionUser, isAdmin } from '@/lib/auth-check'
const user = await getSessionUser()  // Pi(쿠키/헤더) 또는 Google 세션 통합
if (!isAdmin(user)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
```

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

## 공식 브랜드 표기 (2026-06-23 확정)

모든 **사용자 표시 텍스트**(UI 라벨·제목·i18n 값·문서·메뉴얼·주석)는 다음 공식 표기를 사용한다:

| 기능 | 공식 표기 |
|---|---|
| PiCafe / PiCafé | **PiCafé™** (é=U+00E9, ™=U+2122) |
| PiShop | **PiShop™** |
| 자동번역 | **PiTranslate™** |

- ⛔ **원형 유지(™·é 금지)**: DB 코드값 `prod_ctgr_cd='PICAFE'/'PISHOP'/'PISHOP_SUBSCR'/'TRANSLATE'`, 변수·함수·컴포넌트 식별자, **Pi 결제 memo**(™ 특수문자가 결제 호환을 깨뜨릴 수 있음).
- ™ 중복 방지: 치환 시 `(?!™)` lookahead 사용. "자동번역" 한국어 서술은 맥락 보존, 명칭/제목/라벨만 PiTranslate™.
