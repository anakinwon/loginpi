# Pi + Google 계정 연동 구현 스킬

Next.js 16 App Router 코드베이스에서 Pi Network 계정과 Google 계정을 연동하는 완전한 구현 가이드.
Pi Browser와 일반 브라우저의 기술적 제약을 극복하는 "6자리 OTP 코드" 방식의 전체 구현.

> **전제**: Pi 인증이 완료되어 있어야 한다. → `.claude/skills/pi_auth/SKILL.md` 참고

---

## 목차

0. [요청 프롬프트](#0-요청-프롬프트)
1. [왜 6자리 코드 방식인가 (설계 결정 배경)](#1-왜-6자리-코드-방식인가)
2. [전체 아키텍처](#2-전체-아키텍처)
3. [DB 스키마 (Supabase)](#3-db-스키마)
4. [환경변수](#4-환경변수)
5. [생성 파일 목록](#5-생성-파일-목록)
6. [구현 코드 전체](#6-구현-코드-전체)
7. [핵심 함정 (반드시 읽을 것)](#7-핵심-함정)
8. [완료 체크리스트](#8-완료-체크리스트)
9. [다른 프로젝트에서 재사용하기](#9-다른-프로젝트에서-재사용하기)

---

## 0. 요청 프롬프트

```
You are an expert Pi Network + Google OAuth full-stack developer.
Implement Pi + Google account linking in this Next.js 16 App Router codebase.

Requirements:
- Pi Browser generates a 6-digit one-time code (expires in 10 min)
- Regular browser (with Google session) redeems the code to link accounts
- Single Supabase 'users' table: Pi row is the source of truth, Google fields are added to it
- Pi Browser WebView cannot open external browser tabs — use clipboard copy to pass the link URL
- Brute-force protection: max 5 attempts per code
- Fallback auth: X-Pi-Token header when Pi Browser WebView fails to store cookies

Do not explain. Write all file changes directly.
```

---

## 1. 왜 6자리 코드 방식인가

### 기술적 제약

Pi Network 앱은 Pi Browser의 **WebView 안에서** 실행된다.

| 시도 방법 | 결과 | 이유 |
|---|---|---|
| `window.open(googleAuthUrl)` | WebView 내에서 열림 | Pi Browser는 외부 브라우저를 열지 않음 |
| `<a target="_blank">` | 동일 WebView에서 열림 | WebView `target="_blank"` = 새 WebView 탭 |
| 딥링크 / URL Scheme | 미지원 | Pi Browser WebView 제한 |
| **클립보드 복사 + 안내** | ✅ **유일하게 동작** | 사용자가 직접 일반 브라우저에 붙여넣기 |

### 6자리 코드 방식의 흐름

```
[Pi Browser]                     [일반 브라우저 Chrome/Safari]
    │                                        │
    │  1. Pi 로그인 상태에서                  │
    │     "연동 코드 생성" 클릭              │
    │                                        │
    │  2. 서버: 6자리 코드 생성              │
    │     link_codes 테이블 저장              │
    │     (10분 만료, 최대 5회 시도)          │
    │                                        │
    │  3. "연동하러가기 → (URL 복사)" 클릭   │
    │     https://yourapp.com/link?code=123456│
    │     ← 클립보드에 복사                  │
    │                                        │
    │     (사용자가 직접 붙여넣기)  ─────────►│
    │                                        │
    │                               4. /link 페이지 열림
    │                                  code=123456 자동 채워짐
    │                                        │
    │                               5. Google 로그인 (없으면 자동 이동)
    │                                        │
    │                               6. "Google 연동" 버튼 클릭
    │                                  POST /api/auth/link-complete
    │                                  { code: "123456" }
    │                                        │
    │                               7. 서버: 코드 검증 → users 업데이트
    │                                  Pi row에 google_id, google_email 추가
    │                                        │
    ▼                                        ▼
    연동 완료! 이후 어느 방법으로 로그인해도 동일 사용자
```

---

## 2. 전체 아키텍처

### users 테이블 단일화 전략

```
연동 전:
  users row (Pi만 있음)
  ├── id: "uuid-xxxx"
  ├── pi_uid: "abc123"
  ├── pi_username: "alice"
  ├── google_id: NULL         ← 비어있음
  └── google_email: NULL      ← 비어있음

연동 후:
  users row (Pi + Google 합쳐짐)
  ├── id: "uuid-xxxx"         ← 동일 row, 동일 UUID
  ├── pi_uid: "abc123"
  ├── pi_username: "alice"
  ├── google_id: "1234567890" ← Google OAuth sub
  └── google_email: "alice@gmail.com"
```

**핵심 원칙**: Pi row를 원본(source of truth)으로, Google 필드를 덧씌우는 방식.
별도 Google row를 만들지 않는다. 두 테이블 join이 필요 없어 단순하다.

### 파일 맵

```
src/
├── auth.ts                              # NextAuth.js 설정 (JWT 전략 + Supabase 연동)
├── types/
│   └── next-auth.d.ts                   # NextAuth 타입 확장 (sub, id 추가)
├── lib/
│   ├── users.ts                         # users 테이블 헬퍼 (server-only)
│   ├── supabase-admin.ts                # Supabase admin 클라이언트 (lazy init)
│   └── pi-session-crypto.ts             # HMAC 서명/검증 (Pi 세션 쿠키용)
├── app/
│   ├── api/auth/
│   │   ├── [...nextauth]/route.ts        # NextAuth 핸들러
│   │   ├── link-start/route.ts          # Pi Browser → 6자리 코드 생성
│   │   ├── link-complete/route.ts       # 일반 브라우저 → 코드 검증 + DB 연동
│   │   └── link-status/route.ts         # 연동 상태 조회 (양 환경 공통)
│   └── link/
│       ├── page.tsx                     # 코드 생성(Pi) / 코드 입력(일반) 자동 분기
│       └── complete/page.tsx            # 연동 완료 처리
└── components/
    ├── account-link-card.tsx            # 연동 상태 + 코드 생성/입력 UI 카드
    ├── google-login-button.tsx          # Google 로그인 버튼 (일반 브라우저 전용)
    └── google-user-card.tsx             # Google 사용자 정보 카드
```

---

## 3. DB 스키마

### Supabase SQL (순서대로 실행)

```sql
-- ① users 테이블
CREATE TABLE IF NOT EXISTS users (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_uid            TEXT        UNIQUE,
  pi_username       TEXT,
  pi_wallet_address TEXT,
  google_id         TEXT        UNIQUE,
  google_email      TEXT,
  google_name       TEXT,
  google_image      TEXT,
  display_name      TEXT        NOT NULL DEFAULT '',
  role              TEXT        NOT NULL DEFAULT 'USER'
                                CHECK (role IN ('ADMIN', 'MASTER', 'MANAGER', 'USER')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ② link_codes 테이블 (6자리 OTP 코드)
CREATE TABLE IF NOT EXISTS link_codes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT        NOT NULL UNIQUE,
  pi_user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  attempt_count INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_link_codes_code       ON link_codes(code);
CREATE INDEX IF NOT EXISTS idx_link_codes_expires_at ON link_codes(expires_at);

-- ③ RLS 비활성화 (서버 전용 Service Role Key로만 접근)
-- 또는 RLS 활성화 후 service_role만 허용:
ALTER TABLE users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE link_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_users"      ON users      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_link_codes" ON link_codes FOR ALL USING (true) WITH CHECK (true);
-- 위 정책은 service_role key로만 접근하므로 사실상 외부 차단 효과
```

### 테이블 관계

```
users (1) ──── (N) link_codes
  id    ←────── pi_user_id
```

---

## 4. 환경변수

```env
# NextAuth.js
AUTH_SECRET=<32자 이상 랜덤 시크릿>
# 생성: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# Google OAuth (Google Cloud Console → API 및 서비스 → OAuth 2.0)
GOOGLE_CLIENT_ID=<숫자>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-<랜덤>

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # 서버 전용, NEXT_PUBLIC_ 절대 금지

# Pi 인증 (기존 — pi_auth SKILL 참고)
PI_SESSION_SECRET=<32자+ HMAC 시크릿>
```

### Google Cloud Console 설정 (수동 필요)

1. [console.cloud.google.com](https://console.cloud.google.com) → API 및 서비스 → 사용자 인증 정보
2. "OAuth 2.0 클라이언트 ID" 생성 → 유형: 웹 애플리케이션
3. 승인된 리디렉션 URI 추가:
   - 개발: `http://localhost:3000/api/auth/callback/google`
   - 프로덕션: `https://your-domain.vercel.app/api/auth/callback/google`

---

## 5. 생성 파일 목록

| 파일 | 역할 | 신규/수정 |
|---|---|---|
| `src/auth.ts` | NextAuth 설정 (Google Provider + JWT 콜백) | 신규 |
| `src/types/next-auth.d.ts` | session.user에 sub, id 타입 추가 | 신규 |
| `src/lib/supabase-admin.ts` | Service Role Key 기반 admin 클라이언트 | 신규 |
| `src/lib/users.ts` | users 테이블 CRUD (server-only) | 신규 |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth 핸들러 export | 신규 |
| `src/app/api/auth/link-start/route.ts` | 6자리 코드 생성 API | 신규 |
| `src/app/api/auth/link-complete/route.ts` | 코드 검증 + DB 연동 API | 신규 |
| `src/app/api/auth/link-status/route.ts` | 연동 상태 조회 API | 신규 |
| `src/app/link/page.tsx` | 코드 생성/입력 페이지 | 신규 |
| `src/app/link/complete/page.tsx` | 연동 완료 페이지 | 신규 |
| `src/components/account-link-card.tsx` | 연동 UI 카드 | 신규 |
| `src/components/google-login-button.tsx` | Google 로그인 버튼 | 신규 |
| `src/components/google-user-card.tsx` | Google 사용자 카드 | 신규 |
| `src/app/layout.tsx` | SessionProvider 추가 | 수정 |
| `src/env.ts` | AUTH_SECRET, GOOGLE_*, SUPABASE_* 스키마 추가 | 수정 |

---

## 6. 구현 코드 전체

### `src/auth.ts`

```typescript
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: 'jwt' },  // DB 세션 X — users 테이블 충돌 방지
  callbacks: {
    async jwt({ token, profile, account }) {
      // Google 로그인 시점에만 실행 (profile, account 있을 때)
      if (account?.provider === 'google' && profile?.sub) {
        try {
          // 이미 Pi row와 연동된 경우 → 그 Pi row UUID를 userId로 사용
          // 연동 전이면 null → session.user.id는 sub(Google raw ID) fallback
          const { data } = await getSupabaseAdmin()
            .from('users')
            .select('id')
            .eq('google_id', profile.sub as string)
            .maybeSingle()
          token.userId = data?.id ?? null
        } catch {
          token.userId = null
        }
      }
      return token
    },
    session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          // 연동 완료 후: users row UUID / 연동 전: Google OAuth sub (fallback)
          id: (token.userId as string) ?? token.sub ?? '',
          // sub는 Google OAuth raw sub — link-complete에서 google_id로 사용
          sub: token.sub,
        },
      }
    },
  },
  pages: {
    signIn: '/',  // 로그인 페이지를 홈으로 (또는 '/login'으로 변경)
  },
})
```

---

### `src/types/next-auth.d.ts`

```typescript
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string    // users row UUID (연동 후) 또는 Google sub (연동 전)
      sub?: string  // Google OAuth raw sub — link-complete에서 google_id로 사용
    }
  }
}
```

---

### `src/lib/supabase-admin.ts`

```typescript
import 'server-only'
import { createClient } from '@supabase/supabase-js'

let _client: ReturnType<typeof createClient> | null = null

// ⚠️ lazy init: 빌드 시점에 env var 없어도 오류 없음
// SUPABASE_SERVICE_ROLE_KEY는 서버에서만 사용 — 절대 NEXT_PUBLIC_ 사용 금지
export function getSupabaseAdmin() {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Supabase 환경변수 미설정')
    _client = createClient(url, key, {
      auth: { persistSession: false },
    })
  }
  return _client
}
```

---

### `src/lib/users.ts`

```typescript
import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

export interface UserRow {
  id: string
  pi_uid: string | null
  pi_username: string | null
  pi_wallet_address: string | null
  google_id: string | null
  google_email: string | null
  google_name: string | null
  google_image: string | null
  display_name: string
  role: string
  created_at: string
  updated_at: string
}

// Pi 로그인 시 호출 — pi_uid 기준 upsert (항상 1건 유지)
export async function upsertPiUser(piUser: {
  uid: string
  username: string | null
  walletAddress: string | null
}): Promise<UserRow> {
  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .upsert(
      {
        pi_uid: piUser.uid,
        pi_username: piUser.username,
        pi_wallet_address: piUser.walletAddress,
        display_name: piUser.username ?? `pi_${piUser.uid.slice(0, 8)}`,
      },
      { onConflict: 'pi_uid' }
    )
    .select()
    .single()

  if (error) throw new Error(error.message ?? 'Pi 사용자 저장 실패')
  return data as UserRow
}

// link-complete 호출 시 — Pi row에 Google 필드 UPDATE
// Google 전용 row를 별도 생성하지 않음
export async function updatePiUserWithGoogle(
  piUserId: string,
  googleUser: {
    id: string      // Google OAuth sub (숫자 형식 문자열)
    email: string
    name: string | null
    image: string | null
  }
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('users')
    .update({
      google_id: googleUser.id,
      google_email: googleUser.email,
      google_name: googleUser.name,
      google_image: googleUser.image,
    })
    .eq('id', piUserId)

  if (error) throw new Error(error.message ?? '계정 연동 실패')
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const { data } = await getSupabaseAdmin()
    .from('users')
    .select()
    .eq('id', id)
    .single()
  return (data as UserRow) ?? null
}
```

---

### `src/app/api/auth/[...nextauth]/route.ts`

```typescript
import { handlers } from '@/auth'

export const { GET, POST } = handlers
```

---

### `src/app/api/auth/link-start/route.ts`

Pi Browser에서 호출 — 6자리 코드를 생성해 `link_codes` 테이블에 저장.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { verifyPayload } from '@/lib/pi-session-crypto'
import { upsertPiUser } from '@/lib/users'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { PiSessionUser } from '@/types/pi-session'

interface PiUserDTO {
  uid: string
  username?: string
}

function randomSixDigit(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

// X-Pi-Token 헤더 fallback: Pi Network API로 직접 검증 후 userId 반환
async function verifyPiTokenAndGetUserId(accessToken: string): Promise<string | null> {
  try {
    const piRes = await fetch('https://api.minepi.com/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!piRes.ok) return null

    const piUser = (await piRes.json()) as PiUserDTO
    if (!piUser?.uid) return null

    const dbUser = await upsertPiUser({
      uid: piUser.uid,
      username: piUser.username ?? null,
      walletAddress: null,
    })
    return dbUser.id
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.PI_SESSION_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'PI_SESSION_SECRET 미설정' }, { status: 500 })
  }

  // ── 경로 1: pi_session 쿠키 검증 ──────────────────────────────
  let userId: string | null = null
  const piCookie = request.cookies.get('pi_session')?.value

  if (piCookie) {
    const piUser = verifyPayload<PiSessionUser>(piCookie, secret)
    if (piUser?.uid) {
      // userId가 쿠키에 포함된 경우 사용, 없으면 DB 조회
      userId = (piUser as PiSessionUser & { userId?: string }).userId ?? null
      if (!userId) {
        const dbUser = await upsertPiUser({
          uid: piUser.uid,
          username: piUser.username,
          walletAddress: piUser.walletAddress,
        }).catch(() => null)
        userId = dbUser?.id ?? null
      }
    }
  }

  // ── 경로 2: X-Pi-Token 헤더 (Pi Browser WebView 쿠키 저장 실패 시 fallback) ──
  if (!userId) {
    const piToken = request.headers.get('X-Pi-Token')
    if (piToken) userId = await verifyPiTokenAndGetUserId(piToken)
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'Pi 로그인이 필요합니다' },
      { status: 401 }
    )
  }

  // 6자리 코드 생성 — 충돌 시 최대 3회 재시도
  const supabase = getSupabaseAdmin()
  let code = ''

  for (let attempt = 0; attempt < 3; attempt++) {
    code = randomSixDigit()
    const { error } = await supabase.from('link_codes').insert({
      code,
      pi_user_id: userId,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),  // 10분
    })
    if (!error) break
    if (attempt === 2) {
      return NextResponse.json({ error: '코드 생성 실패' }, { status: 500 })
    }
  }

  return NextResponse.json({ code })
}
```

---

### `src/app/api/auth/link-complete/route.ts`

일반 브라우저에서 Google 세션을 가진 채로 호출 — 코드 검증 후 Pi row에 Google 필드 UPDATE.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { updatePiUserWithGoogle } from '@/lib/users'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const { code } = body as { code?: string }
  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: '유효한 6자리 코드를 입력해주세요' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // 코드 조회
  const { data: linkCode, error: fetchErr } = await supabase
    .from('link_codes')
    .select('pi_user_id, expires_at, used_at, attempt_count')
    .eq('code', code)
    .single()

  if (fetchErr || !linkCode) {
    return NextResponse.json({ error: '유효하지 않은 코드입니다' }, { status: 400 })
  }
  if (linkCode.used_at) {
    return NextResponse.json({ error: '이미 사용된 코드입니다' }, { status: 400 })
  }
  if (new Date(linkCode.expires_at) < new Date()) {
    return NextResponse.json({ error: '코드가 만료됐습니다 (10분 초과)' }, { status: 400 })
  }
  if (linkCode.attempt_count >= 5) {
    return NextResponse.json(
      { error: '시도 횟수 초과. Pi Browser에서 새 코드를 생성하세요.' },
      { status: 400 }
    )
  }

  // 브루트포스 방지: 시도 횟수 즉시 증가 (Google 로그인 확인 전에)
  await supabase
    .from('link_codes')
    .update({ attempt_count: linkCode.attempt_count + 1 })
    .eq('code', code)

  // Google 세션 확인
  const googleSession = await auth()
  if (!googleSession?.user) {
    return NextResponse.json({ error: 'Google 로그인이 필요합니다' }, { status: 401 })
  }

  // ⚠️ session.user.sub = Google OAuth raw sub (숫자 형식 문자열)
  //    session.user.id  = users row UUID (연동 후) 또는 sub (연동 전)
  //    google_id 컬럼에는 반드시 sub를 사용 — id는 연동 전후 값이 다름
  const googleSub = googleSession.user.sub
  if (!googleSub || !googleSession.user.email) {
    return NextResponse.json({ error: 'Google 인증 정보가 없습니다' }, { status: 400 })
  }

  try {
    await updatePiUserWithGoogle(linkCode.pi_user_id, {
      id: googleSub,
      email: googleSession.user.email,
      name: googleSession.user.name ?? null,
      image: googleSession.user.image ?? null,
    })

    await supabase
      .from('link_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('code', code)

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '계정 연동 실패' },
      { status: 500 }
    )
  }
}
```

---

### `src/app/api/auth/link-status/route.ts`

Pi Browser, 일반 브라우저 양쪽에서 호출 — 연동 상태 반환.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { verifyPayload } from '@/lib/pi-session-crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { PiSessionUser } from '@/types/pi-session'

interface PiUserDTO { uid: string; username?: string }

export interface LinkStatusResponse {
  linked: boolean
  piUsername: string | null
  googleEmail: string | null
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin()

  // ── 경로 1: Google 세션 기반 조회 ──────────────────────────────
  const googleSession = await auth()
  if (googleSession?.user) {
    const googleSub = googleSession.user.sub ?? googleSession.user.id
    const googleEmail = googleSession.user.email
    let row: { pi_uid: string | null; pi_username: string | null; google_email: string | null } | null = null

    // 1-A: google_id (OAuth sub)로 조회
    if (googleSub) {
      const { data } = await supabase
        .from('users')
        .select('pi_uid, pi_username, google_email')
        .eq('google_id', googleSub)
        .maybeSingle()
      row = data
    }

    // 1-B: google_id 불일치 시 google_email로 fallback
    // (NextAuth가 UUID 저장하는 경우 대비)
    if (!row && googleEmail) {
      const { data } = await supabase
        .from('users')
        .select('pi_uid, pi_username, google_email')
        .eq('google_email', googleEmail)
        .maybeSingle()
      row = data
    }

    if (row) {
      return NextResponse.json<LinkStatusResponse>({
        linked: !!row.pi_uid,
        piUsername: row.pi_username ?? null,
        googleEmail: row.google_email ?? null,
      })
    }
  }

  // ── 경로 2: pi_session 쿠키 기반 조회 ──────────────────────────
  const secret = process.env.PI_SESSION_SECRET
  const piCookie = request.cookies.get('pi_session')?.value
  if (piCookie && secret) {
    const piUser = verifyPayload<PiSessionUser>(piCookie, secret)
    if (piUser?.uid) {
      const { data } = await supabase
        .from('users')
        .select('pi_uid, pi_username, google_id, google_email')
        .eq('pi_uid', piUser.uid)
        .maybeSingle()

      if (data) {
        return NextResponse.json<LinkStatusResponse>({
          linked: !!data.google_id,
          piUsername: data.pi_username ?? null,
          googleEmail: data.google_email ?? null,
        })
      }
    }
  }

  // ── 경로 3: X-Pi-Token 헤더 (Pi Browser WebView 쿠키 미전송 fallback) ──
  const piToken = request.headers.get('X-Pi-Token')
  if (piToken) {
    try {
      const piRes = await fetch('https://api.minepi.com/v2/me', {
        headers: { Authorization: `Bearer ${piToken}` },
      })
      if (piRes.ok) {
        const piUser = (await piRes.json()) as PiUserDTO
        if (piUser?.uid) {
          const { data } = await supabase
            .from('users')
            .select('pi_uid, pi_username, google_id, google_email')
            .eq('pi_uid', piUser.uid)
            .maybeSingle()

          if (data) {
            return NextResponse.json<LinkStatusResponse>({
              linked: !!data.google_id,
              piUsername: data.pi_username ?? null,
              googleEmail: data.google_email ?? null,
            })
          }
        }
      }
    } catch { /* Pi Network API 오류 무시 */ }
  }

  return NextResponse.json<LinkStatusResponse>({
    linked: false,
    piUsername: null,
    googleEmail: null,
  })
}
```

---

### `src/app/link/page.tsx` 핵심 포인트

```typescript
'use client'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn as googleSignIn, useSession } from 'next-auth/react'
import { usePiAuth } from '@/components/pi-auth-provider'

function LinkPageInner() {
  const { user: piUser, piAccessToken, isLoading: piLoading } = usePiAuth()
  const { data: googleSession } = useSession()
  const params = useSearchParams()

  // ⚠️ URL ?code= 파라미터로 코드 자동 채우기
  // Pi Browser에서 "연동하러가기" 클릭 → URL 복사 → 일반 브라우저에 붙여넣기
  // → /link?code=123456 접속 시 코드 자동 입력
  const codeFromUrl = (params.get('code') ?? '').replace(/\D/g, '').slice(0, 6)
  const [inputCode, setInputCode] = useState(codeFromUrl)

  // piUser 있으면 코드 생성 UI, 없으면 코드 입력 UI
  const showGenerate = !!piUser

  // ... 나머지 구현
}

export default function LinkPage() {
  return (
    <Suspense fallback={<div>...</div>}>
      <LinkPageInner />
    </Suspense>
  )
}
```

---

### `src/app/layout.tsx` SessionProvider 추가

```typescript
import { SessionProvider } from 'next-auth/react'
import { auth } from '@/auth'

export default async function RootLayout({ children }) {
  // ⚠️ 서버에서 미리 세션을 가져와 SessionProvider에 전달
  // → 클라이언트 초기 로딩 flicker 방지
  const session = await auth()

  return (
    <html lang='ko' suppressHydrationWarning>
      <body>
        <Script src='https://sdk.minepi.com/pi-sdk.js' strategy='beforeInteractive' />
        <SessionProvider session={session}>
          <PiAuthProvider>
            {children}
          </PiAuthProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
```

---

### `src/env.ts` 환경변수 스키마 추가

```typescript
import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    PI_SESSION_SECRET: z.string().min(32),
    AUTH_SECRET: z.string().min(32),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_PI_SANDBOX: z.enum(['true', 'false']).optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  },
  runtimeEnv: {
    PI_SESSION_SECRET: process.env.PI_SESSION_SECRET,
    AUTH_SECRET: process.env.AUTH_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_PI_SANDBOX: process.env.NEXT_PUBLIC_PI_SANDBOX,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  emptyStringAsUndefined: true,
})
```

---

## 7. 핵심 함정

### ❌ 함정 1 — Pi Browser WebView에서 target='_blank' 사용 (절대 금지)

**증상**: Google 로그인이 Pi Browser WebView 안에서 열려서 실패

**원인**: Pi Browser는 `window.open()`, `<a target="_blank">` 모두 WebView 내부에서 열린다.
Google OAuth는 일반 브라우저에서만 동작.

**잘못된 코드**:
```typescript
// ❌ WebView 내부에서 열림 — Google 로그인 불가
<a href={`/link?code=${code}`} target="_blank">연동하러가기</a>
router.push(`/link?code=${code}`)  // WebView 내 이동
```

**올바른 방법**: URL 클립보드 복사 + 사용자 안내
```typescript
// ✅ 클립보드 복사 → 사용자가 직접 일반 브라우저에 붙여넣기
async function copyLinkUrl() {
  await navigator.clipboard.writeText(`${origin}/link?code=${code}`)
}
// UI: "Chrome, Safari 등 일반 브라우저 주소창에 붙여넣어 접속하세요"
```

---

### ❌ 함정 2 — google_id 형식 불일치 (google_email fallback 필수)

**증상**: 연동 후 link-status가 `linked: false`를 반환

**원인**:
- Google OAuth sub: `"123456789012345678901"` (숫자 형식 문자열)
- NextAuth가 DB에 저장할 때: `"28becf1b-6e3b-4be9-88dd-19eab4de2eb5"` (UUID 형식)
- DB의 `google_id` 컬럼값과 `session.user.sub` 값이 다름

**올바른 방법**: link-status API에서 `google_email` fallback 쿼리 추가
```typescript
// 1-A: sub로 조회
if (googleSub) { ...eq('google_id', googleSub)... }

// 1-B: 불일치 시 email로 fallback
if (!row && googleEmail) { ...eq('google_email', googleEmail)... }
```

**예방**: link-complete API에서 `session.user.sub`을 사용해야 함 (session.user.id 아님)
```typescript
// ✅ 반드시 sub 사용 — id는 연동 전후 값이 다름
const googleSub = googleSession.user.sub
await updatePiUserWithGoogle(piUserId, { id: googleSub, ... })
```

---

### ❌ 함정 3 — Pi Browser WebView 쿠키 저장 실패

**증상**: Pi Browser에서 link-start 호출 시 401 ("Pi 로그인이 필요합니다")
실제로는 Pi 로그인이 되어있는 상태

**원인**: Pi Browser WebView는 서드파티 쿠키를 저장하지 못하는 경우가 있어
`pi_session` 쿠키가 다음 요청에서 전송되지 않음.

**해결**: pi-auth-provider에서 `piAccessToken` 상태를 저장해두고,
API 호출 시 `X-Pi-Token` 헤더로 함께 전송
```typescript
// account-link-card.tsx
const { piAccessToken } = usePiAuth()

fetch('/api/auth/link-start', {
  method: 'POST',
  credentials: 'include',
  headers: {
    ...(piAccessToken ? { 'X-Pi-Token': piAccessToken } : {}),
  },
})
```

link-start API에서 이 헤더를 받아 Pi Network API로 직접 검증 (위 구현 코드 참고).

---

### ❌ 함정 4 — NextAuth DB Adapter 사용 시 users 테이블 충돌

**증상**: NextAuth가 자동으로 users 테이블에 row를 생성해 Pi row와 중복

**원인**: NextAuth Database 전략(Adapter)을 사용하면 Google 로그인 시
자체 스키마로 users 테이블에 row를 insert함 → Pi row와 충돌.

**해결**: `session: { strategy: 'jwt' }` 사용 (Database 전략 X)
```typescript
export const { handlers, auth } = NextAuth({
  session: { strategy: 'jwt' },  // ✅ JWT — DB에 세션 저장 안 함
  // adapter: ... 절대 추가 금지
})
```

---

### ❌ 함정 5 — session.user.id vs session.user.sub 혼동

**증상**: link-complete 후 link-status가 여전히 미연동으로 표시

**원인**: `session.user.id`와 `session.user.sub`의 의미가 다름

| 값 | 연동 전 | 연동 후 |
|---|---|---|
| `session.user.id` | Google sub (숫자) | users row UUID |
| `session.user.sub` | Google sub (숫자) | Google sub (숫자, **변하지 않음**) |

`google_id` 컬럼에는 반드시 `session.user.sub`을 저장해야 함.
`session.user.id`는 연동 전후로 값이 바뀌어 조회에 사용 불가.

---

### ❌ 함정 6 — link_codes 테이블 브루트포스 미처리

**증상**: 공격자가 000000~999999 순차 시도로 타인 계정 탈취 가능

**해결**: `attempt_count` 컬럼으로 최대 5회 시도 제한
```typescript
if (linkCode.attempt_count >= 5) {
  return 400  // "시도 횟수 초과"
}
// ⚠️ Google 세션 확인 전에 attempt_count 먼저 증가
await supabase
  .from('link_codes')
  .update({ attempt_count: linkCode.attempt_count + 1 })
  .eq('code', code)
```

---

## 8. 완료 체크리스트

### DB

- [ ] Supabase에서 `users` 테이블 생성 (위 SQL 실행)
- [ ] Supabase에서 `link_codes` 테이블 생성 (위 SQL 실행)
- [ ] RLS 정책 설정 (service_role 전용)

### Google OAuth 설정

- [ ] Google Cloud Console → OAuth 2.0 클라이언트 생성
- [ ] 리디렉션 URI 등록: `http://localhost:3000/api/auth/callback/google`
- [ ] 리디렉션 URI 등록: `https://your-domain/api/auth/callback/google`

### 파일 생성

- [ ] `src/auth.ts` — JWT 전략, `session.user.sub` 포함 여부 확인
- [ ] `src/types/next-auth.d.ts` — `id`, `sub` 타입 확장
- [ ] `src/lib/supabase-admin.ts` — lazy init 패턴
- [ ] `src/lib/users.ts` — `upsertPiUser`, `updatePiUserWithGoogle` 함수
- [ ] `src/app/api/auth/[...nextauth]/route.ts`
- [ ] `src/app/api/auth/link-start/route.ts` — X-Pi-Token fallback 포함
- [ ] `src/app/api/auth/link-complete/route.ts` — `sub` 사용, attempt_count 처리
- [ ] `src/app/api/auth/link-status/route.ts` — google_email fallback 포함
- [ ] `src/app/link/page.tsx` — `?code=` 파라미터 자동 채우기, Suspense 래핑
- [ ] `src/components/account-link-card.tsx` — URL 복사 버튼
- [ ] `src/env.ts` — 모든 환경변수 스키마 추가

### 파일 수정

- [ ] `src/app/layout.tsx` — `SessionProvider` + 서버 세션 pre-fetch 추가

### 환경변수

- [ ] `.env.local` — `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- [ ] `.env.local` — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Vercel 환경변수 — 위 항목 모두 프로덕션 값 설정

### 동작 검증

- [ ] Pi Browser: "연동 코드 생성" → 6자리 코드 표시
- [ ] Pi Browser: "연동하러가기 → (URL 복사)" → 클립보드에 URL 복사됨
- [ ] 일반 브라우저: 복사된 URL 접속 → `/link?code=XXXXXX` → 코드 자동 채워짐
- [ ] 일반 브라우저: Google 로그인 → "Google 연동" 버튼 클릭 → 연동 완료
- [ ] 홈 화면: 계정 연동 카드에 "✓ Pi + Google 계정 연동 완료" 표시
- [ ] Pi Browser WebView 쿠키 실패 케이스: X-Pi-Token 헤더 fallback 동작 확인

---

## 9. 다른 프로젝트에서 재사용하기

### 필수 복사 파일 목록

```
# 이 파일들을 그대로 복사 후 환경변수만 변경하면 동작
src/auth.ts
src/types/next-auth.d.ts
src/lib/supabase-admin.ts
src/lib/users.ts
src/lib/pi-session-crypto.ts         # Pi 인증 스킬에서 생성
src/app/api/auth/[...nextauth]/route.ts
src/app/api/auth/link-start/route.ts
src/app/api/auth/link-complete/route.ts
src/app/api/auth/link-status/route.ts
src/app/link/page.tsx
src/components/account-link-card.tsx
```

### 커스터마이징 포인트

| 항목 | 기본값 | 변경 방법 |
|---|---|---|
| 코드 유효 시간 | 10분 | `link-start/route.ts`의 `10 * 60 * 1000` 변경 |
| 최대 시도 횟수 | 5회 | `link-complete/route.ts`의 `>= 5` 변경 |
| 코드 자리수 | 6자리 | `randomSixDigit()` 함수에서 `1_000_000` 변경 |
| 역할 종류 | ADMIN/MASTER/MANAGER/USER | `users` 테이블 CHECK 제약 변경 |
| 기본 역할 | USER | `users` 테이블 DEFAULT 변경 |

### 패키지 설치

```bash
pnpm add next-auth@beta @supabase/supabase-js
```

### 빠른 시작 명령어

```
1. Supabase에서 users + link_codes 테이블 생성 (섹션 3 SQL 실행)
2. Google Cloud Console에서 OAuth 2.0 클라이언트 생성
3. 환경변수 설정 (섹션 4)
4. 파일 복사 (섹션 5 목록)
5. pnpm dev → /link 페이지 테스트
```
