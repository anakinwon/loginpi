# 요금제 전환 관리자 화면 설계

> **경로**: `src/app/[locale]/(admin)/admin/fee-mode/page.tsx`  
> **참고**: db-switch / ui-themes 패턴 재사용  
> **상태**: 설계안 (구현은 설계 승인 후)

---

## 1. 화면 레이아웃

```
┌─────────────────────────────────────────────────────────┐
│ 요금제 전환                    (MASTER 권한 필수)         │
├─────────────────────────────────────────────────────────┤
│                                                           │
│ 📋 현재 상태                                              │
│ ┌───────────────────────────────────────────────────┐   │
│ │ 활성 요금제:  ● Bean Token   (마지막 변경: 10분 전) │   │
│ │                                                   │   │
│ │ 설명: 평상시 운영 — Bean Token 요금제            │   │
│ │                                                   │   │
│ │ 시스템 상태:                                      │   │
│ │  · 진행 중 거래: 0건                             │   │
│ │  · 활성 구독: 1,234건                            │   │
│ │  · 최근 Bean 차감: 2026-06-29 09:45:00 UTC       │   │
│ └───────────────────────────────────────────────────┘   │
│                                                           │
│ 🔄 전환하기                                              │
│ ┌───────────────────────────────────────────────────┐   │
│ │ 목표 요금제를 선택하세요                          │   │
│ │                                                   │   │
│ │ [● Bean Token]  [○ Pi Coin]                       │   │
│ │                                                   │   │
│ │ 전환 사유 (선택):                                 │   │
│ │ [입력 필드: "메인넷 등재 준비"]                   │   │
│ │                                                   │   │
│ │ [확인 및 전환]  [취소]                             │   │
│ │                                                   │   │
│ │ ⚠️ 주의: 진행 중 거래가 있습니다(0건).           │   │
│ │    30초 후 재시도하세요.                         │   │
│ └───────────────────────────────────────────────────┘   │
│                                                           │
│ 📜 전환 이력                                              │
│ ┌───────────────────────────────────────────────────┐   │
│ │ 날짜          │ 변경       │ 담당자  │ 사유         │   │
│ ├───────────────────────────────────────────────────┤   │
│ │ 2026-06-20... │ BEAN→PI   │ anakin  │ 메인넷...  │   │
│ │ 2026-06-18... │ PI→BEAN   │ anakin  │ 심사 실패... │   │
│ │ 2026-06-01... │ BEAN(초기) │ ADMIN  │ 평상시...  │   │
│ └───────────────────────────────────────────────────┘   │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 상태 흐름

```
[로드]
  ↓
API GET /api/admin/fee-mode
  ↓
[현재 상태 표시]
  ├─ active_mode (Bean|Pi)
  ├─ 최근 전환 시각
  ├─ 시스템 상태 (pending tx, active subscriptions)
  └─ 전환 이력 테이블
  ↓
[사용자 상호작용]
  ↓
목표 모드 선택 + 사유 입력
  ↓
[전환 사전 검증]
  ├─ pending_transactions > 0 → 경고 ("30초 후 재시도")
  ├─ systemLoad.qps > 100 → 경고 ("고부하 중")
  └─ 기타 → OK/WARN/BLOCK
  ↓
[확인 모달]
  ├─ "BEAN → PI 전환하시겠습니까?"
  ├─ "메인넷 등재 준비"
  └─ [확인]  [취소]
  ↓
[API PATCH /api/admin/fee-mode]
  {
    "new_mode": "PI",
    "reason_memo": "메인넷 등재 준비"
  }
  ↓
[결과 처리]
  ├─ 성공 → 토스트 "전환됨 (즉시 반영)"
  │         페이지 새로고침 (1초 지연)
  └─ 실패 → 토스트 + 에러 메시지
```

---

## 3. UI 컴포넌트 구조

**주 파일**: `src/app/[locale]/(admin)/admin/fee-mode/page.tsx`

**내부 컴포넌트**:

```typescript
// 1. 상태 조회 Hook
function useFeeMode() {
  const [state, setState] = useState<FeeMode | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    piFetch('/api/admin/fee-mode')
      .then(res => res.json())
      .then(setState)
      .finally(() => setLoading(false))
  }, [])
  
  return { state, loading }
}

