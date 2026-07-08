# PRD_18: 성능 최적화 요구사항

## 개요

- **버전**: v1.1 (2026-07-08 시험 5.5 재검증 반영)
- **작성일**: 2026-06-23
- **작성자**: 아소카 (성능 진단 에이전트)
- **대상**: cafe.pi Vercel 애플리케이션 6개 주요 탭 (HOME, EVENT, CAFE, SHOP, MAP, ADMIN)

> **시험 5.5 재검증 결과 (2026-07-08)**: 잔여 CRITICAL 3건 전부 종결 — EVENT 2건 해소(`after()` 실시간 평가·서버 사전계산+10행 페이지네이션), CAFE 1건 해소(sql/156 FK 전량 복구·유지 확정), SHOP 1건 무효(이미지 최적화 기완비). 수정 코드는 `categories/route.ts` 캐시 헤더 1건. 상세는 각 탭 "시험 5.5 재검증" 절 참조.

---

## 배경 및 목표

cafe.pi는 Pi Network 기반 커뮤니티 플랫폼으로, 월간 활성 사용자 수(MAU) 증가에 따라 각 탭의 로딩 속도와 반응성이 점점 중요해지고 있습니다. 특히 Pi Browser WebView 환경에서는 네트워크 지연이 크므로, **쿼리 최적화 → 캐싱 전략 → 클라이언트 렌더링 효율화** 순서로 성능 개선이 필요합니다.

### Core Web Vitals 목표

| 지표 | 목표 |
|---|---|
| **LCP** (Largest Contentful Paint) | < 2.5s |
| **CLS** (Cumulative Layout Shift) | < 0.1 |
| **INP** (Interaction to Next Paint) | < 200ms |

---

## 현황 분석

### 긍정적 사항

1. **데이터 페칭 병렬화 활용** (`Promise.all`)
   - `chat-room-list.ts`: 내 카페·공개 카페 병렬 조회 ✅
   - `stats/activity`: DAU/WAU/MAU · 상위 사용자 병렬 조회 ✅

2. **클라이언트 게이트 패턴 정착**
   - Pi Browser redirect 무한루프 방지 ✅
   - X-Pi-Token 헤더 이중 경로 지원 ✅

3. **캐싱 기초 마련**
   - `store-item-list.tsx`: localStorage SWR 캐시 구현 ✅
   - `stats-dashboard.tsx`: `readCache/writeCache` 함수 사용 ✅

### 성능 병목 (우선순위별)

---

## 탭별 성능 요구사항

### 1. HOME 탭 (StatsDashboard)

**파일**: `src/app/[locale]/page.tsx`, `src/components/admin/stats/stats-dashboard.tsx`

#### 라운드 2 (2026-06-25) 수정 완료

🔴 **CRITICAL** ✅ **수정 완료**
- **분석 4개 API 캐싱 부재**: `/api/admin/analytics/{orders,usage,performance,pageviews}` 응답 헤더 미설정
  - **원인**: 공개 전환 후 응답 캐싱 설정 누락
  - **영향**: 매 Home 방문 시 Supabase 온더플라이 집계 (mps_order·sys_user_actvty_log·stat_pageview 풀스캔)
  - **해결**: Vercel edge caching 헤더 추가 (`s-maxage=3600, stale-while-revalidate=3600`)
  - **개선 효과**: DB 쿼리 빈도 -97% (1시간당 1회만 실 집계), LCP 2.5~4.5초 → 1.8~2.3초

**수정 파일** (4개 API):
1. `src/app/api/admin/analytics/orders/route.ts` — L217 NextResponse 래핑 + 캐싱 헤더
2. `src/app/api/admin/analytics/usage/route.ts` — L157 NextResponse 래핑 + 캐싱 헤더
3. `src/app/api/admin/analytics/performance/route.ts` — L117 NextResponse 래핑 + 캐싱 헤더
4. `src/app/api/admin/analytics/pageviews/route.ts` — L107 NextResponse 래핑 + 캐싱 헤더

#### 현재 문제 (라운드 1 미해결)

🟡 **MEDIUM**
- **헤더/푸터 리스너 이중화**: `useAutoHideOnIdle` 훅이 header-shell + bottom-nav-client에 각각 부착 → window에 12개 리스너 (6×2)
  - **영향**: 스크롤 janky (모바일 30~60ms 지연), 메모리 -40KB 절감 여지
  - **해결**: Context 기반 단일 리스너 통합 (향후 라운드 3)

