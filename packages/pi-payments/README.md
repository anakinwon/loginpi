# @pi/payments — Pi U2A 결제 공용 패키지 (서버 전용)

Pi Browser 결제(U2A)의 서버 3단계(approve · complete · cancel)를 사이트 앱이 같은 안전 순서로 쓰게 하는 공용 패키지다.
도메인 로직(요금표·대상 상태)은 넣지 않는다 — 앱이 `metadata.type` 별 **검증기**로 넘긴다.

- 원장 : `pi_pymnt`(`packages/pi-db/sql/010_pi_pymnt.sql`) — 새 테이블·DDL 없음
- 출처 : `sitemap/sitemap.pi/src/lib/payments.ts` + `api/payments/{approve,complete,cancel}` 의 순서·멱등 처리를 일반화
- `import 'server-only'` — 클라이언트 컴포넌트에서 import 금지

## 필요한 환경변수 (이름만)

| 이름 | 용도 |
|---|---|
| `PI_API_KEY` | Pi Developer Portal 서버 API 키 — 없으면 모든 흐름이 `SERVER_CONFIG`(500) |
| `NEXT_PUBLIC_SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` | 원장 접근(앱이 `@pi/db` `getSupabaseAdmin()` 등으로 만든 클라이언트를 넘긴다) |

값 위치·발급처는 `docs/ENV_GUIDE.md` 정본.

## 안전 순서 (바꾸지 말 것)

| 단계 | 순서 |
|---|---|
| approve | Pi **GET** → 결제자(`user_uid` = 세션 `pi_uid`) → 방향 `user_to_app` → `metadata.type` 검증기(서버 정가 재계산) → Pi 측 취소 여부 → **정가 정확 일치**(10^7 정수 비교) → 원장 `APPROVED` → **그 다음** Pi approve. Pi approve 실패 시 Pi cancel + 원장 `CANCELED` |
| complete | 원장 선조회(본인·`APPROVED`, 없으면 Pi 호출 없이 409) → Pi complete → **txid 대조**(`payment.transaction.txid`) → `finalize`(앱 RPC) 또는 원장 `COMPLETED`. 같은 txid 재호출은 멱등 성공 |
| cancel | 본인 `APPROVED` 만, **Pi cancel 성공 시에만** `CANCELED`(서명 뒤 거래 진행 중이면 `PI_CANCEL_REFUSED`, 원장 유지). 원장 없으면 Pi 결제자 확인 뒤에만 Pi cancel(IDOR 차단) |

상태 전이 : (원장 없음 = PENDING) → `APPROVED` → `COMPLETED` | `CANCELED`. 되살리기 없음.
타임아웃 : Pi 결제 API 10초(`PI_PAY_TIMEOUT_MS`, `docs/BUILD_DEFECTS.md` 2.7 R-P4 예외).

## API

| 이름 | 설명 |
|---|---|
| `approvePayment({ db, user, paymentId, validators })` | → `{ ok, paymentId, type }` 또는 `PayFail` |
| `completePayment({ db, user, paymentId, txid, finalize? })` | → `{ ok, row, result?, already? }` 또는 `PayFail` |
| `cancelPayment({ db, user, paymentId })` | → `{ ok, status: 'NONE' \| 'CANCELED' }` 또는 `PayFail` |
| `verifyPayment(payment, user, validators)` | approve 2단계 검증만(순수) — `cancelPi` 로 Pi 취소 여부 |
| `getPiPayment` · `approvePiPayment` · `completePiPayment` · `cancelPiPayment` | Pi Platform API(실패는 `{ ok:false, status, body, error?, payment?, noKey? }`) |
| `getOwnPayment` · `insertApprovedPayment` · `markPaymentCanceled` · `markPaymentCompleted` | 원장 함수(첫 인자 `db`) |
| `hasOtherApprovedPayment(db, { types, metaKey, metaValue, exceptPaymentId })` | 같은 대상의 진행 중 결제 확인(이중 결제 방지) — 검증기 안에서 호출 |
| `canTransition` · `amountEquals` · `toUnits` · `PI_UNIT` | 순수 함수 |

`user` = `{ id: sys_user.usr_id, pi_uid }` — 앱이 `getSessionUser()`(쿠키 OR `X-Pi-Token`)로 확인한 값. null 이면 호출 전에 401(redirect 금지).

### PayFail 코드 → 앱 apiError 매핑 예

