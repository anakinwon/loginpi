# 보안 취약점 점검 요구사항 (PRD_SECURITY)

## 문서 정보

| 항목 | 내용 |
|------|------|
| 작성일 | 2026-06-03 |
| 참조 가이드 | 주요정보통신기반시설 기술적 취약점 분석·평가 방법 상세가이드 |
| 프로젝트 | claude-nextjs-starters (표준데이터 관리 시스템) |
| 기술 스택 | Next.js 16.2.6 + React 19 + TypeScript + Tailwind CSS v4 + Supabase |
| 점검 기준 | OWASP Top 10 2021 + 주요정보통신기반시설 가이드 웹 취약점 항목 |

---

## 1. 개요 및 범위

### 1.1 시스템 개요

본 시스템은 표준 데이터(단어·도메인·용어) 관리, 다국어 번역 관리, 사용자 역할 기반 접근 제어(RBAC), 게시판, 감사 이력을 제공하는 Next.js 16 기반 웹 애플리케이션이다.

**주요 구성 요소:**
- `proxy.ts` — 인증·인가·i18n 라우팅 프록시 (Next.js 16 naming)
- `app/api/` — REST API Routes (40+ 엔드포인트)
- `lib/auth-guard.ts` — Supabase JWT 기반 인증·인가 공통 미들웨어
- `lib/admin-auth.ts` — HMAC-SHA256 기반 관리자 세션 토큰
- `lib/db.ts` — better-sqlite3 기반 로컬 SQLite (DA 메타 DB)
- Supabase — 사용자 인증, 게시판·프로필 데이터, 파일 스토리지

### 1.2 점검 범위

| 영역 | 대상 경로 |
|------|----------|
| 라우팅·인증 미들웨어 | `proxy.ts`, `lib/auth-guard.ts`, `lib/admin-auth.ts` |
| API 엔드포인트 | `app/api/**/*.ts` (40+ routes) |
| 서버 컴포넌트 | `app/**/layout.tsx`, `app/**/page.tsx` |
| 클라이언트 컴포넌트 | `components/**/*.tsx` |
| 설정 파일 | `next.config.ts`, `.env`, `.env.local`, `package.json` |
| 파일 업로드 | `app/api/board/.../attachments/route.ts`, `app/api/profile/avatar/route.ts` |
| 파일 시스템 접근 | `app/api/i18n/translate/route.ts`, `app/api/i18n/sync/route.ts` |

---

## 2. 취약점 점검 항목

---

### 2.1 인증·인가 (A07: 인증 실패 / A01: 접근 통제)

---

#### SEC-001 관리자 단일 패스워드 인증 취약점

- **점검 목적**: 관리자 Back Office 인증이 단일 평문 패스워드 비교에 의존하는 구조적 취약점 확인
- **위험도**: Critical
- **점검 기준**: 주요정보통신기반시설 가이드 - 취약한 인증 메커니즘 (WA-01)
- **점검 방법**: `app/api/admin/login/route.ts` 및 `.env.local` 검토
- **현황**:
  ```typescript
  // app/api/admin/login/route.ts
  if (!password || password !== adminPassword) { ... }
  ```
  `.env.local`에 `ADMIN_PASSWORD=admin1234` 설정 확인됨 — 취약한 기본값 사용 중
- **취약 기준**:
  - 관리자 패스워드가 추측 가능한 단순 문자열 (`admin1234`)
  - 로그인 실패 횟수 제한 없음 (브루트포스 방지 부재)
  - 시간 지연(타이밍 공격 방어) 없이 즉시 응답
  - 멀티팩터 인증(MFA) 미적용
- **양호 기준**:
  - 강력한 패스워드 정책 (최소 12자 이상, 대소문자·숫자·특수문자 혼합)
  - 로그인 실패 5회 시 IP 잠금 또는 CAPTCHA 적용
  - 프로덕션 환경에서 TOTP 기반 MFA 필수
- **조치 방안**:
  ```typescript
  // app/api/admin/login/route.ts — 개선 예시
  import { timingSafeEqual } from 'crypto'

  // 1) 타이밍 안전 비교
  function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  }

  // 2) 실패 횟수 추적 (Redis 또는 메모리 기반)
  const loginAttempts = new Map<string, { count: number; lastAt: number }>()
  const MAX_ATTEMPTS  = 5
  const LOCKOUT_MS    = 15 * 60 * 1000  // 15분

  export async function POST(request: NextRequest) {
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
    const state = loginAttempts.get(ip)
    if (state && state.count >= MAX_ATTEMPTS) {
      if (Date.now() - state.lastAt < LOCKOUT_MS) {
        return NextResponse.json({ error: '잠시 후 다시 시도하세요' }, { status: 429 })
      }
      loginAttempts.delete(ip)
    }
    // ...
  }
  ```
  - `.env.local`에서 `ADMIN_SECRET_KEY`를 UUID v4 이상의 강력한 난수로 교체 필수

---

#### SEC-002 Admin 세션 쿠키 SameSite 설정 불완전

- **점검 목적**: 관리자 세션 쿠키의 SameSite 속성이 `lax`로 설정되어 CSRF 공격에 노출될 수 있음
- **위험도**: Medium
- **점검 기준**: 주요정보통신기반시설 가이드 - 쿠키 보안 속성 (WA-13)
- **점검 방법**: `lib/admin-auth.ts` 및 `proxy.ts` 쿠키 설정 검토
- **현황**:
  ```typescript
  // lib/admin-auth.ts
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',  // 개발환경에서 false
    sameSite: 'lax',   // strict가 더 안전
    maxAge: MAX_AGE_MS / 1000,
    path: '/',
  })
  ```
- **취약 기준**: 관리자용 세션 쿠키의 SameSite가 `lax` — 타 도메인 GET 요청에 쿠키 전송 허용
- **양호 기준**: 관리자 쿠키는 `sameSite: 'strict'` 적용
- **조치 방안**:
  ```typescript
  // lib/admin-auth.ts — 수정
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',  // lax → strict
    maxAge: MAX_AGE_MS / 1000,
    path: '/admin',      // 경로 범위 제한
  })
  ```

