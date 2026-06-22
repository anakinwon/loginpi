# PRD_18: 성능 최적화 요구사항

## 개요

- **버전**: v1.0
- **작성일**: 2026-06-23
- **작성자**: 아소카 (cafe.pi 성능진단 에이전트)
- **검토자**: 아나킨 마스터님
- **진단 범위**: cafe.pi Vercel 애플리케이션 6개 주요 탭 (home, event, cafe, shop, map, admin)
- **진단 방법**: 탭별 독립 분석 (번들, 렌더링, 데이터 페칭, 클라이언트 성능, 네트워크 캐싱, Pi Browser 특수 이슈)
- **검증 환경**: Pi Browser 실기기 (최우선)

---

## 배경 및 목표

### 배경

cafe.pi는 Pi Network 기반 커뮤니티 플랫폼으로, 북극성 지표가 **활성 사용자 수(DAU)**입니다. HOME 탭의 StatsDashboard가 사용자 진입 첫 화면이므로, **각 탭의 성능 최적화는 사용자 체감도와 신뢰도에 직결**됩니다.

2026-06-23 종합 성능 진단 결과, 다음 공통 패턴이 반복되었습니다:
1. **메모이제이션 미흡** (리렌더링 과다)
2. **캐싱 전략 부재** (매번 DB 조회)
3. **중복 API 호출** (debounce/throttle 미적용)
4. **클라이언트 상태 과다** (번들 크기 증가)
5. **이미지 최적화 미흡** (next/Image 미사용)

### 목표

| 지표 | 목표 | 현재 | 개선율 |
|------|------|------|--------|
| **LCP** (Largest Contentful Paint) | < 2.5s | 1.2~5s | -50% |
| **INP** (Interaction to Next Paint) | < 200ms | 200~500ms | -60% |
| **CLS** (Cumulative Layout Shift) | < 0.1 | 0.05~0.15 | 안정화 |
| **초기 로드 시간** | < 3s | 3~5s | -40% |
| **번들 크기** | < 500KB | 600~800KB | -30% |

### 성공 기준 (KPI)

- ✅ 모든 탭 LCP < 2.5s (Pi Browser 기준)
- ✅ 사용자 입력 응답 < 200ms
- ✅ 중복 API 호출 0건 (debounce/캐싱)
- ✅ Pi Browser 실기기 검증 완료

---

## 탭별 요구사항

### HOME 탭

#### 현재 문제

| 등급 | 문제 | 위치 | 영향 |
|------|------|------|------|
| 🔴 HIGH | LazySection rootMargin 200px 과도 | stats-dashboard.tsx L154 | bean-revenue RPC 조기 호출 (모바일 20~40% 낭비) |
| 🔴 HIGH | aggregate 오류 로깅 미흡 | stats-dashboard.tsx L157 | 오늘 데이터 반영 여부 감시 불가 |
| 🔴 HIGH | BeanTopSpenders 캐싱 부재 | bean-top-spenders.tsx L24 | period 전환 시 재조회 (SWR 미지원) |
| 🟠 MEDIUM | bean-daily-chart period 무시 | bean-daily-chart.tsx L56 | 데이터 낭비 (period=7 선택 시에도 30일 fetch) |
| 🟠 MEDIUM | translate-stats-section 권한 게이트 미흡 | stats-dashboard.tsx | 비관리자 API 에러 무시 |
| 🟠 MEDIUM | Plotly config 최적화 부재 | dau-wau-mau-chart.tsx L87 | 번들 크기 증가 |

#### 요구사항

1. **LazySection rootMargin → 50px**
   - 모바일 사용자가 실제 뷰포트 진입 시에만 bean-revenue 호출
   - RPC 비용 20~40% 감소 예상

2. **aggregate 오류 로깅 추가**
   - console.warn('[HOME 통계] 집계 실패')
   - 관리자가 오늘 데이터 미반영 원인 추적 가능

3. **BeanTopSpenders SWR 캐싱**
   - readCache/writeCache (5분 TTL)
   - period 재선택 시 즉시 캐시 표시

4. **bean-daily-chart period 파라미터 전달**
   - `/api/admin/token/stats?limit=${period}` (서버 API 수정 필요)

#### 성공 기준 (KPI)

- LCP < 1.8s (DATA 포함)
- bean-revenue RPC 호출 5~10회/시간 (현재 20회/시간 감소)
- period 전환 0.5s 이내

---

### EVENT 탭

#### 현재 문제

