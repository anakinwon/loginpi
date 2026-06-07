# Pi Network 결제(Payments) 구현 스킬

Pi Coin으로 결제를 처리하는 전체 흐름 — 실제 구현 기준 정리.

> **전제**: Pi 인증이 완료되어 있어야 한다. → `@.claude/skills/pi_auth/SKILL.md` 참고

---

## 목차

0. [요청 프롬프트](#0-요청-프롬프트)
1. [결제 타입](#1-결제-타입)
2. [결제 3단계 흐름](#2-결제-3단계-흐름)
3. [구현된 파일 구조](#3-구현된-파일-구조)
4. [환경변수](#4-환경변수)
5. [핵심 코드](#5-핵심-코드)
6. [반드시 알아야 할 함정 7가지](#6-반드시-알아야-할-함정-7가지)
7. [완료 체크리스트](#7-완료-체크리스트)
8. [다른 프로젝트에서 재사용하기](#8-다른-프로젝트에서-재사용하기)

---

## 0. 요청 프롬프트

```
You are an expert Pi Network payment developer.
Implement Pi Network U2A payment flow in this Next.js 16 App Router codebase.

Requirements:
- Full 3-phase flow: createPayment() → onReadyForServerApproval → POST /approve → user wallet → onReadyForServerCompletion → POST /complete
- onIncompletePayment handler for automatic recovery of stuck payments
- Sandbox/mainnet toggle via NEXT_PUBLIC_PI_SANDBOX env var
- Pi Browser only — show appropriate fallback UI in regular browsers

Critical:
- /complete MUST be called — missing it permanently blocks future payments for that user
- Payment API uses 'Authorization: Key <PI_API_KEY>' NOT 'Bearer <accessToken>'
- 'payments' scope must be included in Pi.authenticate() scopes array

Do not explain. Write all file changes directly.
```

---

## 1. 결제 타입

| 구분 | U2A (User → App) | A2U (App → User) |
|---|---|---|
| 방향 | 사용자가 앱에 결제 | 앱이 사용자에게 지급 |
| 용도 | 구매, 구독, 결제 | 환불, 보상, 상금 |
| 지원 | ✅ **메인넷 + 테스트넷** | ⚠️ **테스트넷 전용** |
| 구현 방법 | `window.Pi.createPayment()` | 별도 Backend SDK 필요 |

> **이 문서는 U2A만 다룬다.**

---

## 2. 결제 3단계 흐름

```
사용자         프론트엔드              서버                 Pi Network
  │                │                   │                       │
  │ 결제 버튼 클릭 │                   │                       │
  ├───────────────►│                   │                       │
  │                │ createPayment()   │                       │
  │                ├──────────────────────────────────────────►│
  │                │                   │                       │
  │ ─── Phase 1: 서버 승인 ─────────────────────────────────── │
  │                │ onReadyForServerApproval(paymentId)        │
  │                ├──────────────────►│                       │
  │                │                   │ POST /payments/approve│
  │                │                   ├──────────────────────►│
  │                │                   │◄──────────────────────│
  │                │◄──────────────────│                       │
  │                │                   │                       │
  │ ─── Phase 2: 사용자 확인 ──────────────────────────────── │
  │◄───────────────│ Pi 지갑 화면 표시 │                       │
  │ 결제 승인      │                   │                       │
  ├───────────────►│──────────────────────────────────────────►│
  │                │              블록체인 트랜잭션 처리         │
  │                │◄──────────────────────────────────────────│
  │                │                   │                       │
  │ ─── Phase 3: 서버 완료 ─────────────────────────────────── │
  │                │ onReadyForServerCompletion(paymentId, txid)│
  │                ├──────────────────►│                       │
  │                │                   │ POST /payments/complete
  │                │                   │ body: { txid }        │
  │                │                   ├──────────────────────►│
  │ 결제 완료 표시 │◄──────────────────│◄──────────────────────│
  │◄───────────────│                   │                       │
```

### 3단계 핵심 규칙

| Phase | 조건 | 결과 |
|---|---|---|
| 1 미완료 | `/approve` 미호출 | Pi 지갑 화면이 열리지 않음 |
| 3 미완료 | `/complete` 미호출 | 미완료 결제로 누적 → 다음 결제 차단 |
| 콜백 4개 | 모두 구현 필수 | onApproval, onCompletion, onCancel, onError |

---

## 3. 구현된 파일 구조

```
src/
├── components/
│   ├── pi-pay-button.tsx        # 수량 입력 + 결제 버튼 (단순 결제)
│   ├── pi-product-card.tsx      # 상품명/수량/단가 결제 카드
│   ├── pi-payment-demo.tsx      # 자유 금액 데모 컴포넌트
│   └── pi-auth-provider.tsx     # payments scope + 미완료 결제 복구
├── app/api/payments/
│   ├── approve/route.ts         # Phase 1 — 서버 승인
│   └── complete/route.ts        # Phase 3 — 서버 완료 기록
types/
└── pi-network.d.ts              # PaymentDTO, PaymentCallbacks 등 전역 타입
```

### 컴포넌트 용도 비교

| 컴포넌트 | 입력 항목 | 용도 |
|---|---|---|
| `PiPayButton` | Pi 수량만 | 간단한 수량 입력 → 결제 |
| `PiProductCard` | 상품명 + 수량 + 단가 | 상품 기반 결제 |
| `PiPaymentDemo` | 자유 금액 입력 | 데모/테스트용 |

---

## 4. 환경변수

```env
# Pi Developer Portal → 앱 설정 → API Key 에서 발급
# ⚠️ accessToken(Bearer)과 완전히 다른 키 — 서버 전용, 클라이언트 노출 절대 금지
PI_API_KEY=your-pi-server-api-key
```

### API 인증 방식 — 가장 흔한 혼동 포인트

| API | 헤더 | 키 종류 |
|---|---|---|
| 사용자 정보 `/v2/me` | `Authorization: Bearer <accessToken>` | 사용자 로그인 토큰 |
| **결제** `/v2/payments/...` | `Authorization: Key <PI_API_KEY>` | 앱 서버 전용 키 |

> **`Bearer`와 `Key`를 절대 혼동하지 말 것** — 혼동 시 401 Unauthorized

---

## 5. 핵심 코드

### 5-1. 프론트엔드 — `createPayment` 호출 패턴

```typescript
window.Pi.createPayment(
  {
    amount: 1,                              // Pi 금액
    memo: '상품1 구매',                     // 사용자에게 표시되는 설명
    metadata: { orderId: '001', ... },      // 서버 검증용 — 앱 내부 데이터
  },
  {
    // Phase 1: 반드시 /approve 호출해야 Pi 지갑 화면이 열림
    onReadyForServerApproval: async (paymentId) => {
      await fetch('/api/payments/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      })
    },

    // Phase 3: 반드시 /complete 호출해야 결제가 완전히 종료됨
    onReadyForServerCompletion: async (paymentId, txid) => {
      await fetch('/api/payments/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, txid }),
      })
    },

    onCancel: (paymentId) => { /* 취소 처리 */ },
    onError:  (error)     => { /* 오류 처리 */ },
  }
)
```

### 5-2. 백엔드 — `/api/payments/approve/route.ts`

```typescript
export async function POST(request: NextRequest) {
  const apiKey = process.env.PI_API_KEY          // ✅ Key 인증
  // if (!apiKey) → 500

  const { paymentId } = await request.json()

  // ⚠️ 실서비스: 여기서 DB 주문과 금액/사용자 대조 검증 필수
  // const order = await db.findByPaymentId(paymentId)
  // if (order.amount !== payment.amount) return 400

  const res = await fetch(
    `https://api.minepi.com/v2/payments/${paymentId}/approve`,
    { method: 'POST', headers: { Authorization: `Key ${apiKey}` } }
  )
  // → 200 OK 시 Pi 지갑 화면 활성화
}
```

### 5-3. 백엔드 — `/api/payments/complete/route.ts`

```typescript
export async function POST(request: NextRequest) {
  const { paymentId, txid } = await request.json()

  const res = await fetch(
    `https://api.minepi.com/v2/payments/${paymentId}/complete`,
    {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ txid }),          // ← txid 필수
    }
  )
  // → 여기서 DB에 결제 완료 기록
}
```

### 5-4. 미완료 결제 복구 — `pi-auth-provider.tsx` 내부

```typescript
// Pi.authenticate 호출 시 두 번째 인자로 반드시 전달
async (payment: PaymentDTO) => {
  if (!payment.status.developer_approved) {
    // Phase 1 미완료 → 승인 재시도
    await fetch('/api/payments/approve', { ... })
  } else if (!payment.status.developer_completed && payment.transaction?.txid) {
    // Phase 3 미완료 → 완료 재시도
    await fetch('/api/payments/complete', { ... })
  }
}
```

### 5-5. TypeScript 전역 타입 — `types/pi-network.d.ts`

```typescript
interface PaymentDTO {
  identifier: string          // paymentId
  user_uid: string
  amount: number
  memo: string
  metadata: Record<string, unknown>
  from_address: string
  to_address: string
  direction: 'user_to_app' | 'app_to_user'
  network: 'Pi Network' | 'Pi Testnet'
  status: {
    developer_approved: boolean     // Phase 1 완료 여부
    transaction_verified: boolean   // 블록체인 확인
    developer_completed: boolean    // Phase 3 완료 여부
    cancelled: boolean
    user_cancelled: boolean
  }
  transaction: { txid: string; verified: boolean; _link: string } | null
  created_at: string
}

// PiSDK 인터페이스에 추가
interface PiSDK {
  createPayment(data: PaymentData, callbacks: PaymentCallbacks): void
}
```

---

## 6. 반드시 알아야 할 함정 7가지

### ❌ 함정 1 — `payments` scope 누락

**증상**: `createPayment` 호출해도 아무 반응 없음

```typescript
// ❌ 잘못된 코드
Pi.authenticate(['username', 'wallet_address'], ...)

// ✅ 올바른 코드
Pi.authenticate(['username', 'wallet_address', 'payments'], ...)
```

---

### ❌ 함정 2 — API 헤더 혼동 (가장 흔한 실수)

**증상**: 결제 API 401 Unauthorized

```typescript
// ❌ 잘못된 코드 — 사용자 토큰으로 결제 API 호출
headers: { Authorization: `Bearer ${accessToken}` }

// ✅ 올바른 코드 — 앱 서버 API 키
headers: { Authorization: `Key ${process.env.PI_API_KEY}` }
```

---

### ❌ 함정 3 — `onReadyForServerApproval`에서 `/approve` 미호출

**증상**: Phase 1에서 멈추고 Pi 지갑 화면이 열리지 않음

Pi SDK는 서버가 `/approve`를 호출해야만 Phase 2(사용자 지갑 화면)로 넘어간다.
콜백에서 fetch를 빠뜨리거나, await 없이 비동기 처리하면 영원히 대기 상태가 된다.

---

### ❌ 함정 4 — `onReadyForServerCompletion`에서 `/complete` 미호출

**증상**: 결제는 됐는데 앱에서 확인 불가. 다음 결제 시 미완료 결제 오류로 차단됨.

`/complete`를 호출하지 않으면 Pi Network 기준 "미완료" 상태로 남는다.
**미완료 결제가 1개라도 남아있으면 사용자가 새 결제를 시작할 수 없다.**

---

### ❌ 함정 5 — 미완료 결제 핸들러 미구현

**증상**: 네트워크 오류 후 재로그인 시 결제 차단. 사용자 이탈 발생.

`Pi.authenticate` 두 번째 인자(onIncompletePaymentFound)를 빈 함수로 두면 안 된다.
미완료 결제가 있을 때마다 자동 복구를 시도해야 한다.

---

### ❌ 함정 6 — metadata 검증 생략 (보안 취약점)

**증상**: 결제 금액 또는 상품 조작 가능

`/approve`에서 Pi API로 결제 정보를 조회한 후, DB 주문과 대조하지 않으면
클라이언트에서 금액을 조작해도 그대로 승인된다.

```typescript
// ✅ 실서비스 필수 검증 패턴
const order = await db.findByPaymentId(paymentId)
if (!order)                        return 400  // 없는 주문
if (order.amount !== piPayment.amount) return 400  // 금액 불일치
if (order.userId !== piPayment.user_uid) return 400 // 다른 사용자
```

---

### ❌ 함정 7 — Pi Browser 외부에서 `createPayment` 호출

**증상**: 일반 브라우저에서 결제 버튼 클릭 시 아무 반응 없음

`window.Pi`는 SDK가 로드되면 어느 브라우저에서도 정의되지만,
결제 다이얼로그는 Pi Browser 환경에서만 열린다.

```typescript
// ✅ usePiAuth()의 isInPiBrowser로 조건 처리
const { isInPiBrowser } = usePiAuth()
if (!isInPiBrowser) return <p>Pi Browser에서만 결제 가능합니다</p>
```

---

## 7. 완료 체크리스트

### 파일 생성

- [ ] `src/app/api/payments/approve/route.ts` — Phase 1 서버 승인
- [ ] `src/app/api/payments/complete/route.ts` — Phase 3 서버 완료
- [ ] `src/components/pi-pay-button.tsx` — 수량 입력 + 결제 버튼
- [ ] (선택) `src/components/pi-product-card.tsx` — 상품 결제 카드

### 파일 수정

- [ ] `types/pi-network.d.ts` — `PaymentDTO`, `PaymentCallbacks`, `createPayment` 추가
- [ ] `src/components/pi-auth-provider.tsx` — `payments` scope 추가 + 미완료 핸들러 구현

### 환경변수

- [ ] `.env.local` — `PI_API_KEY` 설정 (Pi Developer Portal 발급)
- [ ] Vercel 대시보드 — `PI_API_KEY` 프로덕션 값 추가

### 동작 검증 (Pi Browser에서)

- [ ] 결제 버튼 클릭 → Phase 1 → Pi 지갑 화면 열림
- [ ] Pi 지갑 승인 → Phase 3 → 결제 완료 표시
- [ ] Payment ID + TxID 정상 표시
- [ ] 결제 취소 후 재결제 가능
- [ ] 미완료 결제 복구 (앱 강제 종료 후 재로그인 시 자동 처리)

### 보안 (실서비스 전 필수)

- [ ] `/approve`에서 DB 주문과 금액·사용자 대조 검증
- [ ] `PI_API_KEY` 클라이언트 코드에 노출 없음 (`NEXT_PUBLIC_` 접두사 절대 금지)
- [ ] `/complete`에서 txid 저장 및 중복 처리 방지

---

## 8. 다른 프로젝트에서 재사용하기

### 필수 복사 파일 목록

```
# 이 파일들을 복사 후 환경변수만 변경하면 결제 기능 완성
src/app/api/payments/approve/route.ts
src/app/api/payments/complete/route.ts
src/components/pi-pay-button.tsx          # 단순 수량 입력 결제
src/components/pi-product-card.tsx        # 상품 기반 결제 (선택)
src/types/pi-network.d.ts                 # PaymentDTO 타입 포함 여부 확인
src/components/pi-auth-provider.tsx       # payments scope + 미완료 핸들러
```

### 패키지 설치

추가 패키지 불필요. Next.js 내장 `fetch` + Pi SDK CDN으로 구현.

```bash
# Pi SDK는 CDN으로 로드 (설치 없음)
# layout.tsx에 추가:
# <Script src="https://sdk.minepi.com/pi-sdk.js" strategy="beforeInteractive" />
```

### 커스터마이징 포인트

| 항목 | 기본값 | 변경 방법 |
|---|---|---|
| sandbox 모드 | `NEXT_PUBLIC_PI_SANDBOX=true` | env var 변경 |
| 결제 완료 후 동작 | 콘솔 로그 | `complete/route.ts`에 DB 저장 로직 추가 |
| 결제 금액 검증 | 없음 (데모) | `approve/route.ts`에 DB 대조 로직 추가 |
| 성공 UI | `toast` | `onReadyForServerCompletion` 콜백 수정 |

### 빠른 시작 명령어

```
1. pi_auth SKILL 먼저 구현 (Pi 인증 완제)
2. PI_API_KEY 환경변수 설정 (Pi Developer Portal)
3. NEXT_PUBLIC_PI_SANDBOX=true로 테스트넷 사용
4. 파일 복사 후 pnpm dev
5. Pi Browser에서 /에 접속 → 결제 버튼 테스트
```

### 실서비스 전 보안 체크

```typescript
// approve/route.ts에 반드시 추가
const piPayment = await fetch(`https://api.minepi.com/v2/payments/${paymentId}`, {
  headers: { Authorization: `Key ${process.env.PI_API_KEY}` }
}).then(r => r.json())

const order = await db.getOrder(paymentId)
if (order.amount !== piPayment.amount) return 400
if (order.userId !== piPayment.user_uid) return 400
```

---

## 부록 A — Pi 결제 API 엔드포인트

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| `GET` | `/v2/payments/{id}` | 결제 정보 조회 | `Key <API_KEY>` |
| `POST` | `/v2/payments/{id}/approve` | Phase 1 승인 | `Key <API_KEY>` |
| `POST` | `/v2/payments/{id}/complete` | Phase 3 완료 | `Key <API_KEY>` |
| `GET` | `/v2/payments/incomplete_server_payments` | 미완료 결제 목록 | `Key <API_KEY>` |

Base URL: `https://api.minepi.com`

---

## 부록 B — 결제 상태 전이

```
결제 생성
    │
    ▼ POST /approve 호출
developer_approved: true  →  Pi 지갑 화면 활성화
    │
    ▼ 사용자 Pi 지갑 승인
transaction_verified: true  →  블록체인 트랜잭션 완료
    │
    ▼ POST /complete 호출
developer_completed: true   →  최종 완료 ✓

    또는
    ▼
cancelled / user_cancelled: true  →  결제 취소
```
