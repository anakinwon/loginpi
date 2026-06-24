# 이용후기 시스템 코드 설계 개요

**작성:** 2026-06-24  
**담당:** feedback-reward-architect  
**상태:** Phase 1 기획 완료 (API 구현 대기)

---

## 1. 시스템 아키텍처 개요

### 1-1. 계층별 구조

```
┌─────────────────────────────────────────────┐
│         UI Layer (React Components)         │
├─────────────────────────────────────────────┤
│  FeedbackFormModal   StarRating   FeedbackList
│  ClientFeedbackGate  MaskedUsername
└──────────────────────┬──────────────────────┘
                       │ piFetch
                       ▼
┌─────────────────────────────────────────────┐
│      API Layer (Next.js Route Handlers)     │
├─────────────────────────────────────────────┤
│  POST   /api/feedback/create                │
│  GET    /api/feedback/list                  │
│  GET    /api/feedback/[id]                  │
│  PATCH  /api/feedback/[id]/update           │
│  DELETE /api/feedback/[id]                  │
│  PATCH  /api/feedback/admin/[id]/visibility │
│  GET    /api/admin/feedback/stats           │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│      Service Layer (Business Logic)         │
├─────────────────────────────────────────────┤
│  feedbackService.create()                   │
│    ├─ 거래 인증 (order/msg 확인)             │
│    ├─ 중복 검사 (UNIQUE)                     │
│    ├─ 자매점 차단                            │
│    ├─ 본문 검증                              │
│    ├─ Bean 조회 (bean_fee_plan)             │
│    ├─ Transaction 시작                      │
│    │  ├─ fbck_mst INSERT                   │
│    │  ├─ fbck_img INSERT                   │
│    │  ├─ fn_bean_apply RPC                 │
│    │  ├─ fbck_mst UPDATE (reward flag)     │
│    │  └─ Transaction Commit                │
│    └─ Response (Bean 보상액 포함)            │
│                                              │
│  feedbackService.list()                     │
│    ├─ 조건 필터링 (shop_id/order_id)        │
│    ├─ 페이지네이션                          │
│    └─ 평점 통계 계산                        │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│      Data Layer (Supabase + RPC)            │
├─────────────────────────────────────────────┤
│  fbck_mst             (후기 마스터)          │
│  fbck_img             (후기 이미지)          │
│  bean_fee_plan        (Bean 요금제)          │
│  bean_txn             (Bean 거래 원장)       │
│  bean_wlt             (Bean 지갑)            │
│  fn_bean_apply        (RPC - 원자적 처리)    │
│  mps_order            (주문 검증)            │
│  mps_shop             (카페 검증)            │
│  msg_msg              (채팅 이력 검증)       │
│  sys_user             (사용자 조회)          │
└─────────────────────────────────────────────┘
```

---

## 2. API 엔드포인트 설계

### 2-1. POST /api/feedback/create — 후기 작성 + Bean 지급

#### Request
```typescript
interface CreateFeedbackRequest {
  shop_id?: string  // UUID (카페 후기)
  order_id?: string // UUID (상품 후기)
  fbck_scr: number  // 1~5 정수
  fbck_cn: string   // 10~500자
  fbck_img?: Array<{ img_url: string }>  // 최대 5개
}
```

#### Response (201)
```typescript
interface CreateFeedbackResponse {
  fbck_id: string
  fbck_scr: number
  bean_rwrd_qty: number // 60/70/80/90/100
  rwrd_dtm: ISO8601
  message: string // "후기가 저장되었고, 100 Bean 보상을 받으셨습니다!"
}
```

#### Error Cases
| Code | Error | Reason |
|------|-------|--------|
| 400 | InvalidInput | fbck_scr 범위, fbck_cn 길이 등 |
| 401 | Unauthorized | 로그인 필수 |
| 403 | Forbidden | 자신의 카페/상품, 거래 미인증 |
| 409 | Conflict | 중복 후기 (UNIQUE 위반) |
| 500 | TransactionFailed | Bean 지급 실패 (RPC 에러) |