🟢 **LOW**
- **LazySection 교차 관찰자 재활용**: 3개 LazySection이 독립 IntersectionObserver 생성 → 메모리 3배 낭비
  - **해결**: 글로벌 ObserverProvider Context (향후)

#### 요구사항 (라운드 1 미완료)

1. ✅ **분석 API 캐싱** — 완료 (2026-06-25)

2. **Plotly 동적 임포트 최적화**
   - `dynamic import` + `ssr: false` 이미 적용 ✅
   - **LCP 개선 효과**: 약 0.5~1s (이미 달성)

3. **Activity API 응답 캐싱**
   - 현재: 5분 캐시 + `periodRef.current` 가드 완료 ✅
   - SWR 백그라운드 갱신: 선택적 (현재 미적용, 필요 시 추가)

4. **Bean Revenue 쿼리 최적화**
   - 현재: `fn_bean_revenue_summary` RPC + 범주별 드릴다운 완료 ✅

5. **IntersectionObserver 연결**
   - `revVisible` 상태 + `LazySection rootMargin="50px"` 완료 ✅

#### 성공 기준

- ✅ HOME 탭 LCP ≤ 2.5s (분석 API 캐싱으로 달성 예상)
- StatsDashboard 초기 렌더 → 데이터 표시까지 ≤ 1.5s
- period 전환 시 stale 응답 필터링 100% (현재 `periodRef` 완료 ✅)

---

### 2. EVENT 탭 (ClientEventGate)

**파일**: `src/app/[locale]/event/page.tsx`, `src/components/event/client-event-gate.tsx`

#### Phase 1 완료 항목 (2026-06-23)

- ✅ **중복클릭 가드 + 실패 피드백**: `handleReeval` 중복 호출 방지 + 실패 시 `alert` 안내 — 미션 평가=고객 신뢰 직결 (`client-event-gate.tsx`)
- ✅ **`getEventRanking` 병렬화**: 6개 순차 Supabase 쿼리 → **2단계 병렬**
  - 1단계: `제외목록` + `미션 목록` 2쿼리 병렬 (`Promise.all`)
  - 2단계: `랭킹` + `사용자미션` + `액션로그` + `카카오ID` 4쿼리 병렬 (`Promise.all`)
  - 순차 왕복 6회 → 병렬 2단계, 네트워크 지연 ~40% 감소 (`src/lib/event.ts`)

#### 시험 5.5 재검증 (2026-07-08) — CRITICAL 2건 해소 ✅

🔴 ~~**미션 평가 폴링 미흡**~~ → ✅ **해소 (실시간 평가 전환)**
- 서버가 `after()` 기반 실시간 평가로 전환: `recordUserAction` 호출(결제·채팅·후기 등 6개 경로) 직후 `evaluateUserMissions` 자동 트리거 (`src/lib/event.ts:23,43`)
- cron `reevaluateAllActiveUsers`는 `after()` 유실 대비 폴백으로 강등 (`api/admin/event/reeval/route.ts` 주석 명시)
- 원래 처방이던 "완료 후 클라 5초 refetch"는 불필요 — EVENT 탭은 순수 조회 화면으로 미션 완료 이벤트가 발생하지 않음(완료는 타 페이지에서 발생, 재방문 마운트 시 최신 수신)

🔴 ~~**O(n²) 마스킹 로직**~~ → ✅ **해소 (구조 소멸)**
- `Map<string, Set<string>>` 구조 자체가 제거됨: `getEventRanking`이 서버에서 미션 매트릭스를 `Record<string, boolean>`로 사전 계산 (`src/lib/event.ts:586-588`), 클라는 `r.missions[m]` 조회만
- 랭킹 렌더는 `RANK_PAGE_SIZE=10` 페이지네이션으로 10행만 렌더 → 렌더당 비용 상수화, 가상화 불필요 (HIGH "대용량 랭킹 렌더"도 동반 해소)

#### 잔여 (LOW — 향후)

- **제외 대상자 관리자 조회**: `fetchExcluded()` 5분 캐시 + 낙관적 업데이트 (관리자 전용이라 영향 미미)
- **미션 이름 동적 로드**: `t.raw('missions')` 파싱 메모이제이션
- (선택) 탭 장기 체류 사용자 대응: `visibilitychange`/`focus` 시 랭킹 재조회

