# PRD_USERS.md — 사용자 관리 화면 요구사항

> 담당 에이전트: `.claude/agents/user-profile-manager.md`
> 작성일: 2026-06-09
> 우선순위: **Pi Browser 실기기 동작 보장 최우선**

---

## 1. 개요

### 목적

Pi Browser 포함 모든 브라우저에서 사용자가 자신의 프로필을 확인·수정하고, 결제 내역과 구독 현황을 조회할 수 있는 **마이페이지** 기능을 제공한다.

### 범위

| 섹션 | 기능 |
|---|---|
| 개인정보 | real_nm, nick_nm, phone_no, addr, addr_dtl 수정; display_name 수정; pi_username·Google 계정 읽기 전용 표시 |
| 결제 내역 | pi_pymnt 테이블 기반 최근 결제 내역 조회 (최신순 20건) |
| 구독 현황 | msg_subscr + msg_subscr_plan 기반 현재 플랜 표시, 자동갱신 취소 가능 |

### 핵심 제약 (절대 훼손 금지)

| 제약 | 근거 |
|---|---|
| `getSessionUser()` null 시 `redirect()` 금지 | Pi Browser WebView 무한 루프 유발 |
| 모든 클라이언트 API 호출은 `piFetch()` 사용 | X-Pi-Token 헤더 자동 첨부 + credentials: 'include' |
| 물리 DELETE 금지 | DA 표준 — `del_yn = 'Y'` 논리삭제만 허용 |
| anon key 클라이언트 직접 사용 금지 | 모든 DB 접근은 서버 라우트를 통해서만 |

---

## 2. 화면 구성

### 라우팅

```
/[locale]/profile          → 프로필 메인 (탭 UI)
```

### 탭 레이아웃

```
┌─────────────────────────────────────────┐
│  👤 내 프로필                            │
│  ─────────────────────────────────────  │
│  [개인정보] [결제내역] [구독현황]          │
│  ─────────────────────────────────────  │
│  탭별 콘텐츠 영역                         │
└─────────────────────────────────────────┘
```

### 탭 1: 개인정보

```
pi_username: @john_pi           (읽기 전용, Pi 계정)
Google 계정: john@gmail.com     (읽기 전용, 미연동 시 "연동하기" 버튼)
─────────────────────────────
실명 (real_nm):       [___________]
닉네임 (nick_nm):     [___________]
표시 이름 (display_name): [_______]
전화번호 (phone_no):  [___________]
주소 (addr):          [___________]
상세주소 (addr_dtl):  [___________]
─────────────────────────────
                    [저장]
```

- `pi_username` 없으면 "Pi 미연동" 표시 (read-only)
- `google_email` 없으면 `/link` 페이지 링크 버튼 표시
- 저장 성공 시 sonner toast — "프로필이 업데이트되었습니다"
- 저장 실패 시 sonner toast — "저장 중 오류가 발생했습니다"

### 탭 2: 결제 내역

```
결제 내역 (최근 20건)
────────────────────────────────────────────
날짜          메모               금액    상태
2026-06-01   카페 생성        1 Pi   완료
2026-05-28   PREMIUM 구독      5 Pi   완료
...
────────────────────────────────────────────
결제 내역이 없습니다 (빈 상태)
```

- status 값 → 한국어 매핑: `completed` → `완료`, `approved` → `승인됨`, `cancelled` → `취소됨`
- metadata.type 값 → 한국어 설명:
  - `CHAT_ROOM_CREATE` → 카페 생성
  - `CHAT_SUBSCR` → 구독 결제
  - 기타 → memo 원문 표시
- 금액: `amount + " Pi"` 형식

### 탭 3: 구독 현황

```
현재 플랜: PREMIUM (월간)
만료일: 2026-07-01
자동갱신: ON  [자동갱신 해제]
─────────────────────────────
혜택:
  ✅ 월 3개 무료 카페 생성
  ✅ 프리미엄 테마 사용
  ✅ AI 월 10회 사용
  ✅ Pi Tip 전송
─────────────────────────────
FREE 플랜인 경우:
  "구독하여 더 많은 기능을 이용하세요" + [구독하기] 버튼
```