| 코드 | 상태 | sitemap.pi 코드 예 |
|---|---|---|
| `SERVER_CONFIG` | 500 | `SERVER_CONFIG` |
| `PI_API_FAILED` | 502 | `PAY_PI_APPROVE_FAILED` / `PAY_PI_COMPLETE_FAILED` |
| `NOT_PAYER` · `META_INVALID` · `NOT_FOUND`(complete) · `TXID_MISMATCH` | 403·400·409 | `PAY_SITE_MISMATCH` |
| `AMOUNT_MISMATCH` | 400 | `PAY_AMOUNT_SHORT` |
| `ALREADY_PAID` | 409 | `PAY_ALREADY_PAID` |
| `PI_CANCEL_REFUSED` | 409 | `PAY_PI_CANCEL_FAILED` |
| `DB_FAILED` | 500 | `dbFail` — `detail` 은 서버 로그에만 |
| 검증기 고유 코드 | 검증기 지정(기본 409) | 앱 정의 |

## 앱 연동 순서

1. 앱 `package.json` dependencies 에 `"@pi/payments": "workspace:*"` 추가 → `pnpm install`
2. DB 에 `pi_pymnt` 가 있어야 한다(`node scripts/db-migrate.mjs --app <site> --tier <tier>` — pi-db 폴더가 먼저 적용)
3. prepare 라우트는 앱이 직접 — 서버가 정가를 계산해 `{ amount, memo(ASCII, ™ 금지), metadata: { type, ... } }` 반환
4. 검증기와 approve 라우트 :

```ts
// src/lib/pay-validators.ts — metadata.type 별 서버 정가 재계산
import { hasOtherApprovedPayment, type Validators } from '@pi/payments'
import { getSupabaseAdmin } from '@pi/db'

export const validators: Validators = {
  MY_ITEM: async ({ payment }) => {
    const itemId = payment.metadata.item_id
    if (typeof itemId !== 'string') return { ok: false, code: 'META_INVALID', status: 400 }
    const [busy, price] = await Promise.all([
      hasOtherApprovedPayment(getSupabaseAdmin(), {
        types: ['MY_ITEM'],
        metaKey: 'item_id',
        metaValue: itemId,
        exceptPaymentId: payment.identifier,
      }),
      getItemPrice(itemId), // 앱 함수 — DB 요금표
    ])
    if (busy) return { ok: false, code: 'ALREADY_PAID' }
    if (price == null) return { ok: false, code: 'INVALID_STATE' }
    return { ok: true, amount: price }
  },
}
```

```ts
// src/app/api/payments/approve/route.ts
export async function POST(req: Request) {
  const user = await getSessionUser() // 쿠키 OR X-Pi-Token
  if (!user) return apiError('AUTH_REQUIRED', 401)
  const { paymentId } = await req.json() // zod 검증 권장
  const r = await approvePayment({ db: getSupabaseAdmin(), user, paymentId, validators })
  if (!r.ok) return apiError(mapCode(r.code), r.status) // r.detail 은 console.error 로만
  return NextResponse.json({ ok: true, paymentId: r.paymentId })
}
```

5. complete 라우트 : 도메인 반영(구매 확정·좌석 배정 등)이 있으면 원장 `COMPLETED` 와 **한 트랜잭션 RPC** 로 묶어 `finalize` 로 넘긴다(재호출 멱등). 없으면 생략.
6. 클라이언트는 `piFetch`(`@pi/auth/client`)로 호출 — 일반 `fetch` 는 Pi Browser 401
7. 완료 기준 : `pnpm build` + **Pi Browser 실기기에서 결제 1건(approve→complete)·취소 1건** 확인

## 시험

```bash
pnpm --filter @pi/payments test       # 순수 로직(상태 전이·소수 금액·검증기 배선) node:test
pnpm --filter @pi/payments typecheck  # tsc --noEmit
```

Pi API·원장 함수는 실 DB·Pi 키가 필요해 자동 시험 밖 — 앱 연동 시 Pi Testnet 실기기로 확인한다.

## sitemap.pi·cafe.pi 이관 [TBD]

- **sitemap.pi** : `lib/payments.ts` 의 Pi API·원장 함수와 approve/complete/cancel 라우트를 이 패키지로 교체 예정. SITE_REG·SITE_SPK·SITE_EFCT 정가 산정은 검증기 3개로, `fn_cmpl_site_*_pymnt` RPC 는 `finalize` 로 옮긴다. 차이 1건 — 이 패키지는 **결제자 확인을 metadata 검증보다 먼저** 한다(타인 결제를 Pi cancel 하지 않게). [TBD : 이관 시 Pi Browser 실기기 재검증]
- **cafe.pi(루트)** : 원장 테이블이 구 명칭(`pi_pymnt` 의 payment_id·amount·status·metadata)이고 complete 뒤 도메인 분기(구독·팁·주문·빈 등)가 많아 별도 설계 필요. [TBD : 컬럼 매핑 또는 어댑터 결정]
- 이관 전까지 두 앱은 기존 코드를 그대로 쓴다(이 패키지는 신규 앱 — seminar.pi 등 — 부터 적용).