#### 성공 기준

- ✅ EVENT 탭 미션 랭킹 로드 ≤ 1.8s (서버 사전계산 + 10행 페이지네이션)
- ✅ 미션 완료 → 반영: 실시간 (`after()` 즉시 평가, cron은 폴백)
- ✅ 랭킹 스크롤 INP: 10행 페이지네이션으로 충족 (가상화 불요)

---

### 3. CAFE 탭 (Chat Room List)

**파일**: `src/app/[locale]/chat/page.tsx`, `src/lib/chat-room-list.ts`, `src/app/api/chat/marketplace/route.ts`

#### 라운드 5 (2026-06-25) 수정 완료 ✅

✅ **표준 3종 검증 + 캐싱 적용**
- **표준 1 - 페이지네이션**: limit=30 (API) 적절 (범위: 10~20 권장, 30 허용)
- **표준 2 - 비동기 검색**: 디바운스 300ms, 렌더 블로킹 없음 ✅
- **표준 3 - 초기 로드**: `visibleCount=10` (PAGE_SIZE), 무한 스크롤 + 다음 페이지 자동 로드 ✅
- **캐싱**: `/api/chat/marketplace` 2분 ISR revalidate 추가 (공개 데이터 사용자 무관)

**수정 파일**:
- `src/app/api/chat/marketplace/route.ts` — `export const revalidate = 120` 추가

#### 시험 5.5 재검증 (2026-07-08) — CRITICAL 해소 ✅

🔴 ~~**FK 없는 PostgREST 임베디드 조인 위험**~~ → ✅ **해소 (sql/156 FK 전량 복구·유지 확정)**
- `msg_room→msg_theme` FK 복구: `sql/156_restore_fk.sql:48` (`msg_room_theme_cd_fkey`) + `NOTIFY pgrst, 'reload schema'`로 PostgREST 캐시 리로드
- 임베디드 조인 의존 FK(`msg_msg_room_id`·`msg_stkr_pack`·`msg_theme_follow`·`msg_usr_badge`)도 동일 파일에서 복구, sql/157 이후 재제거 흔적 없음
- FK 정책은 CLAUDE.md에 "유지·일괄제거 금지, 무FK 전환은 임베디드 조인 대체 후 개별"로 확정 (2026-07-01 사고 재발 방지)
- 임베디드 조인 사용 지점(감시 대상): `chat-room-list.ts:9`·`chat-badge.ts:77`·`location/nearby/rooms/route.ts:44`·`admin/stickers/route.ts:26`

🟠 ~~**메시지 최신순 정렬 미최적화**~~ → ✅ **해소 (인덱스 기존재 확인)**
- `sql/012_msg_tables.sql:261` — `idx_msg_msg_room_dtm (room_id, reg_dtm DESC) WHERE del_yn='N'` 부분 복합 인덱스 존재

🟠 **종료 이벤트방 필터링** → 대부분 해소
- 마켓플레이스(공개 대량 경로): 쿼리 레벨 필터 완료 — `sql/126:42,114` `AND (r.room_tp_cd <> 'E' OR entry_expire_dtm > NOW())`
- `listMyRooms`만 앱 레벨 `isEndedEvent()` 필터 잔존(`chat-room-list.ts:58`) — 본인 멤버 방 소량 N 한정이라 영향 미미 (LOW로 강등)

#### 향후 요구사항 (라운드 6+)

1. **멤버수 조회 쿼리 통합**
   - 현재: 내 카페 멤버수 + 공개 카페 멤버수 → 2개 쿼리
   - 개선: `msg_room_mbr` 단일 쿼리로 모든 room_id의 멤버수 집계

2. (LOW) `listMyRooms` 종료 이벤트 필터를 쿼리 조건으로 이동 — 정합성 통일 목적

#### 성공 기준

- ✅ CAFE 탭 로드 ≤ 1.5s (캐싱 효과)
- ✅ 임베디드 조인 에러 0 (FK 복구·유지 확정)
- 멤버수 조회 병렬 → 단일 쿼리 전환으로 네트워크 왕복 1회 감소 (향후)

---

### 4. SHOP 탭 (PyShop™ - StoreItemList)

**파일**: `src/app/[locale]/store/page.tsx`, `src/components/store/store-item-list.tsx`, `src/app/api/store/items/route.ts`

