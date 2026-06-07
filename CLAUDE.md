# CLAUDE.md

이 파일은 Claude Code(claude.ai/code)가 이 저장소에서 작업할 때 참고하는 안내 문서입니다.

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

모든 테이블·컬럼은 한국 DA 표준을 따른다:

- **시스템 컬럼 4개** — 전 테이블 필수: `regr_id VARCHAR(20) NOT NULL DEFAULT 'system'`, `reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`, `modr_id`, `mod_dtm`
- **논리삭제**: `del_yn CHAR(1) DEFAULT 'N'`
- **복합어**: REGR(등록자), MODR(변경자), PYMNT(결제), CTGR(카테고리)
- **도메인 약어**: `_id`(식별자), `_nm`(이름), `_cd`(코드), `_yn`(여부), `_dtm`(일시), `_dt`(날짜)

현재 테이블 목록: `sys_user`, `pi_pymnt`, `auth_link_cd`, `brd_*`, `std_*`, `approval_queue`, `i18n_locale`, `i18n_message`, `i18n_cntry_mst`

---

## 인증 + 세션 구조

### Pi 세션 (Pi Browser)
- `pi_session` 쿠키 — HMAC-SHA256 서명 (`httpOnly`, `sameSite: strict`)
- Pi Browser WebView 쿠키 미전송 시 `X-Pi-Token` 헤더 fallback

### Google 세션 (NextAuth.js v5 beta — v5 stable 미출시)
- `session.user.sub` = Google OAuth raw sub (google_id 저장)
- `session.user.id` = users row UUID

### 통합 체크
```ts
import { getSessionUser, isAdmin } from '@/lib/auth-check'
const user = await getSessionUser()  // Pi 또는 Google 세션 통합
if (!isAdmin(user)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
```

---

## Supabase 사용 패턴

- RLS **비활성화** — 모든 접근은 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`로 처리
- `src/lib/supabase-admin.ts` — lazy init 패턴 (빌드 시점 SERVICE_ROLE_KEY 미설정 방지)
- Supabase anon key는 클라이언트에서 사용하지 않음

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