#### 핵심 구현 로직
```typescript
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const payload = await req.json()
  
  // ① 데이터 검증
  validateFeedback(payload)
  
  // ② 거래 인증 (order_id 또는 shop_id + msg 확인)
  if (payload.order_id) {
    await verifyOrderDelivered(payload.order_id, user.id)
  } else if (payload.shop_id) {
    await verifyShopMessage(payload.shop_id, user.id)
  }
  
  // ③ 자매점 차단
  if (payload.shop_id) {
    await checkNotShopOwner(payload.shop_id, user.id)
  }
  
  // ④ Bean 조회
  const beanQty = await getRewardBeans(payload.fbck_scr)
  
  // ⑤ Transaction
  return await supabaseAdmin.rpc('fn_feedback_create', {
    p_usr_id: user.id,
    p_shop_id: payload.shop_id || null,
    p_order_id: payload.order_id || null,
    p_fbck_scr: payload.fbck_scr,
    p_fbck_cn: payload.fbck_cn,
    p_fbck_img_urls: payload.fbck_img?.map(img => img.img_url) || [],
    p_bean_qty: beanQty
  }).then(result => {
    return new Response(JSON.stringify({
      fbck_id: result.fbck_id,
      fbck_scr: payload.fbck_scr,
      bean_rwrd_qty: beanQty,
      rwrd_dtm: result.rwrd_dtm,
      message: `후기가 저장되었고, ${beanQty} Bean 보상을 받으셨습니다!`
    }), { status: 201 })
  })
}
```

### 2-2. GET /api/feedback/list — 후기 목록 조회

#### Query Parameters
```
?shop_id=uuid&order_id=uuid&page=1&limit=20&sort=recent&score=5
```

#### Response (200)
```typescript
interface FeedbackListResponse {
  data: Array<{
    fbck_id: string
    usr_id: string
    display_name: string  // 마스킹된 명
    fbck_scr: number
    fbck_cn: string
    fbck_img: string[]
    reg_dtm: ISO8601
  }>
  stats: {
    avg_score: number
    total_count: number
    score_dist: { "5": number, "4": number, ... }
  }
  pagination: {
    page: number
    limit: number
    total: number
  }
}
```

#### 핵심 로직
```typescript
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const shopId = searchParams.get('shop_id')
  const orderId = searchParams.get('order_id')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  
  let query = supabaseAdmin
    .from('fbck_mst')
    .select('*, fbck_img(*)', { count: 'exact' })
    .eq('del_yn', 'N')
    .eq('hide_yn', 'N')
  
  if (shopId) query = query.eq('shop_id', shopId)
  if (orderId) query = query.eq('order_id', orderId)
  
  const { data, count } = await query
    .order('reg_dtm', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)
  
  // 마스킹 처리
  const masked = data.map(fbck => ({
    ...fbck,
    display_name: maskUsername(fbck.usr_id)
  }))
  
  // 통계 계산
  const statQuery = shopId ? { shop_id: shopId } : { order_id: orderId }
  const stats = await calculateStats(statQuery)
  
  return new Response(JSON.stringify({
    data: masked,
    stats,
    pagination: { page, limit, total: count }
  }))
}
```

### 2-3. PATCH /api/feedback/[fbck_id]/update — 후기 수정

#### Request
```typescript
interface UpdateFeedbackRequest {
  fbck_scr?: number   // 변경 가능 (Bean 재보상 없음)
  fbck_cn?: string    // 변경 가능
  fbck_img?: Array<{ img_ord: number, img_url: string }> // 추가/삭제
}
```

#### Response (200)
```typescript
{
  fbck_id: string
  fbck_scr: number
  message: "후기가 수정되었습니다. (Bean 재보상 없음)"
}
```

#### 제약 사항
```typescript
// 24시간 이내만 수정 가능
const createdAt = new Date(fbck.reg_dtm)
const elapsedMs = Date.now() - createdAt.getTime()
if (elapsedMs > 24 * 60 * 60 * 1000) {
  throw new Error('작성 후 24시간이 지났습니다')
}

// 작성자 확인
if (fbck.usr_id !== user.id && !isAdmin(user)) {
  throw new Error('권한 없음')
}

// 점수 변경 → Bean 재지급 안 함 (rwrd_yn='Y' 유지)
// fbck_scr 변경 시에도 bean_rwrd_qty 및 rwrd_yn 불변
```

### 2-4. DELETE /api/feedback/[fbck_id] — 후기 삭제 (논리삭제)

#### Response (200)
```typescript
{ message: "후기가 삭제되었습니다" }
```

