# CLAUDE.md

이 파일은 Claude Code(claude.ai/code)가 이 저장소에서 작업할 때 참고하는 안내 문서입니다.

---

## ⭐ 프로젝트 핵심 가치 (최우선 — 절대 훼손 금지)

존재 이유는 단 두 가지다. 어떤 변경도 이 둘을 깨뜨리면 안 된다.

1. **Pi Browser에서 Pi 계정으로 로그인할 수 있어야 한다.**
2. **Pi Browser에서 Pi 계정으로 결제할 수 있어야 한다.**

> Pi Browser 로그인이 막히면 Pi username으로 아무것도 할 수 없어 프로젝트 전체가 무가치해진다.
> 인증·페이지·기능 변경은 **Pi Browser 실기기에서 로그인·결제·채팅 접속을 검증**한 뒤에만 완료로 간주한다.

**치명적 제약 — Pi Browser WebView는 모든 방식(form POST·fetch·302/307 redirect·200 HTML)의 `Set-Cookie`를 저장하지 않는다.**
쿠키에만 의존하는 서버 컴포넌트 페이지 보호는 Pi Browser에서 **구조적으로 동작 불가**다.
→ 인증이 필요한 페이지는 반드시 **쿠키 OR `X-Pi-Token` 헤더** 두 경로를 지원해야 한다(→ "인증 + 세션 구조" 참고).
→ `getSessionUser()`가 null일 때 **`redirect`로 막으면 Pi Browser에서 무한 리다이렉트 루프가 발생한다(절대 금지)** — 클라이언트 게이트로 위임할 것.

---

## 빌드 및 개발 명령어

```bash
pnpm dev              # 개발 서버 실행 (Turbopack, http://localhost:3000)
pnpm build            # 프로덕션 빌드 + 환경변수 검증
pnpm start            # 프로덕션 서버 실행
pnpm lint             # ESLint 검사
pnpm format           # Prettier 포맷 (Tailwind 클래스 순서 자동 정렬 포함)
pnpm format:check     # 포맷 검사만 수행 (파일 수정 없음)
pnpm tsc --noEmit     # 타입 체크
```

shadcn/ui 컴포넌트 추가:
```bash
pnpm dlx shadcn@latest add <컴포넌트명>
```

---

## 현재 기술스택 버전 (2026-06-07 기준)

> 버전 확인: `pnpm outdated` / 업그레이드 전략: `docs/UPGRADE_STRATEGY.md`

| 패키지 | 설치 버전 | 채널 | 비고 |
|---|---|---|---|
| next | `15.5.18` | stable | 16.2.7 available → Tier 3 |
| react / react-dom | `19.2.7` | stable | ✅ 최신 |
| typescript | `^5` (5.9.3) | stable | 6.0.3 available → Tier 3 |
| tailwindcss | `^4` | stable | CSS-first, config 파일 없음 |
| **next-auth** | `5.0.0-beta.31` | **beta** | ⚠️ v5 stable 미출시 (latest = 4.x) |
| next-intl | `^4.13.0` | stable | |
| @supabase/supabase-js | `^2.107.0` | stable | |
| @base-ui/react | `^1.5.0` | stable | shadcn base-nova |
| zod | `^4.4.3` | stable | |
| @t3-oss/env-nextjs | `^0.13.11` | stable | |
| @anthropic-ai/sdk | `^0.101.0` | stable | |
| resend | `^6.12.4` | stable | |
| lucide-react | `^1.17.0` | stable | |
| shadcn (CLI) | `^4.10.0` | stable | |
| eslint | `^9` (9.39.4) | stable | 10.4.1 available → Tier 3 |
| prettier | `^3.8.3` | stable | |
| **@types/node** | `^22` (22.19.20) | **Node 22 Active LTS** | Node 20 EOL 2026-04 → ^22 권장 |
| tsconfig target | `ES2022` | — | Node 22 LTS 기준 (기존 ES2017에서 업그레이드) |

### next-auth 상황