| 등급 | 문제 | 위치 | 영향 |
|------|------|------|------|
| 🔴 HIGH | 미션 평가 로딩 상태 미표시 | client-event-gate.tsx | 사용자 중복 클릭 → 중복 평가 위험 |
| 🔴 HIGH | M2 kakao_id 검증 미흡 | check-mission API | 유효한 M2 거래도 미완료 판정 가능 |
| 🔴 HIGH | 랭킹 조회 메모리 비효율 | ranking/route.ts L18~34 | 10,000행 메모리 로드 (사용자 1000명 × 미션 10개) |
| 🟠 MEDIUM | 캠페인 목록 페이지네이션 부재 | campaign/page.tsx | 100개 상품 전체 로드 (초기 5초+) |
| 🟠 MEDIUM | MissionCard 메모이제이션 미흡 | event/mission-card | 부모 리렌더 시 모두 재렌더 |

#### 요구사항

1. **미션 평가 로딩 상태 (P0 최우선)**
   - CheckMissionButton 클릭 → Loader2 애니메이션 + disabled
   - 완료/실패 토스트 메시지

2. **M2 kakao_id 필수 검증**
   - check-mission API에서 M2 시 kakao_id 필수 확인
   - 미연동 시 "카카오 연동 필요" 에러 반환

3. **랭킹 쿼리 최적화**
   - SQL RPC 또는 GROUP BY로 메모리 -90% (10,000행 → 100행)

4. **캠페인 목록 페이지네이션**
   - limit=20, offset 기반 페이지네이션
   - 초기 로드 5초 → 1초

#### 성공 기준 (KPI)

- LCP < 2.0s (랭킹 포함)
- 미션 평가 대기 시간 3초 이내 (UX 피드백)
- 캠페인 목록 초기 로드 1초 이내

---

### CAFE(채팅) 탭

#### 현재 문제

| 등급 | 문제 | 위치 | 영향 |
|------|------|------|------|
| 🔴 CRITICAL | Pi Browser WebSocket 미지원 미검증 | use-chat-room.ts L50~80 | 메시지 실시간 수신 미작동 위험 (polling 폴백 없음) |
| 🟠 HIGH | 메시지 메모이제이션 부재 | chat-message-list.tsx L120~150 | 500개 메시지 환경에서 1개 입력 → 전체 리렌더 (500ms 지연) |
| 🟠 HIGH | 첫 방문 스켈레톤 UI 부재 | client-chat-list.tsx L35~50 | 초기 로딩 중 빈 화면 (UX 저하) |
| 🟠 HIGH | Gemini 번역 크레딧 소진 | translate/route.ts | API 호출 실패 → 원문만 표시 (기능 하락) |
| 🟠 MEDIUM | 멤버수 쿼리 중복 (비효율) | chat-room-list.ts L80~100 | 각 카페마다 별도 COUNT → 병렬화 가능 |

#### 요구사항

1. **Pi Browser WebSocket 검증 (P0 CRITICAL)**
   - Pi 실기기에서 Network 탭 확인 (프로토콜 101 업그레이드)
   - WebSocket 미지원 시 → 5초 간격 polling 폴백 구현

2. **메시지 메모이제이션**
   - MessageItem 컴포넌트 분리 + memo 처리
   - useMemo로 메시지 배열 메모이제이션

3. **Suspense + 스켈레톤 UI**
   - ClientChatList를 Suspense로 감싸기
   - ChatListSkeleton (5개 행 애니메이션)

4. **번역 API 폴백 (Gemini → Anthropic → 원문)**
   - Gemini 실패 시 Anthropic 폴백
   - 최악의 경우 원문 표시

5. **멤버수 쿼리 최적화**
   - 한 번에 GROUP BY COUNT로 통합

#### 성공 기준 (KPI)

- WebSocket 또는 polling 동작 확인 (메시지 수신 지연 < 5초)
- 메시지 입력 반응 < 500ms (메모이제이션)
- 첫 방문 스켈레톤 UI 표시 즉시

---

### SHOP(PiShop) 탭

#### 현재 문제