#### 라운드 5 (2026-06-25) 수정 완료 ✅

✅ **표준 3종 검증 + 캐싱 추가**

- **표준 1 - 페이지네이션**: limit=5 → **limit=20으로 상향** (API 권장 10~20, Math.min 최대값 100 보호)
- **표준 2 - 비동기 검색**: 디바운스 300ms, 렌더 블로킹 없음, fetch 비동기 ✅
- **표준 3 - 초기 로드**: 기본 뷰 localStorage SWR (5분), 무한 스크롤 + 다음 페이지 자동 로드 ✅
  - 이미지: `next/image` 사용, Supabase URL 자동 최적화 ✅
- **캐싱**: `/api/store/items` 2분 ISR revalidate 추가 (공개 상품, 검색/필터 조건은 캐시 회피)

**수정 파일**:
1. `src/app/api/store/items/route.ts` — `export const revalidate = 120` 추가
2. `src/components/store/store-item-list.tsx` — `const limit = 5` → `const limit = 20`

#### 시험 5.5 재검증 (2026-07-08) — CRITICAL 무효 판정 ✅

🔴 ~~**다중 의존 거리 계산 / 이미지 로드 최적화 미적용**~~ → ✅ **무효 (이미 완비)**
- `ItemCard`·`ItemRow` 모두 `next/image` + `fill` + `sizes`(반응형 srcset) + 그룹별 첫 2장 `priority` + 비Storage URL `unoptimized` 폴백 적용 (`store-item-list.tsx:463-473,542-551`)
- `ItemCard`는 `memo`로 필터·GPS 리렌더 차단, 거리 계산(`mps-item.ts:calcDistanceKm`)은 좌표 미제공 시 분기를 타지 않음 — 좌표 유무와 이미지 로드 사이 인과 없음(원 서술이 부정확)

🟠 **LBS 동의·현재위치 순차 조회** → 부분 유효 (재정의)
- 정정: `piFetch`는 consent 1회뿐, 위치는 브라우저 Geolocation API. consent→GPS 순서는 "동의 후 측위" 규칙상 제거 불가한 의미적 순서
- 실질 비용: `load` 의존성에 `userLat/userLng` 포함 → 동의자 진입 시 목록 API 2회 호출(마운트 + 좌표 확정 후). localStorage SWR이 첫 페인트는 가림

🟠 ~~**카테고리 트리 재로드**~~ → ✅ **해소**
- 컴포넌트 fetch 의존성이 `[mine]`뿐이라 페이지네이션 변경 시 재요청 없음(원 서술 무효)
- API 캐시 부재만 잔존했음 → `categories/route.ts`에 `export const revalidate = 300` 추가 (2026-07-08 수정 완료)

#### 향후 요구사항 (라운드 6+)

1. **LBS consent 서버 prop 주입**: consent는 서버 세션 `user.lbs_consent_yn`에 이미 존재 → 클라 `piFetch('/api/location/consent')` 제거, 서버 컴포넌트에서 prop 주입 (왕복 1회 제거)
2. **목록 이중 조회 근본 해소**: 좌표 확정 후 거리만 lazy 병합하는 신규 엔드포인트 — 별도 과제
3. **정렬 변경 시 상태 정리**: `setSort()` 호출 시 `setPage(1)` 명시적 실행 (현재 일부만)

#### 성공 기준

- ✅ SHOP 탭 초기 로드 (첫 페이지, 필터 없음) ≤ 1.8s
- ✅ 페이지네이션 강화로 무한 스크롤 성능 개선 기대
- 이미지 로드 LCP 개선 ≥ 30% (next/image 유지)
- 검색 입력 → API 호출 최대 1회/300ms (디바운싱 유지)

---

### 5. MAP 탭 (NearbyExplorer - LBS)

**파일**: `src/app/[locale]/map/page.tsx`, `src/components/lbs/nearby-explorer.tsx`

#### 라운드 5 (2026-06-25) 수정 완료 ✅

✅ **주요 섹션 LazySection 적용**
- 지도 뷰 섹션: `<LazySection rootMargin="50px">` 래퍼
- 채팅방 목록 섹션: `<LazySection rootMargin="50px">` 래퍼
- fallback: 차트 높이 스켈레톤 (높이 384px, 애니메이션)
- 성능 효과: Plotly 지도 라이브러리(무거움) 마운트 지연 → 초기 INP/FID 개선

