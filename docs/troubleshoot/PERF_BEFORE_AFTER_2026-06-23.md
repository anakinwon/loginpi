# 성능 개선 Before/After 지표 (Phase 1)

- **작성일**: 2026-06-23
- **대상**: PRD_18_PERFORM Phase 1 즉시개선 (CAFE·MAP·SHOP·EVENT·HOME)
- **정본 연계**: `docs/PRD_18_PERFORM.md` · PRD.md §20 · ROADMAP Phase 20

> ⚠️ **지표 신뢰도 표기 규칙**
> - 🟢 **측정**: 코드/로그로 직접 확인 가능한 사실
> - 🟡 **추정**: 코드 변경 메커니즘에서 도출한 예상치 (실측 아님)
> - 🔵 **실측 대상**: Pi Browser 실기기 + Lighthouse로 마스터님이 채울 항목
>
> 본 문서의 정량 수치는 별도 표기가 없으면 **🟡 추정**이다. 실측 후 §5 템플릿에 기록한다.

---

## 1. 개선 항목 요약

| # | 탭 | 개선 | 커밋 | 신뢰도 |
|---|---|---|---|---|
| 1 | HOME | 매출 `LazySection` rootMargin 200→50px + aggregate 실패 로깅 | `⚡ perf` | 🟢 측정 |
| 2 | SHOP | `ItemCard` `memo` 화 | `⚡ perf` | 🟡 추정 |
| 3 | SHOP | 이미지 `next/Image` + Supabase Storage만 최적화 | `🔧 chore` | 🟡 추정 |
| 4 | EVENT | 미션 재평가 중복클릭 가드 + 실패 피드백 | `⚡ perf` | 🟢 측정 |
| 5 | MAP | 마커 클러스터링(`@googlemaps/markerclusterer`) | `⚡ perf` | 🟡 추정 |
| 6 | CAFE | WebSocket 실패 시 polling 폴백 + `after` 커서 | `⚡ perf` | 🟢 측정 |

---

## 2. 항목별 Before / After

### ① HOME — 매출 섹션 LazySection rootMargin

| 구분 | Before | After |
|---|---|---|
| 진입 트리거 거리 | 뷰포트 **200px** 전 | 뷰포트 **50px** 전 |
| `bean-revenue` RPC 호출 시점 | 매출 섹션 도달 한참 전(스크롤 안 해도 호출 가능) | 실제 진입 직전 |
| aggregate 실패 | `.catch(() => {})` 조용히 삼킴 | `console.warn('[HOME 통계] …')` 추적 가능 |

- 🟢 **측정(코드)**: IntersectionObserver `rootMargin` 200px→50px, 실패 로깅 추가 — diff로 확인.
- 🟡 **추정**: 모바일에서 매출 섹션까지 스크롤하지 않는 세션 비율만큼 RPC 호출 절감. **약 -20~40%** (홈 이탈률·스크롤 깊이에 의존).
- 🔵 **실측 대상**: Vercel Analytics에서 `/api/admin/stats/bean-revenue` 호출 수 배포 전후 비교.

### ② SHOP — ItemCard memo

| 구분 | Before | After |
|---|---|---|
| 카드 컴포넌트 | 일반 함수 컴포넌트 | `memo()` 래핑 |
| 검색어 입력 1글자 시 | 전체 카드 리렌더 | 변경 없는 카드는 **리렌더 스킵** |
| GPS 로딩·필터 토글 시 | 전체 카드 리렌더 | 동일하게 스킵 |

- 🟢 **측정(코드)**: `const ItemCard = memo(function …)` 적용.
- 🟡 **추정**: 목록 5~N개 카드 기준 부모 리렌더당 리렌더 **약 -30%** (변경된 카드 비율에 의존). React DevTools Profiler "Highlight updates"로 확인 가능.

### ③ SHOP — 이미지 최적화

| 구분 | Before | After |
|---|---|---|
| 이미지 태그 | `<img>` 원본 로드 | `next/Image`(fill·sizes·priority) |
| 최적화 범위 | 없음 | Supabase Storage URL만 WebP/리사이즈, 외부 URL은 `unoptimized` fallback |
| 허용 호스트 | — | 프로젝트 Supabase 호스트로 고정(open proxy 방지) |

- 🟢 **측정(코드)**: `next/Image` + `isStorageUrl()` 분기 + `next.config` 호스트 고정.
- 🟡 **추정**: 모바일 썸네일 기준 이미지 대역폭 **약 -50%** (원본 해상도·포맷에 의존). Network 탭 전송 크기로 확인.

### ④ EVENT — 미션 재평가 안정화

| 구분 | Before | After |
|---|---|---|
| 중복 클릭 | 가드 없음 → 재평가 중복 호출 가능 | `if (reevaluating) return` 가드 |
| 실패 시 | `if (!res.ok) return` 조용히 종료 | `alert(에러)` 피드백 |

- 🟢 **측정(코드)**: 가드 + 실패 alert 추가.
- 🟢 **정성**: 미션 평가=고객 신뢰 직결(메모리 원칙). 중복 평가 위험 제거 + 관리자 결과 인지.