```
latest (stable) = 4.24.14   ← v4 API (현재 코드와 호환 불가)
beta            = 5.0.0-beta.31  ← 현재 사용 중
next            = 4.0.0-next.26
canary          = 3.24.0-canary.0
```

v5 stable이 미출시이므로 beta.31 유지. v5 stable 출시 시 `pnpm add next-auth@^5` 로 전환.

---

## 아키텍처 핵심 사항

### shadcn/ui: base-nova 스타일 (@base-ui/react)

이 프로젝트의 shadcn/ui는 **Radix UI가 아닌 `@base-ui/react`** 를 사용하는 `base-nova` 스타일로 초기화됐다.

- **`asChild` prop 없음** — Radix UI 패턴(`<Trigger asChild><Button/></Trigger>`)이 동작하지 않는다.
- 대신 `className={cn(buttonVariants({ variant: 'outline' }))}` 를 Trigger에 직접 적용한다.
- `relative` 클래스 없이 `absolute` 아이콘을 Trigger 안에 넣으면 위치가 이탈한다 — `relative` 명시 필요.

### Tailwind CSS v4 (CSS-first 설정)

- `tailwind.config.*` 파일이 **없다** — v4는 CSS로만 설정한다.
- `src/app/globals.css`의 `@import 'tailwindcss'` 한 줄이 진입점 전부.
- 테마 커스터마이징은 `@theme inline { ... }` 블록에서 CSS 변수로 처리.
- PostCSS 플러그인은 `@tailwindcss/postcss` (v3의 `tailwindcss` 직접 사용 방식과 다름).

### 다크모드 연동

next-themes와 Tailwind v4의 `dark:` 접두사를 연결하는 핵심 한 줄:

```css
/* src/app/globals.css */
@custom-variant dark (&:where(.dark, .dark *));
```

이 줄이 없으면 next-themes가 `<html class="dark">`를 주입해도 `dark:` 클래스가 적용되지 않는다.
`layout.tsx`에서 `<html suppressHydrationWarning>` + `<ThemeProvider attribute="class">` 조합 필수.

### 환경변수 검증 (t3-env)

- 스키마 정의: `src/env.ts` — server/client 분리, `NEXT_PUBLIC_*` 는 반드시 명시
- `next.config.ts` 상단의 `import './src/env'` 로 **빌드 시점에 자동 검증** 실행
- env 누락 시 `pnpm build`가 실패한다 (의도된 동작)
- 새 환경변수 추가 시 `src/env.ts` + `.env.example` 동시 수정 필요

### pnpm 11 빌드 스크립트 허용 설정

pnpm 11부터 `package.json`의 `pnpm` 필드는 무시된다. 네이티브 빌드 스크립트 허용은 `pnpm-workspace.yaml`의 `allowBuilds`로만 설정한다:

```yaml
allowBuilds:
  sharp: true
  unrs-resolver: true
  msw: true
```

새 패키지 추가 후 빌드 스크립트 차단 오류가 발생하면 이 목록에 추가한다.

---

## 다국어 (next-intl v4) 핵심 사항

### routing.ts — 빌드 타임 정적 파일

`src/i18n/routing.ts`의 `locales` 배열은 **빌드 시점에 고정**된다.

- `defineRouting()`, `createMiddleware()`, `createNavigation()` 모두 이 배열을 정적으로 사용
- Vercel 프로덕션에서 소스 파일은 read-only — 런타임 수정 불가
- 현재 203개 국가 코드가 선점 등록되어 있어 Admin 활성화 시 재배포 불필요
- 극히 희귀한 코드(영토 등)만 수동 추가 후 재배포 필요

### locale 단일 소스 파일

locale 관련 매핑은 반드시 이 두 파일을 사용한다 — 직접 정의 시 sync 버그 재발:

```
src/lib/locale-currency.ts  — LOCALE_CURRENCY (locale → 통화 코드)
src/lib/locale-country.ts   — LOCALE_COUNTRY, getAlpha2(), ACTIVE_COUNTRY_CODES
```