#### 로직
```typescript
// 논리 삭제만
await supabaseAdmin
  .from('fbck_mst')
  .update({ del_yn: 'Y', del_dtm: new Date().toISOString() })
  .eq('fbck_id', fbckId)

// Bean 환수 안 함 (bean_txn 기록 유지)
```

### 2-5. PATCH /api/feedback/admin/[fbck_id]/visibility — 관리자 숨김

#### Request
```typescript
{
  hide_yn: 'Y' | 'N'
  hide_reason_txt?: string  // hide_yn='Y' 일 때만
}
```

#### Response (200)
```typescript
{
  fbck_id: string
  hide_yn: 'Y' | 'N'
  hide_reason_txt: string
  hide_dtm: ISO8601
}
```

### 2-6. GET /api/admin/feedback/stats — 통계 조회

#### Query Parameters
```
?date_from=2026-06-01&date_to=2026-06-30
```

#### Response (200)
```typescript
{
  total_count: number
  avg_score: number
  score_dist: { "1": n, "2": n, ... "5": n }
  daily_trend: Array<{
    date: string
    count: number
    avg_score: number
  }>
  report_stats: {
    pending: number
    resolved: number
  }
}
```

---

## 3. 컴포넌트 구조

### 3-1. 후기 작성 컴포넌트 트리

```
src/components/feedback/
├─ FeedbackFormModal.tsx
│  ├─ StarRating.tsx
│  ├─ TextInput.tsx (fbck_cn)
│  ├─ ImageUploader.tsx
│  │  └─ S3Upload
│  └─ SubmitButton.tsx
├─ FeedbackList.tsx
│  ├─ FeedbackItem.tsx
│  │  ├─ MaskedUsername.tsx
│  │  └─ ImageGallery.tsx
│  ├─ ScoreDistribution.tsx
│  └─ Pagination.tsx
└─ FeedbackStats.tsx

src/components/admin/feedback/
├─ FeedbackManagement.tsx
│  ├─ FeedbackTable.tsx
│  ├─ HideModal.tsx
│  └─ ReportTab.tsx
└─ FeedbackStatsChart.tsx
```

### 3-2. FeedbackFormModal 설계

```typescript
interface FeedbackFormModalProps {
  shopId?: string
  orderId?: string
  onSuccess?: (fbck: Feedback) => void
  onError?: (error: Error) => void
}

export function FeedbackFormModal({ shopId, orderId, onSuccess }: Props) {
  const [score, setScore] = useState(0)
  const [text, setText] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [beanReward, setBeanReward] = useState(0) // 실시간 표시
  
  // 별점 변경 시 Bean 실시간 표시
  useEffect(() => {
    if (score > 0) {
      const beans = [60, 70, 80, 90, 100]
      setBeanReward(beans[score - 1])
    }
  }, [score])
  
  const handleSubmit = async () => {
    setIsLoading(true)
    try {
      const formData = new FormData()
      formData.append('shop_id', shopId || '')
      formData.append('order_id', orderId || '')
      formData.append('fbck_scr', score)
      formData.append('fbck_cn', text)
      images.forEach((img, i) => formData.append(`fbck_img[${i}]`, img))
      
      const res = await piFetch('/api/feedback/create', {
        method: 'POST',
        body: formData
      })
      
      const data = await res.json()
      
      if (res.ok) {
        toast.success(`후기가 저장되었고, ${data.bean_rwrd_qty} Bean 보상을 받으셨습니다!`, {
          icon: <BeanIcon /> // 카페빈 아이콘
        })
        onSuccess?.(data)
      } else {
        toast.error(data.message)
        onError?.(new Error(data.error))
      }
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <Modal>
      <div className="space-y-4">
        {/* 별점 */}
        <StarRating value={score} onChange={setScore} />
        
        {/* Bean 실시간 표시 */}
        {beanReward > 0 && (
          <div className="text-sm text-gray-600">
            <BeanIcon className="inline" /> 
            {beanReward} Bean 보상을 받을 예정입니다
          </div>
        )}
        
        {/* 본문 입력 */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="최소 10자 이상의 후기를 남겨주세요"
          className="w-full border rounded p-2"
          minLength={10}
        />
        
        {/* 이미지 업로드 */}
        <ImageUploader
          maxFiles={5}
          onFilesSelected={setImages}
        />
        
        {/* 제출 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={isLoading || score === 0 || text.length < 10}
          className="w-full bg-blue-500 text-white rounded py-2 disabled:opacity-50"
        >
          {isLoading ? '저장 중...' : '후기 작성'}
        </button>
      </div>
    </Modal>
  )
}
```