### ⑤ MAP — 마커 클러스터링

| 구분 | Before | After |
|---|---|---|
| 마커 렌더 | 모든 마커 개별 표시 | 줌 레벨별 클러스터링(`MarkerClusterer`) |
| 100+ 마커 환경 | 지도 렉(진단 추정 ~500ms) | 묶음 렌더로 부하 분산 |
| 사용자 '나' 마커 | — | 클러스터 제외(항상 개별 표시) |

- 🟢 **측정(코드)**: shop 마커를 클러스터러에 위임, cleanup `clearMarkers()`.
- 🟡 **추정**: 100+ 마커 클릭/팬 응답 **약 -90%** (마커 수에 비례). 마커 수가 적으면 체감 차이 작음.
- 🔵 **실측 대상**: Pi Browser 실기기에서 100+ 매장 지역 팬/줌 반응성.

### ⑥ CAFE — WebSocket polling 폴백 (가용성 개선)

| 구분 | Before | After |
|---|---|---|
| WebSocket 정상 | broadcast 실시간 수신 | 동일(변경 없음) |
| WebSocket 차단/끊김(Pi Browser) | `SUBSCRIBED` 외 상태 무시 → **메시지 영영 미수신** | `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` 감지 → **5초 polling 복구** |
| 복구 시 | — | `SUBSCRIBED` 재연결 시 polling 자동 중지 |
| 서버 | `before` 커서만(과거) | `after` 커서 추가(신규 메시지 조회) |

- 🟢 **측정(코드)**: subscribe 상태 분기 + polling + `after` 커서.
- 🟢 **정성**: **기능 가용성 0→1** — 기존엔 WebSocket 실패 시 채팅 수신이 완전 불능이었으나, 폴백으로 최대 5초 지연 내 수신 보장.
- 🔵 **실측 대상**: WebSocket 차단 환경(일부 Pi Browser/네트워크)에서 메시지 수신 지연 < 5초.

---

## 3. Core Web Vitals 목표 대비 (PRD_18 §20.1)

| 지표 | 목표 | Before(추정) | After(이번 Phase 1 기여) |
|---|---|---|---|
| LCP | < 2.5s | 1.2~5s | HOME 지연로드·SHOP 이미지로 하향 기여 🟡 |
| INP | < 200ms | 200~500ms | SHOP memo·MAP 클러스터링으로 입력 응답 개선 🟡 |
| CLS | < 0.1 | 0.05~0.15 | 이미지 `fill`+`sizes`로 레이아웃 안정화 기여 🟡 |
| 번들 | < 500KB | 600~800KB | (Phase 1 직접 영향 작음 — Phase 2/3 대상) |

> Phase 1은 **렌더 효율·RPC 절감·가용성** 중심이라, LCP/번들의 큰 폭 개선은 Phase 2(SWR·쿼리 최적화·서버 페이지네이션)·Phase 3(동적 import·동시성 제한)에서 본격화된다.

---

## 4. 실측 방법

```bash
# 1) Lighthouse (탭별)
pnpm build && pnpm start
# Chrome DevTools → Lighthouse → 각 탭 Audit (LCP·INP·CLS)

# 2) 리렌더 측정 (SHOP memo)
# React DevTools → Profiler → "Highlight updates when components render"
# 검색어 입력 시 ItemCard 하이라이트 범위 before/after 비교

# 3) RPC 호출 수 (HOME)
# Vercel Analytics / 서버 로그에서 /api/admin/stats/bean-revenue 호출 빈도

# 4) 이미지 대역폭 (SHOP)
# DevTools Network → Img 필터 → 전송 크기 합계 before/after

# 5) CAFE polling (실기기)
# Pi Browser DevTools Network → WS 연결 실패 유도 → /messages?after= 폴링 확인
```

---

## 5. 실측 기록 템플릿 (마스터님 작성용)

> Pi Browser 실기기 + Lighthouse 측정 후 채운다. 빈칸은 미측정.

| 탭 | 지표 | Before(실측) | After(실측) | 개선율 | 측정 환경 |
|---|---|---|---|---|---|
| HOME | LCP | | | | |
| HOME | bean-revenue RPC/시간 | | | | |
| SHOP | LCP | | | | |
| SHOP | 이미지 전송 KB | | | | |
| SHOP | ItemCard 리렌더 수 | | | | |
| MAP | 마커 클릭 응답(ms) | | | | |
| CAFE | 메시지 수신 지연(WS 차단 시) | | | | |
| EVENT | (정성) 중복 클릭 차단 | N/A | ✅ | — | |

---

## 6. 한계 및 주의

- 본 문서의 정량 수치는 **코드 변경 메커니즘 기반 추정**이며, 실제 효과는 사용자 행동·기기·네트워크에 따라 달라진다.
- **완료 조건은 Pi Browser 실기기 검증**(핵심 가치 규칙) — 특히 CAFE polling·MAP 클러스터링은 실기기 확인 전까지 "적용"이지 "검증 완료"가 아니다.
- Phase 2·3 미적용 항목(서버 페이지네이션·SWR 캐싱·동적 import 등)은 본 지표에 미반영.