- FREE: 혜택 잠금 아이콘(🔒), 구독 유도 CTA
- PREMIUM/BUSINESS: 혜택 목록 + 자동갱신 토글
- 자동갱신 해제 → DELETE `/api/subscriptions` → "자동갱신이 해제되었습니다" toast
- 구독하기 버튼 → `/chat` 페이지로 이동 (구독 결제는 카페 화면에서)

---

## 3. DB 스키마 변경

### 신규 마이그레이션: `sql/014_user_profile_columns.sql`

```sql
-- 사용자 프로필 확장 컬럼 추가
-- DA 표준: 시스템 컬럼(regr_id, reg_dtm, modr_id, mod_dtm)은 이미 존재
ALTER TABLE sys_user
  ADD COLUMN IF NOT EXISTS real_nm   TEXT,
  ADD COLUMN IF NOT EXISTS nick_nm   TEXT,
  ADD COLUMN IF NOT EXISTS phone_no  TEXT,
  ADD COLUMN IF NOT EXISTS addr      TEXT,
  ADD COLUMN IF NOT EXISTS addr_dtl  TEXT;

COMMENT ON COLUMN sys_user.real_nm   IS '실명';
COMMENT ON COLUMN sys_user.nick_nm   IS '닉네임';
COMMENT ON COLUMN sys_user.phone_no  IS '전화번호';
COMMENT ON COLUMN sys_user.addr      IS '주소';
COMMENT ON COLUMN sys_user.addr_dtl  IS '상세주소';
```

### UserRow 타입 확장 (`src/lib/users.ts`)

```typescript
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
  // 신규 프로필 컬럼
  real_nm: string | null
  nick_nm: string | null
  phone_no: string | null
  addr: string | null
  addr_dtl: string | null
  reg_dtm: string
  mod_dtm: string
}
```

---

## 4. 파일 배치 규칙

```
src/
├── app/
│   ├── [locale]/
│   │   └── profile/
│   │       ├── page.tsx                      # Server Component + Client Gate
│   │       └── _components/
│   │           ├── profile-tabs.tsx           # 'use client' — 탭 컨트롤러
│   │           ├── profile-form.tsx           # 'use client' — 개인정보 수정 폼
│   │           ├── payment-history.tsx        # 'use client' — 결제 내역
│   │           ├── subscription-status.tsx    # 'use client' — 구독 현황
│   │           └── client-profile-gate.tsx   # 'use client' — Pi Browser 게이트
│   └── api/
│       └── profile/
│           └── route.ts                       # GET (프로필 조회), PATCH (수정)
│           └── payments/
│               └── route.ts                   # GET (결제 내역)
└── lib/
    └── users.ts                               # updateUserProfile() 추가
```

**주의**: 구독 현황은 기존 `/api/subscriptions/check` (GET) 와 `/api/subscriptions` (DELETE) 재사용 — 신규 API 불필요.

---

## 5. API 명세

### 5-1. GET `/api/profile`

**목적**: 현재 로그인 사용자의 프로필 조회

**인증**: `getSessionUser()` — 쿠키 OR `X-Pi-Token` 헤더

**응답 (200)**:
```typescript
{
  user: {
    id: string
    pi_username: string | null
    pi_wallet_address: string | null
    google_email: string | null
    google_name: string | null
    display_name: string
    real_nm: string | null
    nick_nm: string | null
    phone_no: string | null
    addr: string | null
    addr_dtl: string | null
    role: string
    reg_dtm: string
  }
}
```

**에러**:
- `401 { error: 'unauthorized' }` — 미인증

---

### 5-2. PATCH `/api/profile`

**목적**: 프로필 정보 수정

**인증**: `getSessionUser()`

**요청 본문** (모든 필드 선택적):
```typescript
{
  display_name?: string  // 1~50자
  real_nm?: string       // 최대 100자
  nick_nm?: string       // 최대 50자
  phone_no?: string      // 최대 30자
  addr?: string          // 최대 200자
  addr_dtl?: string      // 최대 100자
}
```

**입력 검증** (zod):
- 빈 문자열 허용 (필드 초기화 지원)
- XSS 방지: HTML 태그 제거 (`.trim()` + strip 처리)
- `display_name`: 최소 1자 (빈 문자열 불허)

