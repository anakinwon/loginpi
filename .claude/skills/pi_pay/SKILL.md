# Pi Network 결제(Payments) 구현 스킬

Pi Coin으로 결제를 처리하는 전체 흐름을 Next.js App Router에 구현하는 가이드.
이 문서만 참고하면 처음부터 실수 없이 구현할 수 있다.

> **전제**: Pi 인증 구현이 완료되어 있어야 한다. → `@.claude/skills/pi_auth/SKILL.md` 참고

---

## 목차

1. [결제 타입 (U2A vs A2U)](#1-결제-타입-u2a-vs-a2u)
2. [결제 전체 흐름](#2-결제-전체-흐름)
3. [TypeScript 타입 정의](#3-typescript-타입-정의)
4. [환경변수 및 전제 조건](#4-환경변수-및-전제-조건)
5. [구현 코드 전체](#5-구현-코드-전체)
6. [미완료 결제 처리 (필수)](#6-미완료-결제-처리-필수)
7. [핵심 함정 (반드시 읽을 것)](#7-핵심-함정-반드시-읽을-것)
8. [완료 체크리스트](#8-완료-체크리스트)

---

## 1. 결제 타입 (U2A vs A2U)

| 구분 | U2A (User-to-App) | A2U (App-to-User) |
|---|---|---|
| **방향** | 사용자 → 앱 | 앱 → 사용자 |
| **용도** | 상품 구매, 구독, 기부 | 환불, 보상, 상금 지급 |
| **SDK** | 프론트엔드 Pi SDK | 백엔드 Pi SDK (별도) |
| **현재 지원** | ✅ 메인넷 + 테스트넷 | ⚠️ **Testnet 전용** (메인넷 미지원) |
| **트리거** | `window.Pi.createPayment()` | 서버에서 직접 API 호출 |

> **이 문서는 U2A만 다룬다.** A2U는 테스트넷 전용이며 별도 Backend SDK 필요.

---

## 2. 결제 전체 흐름

```
사용자                   앱 프론트엔드              앱 서버              Pi Network
  │                          │                       │                     │
  │ 결제 버튼 클릭           │                       │                     │
  ├─────────────────────────►│                       │                     │
  │                          │ Pi.createPayment()    │                     │
  │                          ├──────────────────────────────────────────►  │
  │                          │                       │                     │
  │  ─── Phase 1: 서버 승인 ────────────────────────────────────────────── │
  │                          │ onReadyForServerApproval(paymentId)          │
  │                          ├──────────────────────►│                     │
  │                          │                       │ POST /payments/{id}/approve
  │                          │                       ├────────────────────►│
  │                          │                       │◄────────────────────│
  │                          │◄──────────────────────│                     │
  │                          │                       │                     │
  │  ─── Phase 2: 사용자 확인 ──────────────────────────────────────────── │
  │◄─────────────────────────│ 결제 다이얼로그 표시                         │
  │ Pi 결제 확인             │                       │                     │
  ├─────────────────────────►│                       │                     │
  │                          │──────────────────────────────────────────►  │
  │                          │                 블록체인 트랜잭션 처리        │
  │                          │◄──────────────────────────────────────────  │
  │                          │                       │                     │
  │  ─── Phase 3: 서버 완료 ────────────────────────────────────────────── │
  │                          │ onReadyForServerCompletion(paymentId, txid)  │
  │                          ├──────────────────────►│                     │
  │                          │                       │ POST /payments/{id}/complete
  │                          │                       │ body: { txid }      │
  │                          │                       ├────────────────────►│
  │                          │                       │◄────────────────────│
  │ 결제 완료 표시           │◄──────────────────────│                     │
  │◄─────────────────────────│                       │                     │
```

### 핵심 규칙

- **Phase 1 승인 없이 Phase 2 진입 불가** — `onReadyForServerApproval`에서 `/approve` 호출 전까지 결제 다이얼로그 미활성화
- **Phase 3 완료 없이 결제 미완료 상태** — `/complete` 미호출 시 `incomplete` 결제로 누적
- **콜백 4개 모두 구현 필수** — onReadyForServerApproval, onReadyForServerCompletion, onCancel, onError

---

## 3. TypeScript 타입 정의

### `types/pi-network.d.ts` 추가 (기존 파일에 병합)

```typescript
// 기존 PiSDK 인터페이스에 createPayment 추가
interface PaymentData {
  amount: number       // Pi 금액 (소수점 가능, 예: 0.001)
  memo: string         // 사용자에게 표시되는 결제 설명 (최대 255자)
  metadata: Record<string, unknown>  // 앱 내부 데이터 (orderId 등) — 서버에서 검증용
}

interface PaymentCallbacks {
  onReadyForServerApproval: (paymentId: string) => void
  onReadyForServerCompletion: (paymentId: string, txid: string) => void
  onCancel: (paymentId: string) => void
  onError: (error: Error, payment: PaymentDTO) => void
}

interface PaymentStatus {
  developer_approved: boolean     // 서버가 /approve 호출 완료
  transaction_verified: boolean   // 블록체인 트랜잭션 확인 완료
  developer_completed: boolean    // 서버가 /complete 호출 완료
  cancelled: boolean              // 결제 취소됨
  user_cancelled: boolean         // 사용자가 직접 취소
}

interface PaymentTransaction {
  txid: string           // 블록체인 트랜잭션 ID
  verified: boolean      // Pi Network 검증 여부
  _link: string          // Pi 블록체인 탐색기 URL
}

interface PaymentDTO {
  identifier: string     // 결제 고유 ID (paymentId)
  user_uid: string       // 결제한 사용자 UID
  amount: number         // Pi 금액
  memo: string           // 결제 설명
  metadata: Record<string, unknown>  // createPayment 시 전달한 메타데이터
  from_address: string   // 발신 지갑 주소
  to_address: string     // 수신 지갑 주소 (앱 지갑)
  direction: 'user_to_app' | 'app_to_user'
  network: 'Pi Network' | 'Pi Testnet'
  status: PaymentStatus
  transaction: PaymentTransaction | null
  created_at: string     // ISO 8601
}

// 기존 PiSDK 인터페이스에 추가
interface PiSDK {
  init(options: PiInitOptions): void | Promise<void>
  authenticate(
    scopes: string[],
    onIncompletePaymentFound: (payment: PaymentDTO) => void
  ): Promise<PiAuthResult>
  createPayment(data: PaymentData, callbacks: PaymentCallbacks): void
}
```

### `src/types/pi-payment.ts` (서버/클라이언트 공유 타입)

```typescript
export interface PaymentRecord {
  paymentId: string
  userId: string          // Pi UID
  amount: number
  memo: string
  metadata: Record<string, unknown>
  txid: string | null
  status: 'pending' | 'approved' | 'completed' | 'cancelled' | 'error'
  createdAt: string
  completedAt: string | null
}
```

---

## 4. 환경변수 및 전제 조건

### 필수 환경변수

```env
# Pi Developer Portal → 앱 설정 → API Key 에서 발급
# ⚠️ accessToken(Bearer)과 완전히 다른 키 — 서버 전용, 절대 클라이언트에 노출 금지
PI_API_KEY=your-pi-server-api-key
```

### `src/env.ts`에 추가

```typescript
server: {
  PI_SESSION_SECRET: z.string().min(32),
  PI_API_KEY: z.string().min(1, 'Pi Developer Portal에서 API Key를 발급받아야 합니다'),
},
runtimeEnv: {
  PI_SESSION_SECRET: process.env.PI_SESSION_SECRET,
  PI_API_KEY: process.env.PI_API_KEY,
},
```

### `pi-auth-provider.tsx` 수정 — `payments` scope 추가

결제 기능을 사용하려면 인증 시 `payments` scope를 반드시 포함해야 한다.

```typescript
// ⚠️ 기존 ['username', 'wallet_address'] → ['username', 'wallet_address', 'payments'] 로 변경
const auth = await window.Pi.authenticate(
  ['username', 'wallet_address', 'payments'],
  handleIncompletePayment   // ← 미완료 결제 핸들러 (섹션 6 참고)
)
```

### API 인증 방식 비교 (중요)

| 용도 | 헤더 형식 | 발급처 |
|---|---|---|
| 사용자 정보 조회 (`/v2/me`) | `Authorization: Bearer <accessToken>` | `Pi.authenticate` 결과 |
| **결제 API** (`/v2/payments/...`) | `Authorization: Key <PI_API_KEY>` | Pi Developer Portal |

> **두 가지를 절대 혼동하지 말 것** — Bearer는 사용자별, Key는 앱 전체 공용

---

## 5. 구현 코드 전체

### 5-1. 백엔드: `src/app/api/payments/approve/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'

const PI_PAYMENTS_URL = 'https://api.minepi.com/v2/payments'

export async function POST(request: NextRequest) {
  const apiKey = process.env.PI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'PI_API_KEY 미설정' }, { status: 500 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const { paymentId } = body as { paymentId?: string }
  if (!paymentId) {
    return NextResponse.json({ error: 'paymentId 필요' }, { status: 400 })
  }

  // ⚠️ 승인 전에 반드시 서버에서 결제 유효성 검증
  // (amount, metadata 등을 DB 주문과 대조)
  // const order = await db.orders.findByPaymentId(paymentId)
  // if (!order || order.amount !== expectedAmount) return 400

  try {
    const res = await fetch(`${PI_PAYMENTS_URL}/${paymentId}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,   // ← Bearer 아닌 Key
      },
    })
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: `Pi 승인 실패: ${err}` }, { status: res.status })
    }
    const payment = (await res.json()) as PaymentDTO
    return NextResponse.json({ success: true, payment })
  } catch {
    return NextResponse.json({ error: 'Pi API 연결 실패' }, { status: 502 })
  }
}
```

### 5-2. 백엔드: `src/app/api/payments/complete/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'

const PI_PAYMENTS_URL = 'https://api.minepi.com/v2/payments'

export async function POST(request: NextRequest) {
  const apiKey = process.env.PI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'PI_API_KEY 미설정' }, { status: 500 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const { paymentId, txid } = body as { paymentId?: string; txid?: string }
  if (!paymentId || !txid) {
    return NextResponse.json({ error: 'paymentId, txid 필요' }, { status: 400 })
  }

  try {
    const res = await fetch(`${PI_PAYMENTS_URL}/${paymentId}/complete`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ txid }),
    })
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: `Pi 완료 실패: ${err}` }, { status: res.status })
    }
    const payment = (await res.json()) as PaymentDTO

    // 여기서 DB에 결제 완료 기록
    // await db.orders.markComplete({ paymentId, txid, completedAt: new Date() })

    return NextResponse.json({ success: true, payment })
  } catch {
    return NextResponse.json({ error: 'Pi API 연결 실패' }, { status: 502 })
  }
}
```

### 5-3. 프론트엔드: `src/components/pi-payment-button.tsx`

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface PiPaymentButtonProps {
  amount: number
  memo: string
  metadata?: Record<string, unknown>
  onSuccess?: (paymentId: string, txid: string) => void
  onCancel?: (paymentId: string) => void
  children?: React.ReactNode
}

export function PiPaymentButton({
  amount,
  memo,
  metadata = {},
  onSuccess,
  onCancel,
  children,
}: PiPaymentButtonProps) {
  const [status, setStatus] = useState<
    'idle' | 'approving' | 'waiting' | 'completing' | 'done' | 'error'
  >('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handlePayment = () => {
    if (!window.Pi) {
      setErrorMsg('Pi SDK가 로드되지 않았습니다 (Pi Browser 필요)')
      return
    }

    setStatus('approving')
    setErrorMsg(null)

    window.Pi.createPayment(
      { amount, memo, metadata },
      {
        // Phase 1: 서버가 결제를 승인해야 다이얼로그 활성화
        onReadyForServerApproval: async (paymentId) => {
          try {
            const res = await fetch('/api/payments/approve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId }),
            })
            if (!res.ok) throw new Error('서버 승인 실패')
            setStatus('waiting')
          } catch (err) {
            setStatus('error')
            setErrorMsg(err instanceof Error ? err.message : '승인 오류')
          }
        },

        // Phase 3: 블록체인 완료 후 서버에 통보
        onReadyForServerCompletion: async (paymentId, txid) => {
          setStatus('completing')
          try {
            const res = await fetch('/api/payments/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId, txid }),
            })
            if (!res.ok) throw new Error('서버 완료 처리 실패')
            setStatus('done')
            onSuccess?.(paymentId, txid)
          } catch (err) {
            setStatus('error')
            setErrorMsg(err instanceof Error ? err.message : '완료 처리 오류')
          }
        },

        onCancel: (paymentId) => {
          setStatus('idle')
          onCancel?.(paymentId)
        },

        onError: (error) => {
          setStatus('error')
          setErrorMsg(error.message)
        },
      }
    )
  }

  const labels: Record<typeof status, string> = {
    idle: '결제하기',
    approving: '승인 중…',
    waiting: '결제 확인 중…',
    completing: '완료 처리 중…',
    done: '결제 완료 ✓',
    error: '다시 시도',
  }

  return (
    <div className='flex flex-col gap-1'>
      <Button
        onClick={handlePayment}
        disabled={status === 'approving' || status === 'waiting' || status === 'completing'}
      >
        {children ?? labels[status]}
      </Button>
      {status === 'done' && (
        <p className='text-xs text-green-600'>결제가 성공적으로 완료됐습니다.</p>
      )}
      {errorMsg && (
        <p className='text-destructive text-xs'>{errorMsg}</p>
      )}
    </div>
  )
}
```

### 5-4. 사용 예시

```tsx
// page.tsx 또는 다른 클라이언트 컴포넌트에서
import { PiPaymentButton } from '@/components/pi-payment-button'

<PiPaymentButton
  amount={1}
  memo='프리미엄 구독 1개월'
  metadata={{ orderId: 'ORDER-001', plan: 'premium' }}
  onSuccess={(paymentId, txid) => {
    console.log('결제 완료:', paymentId, txid)
    // 구독 활성화 처리
  }}
  onCancel={(paymentId) => {
    console.log('결제 취소:', paymentId)
  }}
>
  π 1 Pi로 결제
</PiPaymentButton>
```

---

## 6. 미완료 결제 처리 (필수)

결제 도중 네트워크 오류, 앱 종료 등으로 Phase 1 또는 Phase 3가 완료되지 않으면
다음 로그인 시 `onIncompletePaymentFound` 콜백이 트리거된다.
**반드시 구현하지 않으면 결제가 계속 누적되고 사용자가 새 결제를 할 수 없게 된다.**

### `pi-auth-provider.tsx` 수정

```typescript
// signIn 함수 내부 — onIncompletePaymentFound 콜백 구현
const handleIncompletePayment = async (payment: PaymentDTO) => {
  console.warn('미완료 결제 발견:', payment.identifier, payment.status)

  try {
    if (payment.status.developer_approved && !payment.status.developer_completed) {
      // Phase 3 미완료: 블록체인은 완료됐지만 서버 /complete 미호출
      // transaction이 있다면 완료 재시도
      if (payment.transaction?.txid) {
        await fetch('/api/payments/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentId: payment.identifier,
            txid: payment.transaction.txid,
          }),
        })
      }
    } else if (!payment.status.developer_approved) {
      // Phase 1 미완료: 승인 재시도
      await fetch('/api/payments/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: payment.identifier }),
      })
    }
  } catch (err) {
    console.error('미완료 결제 처리 실패:', err)
  }
}

// authenticate 호출 시 반드시 handleIncompletePayment 전달
const auth = await window.Pi.authenticate(
  ['username', 'wallet_address', 'payments'],
  handleIncompletePayment   // ← 이 콜백 없으면 미완료 결제 영구 누적
)
```

### 서버에서 미완료 결제 전체 조회

```typescript
// GET /api/payments/incomplete — 앱 관리자용
// Pi API: GET https://api.minepi.com/v2/payments/incomplete_server_payments
export async function GET() {
  const res = await fetch(
    'https://api.minepi.com/v2/payments/incomplete_server_payments',
    { headers: { Authorization: `Key ${process.env.PI_API_KEY}` } }
  )
  const data = await res.json()
  return NextResponse.json(data)
}
```

---

## 7. 핵심 함정 (반드시 읽을 것)

### ❌ 함정 1 — `payments` scope 누락

**증상**: `createPayment` 호출 시 오류 또는 다이얼로그 미표시

**원인**: `Pi.authenticate(['username'])` 에서 `'payments'` 누락

**올바른 코드**:
```typescript
Pi.authenticate(['username', 'wallet_address', 'payments'], ...)
//                                               ^^^^^^^^ 필수
```

---

### ❌ 함정 2 — API 인증 헤더 혼동 (가장 흔한 실수)

**증상**: 결제 API가 401 Unauthorized 반환

**원인**: 사용자 `accessToken`으로 결제 API를 호출함
결제 API는 **앱 서버 API 키**가 필요하고, 형식도 `Key`지 `Bearer`가 아님

**잘못된 코드**:
```typescript
headers: { Authorization: `Bearer ${accessToken}` }   // ❌ 사용자 토큰
```

**올바른 코드**:
```typescript
headers: { Authorization: `Key ${process.env.PI_API_KEY}` }  // ✅ 서버 API 키
```

---

### ❌ 함정 3 — onReadyForServerApproval에서 approve 미호출

**증상**: Phase 1에서 멈추고 결제 다이얼로그가 열리지 않음

**원인**: `onReadyForServerApproval` 콜백에서 서버 `/approve`를 호출하지 않음.
Pi SDK는 서버 승인을 기다린 후에만 Phase 2로 진행한다.

---

### ❌ 함정 4 — onReadyForServerCompletion에서 complete 미호출

**증상**: 결제는 됐는데 앱에서 확인이 안 됨. 다음 로그인 시 미완료 결제 누적.

**원인**: Phase 3 콜백에서 서버 `/complete` 호출 누락.
`onCancel`이 아닌 정상 완료 후에도 반드시 `/complete`를 호출해야 한다.

---

### ❌ 함정 5 — metadata 검증 미수행

**증상**: 결제 금액/상품이 조작될 수 있음 (보안 취약점)

**원인**: 서버 `/approve` 에서 `metadata`와 DB 주문을 대조하지 않음

**올바른 패턴**:
```typescript
// POST /api/payments/approve 서버 코드에서
const payment = await getPaymentFromPi(paymentId)  // Pi API로 결제 조회
const order = await db.orders.findById(payment.metadata.orderId)

// 반드시 검증
if (!order) return 400
if (order.amount !== payment.amount) return 400   // 금액 조작 방지
if (order.userId !== payment.user_uid) return 400 // 다른 사용자 결제 방지
```

---

### ❌ 함정 6 — createPayment를 Pi Browser 외부에서 호출

**증상**: 일반 브라우저에서 `window.Pi.createPayment` 가 작동 안 함

**원인**: 결제 기능은 Pi Browser 전용. `window.Pi` 자체는 정의돼 있어도 결제 다이얼로그를 띄울 수 없음.

**해결**: 결제 버튼을 Pi Browser 여부(`isInPiBrowser`)로 조건부 렌더링:
```tsx
const { isInPiBrowser } = usePiAuth()
if (!isInPiBrowser) return <p>Pi Browser에서만 결제 가능합니다</p>
```

---

### ❌ 함정 7 — 미완료 결제 핸들러 미구현

**증상**: 사용자가 결제를 다시 시도하려 하면 "미완료 결제가 있음" 오류로 막힘

**원인**: `onIncompletePaymentFound` 콜백을 빈 함수(`() => {}`)로 처리하거나 누락

**올바른 코드**: 섹션 6의 `handleIncompletePayment` 구현 필수

---

## 8. 완료 체크리스트

### 파일 생성

- [ ] `src/app/api/payments/approve/route.ts` — Phase 1 서버 승인
- [ ] `src/app/api/payments/complete/route.ts` — Phase 3 서버 완료
- [ ] `src/components/pi-payment-button.tsx` — 결제 UI 컴포넌트
- [ ] `src/types/pi-payment.ts` — 공유 타입 정의

### 파일 수정

- [ ] `types/pi-network.d.ts` — `PaymentData`, `PaymentCallbacks`, `PaymentDTO`, `PiSDK.createPayment` 추가
- [ ] `src/components/pi-auth-provider.tsx` — scope에 `'payments'` 추가, `handleIncompletePayment` 구현
- [ ] `src/env.ts` — `PI_API_KEY` 서버 스키마 추가

### 환경변수

- [ ] `.env.local` — `PI_API_KEY` 설정 (Pi Developer Portal에서 발급)
- [ ] `.env.example` — `PI_API_KEY` 플레이스홀더 추가
- [ ] Vercel 대시보드 — `PI_API_KEY` 프로덕션 값 설정

### 보안 검증

- [ ] `/approve` 에서 `metadata` ↔ DB 주문 금액 대조
- [ ] `/approve` 에서 `payment.user_uid` ↔ 세션 사용자 UID 대조
- [ ] `PI_API_KEY` 클라이언트 코드에 노출 없음 (NEXT_PUBLIC_ 금지)
- [ ] `/complete` 에서 txid 저장 후 중복 완료 방지 (idempotent)

### 기능 검증

- [ ] Pi Browser에서 결제 버튼 표시 확인
- [ ] Phase 1 → Phase 2 → Phase 3 전체 흐름 통과
- [ ] 결제 취소(`onCancel`) 후 재결제 가능 확인
- [ ] 미완료 결제 재시도 확인 (앱 강제 종료 후 재로그인)
- [ ] `payments` scope 없이 `createPayment` 호출 시 에러 처리 확인

---

## 부록: PaymentDTO 상태 전이

```
생성(pending)
    │
    ▼ POST /approve
developer_approved: true
    │
    ▼ 사용자 Pi 지갑에서 서명
transaction_verified: true
    │
    ▼ POST /complete
developer_completed: true  ← 최종 완료 상태
    │
    또는
    ▼ 취소
cancelled: true  또는  user_cancelled: true
```

---

## 부록: Pi API 엔드포인트 요약

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| `GET` | `/v2/payments/{id}` | 결제 정보 조회 | `Key <API_KEY>` |
| `POST` | `/v2/payments/{id}/approve` | Phase 1 승인 | `Key <API_KEY>` |
| `POST` | `/v2/payments/{id}/complete` | Phase 3 완료 | `Key <API_KEY>` |
| `GET` | `/v2/payments/incomplete_server_payments` | 미완료 결제 목록 | `Key <API_KEY>` |

Base URL: `https://api.minepi.com`