---

#### SEC-003 인증 우회: `/api/check-dup`, `/api/ddl/export`, `/api/search` 인증 없음

- **점검 목적**: 일부 API 엔드포인트가 인증 없이 내부 DB 데이터에 접근 가능
- **위험도**: High
- **점검 기준**: 주요정보통신기반시설 가이드 - 취약한 접근 통제 (WA-02) / OWASP A01
- **점검 방법**: 해당 라우트 파일에서 `requireAuth` 호출 여부 확인
- **현황**:
  ```typescript
  // app/api/check-dup/route.ts — requireAuth 없음
  export async function GET(req: NextRequest) {
    const table = req.nextUrl.searchParams.get('table') ?? 'dic'
    // ...DB 조회 직접 수행
  }

  // app/api/search/route.ts — requireAuth 없음
  export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams.get('q')
    // DA 메타DB 전체 조회
  }

  // app/api/ddl/export/route.ts — requireAuth 없음
  export async function POST(req: NextRequest) {
    // DA 메타DB에서 용어 정보 조회 후 DDL 생성
  }
  ```
- **취약 기준**: 인증 없이 내부 DA 메타DB 구조·데이터 노출
- **양호 기준**: 최소 USER 역할 인증 후 접근 허용
- **조치 방안**:
  ```typescript
  // app/api/check-dup/route.ts
  import { requireAuth } from '@/lib/auth-guard'

  export async function GET(req: NextRequest) {
    const auth = await requireAuth(req, ['USER', 'SUBMANAGER', 'MANAGER', 'MASTER', 'ADMIN'])
    if (!auth.ok) return auth.response
    // ...기존 로직
  }
  ```

---

#### SEC-004 Supabase Admin 클라이언트의 Server Component 직접 사용

- **점검 목적**: Service Role Key를 사용하는 `supabaseAdmin`이 Server Component에서 직접 사용되어 RLS를 우회함
- **위험도**: Medium
- **점검 기준**: 최소 권한 원칙 (Principle of Least Privilege)
- **점검 방법**: `supabaseAdmin` 사용 위치 검토
- **현황**:
  ```
  app/[locale]/(board)/layout.tsx — supabaseAdmin 직접 사용
  app/[locale]/(board)/[category]/page.tsx — supabaseAdmin 직접 사용
  app/[locale]/admin/(protected)/layout.tsx — supabaseAdmin 직접 사용
  ```
- **취약 기준**: `supabaseAdmin`(Service Role Key)이 페이지 Server Component에서 사용 — 의도치 않은 RLS 우회 가능
- **양호 기준**: `createSupabaseServer()` (anon key + 세션 쿠키) 사용 후 권한 부족 시만 `supabaseAdmin` 사용
- **조치 방안**:
  ```typescript
  // app/[locale]/(board)/layout.tsx — 개선
  import { createSupabaseServer } from '@/lib/supabase-server'

  // RLS가 적용된 일반 클라이언트로 조회
  const supabase = await createSupabaseServer()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, main_role')
    .eq('user_id', user.id)
    .maybeSingle()
  ```

---

#### SEC-005 Admin 패스워드 평문 저장 및 약한 기본값

- **점검 목적**: 운영 환경에서 관리자 패스워드가 추측 가능한 기본값으로 사용될 위험
- **위험도**: ~~Critical~~ → ✅ **조치 완료** (2026-06-03)
- **점검 기준**: 주요정보통신기반시설 가이드 - 기본 계정·패스워드 변경 (SS-01)
- **점검 방법**: `.env.local` 내 `ADMIN_PASSWORD` 값 검토
- **현황**: `ADMIN_PASSWORD`, `ADMIN_SECRET_KEY` 모두 주석 처리 완료 — 관리자 로그인 비활성화 (500 반환)
- **취약 기준**: 패스워드가 추측 가능하고 기본값 그대로 사용
- **양호 기준**: 재활성화 시 강력한 패스워드 설정 필수 (최소 16자 이상 무작위 문자열)
- **조치 방안**:
  ```bash
  # .env.local — 프로덕션 설정 예시
  ADMIN_PASSWORD=<32자 이상 무작위 문자열>
  ADMIN_SECRET_KEY=<UUID v4 형식 무작위 키>
  ```
  - CI/CD 파이프라인에서 기본값 감지 스크립트 추가:
  ```bash
  if [ "$ADMIN_PASSWORD" = "admin1234" ]; then
    echo "오류: 기본 관리자 패스워드 사용 금지" && exit 1
  fi
  ```

---

### 2.2 보안 헤더 및 CSP (A05: 보안 설정 오류)

---

#### SEC-006 보안 HTTP 헤더 완전 미설정

- **점검 목적**: `next.config.ts`에 보안 헤더가 전혀 설정되지 않아 클릭재킹·MIME 스니핑·XSS 공격에 취약
- **위험도**: High
- **점검 기준**: 주요정보통신기반시설 가이드 - 불필요한 정보 노출 방지 (WA-14) / OWASP A05
- **점검 방법**: `next.config.ts` 파일의 `headers()` 설정 확인
- **현황**:
  ```typescript
  // next.config.ts — 보안 헤더 없음
  const nextConfig: NextConfig = {}
  ```
  다음 헤더 모두 미설정:
  - `Content-Security-Policy`
  - `X-Frame-Options`
  - `X-Content-Type-Options`
  - `Strict-Transport-Security`
  - `Referrer-Policy`
  - `Permissions-Policy`