| 등급 | 문제 | 위치 | 영향 |
|------|------|------|------|
| 🔴 CRITICAL | ItemCard 메모이제이션 미흡 | store-item-list.tsx L427~490 | 필터/정렬 변경 시 모든 카드 재렌더 (300ms) |
| 🔴 CRITICAL | 중복 API 호출 (debounce 미흡) | store-item-list.tsx L206~225 | 검색 + 정렬 동시 변경 → 2회 이상 호출 |
| 🔴 CRITICAL | Pi 결제 window.Pi 검증 미확인 | 상품 상세 페이지 | window.Pi 없을 시 결제 실패 (Pi Browser 외) |
| 🟠 HIGH | GPS 권한 반복 요청 | store-item-list.tsx L100~121 | 주변순 버튼 클릭마다 권한 대화상자 (sessionStorage 캐시 부재) |
| 🟠 HIGH | 이미지 최적화 미흡 | store-item-list.tsx L445~450 | 원본 1280px 로드 (모바일 500KB 낭비) |
| 🟠 MEDIUM | 카테고리 캐시 헤더 미설정 | api/store/categories | 30초 불변 데이터 재조회 |

#### 요구사항

1. **ItemCard memo 처리 (P0)**
   - item_id 기반만 비교
   - 필터 변경 시 -30% 리렌더

2. **debounce/중복 호출 방지**
   - searchInput timeout 200ms
   - keyword 실제 변경만 감지

3. **Pi 결제 window.Pi 검증 (P0 CRITICAL)**
   - 결제 버튼 클릭 → window.Pi 선검사
   - Pi Browser 외 환경 진입 차단

4. **GPS 권한 sessionStorage 캐싱**
   - 첫 허용 → sessionStorage 저장
   - 탭 닫힐 때까지 재요청 불필요

5. **이미지 최적화**
   - next/Image 사용 (또는 Cloudinary 리사이징)
   - 500KB → 150KB (70% 감소)

6. **카테고리 캐시 헤더**
   - `Cache-Control: s-maxage=30, stale-while-revalidate=3600`

#### 성공 기준 (KPI)

- 필터/정렬 전환 500ms 이내
- 초기 로드 3초 이내
- 이미지 대역폭 -50%

---

### MAP 탭

#### 현재 문제

| 등급 | 문제 | 위치 | 영향 |
|------|------|------|------|
| 🔴 CRITICAL | 마커 클러스터링 미구현 | shops-map-view.tsx L120~200 | 100+ 마커 시 지도 렉 (500ms 이상 지연) |
| 🟠 HIGH | 마커 재렌더링 최소화 미흡 | shops-map-view.tsx useEffect | shops 변경 시마다 모든 마커 재생성 (깜빡임) |
| 🟠 HIGH | Google Places API 중복 호출 | shops-map-view.tsx L150~170 | bizCategory != 'ALL' 시 불필요한 별도 조회 |
| 🟠 MEDIUM | 뷰포트 마커 필터링 미적용 | nearby-explorer.tsx | 500+ 마커 환경 메모리 낭비 |
| 🟢 ✅ | latd_crd/lngt_crd 마이그레이션 | sql/037 | 완벽히 완료 (인덱스 생성됨) |
| 🟢 ✅ | Pi Browser Geolocation | geo.ts | 호환성 확인 (권한 처리 완비) |

#### 요구사항

1. **마커 클러스터링 추가 (P0)**
   - `@googlemaps/markerclusterer` 설치
   - 마커 클릭 응답 -90% (500ms → 50ms)

2. **마커 재렌더링 최소화**
   - prevShopsRef로 실제 변경만 감지
   - 동일 데이터 재조회 시 깜빡임 제거

3. **Google Places API 제거**
   - 클라이언트에서 필터링만 (서버 호출 X)
   - API 비용 -30%

4. **뷰포트 마커 필터링 (선택)**
   - MAX 50개 표시
   - 메모리 -50%

#### 성공 기준 (KPI)

- 100+ 마커 상황 마커 클릭 < 100ms
- 초기 로드 2초 이내

---

### ADMIN 탭

#### 현재 문제

| 등급 | 문제 | 위치 | 영향 |
|------|------|------|------|
| 🔴 HIGH | 결제 내역 클라이언트 페이지네이션 | api/payments L70~86 | 모든 거래 메모리 로드 (1000+ 시 15+ MB) |
| 🟠 HIGH | 표준단어 캐싱 전략 부재 | api/std/words L14~30 | 매번 std_dic 전체 스캔 (관리자 100명 동시 시 DB CPU +40%) |
| 🟠 HIGH | 다국어 통계 과도한 병렬 처리 | admin/i18n/page.tsx L87~100 | 203개 locale 병렬 쿼리 (DB 연결 풀 고갈 위험) |
| 🟢 ✅ | approval_queue 비활성 상태 | std/approvals | 의도적 비활성 유지 (건드리지 않음) |
| 🟢 ✅ | FK 없는 임베디드 조인 | std/audit | 안전 (감사 로그는 조인 미사용) |
| 🟢 ✅ | 권한 검증 견고함 | auth-check.ts | 3중 인증 (Pi + Google + PIT) 완비 |

