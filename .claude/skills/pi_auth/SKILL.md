# Pi Network 사용자 인증 구현 스킬

Next.js 15 App Router 코드베이스에 Pi Network 인증을 완전하게 구현하는 가이드.
이 문서만 참고하면 처음부터 실수 없이 구현할 수 있다.

---

## 목차


0. [요청 프롬프트]
1. [아키텍처 개요](#1-아키텍처-개요)
2. [Pi SDK 스펙](#2-pi-sdk-스펙)
3. [환경변수](#3-환경변수)
4. [생성 파일 목록](#4-생성-파일-목록)
5. [구현 코드 전체](#5-구현-코드-전체)
6. [핵심 함정 (반드시 읽을 것)](#6-핵심-함정-반드시-읽을-것)
7. [보안 요구사항](#7-보안-요구사항)
8. [완료 체크리스트](#8-완료-체크리스트)
9. [일반로그인 & 구글로그인과 연동]



---

## 0. [요청 프롬프트]

```
You are an expert Pi Network full-stack developer. Implement Pi Network user authentication in this codebase now - write the actual file changes, do not produce a guide or explanation. Reference: https://pi-apps.github.io/pi-sdk-docs/quick-start/genai/Authentication.

Behavior requirements:
- Trigger Pi authentication automatically when the app loads (also add a sign-in button so user can manually trigger).
- Treat Pi.init(...) as a Promise; await it fully before calling Pi.authenticate(...).
- Use the "username" scope.
- Send the returned access token to the backend, which must validate it by calling GET https://api.minepi.com/v2/me with Authorization: Bearer <accessToken> before establishing a session. No Pi Network API key is required for this flow.
```


```
이렇게 요청하면, 관련 파일이 자동으로 생성됨.
```
---

---

## 1. 아키텍처 개요

### 인증 흐름

```
Pi Browser / 일반 브라우저
        │
        ▼
[app/layout.tsx]
  Pi SDK Script (beforeInteractive)
  PiAuthProvider (React Context)
        │
        ▼ useEffect 마운트 시
        │
   Pi Browser?
   ├── YES → signIn() 즉시 호출 ──────────────────────────┐
   └── NO  → GET /api/auth/pi (쿠키 세션 복원)           │
                  │                                       │
              세션 있음 → setUser()                       │
              세션 없음 → 로그인 버튼 대기                │
                                                          ▼
                                            window.Pi.init({ version:'2.0', sandbox })
                                                          │
                                            window.Pi.authenticate(['username','wallet_address'], ...)
                                                          │
                                            POST /api/auth/pi
                                            body: { accessToken, walletAddress }
                                                          │
                                            GET https://api.minepi.com/v2/me
                                            Authorization: Bearer <accessToken>
                                                          │
                                            HMAC-SHA256 서명 쿠키 발급
                                            pi_session = base64url(payload).sig
```

### 파일 맵

```
프로젝트 루트/
├── types/
│   └── pi-network.d.ts          # window.Pi, PiUserDTO 등 전역 TypeScript 타입
src/
├── types/
│   └── pi-session.ts            # PiSessionUser 공유 타입 (서버/클라이언트 공용)
├── env.ts                       # PI_SESSION_SECRET, NEXT_PUBLIC_PI_SANDBOX 검증
├── app/
│   ├── layout.tsx               # Pi SDK Script + PiAuthProvider 래핑
│   └── api/auth/pi/
│       └── route.ts             # GET(세션복원) POST(검증+쿠키) DELETE(로그아웃)
└── components/
    ├── pi-auth-provider.tsx     # React Context + 자동/수동 인증 로직
    ├── pi-login-button.tsx      # 헤더용 간결 버튼
    └── pi-user-card.tsx         # 전체 사용자 정보 카드 (홈페이지용)
```

---

## 2. Pi SDK 스펙

### 요청 가능한 Scope

| Scope | 반환 데이터 | 출처 |
|---|---|---|
| (없음) | `uid` | `/v2/me` (항상 제공) |
| `username` | `username` | `/v2/me` |
| `wallet_address` | `wallet_address` | **`Pi.authenticate` 결과만** — `/v2/me` 미제공 |
| `payments` | 결제 기능 활성화 | 추가 사용자 데이터 없음 |

### `/v2/me` 응답 (UserDTO)

```typescript
interface PiUserDTO {
  uid: string
  username?: string           // 'username' scope 허용 시
  credentials: {
    scopes: string[]          // 부여된 scope 배열
    valid_until: {
      timestamp: number       // Unix timestamp (ms)
      iso8601: string         // "2025-06-04T12:00:00Z"
    }
  }
}
```

> **⚠️ 중요**: `wallet_address`는 `/v2/me`에 없다.
> `Pi.authenticate` 결과의 `auth.user.wallet_address`로만 얻을 수 있으며,
> 클라이언트에서 POST body로 서버에 전달해야 한다.

### `Pi.authenticate` 반환 타입 (PiAuthResult)

```typescript
interface PiAuthResult {
  accessToken: string
  user: {
    uid: string
    username: string           // 'username' scope
    wallet_address?: string    // 'wallet_address' scope
  }
}
```

### SDK 메서드

```typescript
// 앱 로드 시 한 번만 호출. 반드시 await 완료 후 authenticate 호출
window.Pi.init({ version: '2.0', sandbox: boolean }): void | Promise<void>

// scopes 배열로 요청할 데이터 선언
window.Pi.authenticate(scopes: string[], onIncompletePaymentFound: Function): Promise<PiAuthResult>

// 마이그레이션된 지갑 주소 목록 (별도 API, 선택사항)
window.Pi.wallet.getUserMigratedWalletAddresses(): Promise<{ wallets: { publicKey: string }[] }>
```

---

## 3. 환경변수

### `.env.local` (개발 환경)

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Pi App Studio 테스트: true / 프로덕션 메인넷: false 또는 미설정
# ⚠️ localhost에서는 코드가 자동으로 sandbox:true 적용 (env var 무관)
NEXT_PUBLIC_PI_SANDBOX=true

# HMAC-SHA256 세션 쿠키 서명 시크릿 (필수, 32자 이상)
# 생성: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
PI_SESSION_SECRET=여기에_랜덤_시크릿_입력


### vercel.app 운영환경 환경

NEXT_PUBLIC_PI_SANDBOX=false
NEXT_PUBLIC_APP_URL=https://loginpi.vercel.app
PI_SESSION_SECRET=Zc2OsjL2WEOnZuRNNcfacwc6ceyUY23oVIqXR93KUuA

```

### `src/env.ts` 검증 스키마

```typescript
import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    PI_SESSION_SECRET: z.string().min(32, 'PI_SESSION_SECRET는 최소 32자 이상이어야 합니다'),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_PI_SANDBOX: z.enum(['true', 'false']).optional(),
  },
  runtimeEnv: {
    PI_SESSION_SECRET: process.env.PI_SESSION_SECRET,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_PI_SANDBOX: process.env.NEXT_PUBLIC_PI_SANDBOX,
  },
  emptyStringAsUndefined: true,
})
```

### Vercel 배포 시 필수 환경변수

| 변수명 | 값 | 비고 |
|---|---|---|
| `PI_SESSION_SECRET` | 새 랜덤 32자+ 시크릿 | 로컬과 다른 값 권장 |
| `NEXT_PUBLIC_APP_URL` | `https://your-domain.vercel.app` | |
| `NEXT_PUBLIC_PI_SANDBOX` | `false` | 프로덕션 메인넷 |

---

## 4. 생성 파일 목록

| 파일 | 역할 | 비고 |
|---|---|---|
| `types/pi-network.d.ts` | 전역 TypeScript 타입 | 루트에 생성, tsconfig `**/*.ts`로 자동 포함 |
| `src/types/pi-session.ts` | 서버/클라이언트 공유 세션 타입 | Node.js import 없음 → 클라이언트도 import 가능 |
| `src/app/api/auth/pi/route.ts` | 백엔드 인증 API | HMAC 서명/검증 포함 |
| `src/components/pi-auth-provider.tsx` | React Context + 인증 로직 | `'use client'` |
| `src/components/pi-login-button.tsx` | 헤더용 간결 버튼 | `'use client'` |
| `src/components/pi-user-card.tsx` | 전체 사용자 정보 카드 | `'use client'` |

### 수정이 필요한 기존 파일

| 파일 | 변경 내용 |
|---|---|
| `src/app/layout.tsx` | Pi SDK `<Script>` + `<PiAuthProvider>` 래핑 추가 |
| `src/env.ts` | `PI_SESSION_SECRET`, `NEXT_PUBLIC_PI_SANDBOX` 스키마 추가 |
| `next.config.ts` | `X-Frame-Options` 헤더 제거 (Pi Browser iframe 차단 방지) |

---

## 5. 구현 코드 전체

### `types/pi-network.d.ts`

```typescript
declare global {
  interface PiInitOptions {
    version: string
    sandbox?: boolean
  }

  interface PiUserDTO {
    uid: string
    username?: string
    credentials: {
      scopes: string[]
      valid_until: {
        timestamp: number
        iso8601: string
      }
    }
  }

  interface PiUser {
    uid: string
    username: string
    wallet_address?: string   // 'wallet_address' scope 허용 시
  }

  interface PiAuthResult {
    accessToken: string
    user: PiUser
  }

  interface PiIncompletePayment {
    identifier: string
    [key: string]: unknown
  }

  interface PiSDK {
    init(options: PiInitOptions): void | Promise<void>
    authenticate(
      scopes: string[],
      onIncompletePaymentFound: (payment: PiIncompletePayment) => void
    ): Promise<PiAuthResult>
  }

  interface Window {
    Pi?: PiSDK
  }
}

export {}
```

---

### `src/types/pi-session.ts`

```typescript
export interface PiSessionUser {
  uid: string
  displayName: string
  username: string | null
  walletAddress: string | null   // Pi.authenticate 결과에서만 수신
  scopesGranted: string[]
  tokenValidUntil: string
}
```

---

### `src/app/api/auth/pi/route.ts`

```typescript
import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import type { PiSessionUser } from '@/types/pi-session'

const PI_API_URL = 'https://api.minepi.com/v2/me'
const MAX_COOKIE_AGE_SEC = 7 * 24 * 60 * 60

function getSecret(): string {
  const secret = process.env.PI_SESSION_SECRET
  if (!secret) throw new Error('PI_SESSION_SECRET 환경변수가 설정되지 않았습니다')
  return secret
}

// 페이로드를 base64url 인코딩 후 HMAC-SHA256 서명: "<payload>.<sig>"
function signPayload(data: object, secret: string): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

// 서명 검증 후 페이로드 반환. 위변조 시 null
function verifyPayload<T>(value: string, secret: string): T | null {
  const dot = value.lastIndexOf('.')
  if (dot === -1) return null
  const payload = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  try {
    // timingSafeEqual: 바이트 단위 비교로 타이밍 공격 방지
    const sigBytes = Buffer.from(sig, 'base64url')
    const expectedBytes = Buffer.from(expected, 'base64url')
    if (sigBytes.length !== expectedBytes.length) return null
    if (!timingSafeEqual(sigBytes, expectedBytes)) return null
  } catch {
    return null
  }
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

// 현재 세션 반환 (쿠키 서명 검증 + 만료 확인)
export async function GET(request: NextRequest) {
  const cookieValue = request.cookies.get('pi_session')?.value
  if (!cookieValue) return NextResponse.json({ user: null })

  let secret: string
  try { secret = getSecret() } catch {
    return NextResponse.json({ error: 'PI_SESSION_SECRET 미설정' }, { status: 500 })
  }

  const user = verifyPayload<PiSessionUser>(cookieValue, secret)
  if (!user) {
    const res = NextResponse.json({ user: null })
    res.cookies.delete('pi_session')
    return res
  }

  if (new Date(user.tokenValidUntil) < new Date()) {
    const res = NextResponse.json({ user: null })
    res.cookies.delete('pi_session')
    return res
  }

  return NextResponse.json({ user })
}

// Pi accessToken 검증 후 서명된 세션 쿠키 발급
export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다' }, { status: 400 })
  }

  const { accessToken, walletAddress } = body as {
    accessToken?: string
    walletAddress?: string | null
  }
  if (!accessToken || typeof accessToken !== 'string') {
    return NextResponse.json({ error: 'accessToken이 필요합니다' }, { status: 400 })
  }

  let secret: string
  try { secret = getSecret() } catch {
    return NextResponse.json({ error: 'PI_SESSION_SECRET 미설정' }, { status: 500 })
  }

  // API 키 없이 accessToken만으로 Pi Network 사용자 검증
  let piUser: PiUserDTO
  try {
    const piRes = await fetch(PI_API_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!piRes.ok) {
      return NextResponse.json({ error: 'Pi 토큰 검증 실패' }, { status: 401 })
    }
    piUser = (await piRes.json()) as PiUserDTO
  } catch {
    return NextResponse.json({ error: 'Pi Network API 연결 실패' }, { status: 502 })
  }

  // Pi 토큰 만료 시각을 쿠키 maxAge로 적용 (최대 7일)
  const tokenExpiresAt = new Date(piUser.credentials.valid_until.iso8601).getTime()
  const secondsUntilExpiry = Math.floor((tokenExpiresAt - Date.now()) / 1000)
  const maxAge = Math.min(Math.max(secondsUntilExpiry, 0), MAX_COOKIE_AGE_SEC)

  const sessionData: PiSessionUser = {
    uid: piUser.uid,
    displayName: piUser.username ?? `pi_${piUser.uid.slice(0, 8)}`,
    username: piUser.username ?? null,
    // wallet_address는 /v2/me 미제공 → 클라이언트 Pi.authenticate 결과에서 수신
    walletAddress: typeof walletAddress === 'string' ? walletAddress : null,
    scopesGranted: piUser.credentials.scopes,
    tokenValidUntil: piUser.credentials.valid_until.iso8601,
  }

  const signed = signPayload(sessionData, secret)
  const response = NextResponse.json({ success: true, user: sessionData })
  response.cookies.set('pi_session', signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge,
    path: '/',
  })

  return response
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete('pi_session')
  return response
}
```

---

### `src/components/pi-auth-provider.tsx`

```typescript
'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { PiSessionUser } from '@/types/pi-session'

export type { PiSessionUser }

interface PiAuthContextValue {
  user: PiSessionUser | null
  isLoading: boolean
  isInPiBrowser: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  error: string | null
}

const PiAuthContext = createContext<PiAuthContextValue | null>(null)

function detectPiBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /PiBrowser/i.test(navigator.userAgent)
}

// ⚠️ localhost는 항상 sandbox:true — Pi App Studio "Verify My App"이
// Pi.init({ sandbox: false }) 상태에서 Pi.authenticate 호출을 감지하지 못함
function detectSandbox(): boolean {
  if (typeof window !== 'undefined') {
    const { hostname } = window.location
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true
  }
  return process.env.NEXT_PUBLIC_PI_SANDBOX === 'true'
}

export function PiAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PiSessionUser | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isInPiBrowser, setIsInPiBrowser] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signIn = useCallback(async () => {
    if (!window.Pi) {
      setError('Pi SDK가 로드되지 않았습니다')
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      // ⚠️ Pi.init()은 void | Promise<void> — Promise.resolve()로 감싸야 안전하게 await 가능
      await Promise.resolve(
        window.Pi.init({ version: '2.0', sandbox: detectSandbox() })
      )

      // ⚠️ wallet_address는 /v2/me 미제공 → 여기서만 얻을 수 있음
      const auth = await window.Pi.authenticate(
        ['username', 'wallet_address'],
        (payment) => { console.warn('미완료 Pi 결제 발견:', payment.identifier) }
      )

      const res = await fetch('/api/auth/pi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: auth.accessToken,
          walletAddress: auth.user.wallet_address ?? null,
        }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? '서버 인증 실패')
      }

      const data = (await res.json()) as { user: PiSessionUser }
      setUser(data.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pi 인증 중 오류가 발생했습니다')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    await fetch('/api/auth/pi', { method: 'DELETE' })
    setUser(null)
  }, [])

  useEffect(() => {
    const inPi = detectPiBrowser()
    setIsInPiBrowser(inPi)

    if (inPi) {
      // ⚠️ Pi Browser에서는 GET 세션 복원 없이 즉시 signIn() 호출
      // GET 요청을 먼저 기다리면 "Verify My App"이 Pi.authenticate 호출을 감지하지 못함
      signIn()
    } else {
      // 일반 브라우저: 서명된 세션 쿠키로 상태 복원
      fetch('/api/auth/pi')
        .then((res) => res.json())
        .then((data: { user: PiSessionUser | null }) => {
          if (data.user) setUser(data.user)
        })
        .catch(() => {})
    }
  }, [signIn])

  return (
    <PiAuthContext.Provider value={{ user, isLoading, isInPiBrowser, signIn, signOut, error }}>
      {children}
    </PiAuthContext.Provider>
  )
}

export function usePiAuth(): PiAuthContextValue {
  const ctx = useContext(PiAuthContext)
  if (!ctx) throw new Error('usePiAuth는 PiAuthProvider 내부에서 사용해야 합니다')
  return ctx
}
```

---

### `src/components/pi-user-card.tsx` (전체 사용자 정보 표시)

```typescript
'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePiAuth } from './pi-auth-provider'

// Stellar 지갑 주소 56자 → 앞 10자 + … + 끝 6자
function truncateAddress(addr: string): string {
  if (addr.length <= 20) return addr
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function PiUserCard() {
  const { user, isLoading, signIn, signOut, error } = usePiAuth()

  if (!user) {
    return (
      <div className='bg-muted flex flex-wrap items-center gap-6 rounded-xl p-6'>
        <div className='flex flex-col gap-2'>
          <Button onClick={signIn} disabled={isLoading} className='gap-2'>
            <span className='font-serif text-base italic leading-none' aria-hidden='true'>π</span>
            {isLoading ? 'Pi 인증 중…' : 'Pi Network로 로그인'}
          </Button>
          {error && <p className='text-destructive text-xs'>{error}</p>}
        </div>
        <p className='text-muted-foreground text-sm'>
          Pi Browser에서 접속하면 자동으로 인증됩니다.<br />
          다른 환경에서는 버튼을 눌러 수동으로 로그인하세요.
        </p>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between'>
          <CardTitle className='text-sm'>Pi Network 사용자 정보</CardTitle>
          <Button variant='outline' size='sm' onClick={signOut}>로그아웃</Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-2.5'>
        <InfoRow label='사용자명' value={user.username ? `@${user.username}` : '(없음)'} />
        <InfoRow label='UID' value={user.uid} mono />
        {user.walletAddress ? (
          <InfoRow label='지갑 주소' value={truncateAddress(user.walletAddress)}
            fullValue={user.walletAddress} mono />
        ) : (
          <InfoRow label='지갑 주소' value='(scope 미부여)' />
        )}
        <div className='grid grid-cols-[6.5rem_1fr] items-start gap-2 text-sm'>
          <span className='text-muted-foreground shrink-0'>부여된 권한</span>
          <div className='flex flex-wrap gap-1'>
            {user.scopesGranted.length > 0
              ? user.scopesGranted.map((s) => (
                  <span key={s} className='bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium'>{s}</span>
                ))
              : <span className='text-muted-foreground text-xs'>없음</span>
            }
          </div>
        </div>
        <InfoRow label='토큰 만료' value={formatDate(user.tokenValidUntil)} />
      </CardContent>
    </Card>
  )
}

function InfoRow({ label, value, mono, fullValue }: {
  label: string; value: string; mono?: boolean; fullValue?: string
}) {
  return (
    <div className='grid grid-cols-[6.5rem_1fr] items-start gap-2 text-sm'>
      <span className='text-muted-foreground shrink-0'>{label}</span>
      <span className={`break-all${mono ? ' font-mono text-xs' : ''}`} title={fullValue}>
        {value}
      </span>
    </div>
  )
}
```

---

### `src/components/pi-login-button.tsx` (헤더 전용 간결 버튼)

```typescript
'use client'

import { Button } from '@/components/ui/button'
import { usePiAuth } from './pi-auth-provider'

export function PiLoginButton() {
  const { user, isLoading, signIn, signOut, error } = usePiAuth()

  if (user) {
    return (
      <div className='flex items-center gap-2'>
        <span className='text-sm font-medium'>
          {user.username ? `@${user.username}` : user.displayName}
        </span>
        <Button variant='outline' size='sm' onClick={signOut}>로그아웃</Button>
        {error && <span className='text-destructive text-xs'>{error}</span>}
      </div>
    )
  }

  return (
    <div className='flex items-center gap-1'>
      <Button onClick={signIn} disabled={isLoading} size='sm' className='gap-1.5'>
        <span className='font-serif text-sm italic leading-none' aria-hidden='true'>π</span>
        {isLoading ? '인증 중…' : 'Pi 로그인'}
      </Button>
      {error && <span className='text-destructive text-xs'>{error}</span>}
    </div>
  )
}
```

---

### `src/app/layout.tsx` 수정 포인트

```tsx
import Script from 'next/script'
import { PiAuthProvider } from '@/components/pi-auth-provider'

// <body> 안에 추가:
<Script
  src='https://sdk.minepi.com/pi-sdk.js'
  strategy='beforeInteractive'
/>

// ThemeProvider 내부를 PiAuthProvider로 감쌈:
<ThemeProvider ...>
  <PiAuthProvider>
    <Header />
    <main className='flex-1'>{children}</main>
    <Footer />
    <Toaster richColors />
  </PiAuthProvider>
</ThemeProvider>
```

> **`strategy='beforeInteractive'`**: Next.js App Router에서 `app/layout.tsx`에만 사용 가능.
> 서버 렌더링 HTML에 `<head>`로 자동 삽입되어 hydration 전에 실행됨.
> `window.Pi`가 `useEffect` 실행 시점에 반드시 정의되어 있어야 하므로 필수.

---

## 6. 핵심 함정 (반드시 읽을 것)

### ❌ 함정 1 — sandbox 설정 오류 (Verify My App 실패 원인)

**증상**: Pi App Studio "Verify My App" 클릭 시 → "We didn't detect a Pi sign-in" 오류

**원인**: `Pi.init({ sandbox: false })`를 전달하면 Pi App Studio 샌드박스 컨텍스트에서
SDK 초기화가 실패하거나 거부되어 `Pi.authenticate`까지 도달하지 못함

**잘못된 코드**:
```typescript
window.Pi.init({ version: '2.0', sandbox: false })  // ❌ localhost에서도 false
```

**올바른 코드**:
```typescript
function detectSandbox(): boolean {
  if (typeof window !== 'undefined') {
    const { hostname } = window.location
    // localhost는 env var 무관하게 항상 sandbox:true
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true
  }
  return process.env.NEXT_PUBLIC_PI_SANDBOX === 'true'
}

window.Pi.init({ version: '2.0', sandbox: detectSandbox() })  // ✅
```

---

### ❌ 함정 2 — Pi Browser에서 GET 요청 후 signIn (타이밍 오류)

**증상**: Verify My App 또는 Pi Browser 자동 인증이 간헐적으로 실패

**원인**: `GET /api/auth/pi` 네트워크 요청이 완료될 때까지 기다린 후 `signIn()`을 호출하면
Pi Network의 "Verify My App"이 `Pi.authenticate` 호출을 감지하기 전에 타임아웃

**잘못된 코드**:
```typescript
// ❌ Pi Browser에서도 GET 먼저 기다림
fetch('/api/auth/pi')
  .then(data => {
    if (!data.user && inPi) signIn()  // 100~500ms 지연 후 호출
  })
```

**올바른 코드**:
```typescript
// ✅ Pi Browser는 즉시, 일반 브라우저는 세션 복원 우선
if (inPi) {
  signIn()  // 즉시 호출
} else {
  fetch('/api/auth/pi').then(...)  // 세션 복원만
}
```

---

### ❌ 함정 3 — wallet_address를 /v2/me에서 얻으려 함

**증상**: `piUser.wallet_address` 가 항상 `undefined`

**원인**: Pi의 `/v2/me` API (UserDTO)는 `wallet_address`를 반환하지 않음

**올바른 흐름**:
```
Pi.authenticate 결과 → auth.user.wallet_address  ✅
GET /v2/me 결과     → wallet_address 없음         ❌
```

반드시 클라이언트에서 `auth.user.wallet_address`를 POST body에 포함해 서버로 전달해야 함.

---

### ❌ 함정 4 — 평문 JSON 쿠키 (보안 취약점)

**증상**: 사용자가 브라우저 DevTools에서 쿠키 값을 변조해 다른 uid로 세션 위조 가능

**원인**: `JSON.stringify(sessionData)`를 그대로 쿠키에 저장하면 위변조 가능
(`httpOnly: true`는 JS XSS만 방어, DevTools 접근은 막지 못함)

**올바른 구현**: HMAC-SHA256 서명 (`signPayload` / `verifyPayload` 참고)

---

### ❌ 함정 5 — Pi.init() 반환값 처리 미흡

**원인**: `Pi.init()`의 반환 타입은 `void | Promise<void>`.
`void`를 그냥 `await`하면 에러 없이 넘어가지만 실제로는 초기화가 완료되지 않을 수 있음.

**올바른 코드**:
```typescript
// void도 안전하게 처리: Promise.resolve()로 감쌈
await Promise.resolve(window.Pi.init({ version: '2.0', sandbox: detectSandbox() }))
```

---

### ❌ 함정 6 — X-Frame-Options 헤더가 있는 경우

**증상**: Pi Browser에서 앱이 흰 화면 또는 로드 실패

**원인**: Pi Browser는 네이티브 WebView(null origin)로 앱을 iframe 내에서 로드함.
`X-Frame-Options: SAMEORIGIN` 헤더가 있으면 iframe 로딩이 차단됨.

**해결**: `next.config.ts`에서 `X-Frame-Options` 헤더와 CSP의 `frame-ancestors` 지시자를 제거.
(이 스타터킷은 `next.config.ts`가 비어있으므로 기본적으로 문제 없음)

---

## 7. 보안 요구사항

### HMAC-SHA256 쿠키 서명

```
쿠키 값 형식: base64url(JSON.stringify(sessionData)) + "." + HMAC-SHA256-signature
```

- **서명**: `createHmac('sha256', PI_SESSION_SECRET).update(payload).digest('base64url')`
- **검증**: `timingSafeEqual(sigBytes, expectedBytes)` — 타이밍 공격 방지 필수
- **길이 확인**: `sigBytes.length !== expectedBytes.length` 체크 선행

### 쿠키 보안 설정

```typescript
response.cookies.set('pi_session', signed, {
  httpOnly: true,                                        // JS에서 접근 불가 (XSS 방어)
  secure: process.env.NODE_ENV === 'production',         // HTTPS only (프로덕션)
  sameSite: 'strict',                                    // CSRF 방어
  maxAge: /* tokenValidUntil 기반 초 단위, 최대 7일 */,
  path: '/',
})
```

### maxAge 산출 방법

```typescript
const tokenExpiresAt = new Date(piUser.credentials.valid_until.iso8601).getTime()
const secondsUntilExpiry = Math.floor((tokenExpiresAt - Date.now()) / 1000)
const maxAge = Math.min(Math.max(secondsUntilExpiry, 0), 7 * 24 * 60 * 60)
```

> 7일 하드코딩 금지. Pi 토큰 만료 시각을 maxAge로 적용해야 Pi 계정 비활성화/탈퇴 시 자동 로그아웃됨.

---

## 8. 완료 체크리스트

### 파일 생성

- [ ] `types/pi-network.d.ts` — `PiUserDTO`, `PiUser`(`wallet_address?` 포함), `window.Pi` 전역 선언
- [ ] `src/types/pi-session.ts` — `PiSessionUser` (`walletAddress` 포함)
- [ ] `src/app/api/auth/pi/route.ts` — GET / POST(HMAC 서명) / DELETE
- [ ] `src/components/pi-auth-provider.tsx` — UA 감지, `detectSandbox()`, 즉시 `signIn()`
- [ ] `src/components/pi-login-button.tsx` — 헤더용 간결 버튼
- [ ] `src/components/pi-user-card.tsx` — 전체 사용자 정보 카드

### 파일 수정

- [ ] `src/app/layout.tsx` — `beforeInteractive` Pi SDK Script + `PiAuthProvider` 래핑
- [ ] `src/env.ts` — `PI_SESSION_SECRET` (server), `NEXT_PUBLIC_PI_SANDBOX` (client)
- [ ] `next.config.ts` — `X-Frame-Options` 헤더 없음 확인

### 환경변수

- [ ] `.env.local` — `PI_SESSION_SECRET` 32자 이상 랜덤 설정
- [ ] `.env.example` — `PI_SESSION_SECRET` 플레이스홀더 포함
- [ ] Vercel 대시보드 — `PI_SESSION_SECRET` 프로덕션 값 설정

### 검증

- [ ] `npx tsc --noEmit --skipLibCheck` — 타입 에러 없음
- [ ] Pi App Studio "Verify My App" — 통과
- [ ] Pi Browser 자동 로그인 — 작동
- [ ] 일반 브라우저 수동 로그인 — 작동
- [ ] 페이지 새로고침 후 로그인 유지 — 작동 (GET 세션 복원)
- [ ] 로그아웃 후 쿠키 삭제 — 확인

### 보안

- [ ] 쿠키에 HMAC 서명 적용 (`signPayload`)
- [ ] 쿠키 읽을 때 서명 검증 (`verifyPayload` + `timingSafeEqual`)
- [ ] `tokenValidUntil` 기반 maxAge 적용
- [ ] `.env.local` — `.gitignore`에 포함되어 커밋 안 됨 확인
- [ ] `PI_SESSION_SECRET` 코드에 하드코딩 없음 확인


## 9. [일반로그인 & 구글로그인과 연동]

### Pi 로그인 

```
1. 신규일 경우 Supabase Authentication의 정보로 저장
- [ ] UID=6734343b-6e3b-4be9-88dd-19eab4de2eb5
- [ ] Display name = @를 제거한 username,
- [ ] Email=@를 제거한 username@내도메인,
- [ ] Provider='Pi Network'
- [ ] Provider type='Crypto'
- [ ] Created at=CURRENT_TIMESTAMP


2. 가입정보가 있을 경우 Supabase Authentication의 정보로 수정
- [ ] UID=6734343b-6e3b-4be9-88dd-19eab4de2eb5fh 로 중복확인
- [ ] Last sign in at=CURRENT_TIMESTAMP

```