- **취약 기준**: 위 헤더 중 하나라도 설정 안 됨
- **양호 기준**: 모든 응답에 필수 보안 헤더 설정
- **조치 방안**:
  ```typescript
  // next.config.ts
  import type { NextConfig } from 'next'
  import createNextIntlPlugin from 'next-intl/plugin'

  const securityHeaders = [
    {
      key: 'X-DNS-Prefetch-Control',
      value: 'on',
    },
    {
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    },
    {
      key: 'X-Frame-Options',
      value: 'SAMEORIGIN',
    },
    {
      key: 'X-Content-Type-Options',
      value: 'nosniff',
    },
    {
      key: 'Referrer-Policy',
      value: 'strict-origin-when-cross-origin',
    },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=()',
    },
    {
      key: 'Content-Security-Policy',
      value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'",  // Next.js 요구사항
        `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL}`,
        "img-src 'self' data: blob: https:",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' https://fonts.gstatic.com",
        "frame-ancestors 'self'",
      ].join('; '),
    },
  ]

  const nextConfig: NextConfig = {
    async headers() {
      return [
        {
          source: '/(.*)',
          headers: securityHeaders,
        },
      ]
    },
  }

  const withNextIntl = createNextIntlPlugin('./i18n/request.ts')
  export default withNextIntl(nextConfig)
  ```

---

#### SEC-007 API 응답에 캐시 제어 헤더 미설정

- **점검 목적**: 인증이 필요한 API 응답이 중간 프록시에 캐싱될 위험
- **위험도**: Medium
- **점검 기준**: 주요정보통신기반시설 가이드 - 중요 정보 캐싱 방지 (WA-15)
- **점검 방법**: API 라우트 응답 헤더 검토
- **취약 기준**: 인증 필요 API 응답에 `Cache-Control: no-store` 미설정
- **양호 기준**: 모든 인증 필요 API에 `Cache-Control: no-store, no-cache` 설정
- **조치 방안**:
  ```typescript
  // lib/auth-guard.ts — requireAuth 성공 응답에 헬퍼 추가
  export function noCacheHeaders(): HeadersInit {
    return {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    }
  }

  // API 라우트 사용 예시
  return NextResponse.json(data, {
    headers: noCacheHeaders(),
  })
  ```

---

### 2.3 입력값 검증 및 인젝션 (A03: 인젝션)

---

#### SEC-008 게시글·댓글 본문 길이 미검증

- **점검 목적**: 게시글 제목·본문·댓글 내용에 최대 길이 제한이 없어 DoS 및 DB 부하 유발 가능
- **위험도**: Medium
- **점검 기준**: 주요정보통신기반시설 가이드 - 입력값 검증 (WA-04)
- **점검 방법**: `app/api/board/[category]/posts/route.ts`, `comments/route.ts` 검토
- **현황**:
  ```typescript
  // app/api/board/.../posts/route.ts
  const { post_ttl, post_cont } = body
  if (!post_ttl?.trim()) {
    return NextResponse.json({ error: '제목은 필수입니다' }, { status: 400 })
  }
  // post_cont 길이 제한 없음 — 수십 MB 입력 가능
  ```
- **취약 기준**: 본문 필드에 길이 제한 없음
- **양호 기준**: 제목 최대 200자, 본문 최대 10,000자, 댓글 최대 1,000자 검증
- **조치 방안**:
  ```typescript
  // app/api/board/[category]/posts/route.ts
  const MAX_TITLE_LEN   = 200
  const MAX_CONTENT_LEN = 10_000

  const { post_ttl, post_cont } = body

  if (!post_ttl?.trim()) {
    return NextResponse.json({ error: '제목은 필수입니다' }, { status: 400 })
  }
  if (post_ttl.length > MAX_TITLE_LEN) {
    return NextResponse.json({ error: `제목은 ${MAX_TITLE_LEN}자 이하여야 합니다` }, { status: 400 })
  }
  if (post_cont && post_cont.length > MAX_CONTENT_LEN) {
    return NextResponse.json({ error: `본문은 ${MAX_CONTENT_LEN}자 이하여야 합니다` }, { status: 400 })
  }
  ```

---

#### SEC-009 SQLite 쿼리 필드명 화이트리스트 검증 우회 가능성

- **점검 목적**: `check-dup` API에서 필드명을 화이트리스트로 검증하나 `q` 파라미터는 SQLite `LIKE` 쿼리에 직접 삽입됨
- **위험도**: Medium
- **점검 기준**: 주요정보통신기반시설 가이드 - SQL 인젝션 (WA-05) / OWASP A03
- **점검 방법**: `app/api/check-dup/route.ts`, `app/api/audit/route.ts` 검토
- **현황**:
  ```typescript
  // app/api/check-dup/route.ts — 필드명 화이트리스트 양호
  // app/api/audit/route.ts — q 파라미터 LIKE 쿼리 삽입 (파라미터 바인딩으로 안전)
  const kw = `%${q}%`
  params.push(kw, kw, kw)
  // better-sqlite3 prepare().all(...params) — 파라미터 바인딩으로 SQLi 방어 됨
  ```
  현재 better-sqlite3 파라미터 바인딩으로 SQLi는 방어되나, `q` 값의 길이·문자 검증 부재
- **취약 기준**: `q` 파라미터 무제한 입력 허용
- **양호 기준**: 검색어 최대 길이 제한 및 특수문자 검증
- **조치 방안**:
  ```typescript
  // app/api/audit/route.ts
  const MAX_Q_LEN = 100
  const q = sp.get('q')?.trim()?.slice(0, MAX_Q_LEN)
  // 이미 LIKE 파라미터 바인딩 사용 중 — 길이만 추가
  ```

---

#### SEC-010 파일 MIME 타입 클라이언트 신뢰 문제

- **점검 목적**: 첨부파일 업로드 시 `file.type`은 클라이언트가 지정하는 값으로, Magic Byte 검증 없이 MIME 타입만 확인
- **위험도**: Medium
- **점검 기준**: 주요정보통신기반시설 가이드 - 파일 업로드 취약점 (WA-08)
- **점검 방법**: `app/api/board/.../attachments/route.ts` 파일 검증 로직 검토
- **현황**:
  ```typescript
  // app/api/board/.../attachments/route.ts
  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: '지원하지 않는 파일 형식' }, { status: 400 })
  }
  // file.type은 클라이언트 제공값 — Content-Type 헤더 조작으로 우회 가능
  ```
  `application/octet-stream`, `application/sql` 허용 — 악성 스크립트 업로드 가능