// 2. 현재 상태 표시 섹션
function CurrentStatusSection({ state }: { state: FeeMode }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm font-semibold mb-3">📋 현재 상태</p>
      
      <div className="space-y-2 text-sm">
        <p>
          활성 요금제: 
          <span className="font-semibold ml-2">
            {state.active_mode === 'BEAN' ? '● Bean Token' : '● Pi Coin'}
          </span>
        </p>
        <p className="text-muted-foreground">
          마지막 변경: {formatDistanceToNow(new Date(state.activated_at))}
        </p>
        {state.reason_memo && (
          <p className="text-muted-foreground">설명: {state.reason_memo}</p>
        )}
      </div>
      
      <div className="mt-3 space-y-1 text-xs border-t pt-3">
        <p>시스템 상태:</p>
        <p>· 진행 중 거래: <strong>{state.systemStats?.pendingTransactions ?? 0}건</strong></p>
        <p>· 활성 구독: <strong>{state.systemStats?.activeSubscriptions ?? 0}건</strong></p>
        {state.systemStats?.lastBeanSpend && (
          <p>· 최근 Bean 차감: {new Date(state.systemStats.lastBeanSpend).toLocaleString()}</p>
        )}
      </div>
    </div>
  )
}

// 3. 전환 컨트롤 섹션
function SwitchControlSection({ state, onSwitch }: { 
  state: FeeMode
  onSwitch: (mode: 'BEAN' | 'PI', memo: string) => void
}) {
  const [targetMode, setTargetMode] = useState<'BEAN' | 'PI'>(state?.active_mode ?? 'BEAN')
  const [memo, setMemo] = useState('')
  const [confirming, setConfirming] = useState(false)
  
  const handleSwitch = async () => {
    if (targetMode === state.active_mode) {
      toast.warning('현재와 같은 모드입니다')
      return
    }
    
    if (!window.confirm(`${state.active_mode} → ${targetMode}로 전환하시겠습니까?`)) {
      return
    }
    
    setConfirming(true)
    try {
      const res = await piFetch('/api/admin/fee-mode', {
        method: 'PATCH',
        body: JSON.stringify({ new_mode: targetMode, reason_memo: memo })
      })
      
      const data = await res.json()
      if (res.ok && data.ok) {
        toast.success('전환됨 — 즉시 반영됩니다')
        setTimeout(() => window.location.reload(), 1000)
      } else {
        toast.error(data.error || '전환 실패')
      }
    } finally {
      setConfirming(false)
    }
  }
  
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm font-semibold mb-3">🔄 전환하기</p>
      
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium mb-2">목표 요금제:</p>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={targetMode === 'BEAN'}
                onChange={() => setTargetMode('BEAN')}
                disabled={confirming}
              />
              <span className="text-sm">Bean Token</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={targetMode === 'PI'}
                onChange={() => setTargetMode('PI')}
                disabled={confirming}
              />
              <span className="text-sm">Pi Coin</span>
            </label>
          </div>
        </div>
        
        <div>
          <label htmlFor="reason" className="text-xs font-medium block mb-1">
            전환 사유 (선택)
          </label>
          <textarea
            id="reason"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="예: 메인넷 등재 준비"
            className="border-input min-h-16 w-full rounded-md border bg-transparent px-2 py-1 text-xs"
            disabled={confirming}
          />
        </div>
        
        {state.systemStats?.pendingTransactions > 0 && (
          <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
            ⚠️ 진행 중 거래 {state.systemStats.pendingTransactions}건이 있습니다. 30초 후 재시도하세요.
          </p>
        )}
        
        <div className="flex gap-2">
          <button
            onClick={handleSwitch}
            disabled={confirming || targetMode === state?.active_mode || (state?.systemStats?.pendingTransactions ?? 0) > 0}
            className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {confirming ? '전환 중...' : '확인 및 전환'}
          </button>
          <button
            onClick={() => { setTargetMode(state?.active_mode ?? 'BEAN'); setMemo('') }}
            disabled={confirming}
            className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  )
}

// 4. 전환 이력 테이블
function AuditHistoryTable({ history }: { history: FeeModAudit[] }) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <p className="text-sm font-semibold p-4 bg-muted/50">📜 전환 이력</p>
      
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="px-3 py-2 text-left font-medium">날짜</th>
              <th className="px-3 py-2 text-left font-medium">변경</th>
              <th className="px-3 py-2 text-left font-medium">담당자</th>
              <th className="px-3 py-2 text-left font-medium">사유</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.audit_id} className="border-b hover:bg-muted/30">
                <td className="px-3 py-2">{new Date(h.changed_at).toLocaleString()}</td>
                <td className="px-3 py-2 font-mono">
                  {h.old_mode} → <strong>{h.new_mode}</strong>
                </td>
                <td className="px-3 py-2">{h.changed_by}</td>
                <td className="px-3 py-2 text-muted-foreground">{h.reason_memo || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// 5. 메인 페이지
export default function FeeModeAdminPage() {
  const { state, loading } = useFeeMode()
  
  if (loading) return <LoadingSpinner />
  if (!state) return <ErrorPlaceholder />
  
  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold">요금제 전환</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          활성 요금제 세트 변경: <b>Bean Token</b> ↔ <b>Pi Coin</b>
          (메인넷 등재 시점 대응 용)
        </p>
      </div>
      
      <CurrentStatusSection state={state} />
      <SwitchControlSection state={state} onSwitch={...} />
      <AuditHistoryTable history={state.history ?? []} />
    </div>
  )
}
```

---

## 4. 타입 정의

```typescript
// src/types/fee-mode.ts

