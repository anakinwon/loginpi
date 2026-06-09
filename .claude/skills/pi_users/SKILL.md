# 사용자 프로필 관리 (마이페이지) 구현 스킬

Pi Browser 실기기에서 동작하는 마이페이지 — 개인정보 수정 · 결제 내역 · 구독 현황 전체 흐름 구현 가이드.
이 문서만 참고하면 Pi Browser 제약을 지키면서 처음부터 실수 없이 구현할 수 있다.

> **전제**: Pi 인증이 완료되어 있어야 한다. → `.claude/skills/pi_auth/SKILL.md` 참고

---

## 목차

0. [요청 프롬프트](#0-요청-프롬프트)
1. [아키텍처 개요](#1-아키텍처-개요)
2. [Pi Browser 필수 제약 (절대 훼손 금지)](#2-pi-browser-필수-제약-절대-훼손-금지)
3. [DB 마이그레이션](#3-db-마이그레이션)
4. [API 명세](#4-api-명세)
5. [컴포넌트 구조](#5-컴포넌트-구조)
6. [핵심 구현 코드 패턴](#6-핵심-구현-코드-패턴)
7. [반드시 알아야 할 함정](#7-반드시-알아야-할-함정)
8. [3단계 검증 체크리스트 (완료 전 필수)](#8-3단계-검증-체크리스트-완료-전-필수)

---

## 0. 요청 프롬프트

```
You are a Next.js 16 App Router full-stack developer specialized in Pi Browser compatibility.
Implement a user profile management page (마이페이지) in this codebase.

Scope:
1. 개인정보 수정 (real_nm, nick_nm, phone_no, addr, addr_dtl, display_name)
2. 결제 내역 (pi_pymnt 테이블, 최신순 20건)
3. 구독 현황 (msg_subscr 테이블, 플랜 배지 + 취소 버튼)

Critical Pi Browser constraints:
- getSessionUser() null 시 redirect() 절대 금지 → <ClientProfileGate /> 반환
- 모든 클라이언트 API 호출은 piFetch() 사용 (X-Pi-Token 헤더 자동 첨부)
- 물리 DELETE 절대 금지 → del_yn='Y' 논리삭제만 허용
- 모든 DB 접근은 서버 라우트를 통해서만 (anon key 클라이언트 직접 사용 금지)

Reference files:
- src/lib/auth-check.ts — getSessionUser()
- src/lib/pi-fetch.ts — piFetch()
- src/lib/users.ts — getUserById(), upsertPiUser()
- src/app/api/subscriptions/ — 기존 구독 API 재사용
- src/components/chat/subscription-gate.tsx — 구독 게이트 패턴 참고

Do not explain. Write all file changes directly.
```

---

## 1. 아키텍처 개요

### 인증 이중 경로

Pi Browser는 쿠키를 저장하지 않으므로 두 경로를 동시에 지원해야 한다:

| 환경 | 인증 경로 | 동작 |
|---|---|---|
| 일반 브라우저 | `pi_session` 쿠키 | SSR에서 `getSessionUser()` 바로 성공 |
| Pi Browser | `X-Pi-Token` 헤더 | `getSessionUser()` null → `ClientProfileGate` 렌더 → `piFetch()` 호출 |

### 페이지 렌더링 흐름

```
GET /[locale]/profile
        │
        ▼  Server Component
  getSessionUser()
        │
   있음 │──► 프로필 SSR 렌더 (일반 브라우저)
        │
  없음  │──► <ClientProfileGate /> 반환
              │  (redirect 절대 금지)
              ▼  'use client'
        localStorage에서 pi_token 읽기
              │
              ▼ piFetch('/api/profile')  ← X-Pi-Token 헤더 자동 첨부
              │
         성공 │──► ProfileTabs 렌더 (Pi Browser)
              │
         실패 │──► "Pi로 로그인" 버튼 표시
```

### 파일 맵

```
src/
├── app/
│   ├── [locale]/profile/
│   │   ├── page.tsx                         # Server Component + Client Gate
│   │   └── _components/
│   │       ├── profile-tabs.tsx             # 탭 UI (개인정보/결제/구독)
│   │       ├── profile-form.tsx             # 개인정보 수정 폼
│   │       ├── payment-history.tsx          # 결제 내역 목록
│   │       ├── subscription-status.tsx      # 구독 현황 + 취소
│   │       └── client-profile-gate.tsx      # Pi Browser 게이트
│   └── api/profile/
│       ├── route.ts                         # GET/PATCH 내 프로필
│       └── payments/
│           └── route.ts                     # GET 결제 내역
└── lib/
    └── users.ts                             # UserRow 타입 확장 + updateUserProfile()
```

---

## 2. Pi Browser 필수 제약 (절대 훼손 금지)

| 제약 | 준수 방법 |
|---|---|
| **Set-Cookie 미저장** | 클라이언트 측 모든 API 호출에 `fetch` 대신 `piFetch()` 사용 |
| **redirect 절대 금지** | `getSessionUser()` null → `<ClientProfileGate />` 반환 (`redirect()` 사용 절대 금지) |
| **물리 DELETE 금지** | 향후 삭제 기능 추가 시 `del_yn = 'Y'`만 허용 |
| **anon key 클라이언트 사용 금지** | 모든 DB 접근은 서버 라우트(`/api/profile`)를 통해서만 |
| **RLS 비활성화** | `SUPABASE_SERVICE_ROLE_KEY` 서버 전용 클라이언트만 사용 |

### `piFetch` vs `fetch` 사용 기준

```typescript
// ❌ 잘못된 코드 — Pi Browser에서 인증 실패
const res = await fetch('/api/profile', { method: 'PATCH', ... })

// ✅ 올바른 코드 — X-Pi-Token 헤더 자동 첨부 + credentials: 'include'
const res = await piFetch('/api/profile', { method: 'PATCH', ... })
```

---

## 3. DB 마이그레이션

### `sql/014_user_profile_columns.sql`

```sql
-- DA-APPROVED: sys_user 프로필 컬럼 5개 추가 (Phase 10 마이페이지)
ALTER TABLE sys_user
  ADD COLUMN IF NOT EXISTS real_nm   TEXT,
  ADD COLUMN IF NOT EXISTS nick_nm   TEXT,
  ADD COLUMN IF NOT EXISTS phone_no  TEXT,
  ADD COLUMN IF NOT EXISTS addr      TEXT,
  ADD COLUMN IF NOT EXISTS addr_dtl  TEXT;

COMMENT ON COLUMN sys_user.real_nm   IS '실명';
COMMENT ON COLUMN sys_user.nick_nm   IS '닉네임';
COMMENT ON COLUMN sys_user.phone_no  IS '연락처';
COMMENT ON COLUMN sys_user.addr      IS '주소';
COMMENT ON COLUMN sys_user.addr_dtl  IS '상세주소';
```

> DA 표준: 시스템 컬럼 4개(regr_id, reg_dtm, modr_id, mod_dtm)는 이미 sys_user에 존재.
> `phone_no` — `_no`(번호) 도메인 약어 사용. `phone_num`이 아님.

---

## 4. API 명세

| 엔드포인트 | 메서드 | 인증 | 설명 |
|---|---|---|---|
| `/api/profile` | GET | `getSessionUser()` | 내 프로필 조회 (sys_user 단건) |
| `/api/profile` | PATCH | `getSessionUser()` | 프로필 수정 (6개 필드, Zod 검증) |
| `/api/profile/payments` | GET | `getSessionUser()` | 결제 내역 (pi_pymnt, 최신순 20건) |
| `/api/subscriptions/check` | GET | `getSessionUser()` | 구독 현황 — **기존 API 재사용** |
| `/api/subscriptions` | DELETE | `getSessionUser()` | 구독 취소 — **기존 API 재사용** |

### PATCH `/api/profile` 요청 바디 스키마

```typescript
const ProfileUpdateSchema = z.object({
  display_name: z.string().min(1).max(50).optional(),
  real_nm:      z.string().max(50).optional(),
  nick_nm:      z.string().max(30).optional(),
  phone_no:     z.string().max(20).optional(),
  addr:         z.string().max(200).optional(),
  addr_dtl:     z.string().max(100).optional(),
})
```

### GET `/api/profile/payments` 응답 형태

```typescript
interface PaymentHistoryItem {
  payment_id: string
  amount: number       // Pi 금액
  memo: string
  status: string       // 'pending' | 'approved' | 'completed'
  reg_dtm: string      // ISO8601
  metadata: Record<string, unknown>
}
```

---

## 5. 컴포넌트 구조

### 파일별 역할

| 파일 | 렌더링 | 역할 |
|---|---|---|
| `page.tsx` | Server | `getSessionUser()` 체크 → null 시 `ClientProfileGate` 반환 |
| `client-profile-gate.tsx` | 'use client' | localStorage `pi_token` → `piFetch` 인증 → 성공 시 ProfileTabs 렌더 |
| `profile-tabs.tsx` | 'use client' | 3개 탭 UI (개인정보 / 결제내역 / 구독현황) |
| `profile-form.tsx` | 'use client' | 개인정보 수정 폼, PATCH `/api/profile` 호출 |
| `payment-history.tsx` | 'use client' | 결제 내역 테이블, GET `/api/profile/payments` |
| `subscription-status.tsx` | 'use client' | 구독 플랜 배지 + 취소 버튼, 기존 `/api/subscriptions` 재사용 |

---

## 6. 핵심 구현 코드 패턴

### 6-1. `page.tsx` — Server Component (redirect 금지 패턴)

```tsx
// src/app/[locale]/profile/page.tsx
import { getSessionUser } from '@/lib/auth-check'
import { ClientProfileGate } from './_components/client-profile-gate'
import { ProfileTabs } from './_components/profile-tabs'

export default async function ProfilePage() {
  const user = await getSessionUser()

  // Pi Browser는 쿠키 없음 → null 반환 → redirect 절대 금지
  // 클라이언트 게이트가 localStorage pi_token으로 인증을 이어받는다
  if (!user) return <ClientProfileGate />

  return (
    <div className='mx-auto max-w-2xl px-4 py-8'>
      <h1 className='mb-6 text-2xl font-bold'>내 프로필</h1>
      <ProfileTabs initialUser={user} />
    </div>
  )
}
```

### 6-2. `client-profile-gate.tsx` — Pi Browser 진입점

```tsx
'use client'

import { useEffect, useState } from 'react'
import { piFetch } from '@/lib/pi-fetch'
import { ProfileTabs } from './profile-tabs'
import type { UserRow } from '@/lib/users'

export function ClientProfileGate() {
  const [user, setUser] = useState<UserRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    piFetch('/api/profile')
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then((data: { user: UserRow }) => setUser(data.user))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className='p-8 text-center'>로딩 중…</div>

  if (error || !user) {
    return (
      <div className='flex flex-col items-center gap-4 py-16'>
        <p className='text-muted-foreground text-sm'>로그인이 필요합니다</p>
        {/* PiLoginButton은 pi-auth-provider에서 관리 */}
      </div>
    )
  }

  return (
    <div className='mx-auto max-w-2xl px-4 py-8'>
      <h1 className='mb-6 text-2xl font-bold'>내 프로필</h1>
      <ProfileTabs initialUser={user} />
    </div>
  )
}
```

### 6-3. `src/app/api/profile/route.ts` — GET/PATCH

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { z } from 'zod'

const ProfileUpdateSchema = z.object({
  display_name: z.string().min(1).max(50).optional(),
  real_nm:      z.string().max(50).optional(),
  nick_nm:      z.string().max(30).optional(),
  phone_no:     z.string().max(20).optional(),
  addr:         z.string().max(200).optional(),
  addr_dtl:     z.string().max(100).optional(),
})

export async function GET(req: NextRequest) {
  // getSessionUser()가 쿠키 → X-Pi-Token 헤더 폴백으로 자동 처리
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = getSupabaseAdmin()
  const { data } = await db
    .from('sys_user')
    .select('id, display_name, real_nm, nick_nm, phone_no, addr, addr_dtl, pi_username, google_email, role, reg_dtm')
    .eq('id', user.id)
    .maybeSingle()   // .single() 아님 — 결과 없을 때 에러 방지

  return NextResponse.json({ user: data })
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = ProfileUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('sys_user')
    .update({
      ...parsed.data,
      modr_id: user.id,   // DA 표준 시스템 컬럼 갱신
      mod_dtm: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ user: data })
}
```

### 6-4. `src/app/api/profile/payments/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = getSupabaseAdmin()
  const { data } = await db
    .from('pi_pymnt')
    .select('payment_id, amount, memo, status, reg_dtm, metadata')
    .eq('user_id', user.id)
    .order('reg_dtm', { ascending: false })
    .limit(20)

  return NextResponse.json({ payments: data ?? [] })
}
```

### 6-5. `src/lib/users.ts` — UserRow 타입 확장 및 updateUserProfile 추가

```typescript
// UserRow에 프로필 컬럼 추가
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
  // Phase 10 — 마이그레이션 014 추가 컬럼
  real_nm: string | null
  nick_nm: string | null
  phone_no: string | null
  addr: string | null
  addr_dtl: string | null
  reg_dtm: string
  mod_dtm: string
}

export async function updateUserProfile(
  userId: string,
  data: Partial<Pick<UserRow, 'display_name' | 'real_nm' | 'nick_nm' | 'phone_no' | 'addr' | 'addr_dtl'>>
): Promise<UserRow | null> {
  const db = getSupabaseAdmin()
  const { data: row } = await db
    .from('sys_user')
    .update({ ...data, modr_id: userId, mod_dtm: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .maybeSingle()
  return row
}
```

### 6-6. `profile-form.tsx` — piFetch PATCH 호출 패턴

```tsx
'use client'

import { useState } from 'react'
import { piFetch } from '@/lib/pi-fetch'
import type { UserRow } from '@/lib/users'

export function ProfileForm({ initialUser }: { initialUser: UserRow }) {
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const body = Object.fromEntries(
      [...fd.entries()].filter(([, v]) => v !== '')
    )

    // piFetch — X-Pi-Token 헤더 자동 첨부 (Pi Browser 필수)
    const res = await piFetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    setSaving(false)
    if (!res.ok) { /* 에러 토스트 */ return }
    /* 성공 토스트 */
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <input name='display_name' defaultValue={initialUser.display_name ?? ''} />
      <input name='real_nm'      defaultValue={initialUser.real_nm ?? ''} />
      <input name='nick_nm'      defaultValue={initialUser.nick_nm ?? ''} />
      <input name='phone_no'     defaultValue={initialUser.phone_no ?? ''} />
      <input name='addr'         defaultValue={initialUser.addr ?? ''} />
      <input name='addr_dtl'     defaultValue={initialUser.addr_dtl ?? ''} />
      <button type='submit' disabled={saving}>
        {saving ? '저장 중…' : '저장'}
      </button>
    </form>
  )
}
```

### 6-7. `subscription-status.tsx` — 기존 API 재사용 패턴

```tsx
'use client'

import { useEffect, useState } from 'react'
import { piFetch } from '@/lib/pi-fetch'

interface SubscrCheck {
  active: boolean
  plan_cd: string | null
  expire_dtm: string | null
}

export function SubscriptionStatus() {
  const [subscr, setSubscr] = useState<SubscrCheck | null>(null)

  useEffect(() => {
    // 기존 /api/subscriptions/check 재사용
    piFetch('/api/subscriptions/check')
      .then(r => r.json())
      .then(setSubscr)
      .catch(() => {})
  }, [])

  const handleCancel = async () => {
    // 기존 /api/subscriptions DELETE 재사용
    await piFetch('/api/subscriptions', { method: 'DELETE' })
    setSubscr(prev => prev ? { ...prev, active: false } : prev)
  }

  if (!subscr) return null

  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-2'>
        <span className='font-medium'>현재 플랜:</span>
        <span className='rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'>
          {subscr.plan_cd ?? 'FREE'}
        </span>
      </div>
      {subscr.active && subscr.expire_dtm && (
        <p className='text-muted-foreground text-sm'>
          만료일: {new Date(subscr.expire_dtm).toLocaleDateString('ko-KR')}
        </p>
      )}
      {subscr.active && (
        <button onClick={handleCancel} className='text-destructive text-sm underline'>
          구독 취소
        </button>
      )}
    </div>
  )
}
```

---

## 7. 반드시 알아야 할 함정

### ❌ 함정 1 — `getSessionUser()` null 시 `redirect()` 호출

**증상**: Pi Browser에서 `/profile` 접속 시 무한 루프 발생

**원인**: Pi Browser는 쿠키를 저장하지 않으므로 SSR에서 `getSessionUser()`가 항상 null.
`redirect()`를 호출하면 로그인 페이지로 이동 → 또 `getSessionUser()` null → 무한 리다이렉트.

```tsx
// ❌ 절대 금지
if (!user) redirect('/login')

// ✅ 클라이언트 게이트로 위임
if (!user) return <ClientProfileGate />
```

---

### ❌ 함정 2 — `fetch()` 직접 사용 (Pi Browser 인증 실패)

**증상**: Pi Browser에서 `/api/profile` 호출 시 401 Unauthorized

**원인**: 일반 `fetch()`는 `credentials: 'include'`를 주어도 쿠키가 없으면 인증 실패.
`piFetch()`만이 localStorage `pi_token`을 읽어 `X-Pi-Token` 헤더로 첨부한다.

```typescript
// ❌ Pi Browser에서 인증 실패
const res = await fetch('/api/profile')

// ✅ X-Pi-Token 헤더 자동 첨부
const res = await piFetch('/api/profile')
```

---

### ❌ 함정 3 — `.single()` 사용 (데이터 없을 때 에러)

**증상**: 신규 가입 사용자에게 500 에러 발생

**원인**: `.single()`은 결과가 0건이면 에러를 던진다.

```typescript
// ❌ 결과 없을 때 에러
.select(...).eq('id', userId).single()

// ✅ 결과 없을 때 null 반환
.select(...).eq('id', userId).maybeSingle()
```

---

### ❌ 함정 4 — 구독 취소를 물리 DELETE로 구현

**증상**: msg_subscr 행 자체가 삭제되어 이력 추적 불가

**원인**: DA 표준은 물리 DELETE를 금지한다.

```typescript
// ❌ 물리 삭제 — DA 표준 위반
await db.from('msg_subscr').delete().eq('usr_id', userId)

// ✅ 논리 삭제
await db.from('msg_subscr').update({ del_yn: 'Y', mod_dtm: new Date().toISOString() }).eq('usr_id', userId)
```




# Pi Network PiRC2 구독 취소 및 환불·수수료 정책
## 구독 시작 시와 구독 취소 시에 아래의 안내사항을 반드시 공지해야 함.


> **출처:** Pi Network 공식 GitHub ([PiNetwork/PiRC](https://github.com/PiNetwork/PiRC)), [minepi.com 블로그](https://minepi.com/blog/subscriptions-smart-contract/)  
> **조사 일자:** 2026년 6월

---


## ⚠️ 먼저 알아야 할 맥락

PiRC2는 Pi Network 최초의 스마트컨트랙트 기능으로, 현재 **Testnet 단계**에서 개발자 리뷰 및 커뮤니티 피드백을 수집 중입니다. 외부 감사 서비스의 보안 검토도 진행 중이며, 아직 Mainnet 배포는 결정되지 않은 상태입니다.

---

## 1. 취소(Cancel) 메커니즘

공식 GitHub 문서(`9-subscription-setup-guide.md`)에 따르면:

- **`cancel` 함수**는 자동 갱신(`auto_renew`)을 비활성화합니다.
- **이미 결제된 잔여 이용 시간은 그대로 보존됩니다.**
- 즉각적인 서비스 종료가 아닌 **"현재 구독 기간이 끝날 때까지 유지 후 미갱신"** 방식입니다.
- 만약 `auto_renew`가 이미 `false`인 상태라면 `AlreadyCancelled` 오류를 반환합니다.

```
# 취소 호출 예시
stellar contract invoke \
  --id $CONTRACT_ID \
  --network $NETWORK \
  -s <PRIVATE_KEY> \
  -- cancel \
  --subscriber <SUBSCRIBER_PUBLIC_KEY> \
  --sub_id 0
```

> **결론: Pi Network PiRC2의 취소는 "즉시 환불"이 아닌 "기간 만료 후 자동 갱신 중단" 방식**

---

## 2. 환불 정책

공식 PiRC2 문서에는 **부분 환불이나 잔여 기간 환불에 대한 정책이 명시되어 있지 않습니다.**  
`cancel` 호출 시 잔여 이용 시간이 보존된다는 것만 기술되어 있으며, 이는 환불이 아닌 서비스 이용 지속을 의미합니다.

| 구분 | 내용 |
|------|------|
| 취소 즉시 환불 | ❌ 언급 없음 |
| 잔여 기간 서비스 이용 | ✅ 보장 |
| 부분 환불 | ❌ 언급 없음 |
| 환불 수수료 | ❌ 언급 없음 |

---

## 3. 결제 실패 시 자동 처리

결제가 실패하면 해당 구독의 `auto_renew`가 **자동으로 `false`로 전환**됩니다.  
Merchant가 `process()` 함수를 호출할 때 결제에 실패하면 별도 조작 없이 자동으로 구독이 갱신 불가 상태가 됩니다.

| 이벤트 | 설명 |
|--------|------|
| `chg_fail` | 결제 실패 이벤트 발생 |
| `auto_renew` | 자동으로 `false` 전환 |

---

## 4. 스마트컨트랙트의 핵심 설계 원칙 (자금 보호)

구독자가 사전에 예산을 승인하더라도, **실제 청구가 이루어지기 전까지 승인된 자금은 구독자의 지갑에 그대로 유지됩니다.**  
전체 예산을 컨트랙트에 미리 예치(pre-funding)할 필요가 없습니다.

각 청구 이벤트마다 새 서명이 필요하지 않으면서도, 실제 청구 시점까지 자금은 사용자 지갑에 보관됩니다.  
충전 시점에 지갑 잔액이 충분하다면 구독이 유지됩니다.

### 기술 구현 방식

> Soroban의 토큰 allowance 메커니즘을 활용:  
> 구독자가 컨트랙트를 spender로 `approve` → 이후 컨트랙트가 `transfer_from`으로 시간에 따라 차감  
> 전체 예산을 사전 이전하지 않고도 반복 결제 구현 가능

---

## 5. 수수료(Fee) 정책

공식 PiRC2 문서에는 **플랫폼 수준의 수수료 정책이 명시되어 있지 않습니다.**  
서비스 가격(`price`)은 Merchant가 자유롭게 설정할 수 있으며, 가격 단위는 Pi의 소수점 7자리 기준 최소 단위를 사용합니다.

```
price 예시: 10000000 = 1 Pi  (소수점 7자리)
```

---

## 6. 구독 생명주기 흐름

```
1. Merchant → register_service 호출
         ↓
2. Subscriber → subscribe 호출 (토큰 승인 자동 설정)
         ↓
3. 청구 기간 종료 시, Merchant → process 호출
         ↓
4. 컨트랙트 → transfer_from으로 구독자에게 청구
         ↓
5. allowance 부족 시, 구독자 → extend_subscription 호출
         ↓
6. 구독자 → 언제든지 cancel 또는 toggle_auto_renew 호출 가능
```

---

## 7. 개발자 앱 설계 시사점

PiRC2의 취소/환불 철학을 앱 설계에 적용하면:

| 항목 | PiRC2 기본 동작 | 앱 레이어 추가 구현 필요 |
|------|----------------|------------------------|
| 즉시 취소 | `auto_renew = false` | ✅ UI에서 사용자 안내 필요 |
| 잔여 기간 환불 | 스마트컨트랙트 미지원 | ✅ 앱 자체 정책으로 구현 필요 |
| 결제 실패 알림 | `chg_fail` 이벤트 발생 | ✅ 이벤트 수신 후 앱 처리 |
| 트라이얼 후 재구독 | `auto_renew` 필수 | ✅ 무료 체험 중복 방지 내장 |
| 부분 환불 | 미정의 | ✅ 앱 서비스 약관에 직접 명시 필요 |

---

## 8. 에러 코드 참고

| 코드 | 이름 | 설명 |
|------|------|------|
| 3 | `AlreadySubscribed` | 이미 활성 구독 존재 또는 무료 체험 사용 이력 있음 |
| 4 | `SubscriptionNotFound` | 해당 ID의 구독 없음 |
| 6 | `Unauthorized` | 구독 소유자가 아닌 호출자 |
| 7 | `AlreadyCancelled` | 이미 취소된 구독 (`auto_renew = false`) |
| 11 | `SubscriptionExpired` | 구독 만료됨 |
| 12 | `ServiceNotActive` | 서비스 비활성화됨 |

---

## 요약

Pi Network PiRC2의 공식 취소·환불 정책은 **"즉시 환불 없이 잔여 기간 보존 후 만료"** 방식이 기본입니다.  
별도의 환불 수수료나 부분 환불 메커니즘은 스마트컨트랙트 레벨에서 정의되지 않았으며,  
이는 **앱 개발자가 자체적으로 서비스 약관에 환불 정책을 추가 설계해야 한다는 의미**입니다.  
현재 Testnet 단계이므로 Mainnet 출시 전 정책이 변경될 가능성도 있습니다.

---

*참고 링크*
- [PiRC GitHub 공식 저장소](https://github.com/PiNetwork/PiRC)
- [PiRC2 Subscription Setup Guide](https://github.com/PiNetwork/PiRC/blob/main/PiRC2/9-subscription-setup-guide.md)
- [Pi Network 공식 블로그 - Subscription Smart Contract](https://minepi.com/blog/subscriptions-smart-contract/)



---

### ❌ 함정 5 — `mod_dtm` / `modr_id` 갱신 누락

**증상**: 변경 이력 추적 불가, DA 품질 감사 위반

**원인**: DA 표준은 모든 UPDATE에 `modr_id`와 `mod_dtm` 갱신을 요구한다.

```typescript
// ❌ 시스템 컬럼 갱신 누락
await db.from('sys_user').update({ real_nm: '홍길동' }).eq('id', userId)

// ✅ DA 표준 준수
await db.from('sys_user').update({
  real_nm: '홍길동',
  modr_id: userId,
  mod_dtm: new Date().toISOString(),
}).eq('id', userId)
```

---

### ❌ 함정 6 — Server Component에서 쿠키 없이 API 직접 조회

**증상**: `getSessionUser()`가 항상 null 반환 (Pi Browser에서)

**원인**: Server Component에서 직접 DB를 조회하면 Pi Browser의 X-Pi-Token 헤더 경로가 동작하지 않는다.
클라이언트 게이트를 통해야만 이중 경로가 정상 동작한다.

---

## 8. 3단계 검증 체크리스트 (완료 전 필수)

### 1단계: 로컬 개발 서버 (`pnpm dev`)

- [ ] 일반 브라우저 로그인 상태 → `/profile` SSR 직접 렌더
- [ ] 일반 브라우저 비로그인 → `ClientProfileGate` 렌더 (콘솔 에러 없음)
- [ ] 개인정보 수정 폼 제출 → PATCH `/api/profile` 200 → Supabase 변경 확인
- [ ] 결제 내역 탭 → 정상 렌더 (데이터 없을 때 빈 상태 UI 표시)
- [ ] 구독 현황 탭 → FREE 상태 기본값 정상 표시
- [ ] `pnpm tsc --noEmit` — TypeScript 에러 없음
- [ ] `pnpm lint` — ESLint 에러 없음

### 2단계: X-Pi-Token 헤더 시뮬레이션 (Pi Browser 모사)

```typescript
// Playwright 또는 fetch로 직접 테스트
// 1. /profile 비로그인 접속 → ClientProfileGate 렌더 확인 (200 응답, redirect 없음)
// 2. X-Pi-Token 헤더 첨부 요청 → 프로필 데이터 반환 확인
//    fetch('/api/profile', { headers: { 'X-Pi-Token': TEST_TOKEN } })
// 3. PATCH /api/profile → 200, 변경값 Supabase 반영 확인
// 4. GET /api/profile/payments → 200, payments 배열 반환
// 5. GET /api/subscriptions/check → 200, active 상태 정상 반환
```

- [ ] `ClientProfileGate` — 비로그인 시 redirect 없이 200 응답 확인
- [ ] X-Pi-Token 헤더 인증 → 프로필 조회 성공
- [ ] PATCH 요청 → modr_id·mod_dtm 자동 갱신 확인

### 3단계: Pi Browser 실기기 검증 (배포 후 사용자 확인)

- [ ] Pi Browser에서 `/profile` 접속 → `ClientProfileGate` 표시 확인
- [ ] Pi 로그인 후 프로필 편집 저장 → 변경 반영 확인
- [ ] 결제 내역 탭 전환 → 데이터 로드 확인
- [ ] 구독 현황 탭 전환 → 플랜 배지 + 만료일 표시 확인
- [ ] 페이지 새로고침 후 인증 유지 → `ClientProfileGate` 자동 재인증 확인

---

## 부록 A — PLAN_CAPS 플랜 배지 참고

```typescript
// src/lib/chat-auth.ts
export const PLAN_CAPS = {
  FREE:     { quota: 0,  monthly: 0,  ai: 0  },
  PREMIUM:  { quota: 1,  monthly: 3,  ai: 10 },
  BUSINESS: { quota: -1, monthly: -1, ai: -1 },  // -1: 무제한
} as const

// 플랜 배지 표시 예시
const planLabel = subscr?.active ? (subscr.plan_cd ?? 'FREE') : 'FREE'
```

## 부록 B — 구독 플랜 테이블 (msg_subscr_plan)

| plan_cd | pi_mth | mth_cnt | 설명 |
|---|---|---|---|
| FREE | 0 | 0 | 무료 |
| PREMIUM_MONTHLY | 1 | 1 | 프리미엄 월간 (1 Pi) |
| PREMIUM_ANNUAL | 10 | 12 | 프리미엄 연간 (10 Pi) |
| BUSINESS_MONTHLY | 5 | 1 | 비즈니스 월간 (5 Pi) |
| BUSINESS_ANNUAL | 50 | 12 | 비즈니스 연간 (50 Pi) |