**완전성 자동 검증**: `scripts/validate-locales.mjs`가 `pnpm build` 시 messages/*.json ↔ 통화 ↔ 국가 ↔ routing.ts 교차 검증 — 매핑 누락 시 빌드 실패 (et/mx 통화 USD 오표시 재발 방지, 2026-06-08). 수동 실행: `pnpm validate:locales`

### locale_cd 형식 규칙

Admin에서 신규 locale을 처리할 때 `locale_cd` 형식을 반드시 검증한다:

```ts
const LOCALE_CD_RE = /^[a-z]{2,3}(-[A-Z]{2,3})?$/
// 허용: 'ko', 'fil', 'af-AF'
// 거부: 그 외 모든 값 (소스 파일 쓰기 전 화이트리스트 검증)
```

### 번역 파일 로딩

`import()`가 아닌 `readFile()`을 사용한다 — Node.js 모듈캐시가 동기화 결과를 반영하지 않기 때문.

```ts
// 올바른 방법 (src/i18n/request.ts)
const raw = await readFile(join(process.cwd(), 'messages', `${locale}.json`), 'utf-8')
```

---

## DB 테이블 명명 규칙 (DA 표준)

모든 테이블·컬럼은 한국 DA 표준을 따른다. **정본: `docs/da/데이터표준규칙.md`** (프레임워크 전체 맵: `docs/da/README.md`):

- **시스템 컬럼 4개** — 전 테이블 필수: `regr_id TEXT NOT NULL DEFAULT 'ADMIN'`, `reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`, `modr_id TEXT NOT NULL DEFAULT 'ADMIN'`, `mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
- **논리삭제**: `del_yn CHAR(1) DEFAULT 'N'` + `del_dtm TIMESTAMPTZ` (신규 테이블부터 del_dtm 필수) — 물리 DELETE 절대 금지
- **복합어**: REGR(등록자), MODR(변경자), PYMNT(결제), CTGR(카테고리)
- **도메인 약어**: `_id`(식별자), `_nm`(이름), `_cd`(코드), `_yn`(여부), `_dtm`(일시), `_dt`(날짜)
- **자동 강제**: `sql/*.sql` 작성·Supabase 마이그레이션 시 `da-ddl-guard` Hook이 자동 검사 — 위반 시 차단되며 DA 승인(`-- DA-APPROVED:` 주석) 필요

현재 테이블 목록: `sys_user`, `pi_pymnt`, `auth_link_cd`, `brd_*`, `std_*`, `approval_queue`, `i18n_locale`, `i18n_message`, `i18n_cntry_mst`

---

## 인증 + 세션 구조

> Pi Browser는 쿠키를 저장하지 않는다(핵심 가치 제약 참고). 그래서 Pi 세션은
> **쿠키(일반 브라우저) + `X-Pi-Token` 헤더(Pi Browser localStorage) 이중 경로**로 동작한다.

### Pi 세션 (쿠키 비의존 이중 경로)
- **발급** (`/api/auth/pi` POST): `signPayload` HMAC-SHA256 서명 토큰을 `pi_session` 쿠키(`httpOnly`, `sameSite: lax`)와 JSON `token` 필드로 **둘 다 반환**
- **클라이언트 저장**: `pi-auth-provider`가 `token`을 `localStorage`(`pi_token`)에 저장 (`setPiToken`)
- **요청**: 인증이 필요한 클라이언트→API 호출은 `fetch` 대신 **`piFetch`**(`src/lib/pi-fetch.ts`) 사용 → `X-Pi-Token` 헤더 자동 첨부 + `credentials: 'include'`
- **서버 검증**: `getSessionUser()`가 **쿠키 우선 → 없으면 `X-Pi-Token` 헤더**로 신원 확인 + `tokenValidUntil` 만료 검증

### 쿠키 비의존 페이지 패턴 (Pi Browser 필수 — 위반 시 무한 루프)
인증이 필요한 서버 컴포넌트 페이지는 `getSessionUser()`가 null이어도 **`redirect` 금지**.
대신 **클라이언트 게이트**를 렌더해 `piFetch`로 데이터를 로드한다.
- 일반 브라우저(쿠키 O): 서버 SSR 그대로 — 회귀 위험 없음
- Pi Browser(쿠키 X): 클라이언트 게이트 — 예) `ClientChatList`, `ClientChatRoom`, `ClientAdminGate`
- 데이터 API(예: `/api/chat/rooms`)는 `getSessionUser()`만 쓰면 쿠키·헤더 양쪽 자동 지원

### Google 세션 (NextAuth.js v5 beta — v5 stable 미출시)
- `session.user.sub` = Google OAuth raw sub (google_id 저장)
- `session.user.id` = users row UUID

### 통합 체크
```ts
import { getSessionUser, isAdmin } from '@/lib/auth-check'
const user = await getSessionUser()  // Pi(쿠키/헤더) 또는 Google 세션 통합
if (!isAdmin(user)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
```

---

## Supabase 사용 패턴

- RLS **비활성화** — 모든 접근은 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`로 처리
- `src/lib/supabase-admin.ts` — lazy init 패턴 (빌드 시점 SERVICE_ROLE_KEY 미설정 방지)
- Supabase anon key는 클라이언트에서 사용하지 않음

---

## PiRC2 스마트 컨트랙트 (Soroban — Pi Testnet)

Pi Network 최초 Soroban 스마트 컨트랙트. **반복 결제(구독) 시스템** 구현에 사용한다.
공식 문서: `https://github.com/PiNetwork/PiRC` (PiRC2 디렉토리, 9개 섹션)

### 컨트랙트 정보

| 항목 | 값 |
|---|---|
| Contract ID (Testnet) | `CCUF75B6W3HRJTJD6O7OXNI72HGJ7DERZ5MUNOMFMSK23ME5GUIKPFYV` |
| Network passphrase | `"Pi Testnet"` |
| RPC URL | `https://rpc.testnet.minepi.com` |
| 토큰 단위 | **1 Pi = 10,000,000 units (i128)** |

### stellar-cli 설정

```bash
export CONTRACT_ID=CCUF75B6W3HRJTJD6O7OXNI72HGJ7DERZ5MUNOMFMSK23ME5GUIKPFYV
export NETWORK=pi-testnet
```

`~/.stellar/network/pi-testnet.toml`:
```toml
rpc_url = "https://rpc.testnet.minepi.com"
rpc_headers = []
network_passphrase = "Pi Testnet"
```

### 핵심 메서드

| 메서드 | 설명 | 호출 주체 |
|---|---|---|
| `register_service(merchant, name, price, period_secs, trial_period_secs, approve_periods)` | 서비스 등록 (1회성) | **판매자 서버** |
| `subscribe(subscriber, service_id, auto_renew)` | 구독 시작 | **구독자** (Pi Wallet 서명 필요) |
| `cancel(subscriber, sub_id)` | 구독 취소 | 구독자 |
| `process(merchant, service_id, offset, limit)` | 배치 청구 실행 (페이지네이션) | **판매자 서버** (cron job) |
| `extend_subscription(subscriber, sub_id)` | 구독 연장 | 구독자 |
| `toggle_auto_renew(subscriber, sub_id)` | 자동갱신 토글 | 구독자 |
| `is_subscription_active(subscriber, service_id)` | 구독 활성 여부 | 누구나 (read-only) |
| `get_subscription(subscriber, sub_id)` | 구독 상세 조회 | 누구나 |
| `get_merchant_services(merchant)` | 판매자 서비스 목록 | 누구나 |

### 구독 행동 매트릭스

| 조건 | auto_renew=true | auto_renew=false |
|---|---|---|
| **무료 체험 있음** | 즉시 결제 없음, approve_periods 기간 토큰 승인 | 체험 기간만, 만료 시 종료 |
| **무료 체험 없음** | 즉시 첫 기간 결제 + approve_periods 기간 승인 | 즉시 첫 기간 결제 + 1기간 승인 |

### 에러 코드

`1`InvalidPrice · `2`InvalidPeriod · `3`AlreadySubscribed · `4`SubscriptionNotFound
`5`ServiceNotFound · `6`Unauthorized · `7`AlreadyCancelled · `11`SubscriptionExpired · `12`ServiceNotActive

### TASK-054 구현 전략

`subscribe()`는 구독자(Pi Browser 사용자)의 **Soroban 트랜잭션 서명**이 필요하다.
Pi SDK가 `window.Pi.invokeContract()` 또는 유사 메서드를 공식 제공하기 전까지:

- **단기 (TASK-054 현재)**: 기존 U2A 결제 흐름(`metadata.type='CHAT_SUBSCR'`) → 서버에서 `msg_subscr` DB 관리 (앱 레벨 구독). 컨트랙트 없이 동일한 사용자 경험 제공.
- **중기 (Pi SDK Soroban 지원 시)**: PiRC2 `subscribe()` 직접 통합, 서버 cron에서 `process()` 실행.
- `process()` 배치 청구는 판매자 서버 키로 실행 가능 — Pi Wallet 서명 불필요. cron job 설계에 즉시 활용 가능.

```typescript
// 금액 변환 유틸리티 (1 Pi = 10_000_000 units)
const toUnits = (pi: number): bigint => BigInt(Math.round(pi * 10_000_000))
const toPi = (units: bigint): number => Number(units) / 10_000_000
```

---

## 디렉토리 구조

```
src/
├── app/
│   ├── [locale]/               # next-intl 다국어 라우팅
│   │   ├── (admin)/admin/      # 관리자 페이지 (ADMIN/MASTER 전용)
│   │   │   ├── page.tsx        # 대시보드
│   │   │   ├── users/          # 사용자 관리
│   │   │   ├── payments/       # 결제 내역
│   │   │   ├── links/          # 연동 현황
│   │   │   ├── board/          # 게시판 관리
│   │   │   ├── std/            # 데이터 표준 (words/domains/terms/ddl/audit/approvals)
│   │   │   └── i18n/           # 다국어 관리
│   │   ├── board/              # 통합 게시판 (4종)
│   │   ├── link/               # Pi·Google 계정 연동
│   │   ├── layout.tsx          # next-intl NextIntlClientProvider
│   │   └── page.tsx            # 홈
│   ├── api/
│   │   ├── admin/              # 관리자 API
│   │   ├── auth/               # Pi 인증 + NextAuth + 연동
│   │   ├── board/              # 게시판 API
│   │   └── payments/           # Pi 결제 (approve/complete)
│   ├── globals.css             # Tailwind v4 + @custom-variant dark
│   └── layout.tsx              # 루트 레이아웃 (ThemeProvider)
├── components/
│   ├── admin/                  # 관리자 UI
│   ├── layout/                 # Header, Footer, pi-price-chip, language-switcher
│   └── ui/                     # shadcn/ui (@base-ui/react)
├── i18n/
│   ├── routing.ts              # defineRouting — 203개 locale 선점 등록
│   └── request.ts              # getRequestConfig — 3단계 fallback
├── lib/
│   ├── auth-check.ts           # Pi + Google 세션 통합 (server-only)
│   ├── board.ts                # 게시판 헬퍼
│   ├── locale-currency.ts      # LOCALE_CURRENCY 단일 소스
│   ├── locale-country.ts       # LOCALE_COUNTRY + getAlpha2 단일 소스
│   ├── supabase-admin.ts       # Supabase admin 클라이언트 (lazy init)
│   ├── users.ts                # sys_user 테이블 CRUD
│   └── utils.ts                # cn() = twMerge + clsx
├── messages/                   # 번역 파일 (ko.json이 source of truth)
├── types/
│   ├── next-auth.d.ts          # NextAuth 타입 확장
│   └── pi-session.ts           # PiSessionUser 타입
├── auth.ts                     # NextAuth v5 설정
└── env.ts                      # t3-env 환경변수 스키마
```

---

## 코드 스타일

들여쓰기 2칸, 세미콜론 없음, 작은따옴표 사용. Prettier가 `pnpm format` 실행 시 Tailwind 클래스 순서를 자동으로 정렬한다.