**처리**:
- `sys_user` UPDATE (WHERE id = user.id)
- `modr_id = user.id`, `mod_dtm = CURRENT_TIMESTAMP` 자동 갱신

**응답 (200)**:
```typescript
{ user: UserRow }  // 업데이트된 전체 프로필
```

**에러**:
- `400 { error: 'validation_error', details: [...] }` — 입력 검증 실패
- `401 { error: 'unauthorized' }` — 미인증

---

### 5-3. GET `/api/profile/payments`

**목적**: 현재 사용자의 결제 내역 조회

**인증**: `getSessionUser()`

**쿼리 파라미터**: `?limit=20&offset=0` (기본값: limit=20, offset=0)

**DB 쿼리**:
```sql
SELECT payment_id, amount, memo, metadata, status, txid, reg_dtm
FROM pi_pymnt
WHERE user_id = :userId
  AND del_yn = 'N'
ORDER BY reg_dtm DESC
LIMIT :limit OFFSET :offset
```

**응답 (200)**:
```typescript
{
  payments: Array<{
    payment_id: string
    amount: number
    memo: string
    metadata: Record<string, unknown>  // { type: 'CHAT_ROOM_CREATE' | 'CHAT_SUBSCR' | ... }
    status: string                     // 'approved' | 'completed' | 'cancelled'
    txid: string | null
    reg_dtm: string
  }>
  total: number
}
```

**에러**:
- `401 { error: 'unauthorized' }`

---

### 5-4. 구독 현황 (기존 API 재사용)

| 작업 | 엔드포인트 | 메서드 |
|---|---|---|
| 구독 현황 조회 | `/api/subscriptions/check` | GET |
| 자동갱신 취소 | `/api/subscriptions` | DELETE |

**`/api/subscriptions/check` 응답 활용 필드**:
```typescript
{
  tier: 'FREE' | 'PREMIUM' | 'BUSINESS'
  plan_cd: string
  plan_nm: string
  expire_dtm: string | null
  auto_renew_yn: 'Y' | 'N' | null
  canTip: boolean
  canUsePremiumTheme: boolean
  canCreateEventRoom: boolean
  canCreateRoomFree: boolean
  roomQuota: number   // -1 = 무제한
  aiQuota: number     // -1 = 무제한
}
```

---

## 6. 컴포넌트 설계

### 6-1. `profile/page.tsx` — Server Component

```tsx
import { getSessionUser } from '@/lib/auth-check'
import { ClientProfileGate } from './_components/client-profile-gate'
import { ProfileTabs } from './_components/profile-tabs'

export default async function ProfilePage() {
  const user = await getSessionUser()

  // Pi Browser는 Set-Cookie 미저장 → redirect 금지 → 클라이언트 게이트로 위임
  if (!user) return <ClientProfileGate />

  return (
    <div className='mx-auto max-w-2xl px-4 py-8'>
      <h1 className='mb-6 text-2xl font-bold'>내 프로필</h1>
      <ProfileTabs initialUser={user} />
    </div>
  )
}
```

---

### 6-2. `_components/client-profile-gate.tsx`

**동작 흐름**:
1. 마운트 시 `localStorage.getItem('pi_token')` 확인
2. 토큰 있으면 → `piFetch('/api/profile')` 호출
3. 성공(200) → `<ProfileTabs>` 렌더
4. 실패(401) → "Pi로 로그인하세요" 메시지 + 로그인 버튼

```tsx
'use client'

// 상태: 'loading' | 'loaded' | 'unauthenticated'
// loaded 시: ProfileTabs를 클라이언트에서 렌더
// unauthenticated 시: 로그인 유도 UI
```

---

### 6-3. `_components/profile-form.tsx`

**Props**: `initialUser: UserRow`

**상태**: `useOptimistic` 또는 일반 `useState` + `piFetch` PATCH

**필드 구성**:
- 읽기 전용 섹션: pi_username, google_email (수정 불가 시각적으로 구분)
- Google 미연동 시: "Google 계정 연동하기" 버튼 → `href='/link'`
- 편집 가능 필드: display_name, real_nm, nick_nm, phone_no, addr, addr_dtl
- 저장 버튼: `piFetch('/api/profile', { method: 'PATCH', body: ... })`

