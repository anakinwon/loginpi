# Performance Audit Round 3 — 2026-06-25

**마스터 지시(라운드 3)**: event, cafe, shop, map, admin 5개 탭을 표준 3종 기준 + 신규 캐싱 헬퍼로 점검·수정.

**작성일**: 2026-06-25  
**감사자**: 아소카 성능 진단 에이전트  
**상태**: 진행 중 (CRITICAL 발견, 수정 대기)

---

## 요약

| 항목 | 현황 | 등급 | 우선순위 |
|------|------|------|---------|
| **표준 1: 페이지네이션** | 부분 준수 | 🟠 HIGH | 1순위 |
| **표준 2: 비동기 처리** | 대부분 준수 | 🟡 MEDIUM | 2순위 |
| **표준 3: Lazy 로딩** | 최소 준수 | 🟡 MEDIUM | 3순위 |
| **캐싱 정책** | 🔴 부정확 | 🔴 **CRITICAL** | **즉시** |

---

## 🔴 CRITICAL: Analytics API 캐싱 정책 오류

### 발견 내용

**파일**: 
- `src/app/api/admin/analytics/pageviews/route.ts` (L125)
- `src/app/api/admin/analytics/performance/route.ts` (L134)
- `src/app/api/admin/analytics/usage/route.ts` (L166)

**현황**: 이 3개 API가 `publicCacheHeaders()`를 사용하고 있음 (공개 캐시)

**문제**:
- `pageviews`: **세션·체류시간·채널 데이터** = 사용자 행동 추적 (민감 정보)
- `performance`: **라이프사이클 퍼널·활동 패턴** = 사용자 라이프사이클 추적 (민감 정보)
- `usage`: **코호트 리텐션·지역 분포** = 사용자 지역·재방문 패턴 (민감 정보)

**영향도**: 
- 🔴 게스트 사용자가 관리자 민감 데이터에 접근 가능 → **PII 유출 위험**
- 뷰어별 응답 분기(마스킹)가 있지만, 캐시가 공유되면 관리자 원본이 게스트에게 노출됨

### 해결 방안

**변경 대상 3개 API**: `publicCacheHeaders()` → `viewerScopedCacheHeaders(admin)` 변경

```diff
// src/app/api/admin/analytics/pageviews/route.ts
-import { publicCacheHeaders } from '@/lib/cache-headers'
+import { viewerScopedCacheHeaders } from '@/lib/cache-headers'

export async function GET(req: NextRequest) {
  const admin = isAdmin(await getSessionUser())
  // ... 데이터 처리 ...
-    { headers: publicCacheHeaders() },
+    { headers: viewerScopedCacheHeaders(admin) },
```

**효과**:
- ✓ `admin=true`: private 캐시 (비공유, 관리자만)
- ✓ `admin=false`: 마스킹 응답 + `Vary: X-Admin-User` (게스트용 별도 캐시)

---

## 🟠 HIGH: 페이지네이션 미구현 (표준 1 위반)

### 1. ADMIN 탭 — 사용자 목록 (`/admin/users`)

**파일**: `src/app/api/admin/users/route.ts`

**현황**:
```typescript
// ❌ 전량 로드 — 10,000명 이상이면 메모리 폭발
.select('id, pi_uid, pi_username, ...')
```

**문제**:
- 전체 사용자를 메모리에 로드
- 사용자가 1,000명 이상이면 응답 시간 증가 (O(n) 성능)

**해결 방안**:
```typescript
export async function GET(request: NextRequest) {
  const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') ?? 1))
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('limit') ?? 30)))
  const from = (page - 1) * limit

  const { data: users, count, error } = await db
    .from('sys_user')
    .select('...', { count: 'exact' })
    .order('reg_dtm', { ascending: false })
    .range(from, from + limit - 1)

  return NextResponse.json({
    users: users ?? [],
    pagination: { page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) },
  })
}
```

**파일 수정**: `src/app/api/admin/users/route.ts`

---

### 2. ADMIN 탭 — 캐싱 추가

**파일들**:
- `src/app/api/admin/users/route.ts`
- `src/app/api/admin/board/route.ts`
- `src/app/api/admin/payments/route.ts`

**현황**: 캐싱 헤더 없음