export interface FeeMode {
  active_mode: 'BEAN' | 'PI'
  activated_at: string  // ISO 8601
  reason_memo?: string
  systemStats?: {
    pendingTransactions: number
    activeSubscriptions: number
    lastBeanSpend?: string  // ISO 8601
  }
  history?: FeeModAudit[]
  validation?: PreSwitchValidation
}

export interface FeeModAudit {
  audit_id: string
  old_mode: 'BEAN' | 'PI'
  new_mode: 'BEAN' | 'PI'
  changed_by: string
  changed_at: string  // ISO 8601
  reason_memo?: string
}

export interface PreSwitchValidation {
  pendingTransactions: number
  activeSubscriptions: number
  systemLoad: {
    qps: number
    dbConnPoolUtilization: number
  }
  recommendation: 'OK' | 'WARN' | 'BLOCK'
  message?: string
}
```

---

## 5. API 응답 예시

### GET /api/admin/fee-mode (200 OK)

```json
{
  "active_mode": "BEAN",
  "activated_at": "2026-06-20T15:30:00Z",
  "reason_memo": "평상시 운영",
  "systemStats": {
    "pendingTransactions": 0,
    "activeSubscriptions": 1234,
    "lastBeanSpend": "2026-06-29T09:45:00Z"
  },
  "history": [
    {
      "audit_id": "uuid-1",
      "old_mode": "BEAN",
      "new_mode": "PI",
      "changed_by": "anakin",
      "changed_at": "2026-06-22T10:00:00Z",
      "reason_memo": "메인넷 등재 준비"
    },
    {
      "audit_id": "uuid-2",
      "old_mode": "PI",
      "new_mode": "BEAN",
      "changed_by": "anakin",
      "changed_at": "2026-06-01T14:30:00Z",
      "reason_memo": "평상시 운영 복귀"
    }
  ],
  "validation": {
    "pendingTransactions": 0,
    "activeSubscriptions": 1234,
    "systemLoad": {
      "qps": 45,
      "dbConnPoolUtilization": 0.32
    },
    "recommendation": "OK",
    "message": "전환 가능합니다"
  }
}
```

### PATCH /api/admin/fee-mode (200 OK)

```json
{
  "ok": true,
  "old_mode": "BEAN",
  "new_mode": "PI",
  "activated_at": "2026-06-29T10:30:00Z",
  "message": "즉시 반영됨"
}
```

### PATCH /api/admin/fee-mode (400 BAD REQUEST)

```json
{
  "ok": false,
  "error": "pending_transactions > 0 — 진행 중인 거래가 있습니다. 30초 후 재시도하세요."
}
```

---

## 6. 권한 & 접근 제어

- **필수 권한**: `MASTER` 전용 (또는 관리자 중 수퍼유저)
- **403 응답**: 권한 없으면 "이 화면은 MASTER 권한 전용입니다" 안내

---

## 7. 성능 최적화

- **API 캐싱**: 상태 조회는 60초 TTL (이후 자동 새로고침)
- **이력 로드**: 최근 20개만 기본, 페이지네이션 (선택)
- **실시간 갱신**: 전환 후 1초 지연 후 전체 새로고침

---

## 8. 구현 순서

1. **타입 정의** (`src/types/fee-mode.ts`)
2. **API 엔드포인트** (`src/app/api/admin/fee-mode.ts` GET/PATCH)
3. **UI 컴포넌트** (`src/app/[locale]/(admin)/admin/fee-mode/page.tsx`)
4. **테스트** (Bean → Pi → Bean 전환 반복)

---

## 9. 참고 & 링크

- PRD_24_FEES_STRATAGE.md §6: 런타임 전환 아키텍처
- sql/140_fee_mode_config.sql: DB 스키마
- src/lib/fee-resolver.ts: 가격 계산 함수 (구현 예정)