---

### 6-4. `_components/payment-history.tsx`

**마운트 시 동작**: `piFetch('/api/profile/payments')` 호출

**UI 상태**:
- loading: 스켈레톤 3행
- 결제 없음: "결제 내역이 없습니다" 빈 상태
- 결과 있음: 테이블 렌더

**metadata.type 한국어 변환 함수**:
```typescript
function getPaymentLabel(memo: string, metadata: Record<string, unknown>): string {
  const type = metadata?.type as string
  if (type === 'CHAT_ROOM_CREATE') return '카페 생성'
  if (type === 'CHAT_SUBSCR') return '구독 결제'
  return memo
}
```

---

### 6-5. `_components/subscription-status.tsx`

**마운트 시 동작**: `piFetch('/api/subscriptions/check')` 호출

**UI 상태**:
- FREE 플랜: 잠금된 혜택 목록 + "구독하기" → `/chat` 링크
- PREMIUM/BUSINESS: 혜택 목록 (✅ 아이콘) + 만료일 + 자동갱신 상태

**자동갱신 해제 핸들러**:
```typescript
async function handleCancelAutoRenew() {
  const res = await piFetch('/api/subscriptions', { method: 'DELETE' })
  if (res.ok) toast.success('자동갱신이 해제되었습니다.')
  else toast.error('오류가 발생했습니다.')
  reloadSubscription()  // 상태 재조회
}
```

---

## 7. users.ts 추가 함수

```typescript
// src/lib/users.ts 에 추가
export interface ProfileUpdateData {
  display_name?: string
  real_nm?: string
  nick_nm?: string
  phone_no?: string
  addr?: string
  addr_dtl?: string
}

export async function updateUserProfile(
  userId: string,
  data: ProfileUpdateData
): Promise<UserRow> {
  const db = getSupabaseAdmin()
  const { data: updated, error } = await db
    .from('sys_user')
    .update({
      ...data,
      modr_id: userId,
      mod_dtm: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single()
  if (error) throw error
  return updated as UserRow
}
```

---

## 8. 번역 키 (`messages/ko.json`)

`profile` 네임스페이스 추가:

```json
{
  "profile": {
    "title": "내 프로필",
    "tabs": {
      "info": "개인정보",
      "payments": "결제 내역",
      "subscription": "구독 현황"
    },
    "info": {
      "piAccount": "Pi 계정",
      "googleAccount": "Google 계정",
      "notLinked": "미연동",
      "linkGoogle": "Google 계정 연동하기",
      "displayName": "표시 이름",
      "realName": "실명",
      "nickname": "닉네임",
      "phoneNo": "전화번호",
      "address": "주소",
      "addressDetail": "상세주소",
      "save": "저장",
      "saveSuccess": "프로필이 업데이트되었습니다",
      "saveError": "저장 중 오류가 발생했습니다"
    },
    "payments": {
      "title": "결제 내역",
      "empty": "결제 내역이 없습니다",
      "date": "날짜",
      "description": "내역",
      "amount": "금액",
      "status": "상태",
      "statusCompleted": "완료",
      "statusApproved": "승인됨",
      "statusCancelled": "취소됨",
      "typeChatRoom": "카페 생성",
      "typeSubscription": "구독 결제"
    },
    "subscription": {
      "title": "구독 현황",
      "currentPlan": "현재 플랜",
      "expireDate": "만료일",
      "autoRenew": "자동갱신",
      "autoRenewOn": "ON",
      "autoRenewOff": "OFF",
      "cancelAutoRenew": "자동갱신 해제",
      "cancelAutoRenewSuccess": "자동갱신이 해제되었습니다",
      "cancelAutoRenewError": "오류가 발생했습니다",
      "freePlanCta": "구독하여 더 많은 기능을 이용하세요",
      "subscribe": "구독하기",
      "benefits": {
        "roomQuota": "월 {count}개 무료 카페 생성",
        "roomUnlimited": "무제한 카페 생성",
        "aiQuota": "AI 월 {count}회 사용",
        "aiUnlimited": "AI 무제한 사용",
        "canTip": "Pi Tip 전송",
        "premiumTheme": "프리미엄 테마 사용",
        "eventRoom": "이벤트 카페 개설"
      }
    }
  }
}
```