#### 요구사항

1. **결제 내역 서버 페이지네이션 (P0)**
   - limit=50, range() API 적용
   - 응답 크기: 15MB → 100KB (150배 감소)

2. **표준단어 캐싱 추가 (P1)**
   - unstable_cache (5분 TTL)
   - DB CPU -40%

3. **다국어 통계 동시성 제한 (P2)**
   - 활성 locale 20개만 + pLimit(5)
   - DB 연결: 203 → 20

#### 성공 기준 (KPI)

- 결제 내역 초기 로드 5초 → 1.5초 (-70%)
- 표준단어 검색 1.2초 → 0.4초 (-67%)

---

## 공통 요구사항

### Pi Browser WebView 성능 최적화

- **Cookie 비저장 → X-Pi-Token 헤더 경로 필수**
  - piFetch 자동 사용 (모든 API 호출)
  - getSessionUser() 쿠키 우선, 헤더 폴백

- **무한 루프 방지 (redirect 금지)**
  - getSessionUser() null 시 클라이언트 게이트 렌더
  - 예: `if (!user) return <ClientChatRoom roomId={roomId} />`

- **Core Web Vitals 목표**
  - LCP < 2.5s (Largest Contentful Paint)
  - INP < 200ms (Interaction to Next Paint)
  - CLS < 0.1 (Cumulative Layout Shift)

### 캐싱 표준화

| 레이어 | 전략 | 예시 |
|--------|------|------|
| **API Route** | `Cache-Control: s-maxage=30, stale-while-revalidate=3600` | 카테고리, 고정 데이터 |
| **Supabase 쿼리** | `unstable_cache()` (5~30분) | 표준단어, 도메인 |
| **클라이언트** | localStorage SWR (5분) | period별 통계, 검색 결과 |
| **sessionStorage** | 탭 수명 동안 (권한, GPS, 상태) | Pi 토큰, GPS 위치 |

### 번들 크기 목표

- **메인 번들**: < 500KB gzipped
- **동적 import**: Plotly, 지도 라이브러리 분리
- **이미지 최적화**: next/Image, CDN 캐시 (30+ 일)

### 반복 성능 패턴 및 예방

| 패턴 | 예방 책 |
|------|---------|
| **N+1 쿼리** | 배치 조회 (.in()), GROUP BY 사용 |
| **메모이제이션 미흡** | memo + useMemo + useCallback (필수) |
| **중복 API 호출** | debounce (200~300ms), 의존성 배열 엄격히 |
| **상태 과다** | 상태 분해, useReducer 고려 |
| **폴링 오버헤드** | WebSocket 우선, polling 폴백만 사용 |

---

## 구현 우선순위 로드맵

### Phase 1: CRITICAL 이슈 (1주일)

| 탭 | 이슈 | 예상 시간 | 난이도 |
|-----|------|----------|--------|
| HOME | LazySection rootMargin → 50px | 30m | 낮 |
| HOME | aggregate 오류 로깅 | 30m | 낮 |
| EVENT | 미션 평가 로딩 상태 | 1h | 낮 |
| CAFE | WebSocket 검증 (Pi 실기기) | 1h | 중 |
| CAFE | WebSocket 폴백 (polling) | 2h | 중 |
| SHOP | ItemCard memo | 1h | 낮 |
| SHOP | debounce 강화 | 1h | 낮 |
| SHOP | Pi 결제 window.Pi 검증 | 1.5h | 중 |
| MAP | 마커 클러스터링 | 2h | 중 |

**총 예상**: 10~11시간 (3~4일)

### Phase 2: HIGH 이슈 (2주일)

| 탭 | 이슈 | 예상 시간 |
|-----|------|----------|
| HOME | BeanTopSpenders SWR 캐싱 | 1.5h |
| EVENT | M2 kakao_id 검증 강화 | 1.5h |
| EVENT | 랭킹 쿼리 최적화 | 2h |
| CAFE | 메시지 메모이제이션 | 2h |
| CAFE | Suspense + 스켈레톤 | 1.5h |
| CAFE | 번역 API 폴백 | 2h |
| SHOP | GPS 권한 캐싱 | 1.5h |
| SHOP | 이미지 최적화 | 2h |
| ADMIN | 결제 내역 페이지네이션 | 2h |

**총 예상**: 16시간 (5일)

### Phase 3: MEDIUM 이슈 (3주일)