**해결 방안**: 모두 `viewerScopedCacheHeaders(admin)` 추가
- 사용자/주문/게시물 = 관리자 민감 정보 → 게스트와 분리
- 관리자: `private, max-age=600`
- 게스트: 마스킹 응답만 `s-maxage=600` + `Vary: X-Admin-User`

---

## 🟡 MEDIUM: LazySection 미적용 (표준 3 위반)

### EVENT 탭 — 미션 랭킹 상세

**파일**: `src/components/event/client-event-gate.tsx` (L100~500 추정)

**현황**: 
- 미션 목록 + 랭킹 보드가 `<ClientEventGate>` 컴포넌트에 전부 로드
- 랭킹 매트릭스(M1~M10 13컬럼 × 100명 +)는 스크롤 하단까지 기다리지 않고 렌더

**문제**:
- 브라우저 DOM 노드 수 증가 → 메모리 압박 + 렌더 지연
- 모바일에서 Plotly 차트(admin/analytics)처럼 무거운 컴포넌트 사전 마운트

**해결 방안**:
- 랭킹 보드를 `<LazySection onVisible={() => fetchRankings()}>` 감싸기
- 미션 상세 섹션도 lazy 처리

---

### CAFE 탭 — 채팅 메시지 목록

**파일**: `src/components/chat/client-chat-room.tsx` (추정)

**현황**: 메시지 목록이 전부 로드되거나, 무한 스크롤 구현이 있어도 1차 로드 시 다량 메시지 렌더

**해결 방안**: 
- 초기 30~50개 메시지만 로드 후 무한 스크롤로 추가 로드
- 또는 가장 최근 메시지부터 역순 lazy loading

---

## 🟡 MEDIUM: 비동기 처리 최적화 (표준 2 개선)

### EVENT 탭 — 미션 평가 중복 요청

**파일**: `src/components/event/client-event-gate.tsx`

**문제**:
- 사용자가 미션 완료 버튼을 연타하면 동일 요청이 여러 번 발송될 수 있음
- AbortController를 사용하지 않음

**해결 방안**:
```typescript
const abortRef = useRef<AbortController | null>(null)

const completeMission = async (missionCd: string) => {
  // 진행 중인 요청 취소
  abortRef.current?.abort()
  abortRef.current = new AbortController()

  try {
    const res = await piFetch(`/api/admin/event/completions`, {
      method: 'POST',
      body: JSON.stringify({ mission_cd: missionCd }),
      signal: abortRef.current.signal,
    })
    // ...
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    // 실제 에러 처리
  }
}
```

---

### SHOP 탭 — 필터/검색 비동기 최적화

**파일**: `src/components/store/store-item-list.tsx` (L100~200 추정)

**현황**: 
- `keyword` 변경 시마다 API 요청
- debounce가 있을 수 있지만, 취소 로직 없음

**해결 방안**: AbortController + debounce 병합
- 사용자가 입력하는 동안 새 문자 입력마다 이전 요청 취소
- 입력 멈춘 후 500ms 후 최종 요청만 발송

---

## 🟢 LOW: 캐싱 확대 (표준 2 최적화)

### SHOP 탭 — 상품 목록 API

**파일**: `src/app/api/store/[...]/route.ts` (찾기 필요)

**현황**: 캐싱 헤더 없음

**해결 방안**: `publicCacheHeaders(3600)` 추가
- 상품 목록 = 모든 사용자에게 동일한 응답
- 1시간 캐시로 충분

---

## 탭별 상세 분석

### EVENT 탭
| 항목 | 현황 | 등급 | 필요 작업 |
|------|------|------|---------|
| 미션 목록 페이지네이션 | ❌ 없음 | 🟠 HIGH | API 구현 + 컴포넌트 연동 |
| 미션 평가 비동기 | ⚠️ 부분 | 🟡 MEDIUM | AbortController 추가 |
| 랭킹 LazySection | ❌ 없음 | 🟡 MEDIUM | LazySection 감싸기 |
| API 캐싱 | ❌ 없음 | 🟡 MEDIUM | publicCacheHeaders 추가 |