---

## 9. Pi Browser 동작 흐름 다이어그램

```
일반 브라우저 (쿠키 있음)
  → GET /[locale]/profile
  → Server: getSessionUser() → user 반환
  → <ProfileTabs initialUser={user} /> SSR 렌더
  → 탭 전환 시 클라이언트에서 piFetch 호출

Pi Browser (쿠키 없음)
  → GET /[locale]/profile
  → Server: getSessionUser() → null
  → <ClientProfileGate /> 렌더
  → Client: localStorage.getItem('pi_token')
    ├─ 토큰 없음 → "Pi로 로그인하세요" UI
    └─ 토큰 있음 → piFetch('/api/profile')
                     → X-Pi-Token 헤더 첨부
                     → Server: X-Pi-Token 검증
                     → user 반환
                     → <ProfileTabs> 클라이언트 렌더
```

---

## 10. 검증 체크리스트 (작업완료 전 필수 통과)

### Phase 1: 로컬 개발 서버 (`pnpm dev`)

- [ ] `pnpm tsc --noEmit` — TypeScript 에러 없음
- [ ] 일반 브라우저 로그인 상태 → `/profile` SSR 렌더 (개인정보 탭 표시)
- [ ] 일반 브라우저 비로그인 → `/profile` → ClientProfileGate 렌더, "Pi로 로그인" 버튼
- [ ] 개인정보 탭: 수정 후 저장 → `PATCH /api/profile` 200 → Supabase `sys_user` 반영 확인
- [ ] 결제 내역 탭: 목록 렌더 (데이터 없을 때 빈 상태 UI 정상)
- [ ] 구독 현황 탭: FREE 플랜 기본값 표시, 구독하기 CTA 표시
- [ ] 구독 중 계정: 만료일·자동갱신 표시, 자동갱신 해제 버튼 → DELETE 성공 → 상태 갱신

### Phase 2: Playwright 테스트 (X-Pi-Token 헤더 시뮬레이션)

```typescript
// 비로그인 접속 → ClientProfileGate 확인
await page.goto('/profile')
await expect(page.locator('[data-testid="pi-login-cta"]')).toBeVisible()

// localStorage 토큰 주입 후 프로필 로드
await page.evaluate(() => localStorage.setItem('pi_token', TEST_PI_TOKEN))
await page.reload()
await expect(page.locator('[data-testid="profile-form"]')).toBeVisible()

// PATCH 수정 저장
await page.fill('[data-testid="nick-nm-input"]', '테스트닉네임')
await page.click('[data-testid="save-button"]')
await expect(page.locator('[data-testid="save-success-toast"]')).toBeVisible()
```

### Phase 3: Pi Browser 실기기 검증 (배포 후 사용자 확인)

- [ ] Pi Browser에서 `/profile` 접속 → ClientProfileGate 표시
- [ ] Pi 로그인 후 `/profile` 재접속 → 프로필 폼 표시
- [ ] 닉네임 수정 → 저장 → 페이지 새로고침 후 변경 유지
- [ ] 결제 내역 탭 전환 → 내역 표시
- [ ] 구독 현황 탭 전환 → 현재 플랜 표시

---

## 11. 구현 순서

1. **DB 마이그레이션** — `sql/014_user_profile_columns.sql` 작성 + Supabase 적용
2. **타입/CRUD 확장** — `src/lib/users.ts`에 `UserRow` 컬럼 추가 + `updateUserProfile()` 구현
3. **API 구현**
   - `src/app/api/profile/route.ts` (GET / PATCH)
   - `src/app/api/profile/payments/route.ts` (GET)
4. **UI 구현**
   - `client-profile-gate.tsx` (Pi Browser 게이트)
   - `profile-form.tsx` (개인정보 폼)
   - `payment-history.tsx` (결제 내역)
   - `subscription-status.tsx` (구독 현황)
   - `profile-tabs.tsx` (탭 컨트롤러)
   - `profile/page.tsx` (Server Component)
5. **번역 키 추가** — `messages/ko.json`에 `profile` 네임스페이스
6. **검증** — Phase 1 → Phase 2 → Phase 3 순서대로 통과 후 완료 처리