| 탭 | 이슈 | 예상 시간 |
|-----|------|----------|
| HOME | bean-daily-chart period 전달 | 1.5h |
| HOME | Plotly config 최적화 | 1h |
| EVENT | 캠페인 목록 페이지네이션 | 2h |
| SHOP | 카테고리 캐시 헤더 | 1h |
| MAP | 마커 재렌더링 최소화 | 1.5h |
| MAP | Google Places API 제거 | 1h |
| ADMIN | 표준단어 캐싱 | 1.5h |
| ADMIN | 다국어 통계 동시성 제한 | 1.5h |

**총 예상**: 12시간 (4일)

**전체 로드맵**: 3주 (Phase 1 → Phase 2 → Phase 3)

---

## 비기능 요구사항

### 보안

- **Pi 결제는 Pi Browser 전용** (window.Pi 검증 필수)
- **X-Pi-Token 헤더**: 모든 보호 API에 포함
- **클라이언트 게이트**: redirect 절대 금지 (무한 루프 방지)
- **논리삭제 유지**: 물리 DELETE 금지

### 데이터 품질

- **N+1 쿼리 Zero**: 배치 조회 필수
- **마이그레이션 완성**: latd_crd/lngt_crd (sql/037) 완벽히 적용
- **FK 없는 임베디드 조인 금지**: PostgREST PGRST200 방지

### 운영 편의성

- **에러 로깅**: console.warn으로 추적 가능하게
- **성능 메트릭**: Vercel Analytics, DevTools Profiler 검증
- **Pi Browser 실기기**: 모든 변경 후 필수 검증

---

## 검증 방법

### Local 개발 환경

```bash
# 1. 성능 측정 (Lighthouse)
pnpm dev
# Chrome DevTools → Lighthouse → Audit (LCP, INP, CLS 기준선)

# 2. 번들 분석
pnpm build
# npm install -g webpack-bundle-analyzer
# npx webpack-bundle-analyzer .next/static/chunks

# 3. 메모리 프로파일링
# Chrome DevTools → Memory → Heap Snapshot (각 탭별)
```

### Pi Browser 실기기 검증 (필수)

| 항목 | 검증 방법 |
|------|----------|
| **LCP** | Pi Browser DevTools Network → 초기 페인트 시간 |
| **메시지 실시간 수신** | 채팅방 → 상대 메시지 전송 → 즉시 수신 확인 |
| **GPS 권한** | MAP 탭 → 주변순 → 권한 대화상자 1회만 표시 |
| **Pi 결제** | SHOP → 상품 구매 → createPayment 호출 및 승인 완료 |
| **권한 검증** | X-Pi-Token 헤더 → Network 탭 확인 |

### Vercel Analytics

- **Core Web Vitals**: 실사용자 LCP, INP, CLS 추적
- **API 지연**: 각 엔드포인트 응답 시간 모니터링
- **에러율**: JavaScript 에러 콘솔 로그

---

## 비용 추정

| 항목 | 예상 비용 |
|------|----------|
| **개발 시간** | 38시간 (1주 풀타임 + 2주 파트타임) |
| **Supabase RPC** | 기존 쿼리로 충분 (신규 RPC 불필요) |
| **이미지 CDN** | Vercel 기본 (추가 비용 0) |
| **Gemini 번역 폴백** | Anthropic 비용 (크레딧 소진 시만) |

---

## 최종 요약

cafe.pi 성능 진단 결과, **각 탭의 주요 병목은 메모이제이션·캐싱·쿼리 최적화 미흡**으로 수렴합니다. **CRITICAL 이슈 9개(Phase 1)**는 1주일 내 즉시 처리하여 사용자 체감 성능을 **50% 이상 향상**시킬 수 있습니다.

**최우선**: Pi Browser 실기기 검증 (모든 변경 후)

---

## 체크리스트

### Phase 1 완료 기준
- [ ] HOME: LazySection 50px + aggregate 오류 로깅
- [ ] EVENT: 미션 평가 로딩 상태 추가
- [ ] CAFE: WebSocket 검증 + polling 폴백
- [ ] SHOP: ItemCard memo + debounce + Pi 결제 검증
- [ ] MAP: 마커 클러스터링 추가
- [ ] Pi Browser 실기기 전 탭 테스트

### 최종 검증
- [ ] LCP < 2.5s (모든 탭)
- [ ] INP < 200ms (모든 사용자 입력)
- [ ] 번들 크기 < 500KB
- [ ] Core Web Vitals 녹색 등급

---

**작성**: 아소카 (cafe.pi 성능진단 에이전트)  
**최종 검토**: 아나킨 마스터님