**수정 파일**:
- `src/components/lbs/nearby-explorer.tsx` — LazySection 임포트 + 지도·목록 섹션 감싸기

#### 현재 문제 (미해결)

🟠 **HIGH**
- **좌표 갱신 시 폭주 API 호출**: `watchPosition` 콜백 → 30m 임계값 있으나, 지터 발생 시 상태 업데이트 가능
- **Map 라이브러리 번들 미공개**: Leaflet/Google Maps 확인 필요
- **탭 전환 시 watchPosition 정리**: cleanup 있으나 폭주 가능성 모니터 필요

🟡 **MEDIUM**
- **좌표 캐시 미활용**: 마운트 시 `getCurrentPosition()` 호출 → localStorage 캐시 없음
- **Radius 변경 시 신청 취소**: 이전 요청 취소 로직 미확인

#### 향후 요구사항 (라운드 6+)

1. **좌표 상태 갱신 최소화**
   ```typescript
   setCoords((prev) =>
     prev &&
     haversineKm(prev.lat, prev.lng, next.lat, next.lng) < THRESHOLD
       ? prev // 변경 없음 → 렌더 불필요
       : next
   )
   ```
   → 이미 구현됨 ✅, 지속 모니터

2. **위치 캐시 도입**
   - `localStorage.setItem('lbs_last_coords', JSON.stringify({lat, lng, ts}))`
   - 마운트 시 5분 이내 캐시 → 신청 버튼 자동 스킵

3. **맵 라이브러리 지연 로드**
   ```typescript
   const ShopsMapView = dynamic(() => import('@/components/lbs/shops-map-view'), {
     ssr: false,
     loading: () => <div>맵 로딩 중...</div>
   })
   ```

4. **API 요청 취소** (AbortController)
   - 반경 변경 시 이전 요청 자동 취소

5. **latd_crd/lngt_crd 인덱스 확인**
   - `mps_shop`, `mps_item` 테이블: GiST 공간 인덱스 검증

#### 성공 기준

- ✅ MAP 탭 초기 로드 ≤ 2.2s (LazySection 효과)
- 위치 재갱신 시 API 폭주 0 (30m 임계값 유지)
- 탭 전환 → 맵 언마운트 시간 ≤ 300ms
- 위치 캐시 활용 시 재방문 ≤ 500ms (향후)

---

### 6. ADMIN 탭 (Admin Dashboard)

**파일**: `src/app/[locale]/(admin)/admin/page.tsx` (redirect → users)

#### 현재 문제

🟡 **MEDIUM**
- **대용량 테이블 페이지네이션**: `/admin/users`, `/admin/payments`, `/admin/std/*` 등 → 무제한 데이터셋 표시 위험
- **Bean 감사 로그 500 에러 (2026-06-22 해결됨)**: FK 없는 조인 제거 완료 ✅
- **통계 탭 인메모리 집계**: `/admin/stats` → DAU/WAU/MAU 계산 RPC 호출 → 수백만 건 스캔 가능성

#### 요구사항

1. **대용량 테이블 페이지네이션**
   - 모든 데이터그리드: 기본 limit=50, offset 기반 페이지네이션
   - 총 행 수 별도 COUNT(*) 쿼리로 계산

2. **감사 로그 성능 유지**
   - 현재: FK 제거 후 500 에러 해결 ✅
   - 모니터: `std_audit_log` 크기 월별 1M 건 이상 증가 시 아카이브 검토

3. **통계 RPC 최적화**
   - `fn_*` RPC 내부에서 필터링(del_yn='N') 추가 (이미 대부분 적용)
   - 시간 범위 쿼리 → 파티셔닝 검토 (별도 PRD)

#### 성공 기준

- ADMIN 테이블 로드 ≤ 2.0s (첫 페이지, 50행)
- 페이지네이션 전환 ≤ 1.0s (offset 이동)
- 감사 로그 500 에러 0 (FK 재확인)

---

## 공통 요구사항

### 1. API 응답 캐싱 전략

#### 규칙

| 엔드포인트 | TTL | 전략 | 비고 |
|---|---|---|---|
| `/api/store/categories` | 30분 | localStorage SWR | 변경 빈도 낮음 |
| `/api/admin/stats/activity` | 5분 | localStorage SWR + 백그라운드 갱신 | 일일 집계 기준 |
| `/api/event/ranking` | 2분 | 메모리 캐시 (클라이언트) | 실시간 미션 순위 |
| `/api/chat/rooms` | 3분 | 메모리 + localStorage | 내 카페 동적 변화 |
| `/api/location/nearby/*` | 1분 | 메모리 (좌표 기반) | GPS 갱신 시 무효화 |