### CAFE 탭
| 항목 | 현황 | 등급 | 필요 작업 |
|------|------|------|---------|
| 카페 목록 페이지네이션 | ✅ `/api/chat/marketplace` 구현됨 (L26~30) | 🟢 완료 | — |
| 메시지 목록 LazySection | ❌ 없음 | 🟡 MEDIUM | 메시지 스크롤 lazy 적용 |
| 검색/필터 비동기 | ⚠️ 부분 | 🟡 MEDIUM | AbortController 추가 |
| API 캐싱 | ❌ 없음 | 🟡 MEDIUM | publicCacheHeaders 추가 (marketplace) |

### SHOP 탭
| 항목 | 현황 | 등급 | 필요 작업 |
|------|------|------|---------|
| 상품 목록 페이지네이션 | ✅ StoreItemList에 page 구현 (L79~80) | 🟢 완료 | — |
| 상품 필터/검색 비동기 | ⚠️ 부분 | 🟡 MEDIUM | AbortController 추가 |
| 상품 상세 LazySection | ❌ 없음 | 🟡 MEDIUM | 관련 섹션 lazy 적용 |
| API 캐싱 | ❌ 없음 | 🟡 MEDIUM | publicCacheHeaders 추가 |

### MAP 탭
| 항목 | 현황 | 등급 | 필요 작업 |
|------|------|------|---------|
| 위치 기반 상점 페이지네이션 | ❌ 없음 | 🟠 HIGH | `/api/lbs/nearby/shops` API 구현 |
| 채팅방 위치 페이지네이션 | ❌ 없음 | 🟠 HIGH | `/api/lbs/nearby/rooms` API 구현 |
| 지도 마커 LazySection | ❌ 없음 | 🟡 MEDIUM | 마커 rendering lazy 적용 |
| API 캐싱 | ❌ 없음 | 🟡 MEDIUM | publicCacheHeaders 추가 |

### ADMIN 탭
| 항목 | 현황 | 등급 | 필요 작업 |
|------|------|------|---------|
| 사용자 목록 페이지네이션 | ❌ 없음 | 🔴 **CRITICAL** | **즉시 구현** |
| 주문 목록 페이지네이션 | ✅ `/api/admin/board` (L12~18) | 🟢 완료 | — |
| 게시물 목록 페이지네이션 | ✅ 구현됨 | 🟢 완료 | — |
| Analytics 캐싱 정책 | ❌ 잘못됨 (public 사용) | 🔴 **CRITICAL** | **즉시 수정** |
| 통계 필터 비동기 | ⚠️ 부분 | 🟡 MEDIUM | AbortController 추가 |
| 섹션 LazySection | ✅ stats-dashboard에 부분 구현 | 🟡 MEDIUM | 확대 적용 |

---

## 즉시 조치 필요 (마스터 우선순위)

### 1. 🔴 CRITICAL: Analytics 캐싱 정책 (3개 파일)

```bash
# 변경 파일:
src/app/api/admin/analytics/pageviews/route.ts      (L3, L125)
src/app/api/admin/analytics/performance/route.ts    (L3, L134)
src/app/api/admin/analytics/usage/route.ts          (L3, L166)
```

**이유**: 관리자 민감 데이터(행동 추적·지역·코호트)가 게스트에게 노출될 위험

---

### 2. 🔴 CRITICAL: ADMIN 사용자 목록 페이지네이션

```bash
# 변경 파일:
src/app/api/admin/users/route.ts (전체 + 캐싱 헤더)
```

**이유**: 1,000명 이상 사용자 환경에서 메모리 부하 + 응답 지연

---

### 3. 🟠 HIGH: MAP 탭 페이지네이션 API 구현

```bash
# 신규 추가:
src/app/api/lbs/nearby/shops/route.ts       (위치 기반 상점)
src/app/api/lbs/nearby/rooms/route.ts       (위치 기반 채팅방)
```

---

## 추가 권장사항 (우선순위 2-3)

### 단기 (1주일)
- LazySection 확대 적용 (EVENT/ADMIN)
- AbortController 패턴 도입 (필터/검색)

### 중기 (2주일)
- IntersectionObserver 글로벌 재활용 (ObserverProvider Context)
- 헤더/푸터 리스너 통합

---

## 참고

- 캐싱 헬퍼: `src/lib/cache-headers.ts`
- PRD_18_PERFORM.md 최신 상태 참고
- 마스터 지시: 쿠키 vs X-Pi-Token 이중 경로 + 뷰어별 응답 분기