- **취약 기준**: 클라이언트 제공 MIME 타입만으로 파일 검증, Magic Byte 미확인
- **양호 기준**: 서버에서 파일 헤더(Magic Byte) 검증 또는 `file-type` 라이브러리 사용
- **조치 방안**:
  ```typescript
  // app/api/board/.../attachments/route.ts
  // file-type 패키지 설치: npm install file-type
  import { fileTypeFromBuffer } from 'file-type'

  const buffer = Buffer.from(await file.arrayBuffer())
  const detected = await fileTypeFromBuffer(buffer)

  // Magic Byte로 탐지된 타입 기준 검증
  const trueMime = detected?.mime ?? file.type
  if (!ALLOWED_MIME_TYPES.has(trueMime)) {
    return NextResponse.json({ error: '파일 형식이 유효하지 않습니다' }, { status: 400 })
  }
  ```

---

#### SEC-011 파일명 경로 정규화 취약점 (Path Traversal)

- **점검 목적**: 첨부파일 경로 생성 시 파일명 정규화가 충분하지 않아 `..` 포함 파일명으로 경로 이탈 시도 가능
- **위험도**: Low
- **점검 기준**: 주요정보통신기반시설 가이드 - 디렉토리 트래버설 (WA-07)
- **점검 방법**: `app/api/board/.../attachments/route.ts` 파일 경로 생성 로직 검토
- **현황**:
  ```typescript
  const fl_pth = `${id}/${fileUuid}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  ```
  `.` 문자가 허용되어 `..`가 `__` 등으로 치환되지 않고 `..`로 남을 수 있음 → Supabase Storage 경로에 삽입됨
- **취약 기준**: 파일명 내 `..` 시퀀스 미제거
- **양호 기준**: `..` 포함 파일명 거부 또는 UUID만으로 경로 생성
- **조치 방안**:
  ```typescript
  // 파일명에서 확장자만 추출, 경로는 UUID로만 구성
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const fileUuid = randomUUID()
  const fl_pth = `${id}/${fileUuid}.${ext}`
  // 원본 파일명은 DB에만 저장 (fl_nm 컬럼)
  ```

---

### 2.4 환경 변수 및 시크릿 관리 (A02: 암호화 실패)

---

#### SEC-012 Supabase Service Role Key 클라이언트 노출 위험

- **점검 목적**: `lib/supabase.ts`의 `supabaseAdmin`은 서버 전용이나 잘못된 import로 클라이언트에 포함될 위험
- **위험도**: High
- **점검 기준**: 주요정보통신기반시설 가이드 - 중요 정보 노출 (WA-11)
- **점검 방법**: `lib/supabase.ts` 임포트 경로 및 사용 컨텍스트 검토
- **현황**:
  ```typescript
  // lib/supabase.ts
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  export const supabaseAdmin = createClient(url, svcKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  ```
  `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용이나 파일 자체는 `'use server'` 지시어 없음. 클라이언트 컴포넌트에서 실수로 import 시 번들에 포함될 수 있음
- **취약 기준**: Service Role Key가 클라이언트 번들에 포함되는 경우
- **양호 기준**: 서버 전용 모듈 분리 또는 `server-only` 패키지 사용
- **조치 방안**:
  ```typescript
  // lib/supabase.ts 상단에 추가
  import 'server-only'  // npm install server-only

  // 클라이언트에서 import 시 빌드 타임 오류 발생
  ```

---

#### SEC-013 Slack Webhook URL 하드코딩 노출

- **점검 목적**: `.env` 파일에 Slack Webhook URL이 실제 값으로 저장되어 있으며 이는 민감 정보
- **위험도**: Medium
- **점검 기준**: 주요정보통신기반시설 가이드 - 중요 정보 노출 (WA-11)
- **현황**: `.env` 파일에 `SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T0B5QR6K693/...` 실제 URL 포함됨
- **취약 기준**: 실제 시크릿 값이 `.env` 파일에 커밋될 경우
- **양호 기준**: `.env` 파일은 예시 형식만 유지, 실제 값은 `.env.local`에만 관리
- **조치 방안**:
  ```bash
  # .env — 예시 파일 (커밋 가능)
  SLACK_WEBHOOK_URL=https://hooks.slack.com/services/REPLACE_ME

  # .env.local — 실제 값 (커밋 불가, .gitignore에 포함)
  SLACK_WEBHOOK_URL=https://hooks.slack.com/services/실제-URL
  ```

---

#### SEC-014 Supabase Publishable Key 파일 직접 노출

- **점검 목적**: `.env` 파일에 Supabase URL과 Publishable Key 실제 값이 포함되어 있음
- **위험도**: Low
- **점검 기준**: 주요정보통신기반시설 가이드 - 중요 정보 노출
- **현황**: `.env` 및 `.env.local`에 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`와 `SUPABASE_SERVICE_ROLE_KEY` 실제 값 포함
- **취약 기준**: `.env` 파일이 공개 저장소에 커밋되거나 서버 디렉토리에 노출
- **양호 기준**: `.gitignore`에 `.env*` 패턴 등록 확인 (현재 등록됨), 단 실제 `.env` 내용이 예시값이어야 함

---

### 2.5 Open Redirect 및 URL 검증

---

#### SEC-015 OAuth 콜백 `next` 파라미터 Open Redirect 방어 검토

- **점검 목적**: `app/auth/callback/route.ts`의 `sanitizeNext()` 함수가 프로토콜 상대 URL을 올바르게 차단하는지 확인
- **위험도**: Low
- **점검 기준**: 주요정보통신기반시설 가이드 - Open Redirect (WA-16)
- **점검 방법**: `sanitizeNext()` 함수 로직 검토
- **현황**:
  ```typescript
  // app/auth/callback/route.ts — 양호한 구현
  function sanitizeNext(next: string | null): string {
    if (!next) return '/'
    if (next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')) {
      return next
    }
    return '/'
  }
  ```
  현재 구현은 양호하나, URL 인코딩된 `/%2F%2Fevil.com` 등의 우회 시도 방어 확인 필요
- **취약 기준**: URL 인코딩 등 우회 시 외부 도메인으로 redirect
- **양호 기준**: 추가 URL 디코딩 후 검증
- **조치 방안**:
  ```typescript
  function sanitizeNext(next: string | null): string {
    if (!next) return '/'
    try {
      // URL 인코딩 우회 방어
      const decoded = decodeURIComponent(next)
      if (decoded.startsWith('/') && !decoded.startsWith('//') && !decoded.startsWith('/\\')) {
        return decoded
      }
    } catch {
      // 디코딩 실패 시 기본값
    }
    return '/'
  }
  ```

---

### 2.6 Rate Limiting 및 DoS 방지 (A04: 불안전한 설계)

---

#### SEC-016 API 엔드포인트 Rate Limiting 전무

- **점검 목적**: 모든 API 엔드포인트에 요청 횟수 제한이 없어 DoS 및 브루트포스 공격에 취약
- **위험도**: High
- **점검 기준**: 주요정보통신기반시설 가이드 - DoS 방지 (WA-18) / OWASP A04
- **점검 방법**: `proxy.ts` 및 API 라우트 전체에서 Rate Limiting 코드 검색
- **현황**: 프로젝트 전체에 Rate Limiting 구현 없음 — `/api/admin/login`, `/api/i18n/translate` 등 고비용 엔드포인트 포함
- **취약 기준**: 인증·번역·파일 업로드 API에 요청 제한 없음
- **양호 기준**: IP 기반 또는 사용자 기반 Rate Limiting 적용
- **조치 방안**:
  ```typescript
  // proxy.ts 또는 별도 lib/rate-limit.ts

  // 메모리 기반 간단 구현 (프로덕션에서는 Redis 권장)
  const requestCounts = new Map<string, { count: number; resetAt: number }>()

  export function checkRateLimit(ip: string, limit = 100, windowMs = 60_000): boolean {
    const now = Date.now()
    const entry = requestCounts.get(ip)

    if (!entry || now > entry.resetAt) {
      requestCounts.set(ip, { count: 1, resetAt: now + windowMs })
      return true
    }
    if (entry.count >= limit) return false
    entry.count++
    return true
  }

  // proxy.ts에서 /api/ 경로 진입 전 검사
  // 또는 Vercel Edge Middleware / Upstash ratelimit 라이브러리 사용 권장
  ```

---

#### SEC-017 번역 API 비용 제한 미흡 (Google Translate 남용)

- **점검 목적**: `/api/i18n/translate` 엔드포인트는 Google Translate API 대량 호출 가능 — 비용 폭발 및 DoS 위험
- **위험도**: Medium
- **점검 기준**: 주요정보통신기반시설 가이드 - 자원 소모 공격 (WA-18)
- **현황**: ADMIN/MASTER 권한 제한은 있으나, 동시 호출 시 과도한 외부 API 비용 발생 가능
- **취약 기준**: 단위 시간 내 번역 요청 횟수 제한 없음
- **양호 기준**: 사용자별 일일 번역 요청 횟수 제한 + 실행 중 번역 잠금(mutex) 구현
- **조치 방안**:
  ```typescript
  // app/api/i18n/translate/route.ts
  // 번역 실행 중 플래그 (단순 메모리 잠금)
  let isTranslating = false

  export async function POST(req: NextRequest) {
    if (isTranslating) {
      return NextResponse.json({ error: '번역이 이미 진행 중입니다' }, { status: 429 })
    }
    isTranslating = true
    try {
      // ...기존 번역 로직
    } finally {
      isTranslating = false
    }
  }
  ```

---

### 2.7 에러 처리 및 정보 노출 (A09: 보안 로깅 실패)

---

#### SEC-018 내부 오류 메시지 직접 클라이언트 노출

- **점검 목적**: Supabase 오류 메시지가 그대로 클라이언트에 반환되어 내부 DB 구조 노출 가능
- **위험도**: Medium
- **점검 기준**: 주요정보통신기반시설 가이드 - 오류 처리 미흡 (WA-19)
- **점검 방법**: API 라우트 오류 처리 패턴 검토
- **현황**: 프로젝트 전반에서 다음 패턴 사용
  ```typescript
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  ```
  Supabase 내부 오류 메시지(테이블명, 컬럼명, 제약조건 등)가 그대로 응답에 포함됨
- **취약 기준**: 운영 환경에서 `error.message`를 그대로 클라이언트에 반환
- **양호 기준**: 운영 환경에서 일반화된 오류 메시지 반환, 상세 내용은 서버 로그에만 기록
- **조치 방안**:
  ```typescript
  // lib/api-error.ts
  export function handleDbError(error: unknown, context?: string): NextResponse {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[DB Error] ${context ?? ''}:`, message)

    return NextResponse.json(
      { error: '데이터 처리 중 오류가 발생했습니다' },
      { status: 500 }
    )
  }

  // API 라우트 사용 예시
  if (error) return handleDbError(error, 'board/posts GET')
  ```

---

#### SEC-019 감사 로그 기록 범위 한정 — API 접근 이력 미기록

- **점검 목적**: 현재 감사 로그는 DA 메타DB CRUD에만 적용되고, API 인증 실패·중요 데이터 조회 이력 미기록
- **위험도**: Medium
- **점검 기준**: 주요정보통신기반시설 가이드 - 보안 감사 로그 (CA-01) / OWASP A09
- **점검 방법**: `lib/audit.ts` 및 API 라우트 감사 로그 적용 범위 확인
- **현황**: `writeAudit()` 함수는 `STD_DIC`, `STD_DOM`, `APPROVAL` 등 DA 엔터티에만 적용. 인증 실패, 관리자 로그인, 역할 변경 등 보안 이벤트 미기록
- **취약 기준**: 인증 실패·권한 변경 이벤트가 감사 로그에 기록되지 않음
- **양호 기준**: 인증 실패(5회 이상), 관리자 로그인/로그아웃, 역할 변경 이벤트 감사 로그 기록
- **조치 방안**:
  ```typescript
  // lib/audit.ts — 보안 이벤트 로그 함수 추가
  export function writeSecurityAudit(event: {
    eventType: 'LOGIN_FAILURE' | 'ADMIN_LOGIN' | 'ROLE_CHANGE' | 'UNAUTHORIZED_ACCESS'
    actor: string
    target?: string
    detail?: string
    ip?: string
  }) {
    ensureTable()
    getDb().prepare(`
      INSERT INTO STD_AUDIT_LOG
        (LOG_ID, ENTITY_TYPE, ENTITY_ID, ENTITY_NM, ACTION_TYPE, BEFORE_DATA, AFTER_DATA, CHANGED_BY, CHANGED_AT)
      VALUES (?, 'SECURITY', ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `).run(
      randomUUID(),
      event.eventType,
      event.target ?? '',
      event.eventType,
      event.ip ? JSON.stringify({ ip: event.ip }) : null,
      event.detail ? JSON.stringify({ detail: event.detail }) : null,
      event.actor,
    )
  }
  ```

---

### 2.8 의존성 보안 (A06: 취약한 컴포넌트)

---

#### SEC-020 의존성 취약점 정기 점검 프로세스 미수립

- **점검 목적**: 프로젝트 의존성 패키지에 알려진 CVE가 있는지 정기적으로 점검하는 프로세스 확인
- **위험도**: Medium
- **점검 기준**: 주요정보통신기반시설 가이드 - 패치 관리 (PM-01) / OWASP A06
- **점검 방법**: `package.json` 버전 관리 정책 및 `npm audit` 실행 여부 확인
- **조치 방안**:
  ```bash
  # 현재 취약점 점검
  npm audit

  # 자동 수정 가능한 항목 패치
  npm audit fix

  # CI/CD 파이프라인에 추가 (GitHub Actions 예시)
  # .github/workflows/security.yml
  - name: 의존성 보안 점검
    run: npm audit --audit-level=high
  ```
  **중점 점검 패키지:**
  - `@vitalets/google-translate-api` — 비공식 API 래퍼, 불안정성 위험
  - `better-sqlite3` — 로컬 파일 기반 DB, SQL 인젝션 위험 (현재 파라미터 바인딩 사용 중 — 양호)
  - `next-intl` — 파일시스템 접근 포함

---

#### SEC-021 `@vitalets/google-translate-api` 비공식 라이브러리 사용

- **점검 목적**: 비공식 Google Translate API 래퍼 사용으로 Google TOS 위반 및 서비스 중단 위험
- **위험도**: Low
- **점검 기준**: 공식 API 사용 권고
- **현황**: `translate()` 함수는 Google 공식 API가 아닌 웹 스크래핑 방식 사용 가능성
- **조치 방안**: Google Cloud Translation API 공식 SDK로 전환 (`@google-cloud/translate`)

---

### 2.9 Next.js 16 특화 보안 점검

---

#### SEC-022 `proxy.ts` API 경로 인증 완전 우회

- **점검 목적**: `proxy.ts`에서 `/api/` 경로는 미들웨어 인증 검사를 전혀 거치지 않아 1차 방어선 부재
- **위험도**: Medium
- **점검 기준**: 심층 방어(Defense in Depth) 원칙
- **점검 방법**: `proxy.ts` 라우팅 로직 검토
- **현황**:
  ```typescript
  // proxy.ts
  if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) {
    return NextResponse.next({ request })  // 미들웨어 인증 완전 우회
  }
  ```
  모든 `/api/` 요청은 각 API 라우트의 `requireAuth()`에만 의존 — SEC-003처럼 인증 누락 시 무방비 노출
- **취약 기준**: 인증 없는 API 엔드포인트가 존재할 경우 (`/api/check-dup`, `/api/search`, `/api/ddl/export`)
- **양호 기준**: SEC-003 항목 수정으로 모든 API 엔드포인트에 `requireAuth` 적용 시 허용 가능한 설계
- **조치 방안**: SEC-003 조치와 연계하여 모든 API 엔드포인트의 `requireAuth` 적용 완료 후 현 설계 유지

---

#### SEC-023 `revalidateTag` 두 번째 인수 에러 무시 패턴

- **점검 목적**: Next.js 16에서 `revalidateTag`의 두 번째 인수(cacheLife 프로필)가 필수인데, 오류를 `try-catch`로 무시
- **위험도**: Low
- **점검 기준**: Next.js 16 Breaking Changes 준수
- **현황**:
  ```typescript
  try { revalidateTag('i18n', 'max') } catch {}
  // 빈 catch로 캐시 무효화 실패 무시
  ```
  캐시 무효화 실패 시 사용자가 stale 데이터를 볼 수 있음
- **조치 방안**:
  ```typescript
  try {
    revalidateTag('i18n', 'max')
  } catch (e) {
    // 캐시 무효화 실패를 로그로 기록
    console.error('[캐시 무효화 실패]', e)
  }
  ```

---

#### SEC-024 관리자 인증 이중 채널 설계 취약점

- **점검 목적**: 관리자 Back Office가 Supabase JWT와 별도의 HMAC 세션 쿠키 두 가지 인증 방식을 혼용하여 보안 정책 일관성 부재
- **위험도**: Medium
- **점검 기준**: 주요정보통신기반시설 가이드 - 통일된 접근 통제 정책 (AM-03)
- **현황**:
  - Supabase JWT: 일반 사용자 인증 및 일부 관리자 API
  - HMAC 세션 쿠키: 관리자 Back Office 전용 (`/api/admin/*`, `/api/approval/*`)
  - `requireAuth()`는 둘 다 처리하나, `isAdminSession()`만 쓰는 API 존재 (Bearer 토큰 없이 관리자 쿠키만으로 인가)
- **취약 기준**: 동일 관리자 기능에 두 가지 인증 경로가 동시 존재하여 정책 일관성 문제
- **양호 기준**: 관리자 API도 `requireAuth()` 통합 처리 + 관리자 쿠키는 세션 증명 보조 수단으로만 사용

---

### 2.10 파일 시스템 보안

---

#### SEC-025 `messages/*.json` 파일 직접 쓰기 — 서버 파일 시스템 접근

- **점검 목적**: 번역·동기화 API가 서버의 `messages/` 디렉토리에 직접 파일을 쓰는 구조는 서버 파일시스템 무결성 위험
- **위험도**: Medium
- **점검 기준**: 주요정보통신기반시설 가이드 - 서버 파일 접근 제어 (SC-03)
- **점검 방법**: `app/api/i18n/translate/route.ts`, `app/api/i18n/sync/route.ts` 검토
- **현황**:
  ```typescript
  // app/api/i18n/translate/route.ts
  const messagesDir = path.join(process.cwd(), 'messages')
  const outPath = safeLangPath(messagesDir, lang_cd)
  await fs.writeFile(outPath, JSON.stringify(obj, null, 2), 'utf8')
  ```
  ADMIN/MASTER 권한 확인 후 실행 (양호). 단 `safeLangPath()` 검증은 현재 구현 양호
- **취약 기준**: `lang_cd` 파라미터 검증 우회 시 임의 경로 파일 쓰기 가능
- **양호 기준**: 현재 `LANG_CD_RE` 정규식 + 절대 경로 비교 검증 유지. 추가로 파일 쓰기 전 디렉토리 존재 확인
- **조치 방안**: 현재 구현(`safeLangPath`) 유지, 별도 변경 불요. 단 서버리스 환경(Vercel 등) 배포 시 파일시스템 쓰기 불가 — 향후 Supabase Storage 또는 Edge Config으로 전환 검토

---

## 3. 우선순위별 조치 계획

### 3.1 즉시 조치 필요 (Critical) — ✅ 모두 완료

| ID | 항목 | 담당 영역 | 상태 |
|----|------|----------|------|
| SEC-001 | 관리자 브루트포스 방어 | `app/api/admin/login/route.ts` | ✅ 완료 (Rate Limiting + timingSafeEqual) |
| SEC-005 | 기본 관리자 패스워드 `admin1234` | `.env.local` | ✅ 완료 (계정 삭제) |

### 3.2 72시간 이내 조치 (High) — ✅ 모두 완료

| ID | 항목 | 담당 영역 | 상태 |
|----|------|----------|------|
| SEC-003 | 인증 없는 API 3개 | `app/api/` 3개 파일 | ✅ 완료 (requireAuth 추가) |
| SEC-006 | 보안 HTTP 헤더 미설정 | `next.config.ts` | ✅ 완료 (6종 헤더 설정) |
| SEC-012 | Service Role Key 노출 위험 | `lib/supabase.ts` | ✅ 완료 (server-only 적용) |
| SEC-016 | API Rate Limiting 전무 | `lib/rate-limit.ts` 신규 | ✅ 완료 (10회/분 제한) |

### 3.3 30일 이내 조치 (Medium)

| ID | 항목 |
|----|------|
| SEC-002 | Admin 쿠키 SameSite `lax` → `strict` 변경 |
| SEC-004 | Server Component에서 `supabaseAdmin` 직접 사용 제거 |
| SEC-007 | API 응답 캐시 제어 헤더 추가 |
| SEC-008 | 게시글·댓글 입력 길이 검증 추가 |
| SEC-010 | 파일 Magic Byte 검증 추가 |
| SEC-013 | Slack Webhook URL `.env` 파일 정리 |
| SEC-017 | 번역 API 동시 실행 잠금 구현 |
| SEC-018 | 내부 오류 메시지 일반화 처리 |
| SEC-019 | 보안 이벤트 감사 로그 확장 |
| SEC-024 | 관리자 인증 이중 채널 설계 정비 |
| SEC-025 | 파일시스템 직접 쓰기 → 스토리지 전환 검토 |

### 3.4 90일 이내 개선 (Low/Info)

| ID | 항목 |
|----|------|
| SEC-009 | 검색어 최대 길이 제한 추가 |
| SEC-011 | 파일 경로 UUID 전용 생성으로 변경 |
| SEC-015 | Open Redirect URL 인코딩 우회 방어 강화 |
| SEC-020 | `npm audit` CI/CD 통합 |
| SEC-021 | 비공식 구글 번역 라이브러리 공식 SDK 전환 |
| SEC-022 | API 경로 심층 방어 보완 |
| SEC-023 | `revalidateTag` 오류 로깅 개선 |

---

## 4. 보안 요구사항 체크리스트

### Critical / High (즉시 ~ 72시간)

- [x] SEC-001: Rate Limiting (10회/분) + `timingSafeEqual` 타이밍 공격 방어 (2026-06-03)
- [x] SEC-005: `ADMIN_PASSWORD`, `ADMIN_SECRET_KEY` 삭제 — 관리자 로그인 비활성화 (2026-06-03)
- [x] SEC-003: `/api/check-dup`, `/api/search`, `/api/ddl/export` `requireAuth` 추가 (2026-06-03)
- [x] SEC-006: `next.config.ts` 보안 헤더 6종 (CSP·HSTS·X-Frame-Options 등) 설정 (2026-06-03)
- [x] SEC-012: `lib/supabase.ts` `import 'server-only'` 추가 (2026-06-03)
- [x] SEC-016: `lib/rate-limit.ts` 신규 생성, admin login 적용 (2026-06-03)

### Medium (30일 이내)

- [x] SEC-002: Admin 쿠키 `sameSite: 'strict'` 변경 완료 (2026-06-03)
- [x] SEC-004: Server Component 3곳 `supabaseAdmin` → `supabase`(RLS) 교체 완료 (2026-06-03)
- [x] SEC-007: `noCacheHeaders()` 유틸리티 생성 + 게시글 API 적용 (2026-06-03)
- [x] SEC-008: 게시글 제목 200자·본문 10,000자 길이 검증 추가 (2026-06-03)
- [x] SEC-010: `file-type` Magic Byte 검증 + UUID 경로 생성 (2026-06-03)
- [x] SEC-013: `.env` Slack Webhook URL 예시값으로 교체 (2026-06-03)
- [x] SEC-017: 번역 API `isTranslating` 뮤텍스 + `try-finally` 구현 (2026-06-03)
- [x] SEC-018: `lib/api-error.ts` `handleDbError()` 도입, 게시글 API 적용 (2026-06-03)
- [x] SEC-019: `writeSecurityAudit()` 추가, admin login 실패/성공 기록 (2026-06-03)

### Low / Info (90일 이내)

- [x] SEC-009: 검색어 최대 100자 `.slice(0, 100)` 적용 — search·audit API (2026-06-03)
- [x] SEC-011: 첨부파일 경로 UUID 전용 생성 완료 (2026-06-03)
- [x] SEC-015: `sanitizeNext()` `decodeURIComponent` 우회 방어 추가 (2026-06-03)
- [x] SEC-020: `npm audit --audit-level=high` 통과 — moderate 2건(PostCSS/Next.js 내부, 수동 수정 불가) (2026-06-03)
- [ ] SEC-021: `@vitalets/google-translate-api` → 공식 Google Cloud SDK 전환 검토
- [x] SEC-023: `revalidateTag` 빈 catch → 로깅 추가 완료 (2026-06-03)

---

## 5. 컴플라이언스 매핑

| 주요정보통신기반시설 가이드 항목 | 대응 점검 ID | 상태 |
|-------------------------------|------------|------|
| WA-01: 취약한 인증 메커니즘 | SEC-001, SEC-005 | 미흡 |
| WA-02: 취약한 접근 통제 | SEC-003, SEC-004 | 미흡 |
| WA-04: 입력값 검증 미흡 | SEC-008, SEC-009 | 미흡 |
| WA-05: SQL 인젝션 | SEC-009 | 양호 (파라미터 바인딩 적용) |
| WA-07: 디렉토리 트래버설 | SEC-011, SEC-025 | 부분 양호 |
| WA-08: 파일 업로드 취약점 | SEC-010, SEC-011 | 미흡 |
| WA-11: 중요 정보 노출 | SEC-012, SEC-013, SEC-014 | 미흡 |
| WA-13: 쿠키 보안 속성 | SEC-002 | 부분 양호 |
| WA-14: 불필요한 정보 노출 | SEC-006, SEC-018 | 미흡 |
| WA-15: 중요 정보 캐싱 | SEC-007 | 미흡 |
| WA-16: 오픈 리다이렉트 | SEC-015 | 부분 양호 |
| WA-18: DoS 방지 | SEC-016, SEC-017 | 미흡 |
| WA-19: 오류 처리 미흡 | SEC-018 | 미흡 |
| CA-01: 보안 감사 로그 | SEC-019 | 부분 적용 |
| AM-03: 통일된 접근 통제 | SEC-022, SEC-024 | 미흡 |
| PM-01: 패치 관리 | SEC-020, SEC-021 | 미흡 |
| SS-01: 기본 계정·패스워드 | SEC-005 | ✅ 완료 (계정 삭제) |

---

## 6. 부록: 환경별 보안 체크포인트

### 6.1 개발 환경 (Development)

```bash
# 개발 환경 시작 전 확인사항
1. .env.local 파일이 .gitignore에 포함되어 있는지 확인
2. ADMIN_PASSWORD가 기본값 admin1234인 경우 로컬에서만 사용
3. npm audit 실행하여 고위험 취약점 없음 확인
```

### 6.2 스테이징/프로덕션 배포 전 체크리스트

```bash
# 배포 전 필수 확인
1. ADMIN_PASSWORD != 'admin1234'
2. ADMIN_SECRET_KEY가 32자 이상 무작위 문자열
3. SUPABASE_SERVICE_ROLE_KEY가 환경 변수에만 설정 (코드에 하드코딩 금지)
4. next.config.ts에 보안 헤더 설정 확인
5. npm audit --audit-level=high 통과
6. Supabase RLS 정책 활성화 확인
```

### 6.3 Supabase 보안 설정 권고사항

```sql
-- Supabase Dashboard > Authentication > Settings
-- 1. 이메일 인증 필수화 (Email Confirm 활성화)
-- 2. 세션 만료 시간: 최대 24시간 권장
-- 3. 패스워드 최소 길이: 8자 이상 설정
-- 4. RLS 정책: 모든 테이블 활성화 확인

-- Storage 버킷 정책 확인 (보안 취약 설정 예시 → 수정 필요)
-- avatars 버킷: Public Read 활성화됨 → 필요 시 Private으로 변경
-- board-attachments 버킷: Public URL 생성됨 → Signed URL로 변경 검토
```

---

## 7. 참고 자료

- 주요정보통신기반시설 기술적 취약점 분석·평가 방법 상세가이드 (한국인터넷진흥원)
- OWASP Top 10 2021: https://owasp.org/Top10/
- Next.js 16 Security: https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
- Supabase Security Practices: https://supabase.com/docs/guides/auth
- CWE-287: Improper Authentication
- CWE-79: Cross-site Scripting
- CWE-89: SQL Injection
- CWE-22: Path Traversal
- CVE Database: https://nvd.nist.gov/
