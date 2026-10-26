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
| approve | Pi **GET** → 결제자(`user_uid` = 세션 `pi_uid`) → 방향 `user_to_app` → `metadata.type` 검증기(서버 정가 재계산) → Pi 측 취소 여부 → **정가 정확 일치**(10^7 정수 비교) → 원장 `APPROVED`(같은 대상 동시 결제는 부분 유일 인덱스가 23505 → `ALREADY_PAID`) → **그 다음** Pi approve. Pi approve 실패 시 Pi 재조회 — `developer_approved` 면 성공, 아니면 Pi cancel 하고 **성공했을 때만** 원장 `CANCELED`(거부되면 `APPROVED` 유지 → complete 가 복구). 검증기 거부 시 본인 원장 행이 이미 있으면 Pi cancel 하지 않음 |
| complete | 원장 선조회(본인·`APPROVED`, 없으면 Pi 호출 없이 409) → Pi complete → **txid 대조**(`payment.transaction.txid`) → `finalize`(앱 RPC) 또는 원장 `COMPLETED`. 같은 txid 재호출은 멱등 성공. 원장 갱신 0행(동시 취소 등)은 재조회해 같은 txid `COMPLETED` 만 성공, 그 외 `INVALID_STATE`(로그) |
| cancel | 본인 `APPROVED` 만, **Pi cancel 성공 시에만** `CANCELED`(서명 뒤 거래 진행 중이면 `PI_CANCEL_REFUSED`, 원장 유지). 원장 없으면 Pi 결제자 확인 뒤에만 Pi cancel(IDOR 차단) |

상태 전이 : (원장 없음 = PENDING) → `APPROVED` → `COMPLETED` | `CANCELED`. 되살리기 없음.
타임아웃 : Pi 결제 API 10초(`PI_PAY_TIMEOUT_MS`, `docs/BUILD_DEFECTS.md` 2.7 R-P4 예외).

## API

| 이름 | 설명 |
|---|---|
| `approvePayment({ db, user, paymentId, validators })` | → `{ ok, paymentId, type }` 또는 `PayFail` |
| `completePayment({ db, user, paymentId, txid, finalize? })` | → `{ ok, row, result?, already? }` 또는 `PayFail` — `row` 는 `COMPLETED`·`tx_id` 반영 행(`finalize` 의 `ctx.row` 는 갱신 전 행) |
| `cancelPayment({ db, user, paymentId })` | → `{ ok, status: 'NONE' \| 'CANCELED' }` 또는 `PayFail` |
| `verifyPayment(payment, user, validators)` | approve 2단계 검증만(순수) — `cancelPi` 로 Pi 취소 여부 |
| `getPiPayment` · `approvePiPayment` · `completePiPayment` · `cancelPiPayment` | Pi Platform API(실패는 `{ ok:false, status, body, error?, payment?, noKey? }`) |
| `getOwnPayment` · `insertApprovedPayment` · `markPaymentCanceled` · `markPaymentCompleted` | 원장 함수(첫 인자 `db`). `insertApprovedPayment` 는 23505 → `{ inserted:false, busy:true }`, `markPaymentCompleted` 는 갱신 행 또는 `null`(0행) |
| `approvedTargetIndexSql({ nn, metaKey, types })` | 같은 대상 진행 중 결제 1건 제한 부분 유일 인덱스 DDL 문자열(아래 '이중 결제 차단') |
| `hasOtherApprovedPayment(db, { types, metaKey, metaValue, exceptPaymentId })` | 같은 대상의 진행 중 결제 확인(이중 결제 방지) — 검증기 안에서 호출 |
| `canTransition` · `amountEquals` · `toUnits` · `PI_UNIT` | 순수 함수 — `amountEquals` 는 숫자·비어 있지 않은 숫자 문자열만, 정가 0 이하 거부 |

`user` = `{ id: sys_user.usr_id, pi_uid }` — 앱이 `getSessionUser()`(쿠키 OR `X-Pi-Token`)로 확인한 값. null 이면 호출 전에 401(redirect 금지).

### PayFail 코드 → 앱 apiError 매핑 예

| 코드 | 상태 | sitemap.pi 코드 예 |
|---|---|---|
| `SERVER_CONFIG` | 500 | `SERVER_CONFIG` |
| `PI_API_FAILED` | 502(Pi 응답 없음·비 JSON·본문 수신 중 타임아웃은 내부 `status:0`) | `PAY_PI_APPROVE_FAILED` / `PAY_PI_COMPLETE_FAILED` |
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

   - 검증기의 대상 중복 확인은 **반드시 `exceptPaymentId: payment.identifier`** 로 자기 결제를 빼고 한다(approve 재호출 때 자기 결제를 중복으로 오판하지 않게).
   - **이중 결제 차단(R-P5) 필수** — 아래 '이중 결제 차단' 인덱스를 앱 DB 에 둔다.