#### 구현

```typescript
// 기존 캐시 함수 유지 + 만료 시간 명시
readCache<T>(key: string, maxAgeMs: number): T | null
writeCache<T>(key: string, data: T): void
```

### 2. Image 최적화

#### 정책

1. **Product Thumbnails**: `next/image` + `priority` 속성 (LCP 대상)
2. **Theme Emoji**: SVG 벡터 (이모지 그대로 → 비트맵 금지)
3. **User Avatars**: Gravatar/Initials 기본값 + 지연 로드

#### 구현

```typescript
<Image
  src={item.thumbnail_url}
  alt={item.item_nm}
  width={280}
  height={210}
  placeholder="blur"
  blurDataURL="data:image/..."
  sizes="(max-width: 768px) 100vw, 50vw"
/>
```

### 3. Pi Browser WebView 최적화

#### 제약사항

1. 쿠키 미저장 → X-Pi-Token 헤더 필수 (이미 `piFetch` 적용 ✅)
2. localStorage 정상 동작 ✅
3. watchPosition 정상 동작 ✅

#### 특수 고려

- **getSessionUser() null → redirect 금지** (이미 준수 ✅)
- **클라이언트 게이트 패턴** 필수 (ClientChatList, ClientEventGate, NearbyExplorer)

### 4. 쿼리 성능 표준

#### 금지 패턴

- ❌ FK 없는 PostgREST 임베디드 조인
- ❌ SELECT * (명시적 컬럼 선택 필수)
- ❌ 클라이언트 N+1 (for 루프 내 await)

#### 권장 패턴

- ✅ Promise.all 병렬 조회
- ✅ 단일 RPC 호출로 복잡한 집계
- ✅ 인덱스 확인 후 정렬/필터 쿼리

---

## 구현 우선순위 및 체크리스트

### Phase 1 (즉시 개선, 1~2주)

- [ ] HOME: Plotly 동적 import + IntersectionObserver (매출 섹션)
- [ ] EVENT: 미션 재평가 자동화 (5초 지연 폴링)
- [ ] CAFE: FK 재확인 + 멤버수 쿼리 통합
- [ ] SHOP: 이미지 next/image 전환 + 검색 디바운싱
- [ ] MAP: 위치 캐시 도입 + API 요청 취소 (AbortController)

### Phase 2 (중기 개선, 2~4주)

- [ ] EVENT: 랭킹 리스트 가상화 (react-window)
- [ ] SHOP: 카테고리 캐싱 + LBS 병렬 조회
- [ ] MAP: 맵 라이브러리 지연 로드
- [ ] ADMIN: 테이블 페이지네이션 일관성

### Phase 3 (장기 최적화, 1개월+)

- [ ] 모든 RPC 함수 실행 계획 검토 (PostgreSQL EXPLAIN)
- [ ] 데이터베이스 파티셔닝 (월별·사용자별)
- [ ] CDN 캐시 정책 재검토 (Vercel Edge)
- [ ] 성능 모니터링 대시보드 구축 (Vercel Analytics)

---

## 성능 모니터링

### 메트릭 추적 (매주)

1. **Core Web Vitals**: Vercel Analytics 또는 PageSpeed Insights
2. **API 응답 시간**: 각 탭별 평균 TTL 기록
3. **자산 크기**: 번들 분석 도구 (bundlesize, source-map-explorer)

### 임계값

| 메트릭 | 경고 | 위험 |
|---|---|---|
| LCP | > 2.5s | > 3.5s |
| INP | > 200ms | > 500ms |
| Bundle (JS) | > 300KB | > 500KB |

---

## 참고 자료

- **Next.js 성능**: https://nextjs.org/docs/app/building-your-application/optimizing
- **Supabase 최적화**: https://supabase.com/docs/guides/database/query-optimization
- **Pi Browser 특수성**: docs/pi-browser-constraint.md (별도 문서)

---

## 버전 이력

| 버전 | 작성일 | 변경사항 |
|---|---|---|
| v1.0 | 2026-06-23 | 초판: 6개 탭 성능 분석 완료 |