### 3-3. StarRating 컴포넌트

```typescript
interface StarRatingProps {
  value: number
  onChange: (score: number) => void
  readOnly?: boolean
}

export function StarRating({ value, onChange, readOnly }: Props) {
  const [hover, setHover] = useState(0)
  
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          onClick={() => !readOnly && onChange(score)}
          onMouseEnter={() => !readOnly && setHover(score)}
          onMouseLeave={() => !readOnly && setHover(0)}
          className={`text-4xl transition ${
            score <= (hover || value) ? 'text-yellow-400' : 'text-gray-300'
          }`}
        >
          ★
        </button>
      ))}
    </div>
  )
}
```

---

## 4. 인증 및 보안 설계

### 4-1. 클라이언트 게이트 패턴

```typescript
// src/app/[locale]/feedback/page.tsx
import { getSessionUser } from '@/lib/auth-check'
import ClientFeedbackPage from '@/components/feedback/ClientFeedbackPage'

export default async function FeedbackPage() {
  const user = await getSessionUser()
  
  // getSessionUser() null 시 redirect 금지
  // 대신 클라이언트 게이트 렌더
  if (!user) {
    return <ClientFeedbackPage />
  }
  
  return <FeedbackContent userId={user.id} />
}

// src/components/feedback/ClientFeedbackPage.tsx
'use client'

export function ClientFeedbackPage() {
  const user = useSessionUser() // 클라이언트 세션 훅
  
  if (!user) {
    return (
      <div className="text-center">
        <p>로그인이 필요합니다</p>
        <button onClick={() => router.push('/auth/login')}>
          로그인
        </button>
      </div>
    )
  }
  
  return <FeedbackContent />
}
```

### 4-2. API 보안 패턴

```typescript
// src/app/api/feedback/create.ts
import { getSessionUser } from '@/lib/auth-check'
import { isAdmin } from '@/lib/auth-check'

export async function POST(req: NextRequest) {
  // ① 인증
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // ② 권한 (admin은 어떤 사용자의 후기든 작성 가능, 일반 사용자는 자신의 후기만)
  const payload = await req.json()
  if (payload.usr_id && payload.usr_id !== user.id && !isAdmin(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  // ③ 데이터 검증
  try {
    validateFeedback(payload)
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  
  // ④ 비즈니스 로직 (거래 인증, 중복 검사, Bean 지급)
  // ...
}
```

### 4-3. 입력 검증

```typescript
function validateFeedback(payload: CreateFeedbackRequest) {
  // fbck_scr: 1~5 정수
  if (typeof payload.fbck_scr !== 'number' || payload.fbck_scr < 1 || payload.fbck_scr > 5) {
    throw new Error('별점은 1~5 정수여야 합니다')
  }
  
  // fbck_cn: 10~500자 (공백 제외)
  const trimmed = payload.fbck_cn.trim()
  if (trimmed.length < 10 || trimmed.length > 500) {
    throw new Error('후기는 10~500자여야 합니다')
  }
  
  // fbck_img: 최대 5개, URL 검증
  if (payload.fbck_img && payload.fbck_img.length > 5) {
    throw new Error('이미지는 최대 5개까지만 가능합니다')
  }
  
  // URL whitelist
  const allowedDomains = ['s3.amazonaws.com', 'supabase.co']
  payload.fbck_img?.forEach(img => {
    const url = new URL(img.img_url)
    if (!allowedDomains.some(domain => url.hostname.includes(domain))) {
      throw new Error('지원하지 않는 이미지 서버입니다')
    }
  })
  
  // shop_id 또는 order_id 필수 (XOR)
  if (!payload.shop_id && !payload.order_id) {
    throw new Error('카페 또는 상품 ID가 필요합니다')
  }
}
```

---

## 5. 타입 정의