5. complete 라우트 : 도메인 반영(구매 확정·좌석 배정 등)이 있으면 원장 `COMPLETED` 와 **한 트랜잭션 RPC** 로 묶어 `finalize` 로 넘긴다(재호출 멱등). 없으면 생략.
6. 클라이언트는 `piFetch`(`@pi/auth/client`)로 호출 — 일반 `fetch` 는 Pi Browser 401
7. 완료 기준 : `pnpm build` + **Pi Browser 실기기에서 결제 1건(approve→complete)·취소 1건** 확인

## 이중 결제 차단 (R-P5)

`hasOtherApprovedPayment`(조회) → `insertApprovedPayment`(기록)는 2단계라 같은 대상에 대한 approve 2건이 동시에 오면 둘 다 통과한다.
DB 가 최종으로 막도록 앱 `sql/` 에 **부분 유일 인덱스**를 둔다 — 위반(23505)은 `insertApprovedPayment` 가 잡아 `approvePayment` 가 Pi 결제를 취소하고 `ALREADY_PAID`(409)로 돌려준다.

```ts
// 일회성 — 출력을 앱 sql/NNN_*.sql 에 붙이고 DA-APPROVED 머리 주석의 근거·일자를 채운다
import { approvedTargetIndexSql } from '@pi/payments'
console.log(approvedTargetIndexSql({ nn: '01', metaKey: 'item_id', types: ['MY_ITEM'] }))
```

```sql
-- DA-APPROVED: <승인 근거·일자> — pi_pymnt 대상(item_id) 진행 중 결제 1건 제한(@pi/payments approvedTargetIndexSql)
CREATE UNIQUE INDEX IF NOT EXISTS x_pi_pymnt_01
  ON pi_pymnt ((meta_val ->> 'item_id'))
  WHERE pymnt_sts_cd = 'APPROVED' AND del_yn = 'N' AND pymnt_tp_cd IN ('MY_ITEM');
```

- 이름 `x_pi_pymnt_NN`(DA 표준 §5) — `NN` 은 앱 DB 안에서 겹치지 않게.
- `types` 는 검증기의 `hasOtherApprovedPayment({ types })` 와 같게 — 여러 유형이면 그 유형들끼리도 같은 대상 1건. 키가 없는 행은 NULL 이라 충돌하지 않는다.
- 결정 : 아소카 결정(마스터 위임 2026-10-26) — 패키지는 DDL 을 실행하지 않고 문자열만 준다(원장 baseline `010_pi_pymnt.sql` 은 대상 키를 모르므로). 키·유형 형식을 검사해 주입을 막는다.

## 시험

```bash
pnpm --filter @pi/payments test       # 순수 로직 + 가짜 fetch·가짜 Supabase 로 흐름 실패 경로(approve 되돌림·complete 0행·Pi 본문 오류·23505) node:test
pnpm --filter @pi/payments typecheck  # tsc --noEmit
```

실 Pi Platform API·실 Supabase 는 자동 시험 밖(가짜로 대체) — 앱 연동 시 Pi Testnet 실기기로 확인한다. 시험은 `test/resolve-ts.mjs` 해석 훅으로 src 의 확장자 없는 import 를 `.ts` 로 찾는다.

## sitemap.pi·cafe.pi 이관 [TBD]

- **sitemap.pi** : `lib/payments.ts` 의 Pi API·원장 함수와 approve/complete/cancel 라우트를 이 패키지로 교체 예정. SITE_REG·SITE_SPK·SITE_EFCT 정가 산정은 검증기 3개로, `fn_cmpl_site_*_pymnt` RPC 는 `finalize` 로 옮긴다. 차이 1건 — 이 패키지는 **결제자 확인을 metadata 검증보다 먼저** 한다(타인 결제를 Pi cancel 하지 않게). [TBD : 이관 시 Pi Browser 실기기 재검증]
- **cafe.pi(루트)** : 원장 테이블이 구 명칭(`pi_pymnt` 의 payment_id·amount·status·metadata)이고 complete 뒤 도메인 분기(구독·팁·주문·빈 등)가 많아 별도 설계 필요. [TBD : 컬럼 매핑 또는 어댑터 결정]
- 이관 전까지 두 앱은 기존 코드를 그대로 쓴다(이 패키지는 신규 앱 — seminar.pi 등 — 부터 적용).