```typescript
// src/types/feedback.ts
export interface Feedback {
  fbck_id: string
  usr_id: string
  shop_id?: string
  order_id?: string
  prod_id?: string
  fbck_scr: number // 1~5
  fbck_cn: string
  bean_rwrd_qty: number
  rwrd_yn: 'Y' | 'N'
  rwrd_dtm?: string
  hide_yn: 'Y' | 'N'
  hide_reason_txt?: string
  hide_dtm?: string
  del_yn: 'Y' | 'N'
  del_dtm?: string
  reg_dtm: string
  mod_dtm: string
}

export interface FeedbackImage {
  fbck_img_id: string
  fbck_id: string
  img_ord: number // 1~5
  img_url: string
  del_yn: 'Y' | 'N'
  reg_dtm: string
}

export interface FeedbackStats {
  avg_score: number
  total_count: number
  score_dist: {
    [key in '1' | '2' | '3' | '4' | '5']: number
  }
}

export interface CreateFeedbackRequest {
  shop_id?: string
  order_id?: string
  fbck_scr: number
  fbck_cn: string
  fbck_img?: Array<{ img_url: string }>
}

export interface CreateFeedbackResponse {
  fbck_id: string
  fbck_scr: number
  bean_rwrd_qty: number
  rwrd_dtm: string
  message: string
}
```

---

## 6. 구현 순서 및 의존성

### Phase 2A: Backend Core (1주)
1. **DB 마이그레이션** → `sql/115_fbck_schema.sql` 적용
2. **Service Layer**
   - `src/lib/feedback.ts` — CRUD 함수
   - `src/lib/feedback-validation.ts` — 입력 검증
   - `src/lib/feedback-bean.ts` — Bean 조회 + fn_bean_apply 호출
3. **API Routes**
   - `POST /api/feedback/create` (Bean 지급 포함)
   - `GET /api/feedback/list`
   - `GET /api/feedback/[id]`

### Phase 2B: Backend Admin (1주)
4. **Admin API Routes**
   - `PATCH /api/feedback/admin/[id]/visibility`
   - `GET /api/admin/feedback/stats`
5. **RPC 함수 (향후)**
   - `fn_feedback_create()` — 원자적 처리 (현재는 route에서 수동)

### Phase 3: Frontend (1주)
6. **컴포넌트**
   - `FeedbackFormModal.tsx`
   - `StarRating.tsx`
   - `FeedbackList.tsx`
   - `ClientFeedbackGate.tsx`
7. **통합**
   - 상품 상세 페이지 → 후기 모달 추가
   - 카페 상세 페이지 → 후기 목록 표시

### Phase 4: QA (1주)
8. **테스트**
   - 단위 테스트 (Bean 지급 멱등성)
   - 통합 테스트 (API + DB)
   - Pi Browser 실기기 검증

---

## 7. 성능 고려사항

### 인덱싱
```sql
-- 주요 조회 패턴 인덱싱
idx_fbck_mst_shop_active(shop_id, del_yn, hide_yn, reg_dtm DESC)
idx_fbck_mst_order_active(order_id, del_yn, hide_yn)
idx_fbck_mst_usr_recent(usr_id, reg_dtm DESC)
idx_fbck_mst_score_dist(fbck_scr, reg_dtm DESC)
```

### 캐싱 전략 (향후)
- 카페/상품별 평점 캐시 (TTL=1시간)
- 통계 캐시 (일일 배치)

### 쿼리 최적화
- N+1 방지: fbck_mst + fbck_img 배치 조회
- 페이지네이션 필수 (limit=20)

---

## 8. 모니터링 대시보드 (향후)

```sql
-- 실시간 모니터링 쿼리
SELECT
  COUNT(*) as daily_feedbacks,
  AVG(fbck_scr) as avg_score,
  SUM(bean_rwrd_qty) as bean_distributed_today
FROM fbck_mst
WHERE DATE(reg_dtm) = CURRENT_DATE AND del_yn='N';
```

---

## 참고 문서

- **PRD**: `docs/PRD_20_FEEDBACK.md` (전체 요구사항)
- **DB Schema**: `sql/115_fbck_schema.sql` (DDL)
- **Bean 인프라**: `sql/067_bean_wallet.sql`, `sql/070_bean_tokenomics_governance.sql`
- **인증**: `src/lib/auth-check.ts`, `CLAUDE.md § 인증 및 세션`
- **마스킹**: `src/lib/mask-username.ts`

