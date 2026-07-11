# Troubleshoot — 운영 이슈 기록

> 배포·인프라·서비스 제약으로 인해 발생한 이슈와 해결책을 기록합니다.
> 코드 버그가 아닌 **플랫폼 제약·정책·환경 차이**로 인한 이슈를 여기에 기록합니다.
>
> 본 문서는 세 부분으로 구성됩니다.
> - **A. 성능 리스크 레지스터** (proactive) — 아직 안 터졌지만 동접·거래량 증가 시 예측되는 병목.
> - **A-2. 운영·사업 리스크 레지스터** (proactive, 2026-07-08 신설) — 등재·프로모 종료·법무 등 사업 직접 타격 리스크 (WBS 1.3 정본).
> - **B. 운영 이슈 기록** (reactive) — 실제로 발생한 이슈와 해결책.

---

# A. 성능 리스크 레지스터 (Performance Risk Register)

> **[2026-06-15] 핵심 기능 7종의 "장점 ↔ 성능 부담" 분석.**
> 모든 장점은 자원(DB 커넥션 · 외부 RPC 지연 · 직렬화된 권한 검증)으로 환산된다.
> 이 프로젝트의 진짜 병목은 CPU가 아니라 **① DB 커넥션 수 ② 외부 체인 RPC 지연 ③ 직렬 권한 검증**이며, 셋 다 수평 확장으로 풀리지 않는다.

## 종합 우선순위 (성능 리스크 큰 순)

| 순위 | 기능 | 핵심 병목 | 민감 변수 | 수평 확장으로 풀리나 |
|---|---|---|---|---|
| 🔴 1 | **실시간 채팅 (203개국)** | 영속 연결 + 메시지 팬아웃 | 동접 × 방 인원 | 어려움 (연결 한도) |
| 🔴 2 | **위치기반 직거래** | 공간 쿼리 + 고빈도 위치 쓰기 | 데이터 밀도 | 부분적 (인덱스 의존) |
| 🟠 3 | **에스크로 (PiRC3)** | 상태 경합 + 앱 레벨 정합성 | 거래량 × 분쟁율 | 어려움 (정합성) |
| 🟠 4 | **구독 (PiRC2)** | cron 배치 집중 | 구독자 수 | 가능 (시간 분산) |
| 🟡 5 | **결제 (PiRC1)** | 외부 RPC 지연 | 결제 빈도 | 가능 (비동기화) |
| 🟡 6 | **계정 통합 (Pi+Google)** | 요청당 권한 검증 | 페이지당 API 수 | 가능 (캐시) |
| 🟢 7 | **다국어 (203개국)** | 번역 I/O + 빌드 검증 | 활성 locale × 파일 크기 | 가능 (캐시) |

> **공통 천장:** RLS 비활성 + `SUPABASE_SERVICE_ROLE_KEY` 단일 경로 → 모든 부하가 **service_role 커넥션 풀 하나로 수렴**한다. 🔴①②·🟠③·🟢⑦이 같은 풀을 두고 경쟁하므로, pooler(PgBouncer) 풀 사이즈가 숨은 공통 한계.

---

### 🔴 1. 실시간 채팅 (203개국) — 최우선

- **병목:** 실시간은 요청-응답이 아니라 **연결 유지**. 동접 N명 = 상시 N개 연결 → Supabase Realtime/WebSocket **동시 연결 한도**가 1차 천장.
- 메시지 1건이 방 인원 M명에게 **팬아웃** → 트래픽 `메시지수 × M`. 활발한 방일수록 제곱에 가깝게 증가.
- 메시지 영속화(`msg_msg`)는 고빈도 INSERT + 최근 메시지 조회 인덱스 부담 → 핫 테이블화.
- "203개국" = **다중 리전 지연**. 한 방에 여러 대륙 사용자가 섞이면 일부는 항상 먼 신호 경로.
- **체감 시점:** 동접에 가장 민감. 활성 사용자(북극성) 상승 시 이 축이 먼저 한계.
- **완화:** 방 단위 샤딩/프레즌스 분리 · 메시지 쓰기 배치/버퍼링 · 읽음 표시 등 고빈도 신호는 경량 채널 분리 · 오래된 메시지 콜드 스토리지 이관.

### 🔴 2. 위치기반 직거래

- **병목:** "내 주변 매물/매장" = **반경 검색(geo query)**. B-tree로 불가 → **공간 인덱스(PostGIS/GiST)** 필수. 없으면 풀스캔.
- 위치는 자주 변함(이동 중 갱신) → 고빈도 위치 쓰기 + 반경 조회 충돌.
- 위치 종류 다층(거래·로그인·상품·매장) + 수집 동의 기록 → 테이블·조인 증가.
- 위치 × 카테고리 × 가격 **복합 필터** 빈번 → 복합 인덱스 설계 난이도.
- **체감 시점:** 데이터 밀도(인구 밀집지에 매물 집중) 시 결과 집합 커지며 정렬·페이징 급증.
- **완화:** PostGIS GiST 인덱스 필수 · geohash 격자 버킷 근사 후 정밀 필터 · 위치 갱신 스로틀링(이동 임계값 이상만 기록).

### 🟠 3. 에스크로 (PiRC3)

- **병목:** `보류 → 확정 → 정산/환불` 다단계 상태를 거래마다 유지 → **동시 갱신 경합**(구매자 확정 vs 판매자 취소 vs cron 만기).
- PiRC3/`invokeContract` 공식 미지원 → **가상 에스크로를 앱 레벨에서 유지**(메모리: `mps-escrow-pirc3-blocked`). 체인이 보장할 원자성을 **DB 트랜잭션으로 직접 떠안음** = 가장 비싼 정합성 부담.
- 분쟁·중재 시 장기 보류 행 누적 → 인덱스·조회 비용 누적.
- **체감 시점:** 동접보다 **동일 거래 동시 접근 빈도**. 거래량 × 분쟁율이 핵심.
- **완화:** 상태 전이를 조건부 단일 원자 UPDATE(`WHERE status=...`) · 멱등 키 필수 · 만기 처리도 동일 가드.

### 🟠 4. 구독 (PiRC2)

- **병목:** 본질이 **만기 도래분 일괄 갱신**. `process(merchant, service_id, offset, limit)`가 cron으로 돌면 구독자 수에 비례해 **자정 한 번에 처리할 양** 선형 증가(`event.ts` "cron 자정 1회"와 동일 함정).
- 각 갱신 = 체인 트랜잭션 + DB 쓰기 → 1만 구독 = 1만 RPC. 타임아웃·부분 실패·재처리 필수.
- ※ Vercel Hobby cron 제약(본 문서 B 섹션)과 결합 시 배치 집중 악화.
- **완화:** `offset/limit` 페이지네이션 강제 · 시간 분산(갱신일 해시 버킷팅) · 실패분 멱등 재처리 큐.

### 🟡 5. 결제 (PiRC1)

- **병목:** 결제 확인 = `rpc.testnet.minepi.com` **네트워크 왕복**. 서버가 빨라도 체인이 느리면 사용자는 느린 결제 경험.
- 멱등성 필수 → `pi_pymnt` lock/unique 제약 + 상태 폴링(반복 DB 쓰기).
- 체인 응답 대기 동안 **함수 인스턴스 점유**.
- **완화:** 검증을 동기 응답에서 분리(웹훅/큐), 사용자에겐 "처리 중" 즉시 반환.

### 🟡 6. 계정 통합 (Pi + Google)

- **병목:** `getSessionUser()`가 **쿠키 → `X-Pi-Token` 헤더 → Google 세션** 3경로 순차 확인 → 인증 필요한 모든 API/페이지가 매 요청 지불.
- "한 사람 = 여러 신원" 매핑 → `auth_link_cd` 조인이 핫패스 진입.
- HMAC-SHA256 검증 + `tokenValidUntil` 만료 체크가 **요청당 동기 연산**. 캐시 없으면 동접 × 페이지뷰만큼 반복.
- **체감 시점:** 동접보다 **페이지당 인증 호출 수**. 한 화면이 5개 API 호출 시 검증도 5배.
- **완화:** 검증 결과를 요청 스코프(`React.cache`)로 메모이즈 · 토큰 디코드 결과 재사용.

### 🟢 7. 다국어 (203개국)

- **병목:** 번역 로딩이 `import()` 아닌 **`readFile()`**(동기화 반영 목적) → 렌더 경로에 파일 I/O. locale 파일 크면 콜드 스타트에서 두드러짐.
- `locales` **203개 선점 등록** + `validate-locales.mjs`가 빌드마다 교차 검증 → 빌드 시간·메모리 증가.
- 정본이 DB(`i18n_message`)라 sync·캐시 무효화(`v1→v2` 사례) 잦으면 **캐시 미스 폭** 큼(메모리: `i18n-db-source-of-truth`).
- **체감 시점:** 동접보다 **활성 locale 수 × 메시지 파일 크기**. 실트래픽은 소수 locale인데 비용은 전체 분산.
- **완화:** locale 메시지를 빌드 산출물로 캐시(읽기 1회 후 메모리 캐시) · 활성 locale만 워밍 · namespace 분할 로딩.

---

## 📐 카페방 조회 — 구현 수준과 성능 보장 한계 [2026-06-20]

> 카페 목록·검색·인기 랭킹의 현재 구현과, 데이터/사용자 규모별 한계 추정. (차수 추정 — 정확치는 `EXPLAIN ANALYZE`+부하테스트 필요)

### 현재 구현 수준

| 영역 | 구현 | 인덱스 |
|---|---|---|
| 내 카페 / 탐색 목록 | 병렬 3단계 + 멤버수 1쿼리 집계 (`chat-room-list.ts`) | `idx_msg_room_mbr_usr/room`, `idx_msg_room_public` |
| 마켓 검색 | pg_trgm GIN substring (`sql/072`) | `idx_msg_room_nm/desc_trgm` |
| 마켓 인기 랭킹 | LATERAL 실시간 집계 + score 정렬 (`fn_chat_marketplace`) | `idx_msg_msg_room_dtm` 등 |

### 성능 보장 한계 (추정)

| 차원 | 쾌적 보장 | 첫 병목 | 병목 지점 |
|---|---|---|---|
| 카페 수 | ~수만 개 | ~10만+ | 마켓 인기 랭킹 실시간 LATERAL 집계 |
| 동시 사용자 | 수백~1천 req/s | 그 이상 | Vercel 함수 동시성 × Supabase 커넥션 풀 |
| 카페당 멤버 | ~수천 | ~수만+ | 멤버수를 `COUNT` 아닌 JS로 집계 |
| 카페당 메시지 | 7일 윈도우라 누적 무관 | 한 방 7일 수십만+ | 랭킹의 `COUNT(7일 메시지)` |

- **가장 먼저 무너지는 곳 = 마켓 인기 랭킹**(매 호출 실시간 집계). 목록 조회(내 카페·탐색)는 `limit 10`이라 데이터 증가에 거의 무영향.
- 검색은 trigram GIN으로 이미 수십만 행 대비됨 → 역설적으로 "검색보다 랭킹 집계가 먼저 한계".
- **공통 천장:** service_role 단일 커넥션 풀(A 서문 참조).

### 확장 사다리 (한계 도달 시 순서)
1. **랭킹 score 사전계산** — 매시간 배치로 테이블/MV에 저장 → 실시간 LATERAL 제거 (효과 최대)
2. **멤버수 비정규화** — `msg_room.cur_mbr_cnt` 카운터 + 가입/탈퇴 시 증감 → JS 집계 제거
3. **커넥션 풀** — PgBouncer transaction mode + 읽기 복제본
4. 검색은 trigram으로 선대비됨

**결론:** 현 구조는 **수만 카페 / 동시 수백~천 사용자 / 카페당 멤버 수천**까지 안정. 초기~중기 충분, 그 이상은 1→2 순서로 점진 대응.

---

## 🔍 substring 검색 trigram 확대 — 상품·게시판 [2026-06-20]

> 카페 검색(`sql/072`)에 적용한 pg_trgm GIN을 다른 `%검색어%` 풀스캔 지점으로 확대.

### 배경 — 같은 풀스캔이 상품에 남아있음
`mps-item.ts:193`은 이미 `item_nm.ilike.%kw%,item_desc.ilike.%kw%` substring 검색인데, `mps_item` 인덱스는 `seller_id/ctgr_id/item_st_cd/좌표`뿐 — **텍스트 인덱스가 없어 풀스캔**. 카페가 071→072로 푼 문제가 상품엔 그대로 남음.

### 적용 우선순위 (ROI 순)

| 순위 | 대상 | 컬럼 | 비고 |
|---|---|---|---|
| 1 ⭐ | `mps_item` (상품) | `item_nm`, `item_desc` | 사용자 대면 + 풀스캔 중 |
| 2 | `brd_post` (게시판) | `post_ttl`, `post_cont` | 사용자 대면 (`board/[category]:47`) |
| 3 | admin (std 단어/용어/도메인 등) | 각 명칭 | 데이터 수백 건 → ROI 낮음, 생략 무방 |

### 기술 포인트 — 카페보다 간단
- 카페 RPC는 `lower(room_nm) LIKE`라 lower() 식 인덱스가 필요했지만, 상품/게시판은 PostgREST `.ilike`(=ILIKE 연산). **`gin_trgm_ops`는 ILIKE를 대소문자 무시로 직접 가속** → lower() 식 불필요, **코드 변경 0**, 인덱스만 추가하면 기존 ILIKE 쿼리가 자동으로 색인 사용.
- 적용: `sql/076_search_trgm_expand.sql`

### 주의점
- **2글자 미만 검색어**는 trigram(3글자 단위) 효율 저하 → UI에 최소 2글자 제한 권장.
- GIN 인덱스는 **쓰기 비용 소폭 증가** — 등록 빈도 낮으면 무시 가능.
- 긴 본문(`item_desc`/`post_cont`)은 인덱스 커짐 → 제목 우선, 본문은 선택.

---

# A-2. 운영·사업 리스크 레지스터 (2026-07-08 신설)

> A(성능)와 별개로, **지금 터지면 서비스·사업에 직접 타격**인 운영·사업 리스크. WBS 1.3 위험 관리 정본.
> 갱신 주기: 주요 배포·정책 변경 시. 해소된 항목은 상태를 ✅로 바꾸고 남긴다(이력 보존).

| ID | 리스크 | 발생가능성 | 영향 | 완화·대응 | 상태 |
|---|---|---|---|---|---|
| R-01 | **메인넷 등재 심사 반려** — 레드라인 4종(도박·Pi외통화·Pi외로그인·브랜딩)·Bean 표현 A-5 | 중 | 🔴 치명 (출시 차단) | PRD_23 절제/부각 가이드·Bean→포인트 순화(운영 오버레이)·시세칩 숨김 게이트(computeShowPiValuation)·Pi Sign-In으로 'Pi 외 로그인' 완화 | 🚧 등재 신청 준비 중 |
| R-02 | **오픈 프로모 자동 종료 후 과금 복귀** — `fn_is_open_promo_active()` FALSE 전환 시 7개 청구경로 정상 과금·표시 전환 여부 | 저 (게이트 검증 후) | 🟠 높음 (과금 오류=신뢰 타격) | ✅**2026-07-09 게이트 검증 완료**: staging 시뮬레이션(end_dtm 과거 설정→fn·`v_promo_fee_current` 모두 false→원복 확인)+staging은 6/30부로 이미 종료 상태 실증(자연 실측). `applyPromoGate`는 RPC 오류 시에도 정상 과금 폴백(fail-safe). ⭐**운영 종료=2026-12-31 23:59 KST는 의도된 전략**(2026-07-09 마스터 확인: 무료 프로모=실사용자 지속 유입 드라이버, **계속 연장 예정**). 종료는 마스터 결정 사항이며, 결정 시 실행 절차=①종료 7일 전 공지 ②`/admin/open-promo` 종료시각 확정 ③종료 직후 과금 정상화 모니터링 | ✅ 게이트 검증 완료·종료는 전략적 보류(연장 운영) |
| R-03 | **Pi 계정 영구제명** — 실환경 더미/다중계정 테스트 = KYC·1인1계정 위반 | 저 (철칙 준수 시) | 🔴 치명 (핵심가치·등재 붕괴) | ⛔검증은 실사용자 행위로만·명시승인 격리환경만 (CLAUDE.md·메모리 철칙) | ✅ 철칙 명문화 |
| R-04 | **SANDBOX_FLAG 오설정** — 플립 시 전 사용자 pi_uid 재발급→계정 무한 재생성 | 저 (재발 방지 후) | 🔴 치명 | 환경별 고정값 확정(staging=true·운영=false)·pi_username 재바인딩 폴백(sql/162)·본 문서 [2026-07-02] 정본 | ✅ 근본수정 배포 |
| R-05 | **NextAuth v5 beta 의존** — beta.31, stable 미출시 | 저 | 🟡 중간 | 버전 고정 유지·UPGRADE_STRATEGY.md 모니터링·trustHost 등 운영 설정 문서화 완료 | 🔒 외부 대기 |
| R-06 | **Vercel Pro 의존** — 다운그레이드 시 분단위 cron 배포 차단 | 저 | 🟠 높음 (정산·알림·자가치유 중단) | Pro 유지 필수 (ROADMAP 제약사항 필독 표) | ✅ 인지·유지 중 |
| R-07 | **텔레그램 봇 단일 장애점** — Pi Browser 푸시 부재의 유일 대체 채널 | 중 | 🟠 높음 (주문·채팅 알림 유실) | webhook 자가치유 cron 1분(b3563c0)·환경별 봇 분리 철칙·진단 API `/api/admin/telegram/webhook`·앱 내 Realtime+Pull 2계층 백업 | ✅ 자가치유 배포 |
| R-08 | **법무 컴플라이언스** — (구)문서 현행화 지연 → 4종 v1.1 완결(2026-07-09 공지·7/16 시행)로 해소. ⭐**법무 전략 확정(2026-07-09 마스터)**: 상시 법무팀 불요 — ①기본 컴플라이언스=자체 문서 체계(완료) ②VASP 쟁점=에스크로 보관 규모 확대 시 1회 스팟 자문(유일한 워치 포인트) ③T05 증권성=토큰 발행 결정 시점으로 이연. 외부 법무 자문은 **Pi 공식 요구 아님 이중 확인**(PRD_12 v1.8 + 2026-07-09 웹 재확인 — 등재 요구=KYC·브랜딩·Pi SDK·품질·개발자 약관뿐). 원칙: 법무 요구 발생 시 "Pi 공식 요구 vs 자체 안전장치" 먼저 구분 | 저 | 🟡 중간 | 트리거형 스팟 자문 노선 | ✅ 전략 확정·문서 v1.1 완결 |
| R-09 | **service_role 단일 커넥션 풀 천장** — RLS 비활성 구조상 전 부하가 한 풀로 수렴 | 중 (사용자 증가 시) | 🟠 높음 | A 레지스터 공통 천장 참조·pooler 사이즈 모니터링(/admin/monitor DB 부하 메트릭) | 🚧 모니터링 구축 중 |
| R-10 | **성능 CRITICAL — 전량 종결** (✅2026-07-09 전수 확인): SHOP window.Pi 가드=4개 진입점 기구현·CAFE WebSocket 폴백=6/23 기구현(bda03c35, 5초 polling+after 커서)·MAP 클러스터링=6/23 기구현(@googlemaps/markerclusterer). 점검 중 **유령 폴링 실버그 발견·수정**(2026-07-09): removeChannel의 CLOSED 콜백이 cleanup 후 startPolling을 되살려 방 이탈마다 이전 방 폴링 영구 지속 → disposed 가드 추가. 잔여는 PRD_18 HIGH/MEDIUM급만 | 저 | 🟢 낮음 | PRD_18 Phase 2(HIGH/MEDIUM)로 관리 | ✅ CRITICAL 0건 |

> **성능 레지스터(A) 현행화 노트 [2026-07-08]**: substring 검색 trigram 확대(§ 2026-06-20 항목)는 sql/072·076으로 **적용 완료**. 다국어 리스크(#7)는 활성 locale 24→**189개 확장(2026-07-07)** 으로 민감 변수가 커졌으나 번역 캐시·빌드 검증 통과로 현재 안정. 나머지 7종 분석은 여전히 유효.

---

# B. 운영 이슈 기록 (Operational Issues)

---

## [2026-07-11] 🔴 운영 Pi 결제 전면 타임아웃 — 클라 메인넷 ↔ 서버 테스트넷 키 스코프 불일치 ⭐

### 증상
- 운영(cafepi.vercel.app) Pi Browser 결제가 전부 결제창 대기 후 **타임아웃**. 로그인·카트 주문 생성(201)은 정상.
- 계측(sys_metric_req_perf): 10:07~10:10 KST `/api/payments/approve` 9건 **전부 404** (결제 시도 3건 × 재시도 3회). `pi_pymnt` 신규 행 0건.
- 스테이징은 결제 정상 (마스터 실기기 확인) — 환경 비대칭이 지문.

### 원인 (실측 확정)
- 404는 우리 라우트가 아니라 **Pi Platform API의 `payment_not_found` pass-through**.
- 판별 프로브(완결된 7/3 결제 ID로 approve 재호출 — 이미 완결이라 무해, 키 유효 시 결제 객체 반환):
  운영 `PI_API_KEY`가 7/3 결제를 찾음 → 단 **`"network":"Pi Testnet"`** = **운영 키는 테스트넷 앱 키**.
- 운영 번들 인라인 실측: `NEXT_PUBLIC_PI_SANDBOX:"false"` — 그러나 **실기기 Pi Browser의 네트워크는 sandbox 플래그가 아니라 Developer Portal 앱 등록 스코프가 결정**한다(플래그는 데스크톱 브라우저 Pi Sandbox 라우팅용). 그래서 "메인넷 확정(7/2)" 이후에도 실제 결제는 테스트넷으로 성사돼 왔음(7/2~7/3 성공 건 전부 `Pi Testnet`).
- 촉발: 7/3~7/11 사이 **Portal에서 운영 앱 스코프가 메인넷으로 전환**(등재 신청 준비와 시기 일치 추정) → 전 사용자 uid 재발급. 증거: 마스터 계정(7/2 테스트넷 시절 생성)의 pi_uid가 7/1 메인넷 시절 uid(3c1484c4)로 재바인딩(mod 7/11 10:09). **로그인은 pi_username 재바인딩 폴백(sql/162)이 자가치유**해 멀쩡했고, 결제만 조용히 깨짐.
- 사고 흐름: 클라 **메인넷 결제 생성** → 서버 **테스트넷 키**로 approve → Pi API 404 → 승인 불발 → 결제창 타임아웃.

### 해결 (마스터 조치 — Portal·시크릿은 마스터 전용)
1. Pi Developer Portal **메인넷 앱**의 `PI_API_KEY` + 메인넷 앱 지갑 `PI_WALLET_PRIVATE_SEED`(A2U 서명용 — 환불·팁·후기보상·캠페인 전부 이 시드) 확보.
2. Vercel `cafe` 프로젝트 production env 2종 교체 → **재배포** (server env도 배포 단위 반영).
3. 실기기 검증: 로그인 → 소액 결제 → approve/complete → 텔레그램 알림.
4. ⚠️ 메인넷 = 실돈. **테스트넷 시절 금전 데이터(pi_pymnt·bean_txn 등) 초기화**는 기존 잔여 과제(컷오버 직전 초기화 필수) — 이번 전환과 함께 결정 필요.
- (대안) 포털 전환이 의도가 아니었다면 앱을 테스트넷으로 원복해도 복구되나, 운영=메인넷 확정 정책(2026-06-30)과 상충.

### 재발방지 (철칙)
1. **Portal 앱 스코프 변경 = 세트 작업**: 앱 네트워크 전환 시 `PI_API_KEY`·`PI_WALLET_PRIVATE_SEED` 동시 로테이트 + 재배포 + 실기기 결제 검증까지가 한 단위. (uid 재발급은 재바인딩이 자가치유하지만 **API 키는 자가치유 불가**.)
2. **`NEXT_PUBLIC_PI_SANDBOX`≠실기기 네트워크**: 실기기 Pi Browser의 Testnet/Mainnet은 Portal 등록이 결정. 번들 플래그만 보고 네트워크를 단정하지 말 것.
3. **진단 공식**: "로그인 O·결제 approve 404" = 십중팔구 키↔앱 스코프 불일치. 완결 결제 ID approve 재호출 프로브로 서버 키의 `network`를 실측하라(읽기 API 불요).
4. approve/complete의 Pi API 실패는 현재 클라이언트 응답에만 담김 — 서버 로그(console.error)에도 남기는 관측성 개선 권장.
5. ⚠️ **프로브 부작용 주의**: Pi approve API는 이미 완결된 결제에도 200+결제객체를 반환하며, 이때 approve 라우트가 `pi_pymnt`를 `status:'approved'`로 **upsert해 completed를 되돌린다**(2026-07-11 진단 중 실제 발생 — 7/3 완결 2행 격하 → 당일 원복 완료). 프로브 후 반드시 대상 행 status 재확인. 근본책: approve upsert를 `status='completed'가 아닐 때만` 갱신하도록 가드 권장.

### ✅ 최종 해결 확정 (2026-07-11 마스터 실기기 검증)
- 마스터가 Portal **메인넷 앱** `PI_API_KEY` 확보 → Vercel production env 교체 → 리디플로이(Vercel API, `cafe-wrtrfozrd` READY 18:08 KST).
- 반영 검증: 교체 전 프로브=테스트넷 결제 조회 성공(`Pi Testnet`) → 교체 후 동일 프로브=`payment_not_found` 404(새 키는 다른 앱 스코프 — 의도된 정상 신호).
- **메인넷 첫 실결제 성공**: `rR0TAqLy…` 2.2 Pi 카트 결제 completed+txid (18:06 KST). **`PI_API_KEY` 교체만으로 복구** — `PI_WALLET_PRIVATE_SEED`는 U2A와 무관(A2U 서명 전용)이라 유지. 시드 요건="메인넷 앱 등록 지갑과 동일 키페어"(Pi 지갑 키페어는 양 네트워크 공용) — 첫 환불/보상 A2U 시 실검증 필요.
- 🎉 **메인넷 등재 신청 완료** (마스터, 2026-07-11).
- 잔여: ①테스트넷 시절 금전 데이터(pi_pymnt·bean_txn) 초기화 결정(컷오버 정책) ②A2U(환불·팁·보상) 메인넷 첫 실행 검증 ③approve upsert 격하 가드 코드 반영.

---

## [2026-07-10] ⚡ 함수 리전 튜닝 — 미국(iad1)↔서울 DB 태평양 왕복 제거 (전 페이지 6~13배)

### 증상
- 운영 전 페이지가 **웜 상태에서도 TTFB 1.2~1.8초**, 캐시 상시 MISS. 로컬/회선 문제가 아닌지 마스터 문제 제기.
- 내부 계측(sys_metric_req_perf): auth avg 280ms·카트 avg 1.5s·결제 complete avg 6.2s — 전부 "순차 DB 왕복 수 × ~180ms" 패턴.

### 근본 원인
- **`vercel.json`에 `regions` 미설정** → 함수가 기본 리전 **iad1(미국 동부)** 에서 실행. Supabase는 서울(ap-northeast-2).
- 모든 SSR/API가 쿼리마다 태평양 왕복(RTT ~180ms) — 쿼리 5~8회 페이지는 그것만 1~1.5초. **그간의 코드 튜닝(trgm·병렬화·캐싱) 효과가 RTT에 파묻혀 체감 불가였던 이유.**

### 해결
- `vercel.json`에 `"regions": ["icn1"]` 한 줄 — 함수를 DB 옆(서울)으로. staging 검증 후 promote (2026-07-10).

### 📊 체감 수치 비교 (운영 실측 — 웜 TTFB)

| 페이지 | before (iad1) | after (icn1) | 개선 |
|---|---|---|---|
| 홈 | 1,462ms | **224ms** | 6.5× |
| 카페 목록 | 1,177ms | **198ms** | 5.9× |
| 상점 | 1,663ms | **176ms** | 9.4× |
| 게시판 | 1,814ms | **171ms** | 10.6× |
| **맵(SSR)** | 2,445ms | **178ms** | **13.7×** |

- 콜드도 3.0~3.8s → 0.4~1.2s. API(인증·결제·카트)의 DB 왕복분도 동일 비율 개선(내부 계측으로 추적).
- 판별법 정본: `x-vercel-id` 헤더 = `<엣지PoP>::<함수리전>::<id>` — **두 번째 세그먼트가 함수 실행 리전** (첫 세그먼트만 보고 오판 주의).

### 재발 방지
- 신규 Vercel 프로젝트 생성 시(팩토리 졸업 등) **regions 설정을 SOP에 포함** — 기본값은 항상 iad1임을 기억.
- MAP 잔여 체감(GPS 측위 1~5s 직렬 체인)은 **P1 완료(2026-07-11)**: 마지막 위치 7일 캐시 선표시(lbs_last_pos)+동의 낙관 캐시(서버 정본·API 403 재검증 유지)+GPS 도착 시 30m 게이트 보정+재조회 중 지도 언마운트 제거. 재진입 체감 = GPS 대기 0초(당근 패턴).

---

## [2026-07-10] 🐛 증분 번역 파이프라인 mv.json 이중 중첩 → 3연속 빌드 실패 (promote 무효 사고)

### 증상
- staging 빌드가 아침부터 전량 ERROR. **당일 promote 2회도 운영 빌드가 같은 이유로 실패** — "승격 완료" 로그와 달리 운영은 직전 성공 배포를 계속 서빙(무중단이라 장애는 없었으나 신규 반영 누락).

### 근본 원인
- 증분 번역 확산 시 mv(Dhivehi) 그룹에서 json 병합이 `adminAnalytics.adminAnalytics.export.*` **이중 중첩 키**를 생성 → `validate-locales`가 "ko에 없는 키 초과"로 빌드 차단(가드는 정상 작동).
- DB(i18n_message)는 staging·운영 모두 오염 0건 — **json 생성 단계 한정 버그** (파이프라인 병합 로직 후속 조사 필요).

### 해결·재발 방지
1. mv.json 중첩 블록 정위치 병합(9a2fa6e6) → 빌드 복구.
2. ⭐**promote는 "빌드 READY 확인"까지가 한 단위** — 승격 스크립트 성공 ≠ 배포 성공. Vercel API(`v6/deployments`)로 최신 배포 state 확인을 promote 후속 절차로 명문화.
3. 증분 파이프라인의 "+N행" 로그가 뜬 언어는 확산 후 validate:locales 즉시 실행으로 조기 검출.

---

## [2026-06-15] Vercel Hobby 플랜 — Cron Job 주기 제약

### 증상

`vercel.json`의 cron 표현식을 `*/5 * * * *`(5분마다)로 설정 후 배포 시 아래 오류 발생:

```
Hobby accounts are limited to daily cron jobs.
This cron expression (*/5 * * * *) would run more than once per day.
Upgrade to the Pro plan to unlock all Cron Jobs features on Vercel.
```

배포 자체가 차단되며 Vercel 대시보드에 FAILED 로그도 남지 않아 조용히 누락됨.

### 원인

Vercel Hobby 플랜은 **하루 1회 이하** 실행되는 cron만 허용.

| 표현식 | 실행 빈도 | Hobby 허용 |
|---|---|---|
| `0 0 * * *` | 매일 자정 1회 | ✅ |
| `0 8 * * *` | 매일 오전 8시 1회 | ✅ |
| `0 * * * *` | 매시간 (하루 24회) | ❌ |
| `*/30 * * * *` | 30분마다 (하루 48회) | ❌ |
| `*/10 * * * *` | 10분마다 (하루 144회) | ❌ |
| `*/5 * * * *` | 5분마다 (하루 288회) | ❌ |

### 해결책

**현재 적용**: `0 0 * * *` (매일 KST 09:00 = UTC 00:00) — Hobby 플랜 유지.

**Pro 업그레이드 시**: $20/월로 임의 주기 cron 사용 가능. `*/5 * * * *` 등 고빈도 재평가 가능.

### 영향 범위

- `vercel.json` → `/api/cron/event-reeval` 경로의 이벤트 미션 재평가
- 미션 재평가가 하루 1회로 제한됨 — 실시간 `recordUserAction()` 트리거는 정상 동작

### 재발 방지

- `vercel.json`의 cron 표현식 변경 시 **반드시 Hobby 제약 확인 후 커밋**
- Pro 업그레이드 전까지는 `0 H * * *` (하루 1회) 형식만 사용

---

## [2026-06-15] Vercel GitHub Integration Webhook 누락

### 증상

GitHub `master` 브랜치에 push 완료(`git push origin master`)했으나 Vercel에 자동 배포가 트리거되지 않음.
Vercel 배포 목록에 새 배포 항목 자체가 나타나지 않음 (FAILED 로그도 없음).

### 원인 (추정)

위의 Hobby cron 제약으로 인한 배포 실패가 반복되면서 Vercel GitHub App webhook이 비활성화된 것으로 추정.
또는 GitHub App 토큰 만료, Repository 권한 변경 등으로 webhook 단절 가능.

### 해결책

Vercel CLI로 수동 배포:
```bash
vercel deploy --prod --yes
```

또는 Vercel 대시보드 → `loginpi` 프로젝트 → 최신 배포 → **Redeploy** 클릭.

### 근본 해결

Vercel 대시보드 → Settings → Git → **Disconnect and reconnect** 으로 GitHub Integration 재연결.

---

## [2026-06-16] PyVoice™ TURN 서버 운영 설정

### 증상 (미설정 시)

`TURN_HOST` / `TURN_SECRET` 미설정 상태에서 모바일(특히 Pi Browser) 음성채널 입장 시 상대방 소리가 들리지 않음.
WebRTC 연결 상태가 `connected`가 아닌 `failed`로 전환되며 화면에 "NAT 통과 불가" 오류 메시지 표시.

### 원인

모바일 LTE/5G 환경은 CGNAT(대칭 NAT)을 사용하므로 STUN만으로 P2P 직결이 불가능하다.
TURN 릴레이 서버 없이는 양쪽 피어 중 한 곳이라도 대칭 NAT 뒤에 있으면 ICE 협상이 실패한다.

현재 코드는 폴백으로 `openrelay.metered.ca`(무료 공개 TURN)을 사용하나, 이는 **개발·검증 전용**이며
대역폭·신뢰성 무보장 + 연결 거부 가능성이 있어 운영에 부적합하다.

### 코드 구현 상태 (2026-06-16 완료)

| 항목 | 파일 | 상태 |
|---|---|---|
| TURN 자격증명 API (HMAC-SHA256 TTL) | `src/app/api/voice/turn-credentials/route.ts` | ✅ |
| 클라이언트 훅 — 입장 시 자격증명 fetch | `src/hooks/use-voice-channel.ts` (line 221~240) | ✅ |
| env 스키마 등록 | `src/env.ts` (TURN_HOST, TURN_SECRET, TURN_CREDENTIAL_TTL) | ✅ |
| env 문서화 | `.env.example` (line 44~47) | ✅ |
| RemoteAudio display:none 무음 우회 | `src/components/chat/voice-channel-panel.tsx` (line 64~71) | ✅ |
| RemoteAudio autoplay 정책 우회 | 동 파일 (line 44~53, 터치 제스처 폴백) | ✅ |

### 해결책 — 전용 TURN 서버 연결

#### Option A: Cloudflare Realtime TURN (★ 운영 권장, 2026-06-22 채택)

무료 1TB/월 + Cloudflare 글로벌 인프라(신뢰성·지연 최상). 자격증명은 **API 발급 방식**이라
서버가 Cloudflare API를 호출해 TTL 짧은 username/credential을 발급받아 클라이언트에 중계한다.

1. [Cloudflare 대시보드](https://dash.cloudflare.com/) → **Realtime** → **TURN** 앱 생성
2. 발급된 **Turn Token ID**(Key ID) + **API Token** 복사
3. 환경변수 설정:

```bash
vercel env add CLOUDFLARE_TURN_TOKEN_ID production   # → Turn Token ID(Key ID)
vercel env add CLOUDFLARE_TURN_API_TOKEN production   # → API Token (서버 전용 비밀)
vercel env add TURN_CREDENTIAL_TTL production          # → 3600 (1시간, 선택)
```

서버 호출: `POST https://rtc.live.cloudflare.com/v1/turn/keys/{ID}/credentials/generate-ice-servers`
→ 응답의 `iceServers` 배열(자체 STUN 포함)을 그대로 클라이언트에 전달(코드 `turn-credentials/route.ts` 1순위 경로).
**API 호출 실패 시** 로그를 남기고 아래 HMAC/공개 TURN으로 우아하게 폴백(통화 가용성 우선).

#### Option B: Metered.ca 관리형 서비스 (HMAC 호환, 코드 무수정)

1. [https://www.metered.ca/](https://www.metered.ca/) 가입 → TURN 앱 생성
2. 대시보드 → **TURN Credentials** → **Time-Limited Credentials** 활성화
3. `TURN Secret` 복사, `TURN Host`는 `global.relay.metered.ca` 사용

```bash
# Vercel 환경변수 설정
vercel env add TURN_HOST production   # → global.relay.metered.ca
vercel env add TURN_SECRET production # → Metered 대시보드의 TURN Secret
vercel env add TURN_CREDENTIAL_TTL production  # → 3600 (1시간)
```

HMAC 검증 패턴: `username = expiry:userId`, `credential = HMAC-SHA256(TURN_SECRET, username)`
→ Metered Time-Limited Credentials와 동일한 포맷이므로 코드 수정 없이 연동.

#### Option C: 자체 coturn (HMAC 호환, 트래픽 무제한·완전 자체 통제)

```bash
# Ubuntu 22.04 + coturn 설치
sudo apt install coturn

# /etc/turnserver.conf 핵심 설정
listening-port=3478
tls-listening-port=443
cert=/etc/letsencrypt/live/turn.example.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.example.com/privkey.pem
use-auth-secret
static-auth-secret=YOUR_RANDOM_SECRET_HERE
realm=turn.example.com
total-quota=100
max-bps=1000000
```

```bash
# Vercel 환경변수 설정 (자체 서버)
vercel env add TURN_HOST production   # → turn.example.com
vercel env add TURN_SECRET production # → YOUR_RANDOM_SECRET_HERE
```

#### 검증 방법

1. Vercel 배포 후 Pi Browser (모바일 LTE)에서 음성채널 입장
2. `/api/voice/turn-credentials` 응답 확인 → `ttlSec: 3600` (0이면 폴백 상태)
3. WebRTC Stats (`chrome://webrtc-internals`) → candidate-pair 타입이 `relay`이면 TURN 경유 정상
4. 상대방 소리 확인 (모바일 ↔ 데스크톱 양방향)

### 영향 범위 (자격증명 발급 우선순위)

`turn-credentials/route.ts`는 아래 순서로 자격증명을 발급한다 (상위 미설정/실패 시 다음으로):

1. **Cloudflare** (`CLOUDFLARE_TURN_TOKEN_ID` + `CLOUDFLARE_TURN_API_TOKEN`): Cloudflare API 발급 자격증명 — 운영 권장
2. **HMAC** (`TURN_HOST` + `TURN_SECRET`): HMAC-SHA256 임시 자격증명 (자체 coturn·Metered)
3. **공개 TURN 폴백** (아무것도 미설정): Metered Open Relay — 개발·검증용, `ttlSec: 0`

- Cloudflare API 호출 실패(인증·쿼터·타임아웃) 시 **서버 로그를 남기고** 2~3순위로 폴백 (통화 가용성 우선)
- `TURN_CREDENTIAL_TTL`: 기본 3600초, Cloudflare·HMAC 공통 적용. 운영 보안 강화 시 300~600으로 단축 권장

---

## [2026-06-26] 일반 브라우저 헤더-본문 세션 불일치 (Google 세션 동기화 누락)

### 증상
일반 브라우저(PC/모바일)에서 Google 로그인 후 헤더는 Google 사용자명을 표시했으나, 본문(페이지 콘텐츠)은 "로그인 필요" 상태 표시. 헤더와 본문이 다른 세션 상태를 보여 UX 혼란 발생.

### 원인
- 헤더 컴포넌트는 NextAuth `useSession()`으로 Google 세션을 정상 인식
- 본문 일부 컴포넌트는 `usePiAuth()` 훅을 사용 → `usePiAuth`는 내부적으로 `/api/auth/pi GET`을 호출해 Pi 세션 상태를 가져옴
- `/api/auth/pi GET`이 `pi_session` 쿠키만 확인하고 Google 세션(NextAuth JWT)을 무시 → `usePiAuth().user`가 null 반환

### 해결 (커밋 961660e)
`/api/auth/pi GET`에 `getSessionUser()` 폴백 추가 — Pi 쿠키/헤더 확인 후 없으면 Google 세션도 인식하도록 수정. `usePiAuth`가 Google 사용자도 정상 반환.

### 확정 원칙
| 환경 | 인증 수단 | 헤더 · 본문 세션 |
|---|---|---|
| PC/모바일 일반 브라우저 | Google OAuth (NextAuth) | 항상 Google 세션으로 동기화 |
| Pi Browser | Pi Token (localStorage) | 항상 Pi 세션으로 동기화 |

- 두 환경에서 헤더와 본문은 **동일한 단일 세션**만 사용해야 한다. 혼용 절대 금지.
- `usePiAuth`는 Pi Browser 전용이 아님 — `getSessionUser()` 기반이므로 Pi 세션과 Google 세션 모두 처리.

---

## [2026-06-26] Pi+Google 계정 통합 시 1인 2계정 발생 — 중복 계정 비활성화 정책

### 증상
사용자가 PC에서 Google 로그인 → Pi Browser에서 Pi 로그인 → 연동(link-complete) 완료 후에도 `sys_user`에 두 행 존재. Google-only 고아 행이 남아 `updatePiUserWithGoogle()` 호출 시 `google_id UNIQUE` 충돌 발생.

### 원인 패턴
1. Google 로그인 시 `upsertGoogleUser()`로 Google-only 행(pi_uid=NULL) 생성
2. Pi Browser에서 Pi 로그인 시 별개 행 생성(google_email=NULL)
3. 연동 시 Pi 행의 `google_id`를 Google-only 행의 값으로 UPDATE 시도 → UNIQUE 충돌
4. 연동 성공해도 Google-only 고아 행이 `del_yn='N'`으로 잔존 → 이중 세션 혼란

### 해결 (2026-06-26 적용)
1. **`sql/127_sys_user_del_yn.sql`**: `sys_user`에 `del_yn CHAR(1) DEFAULT 'N'`, `del_dtm TIMESTAMPTZ` 추가
2. **`sql/128_one_account_policy.sql`**: 기존 중복 행 일괄 정리 — google_id NULL 초기화 후 `del_yn='Y'`
3. **`src/lib/users.ts updatePiUserWithGoogle()`**: 연동 전 Google-only 고아 행의 `google_id=NULL` + `del_yn='Y'` 원자 처리 (UNIQUE 충돌 방지)
4. **`src/auth.ts`**: 신규 Google-only 행 생성 중단 — `upsertGoogleUser()` 제거, 기존 Pi 행 없으면 `token.userId=null, hasPiAccount=false`
5. **`src/lib/auth-check.ts`**: `getSessionUser()`에서 `pi_uid IS NULL`인 Google 사용자 차단 → `return null`

### 확정 정책 (1인 1계정 원칙)
- **유일한 활성 계정 조건**: `pi_username IS NOT NULL` AND `google_email IS NOT NULL`이 **같은 행에** 공존
- `del_yn='Y'` 계정은 모든 화면·모든 세션에서 접근 불가 (getSessionUser null 반환)
- Link 페이지는 `useSession()` 클라이언트 훅 직접 사용 → `getSessionUser()` 차단과 무관하게 연동 플로우 정상 동작

### 주의: UNIQUE 제약 & soft-delete 순서
`del_yn='Y'`만으로는 Postgres UNIQUE 제약이 해제되지 않음. 반드시 아래 순서 준수:
```sql
-- 1단계: UNIQUE 값 해제
UPDATE sys_user SET google_id = NULL WHERE ...;
-- 2단계: 논리 삭제
UPDATE sys_user SET del_yn = 'Y', del_dtm = NOW() WHERE ...;
```

---

## [2026-06-26] 헤더 UI — 브라우저 환경별 로그인 전/후 표시 정책 확정

### 증상
일반 브라우저(PC/모바일)에서 로그인 전 "Google 로그인" 버튼이 표시되지 않거나, Pi Browser에서 Google 로그인 관련 UI가 혼재되어 사용자 혼란 발생.

### 원인
환경별 헤더 UI 정책이 명시되지 않아 Google 로그인 버튼 표시 조건이 불명확했음.

### 확정 정책

| 환경 | 로그인 전 | 로그인 후 |
|---|---|---|
| PC/모바일 일반 브라우저 | **Google 로그인 버튼** | **Google 사용자명** |
| Pi Browser | **로고 + Pi 로그인 버튼** | **로고 + 별명 (nick\_nm)** |

### 구현 (커밋 961660e)
- `components/google-login-button.tsx`: `isPiBrowser()` 판정으로 Pi Browser에서 컴포넌트 숨김(`return null`)
- Pi Browser 진입점 판별: `window.Pi !== undefined` 또는 `User-Agent` 기반

### 재발방지
- 신규 헤더 UI 요소 추가 시 반드시 Pi Browser/일반 브라우저 분기 고려
- Pi Browser에서는 Pi SDK(`window.Pi`) 외 OAuth 버튼 노출 금지
- 헤더 세션 상태와 본문 세션 상태는 항상 같은 소스를 바라봐야 함 — 이 원칙 위반이 이번 이슈의 근본 원인

---

## [2026-07-02] Pi Browser 재동의·계정 무한 재생성 — `NEXT_PUBLIC_PI_SANDBOX` 전환 사고 ⭐

> 핵심가치(Pi Browser 로그인) 직결 사고. 관련 메모리: `pi-sandbox-flag-uid-rebinding`.

### 증상
- 이미 가입된 계정(anakin2)인데 **Pi Browser로 접근하면 이용동의(약관·개인정보·위치)를 다시 요구**.
- **일반 브라우저(Google 세션)에서는 정상** — 재동의 안 뜸.
- 계정을 지워도 로그인할 때마다 **또 새 계정이 생성**됨("자꾸 다시 생김").

### 원인 (근본)
Pi의 uid는 **(앱, Testnet/Mainnet 환경) 쌍마다 다른 scoped 값**이다. `detectSandbox()`(`pi-auth-provider.tsx`)는 localhost를 제외하면 **오직 `NEXT_PUBLIC_PI_SANDBOX==='true'`** 로 sandbox를 판정하는데, 이 값이 배포 사이에 흔들리자 anakin2의 pi_uid가 `3c1484c4`(7/1)→`6789d9c1`(7/2)로 재발급됐다. `upsertPiUser`는 `onConflict:'pi_uid'`라 **uid가 다르면 무조건 신규 `sys_user` row 생성** → 그 계정은 consent 0 → 재동의. consent는 `sys_user_consent.user_str_id = sys_user.id` 기준이라 정본(consent 4/4)과 완전히 분리된다.

### 왜 일반 브라우저만 정상이었나
`getSessionUser`의 Google 경로는 `userId → google_id → google_email(불변키)` **3단 폴백**으로 정본을 복원한다. 반면 Pi 경로는 `userId`(=`sys_user.id`, 가변키)로만 조회하고 `pi_uid` 폴백이 `else if`라 **작동하지 않는다**(구조적 비대칭). 그래서 일반 브라우저만 정본을 찾았다.

### 해결 (2026-07-02)
- **근본 해결 = `NEXT_PUBLIC_PI_SANDBOX`를 환경마다 하나의 값으로 고정 + 재배포.** 계정 삭제·재테스트로는 절대 안 멈춘다(다음 로그인에 또 다른 uid).
- 운영 방향 확정 = **메인넷(`false`)** — 운영 DB 클린 초기화(`334e52d` 단일 TRUNCATE)와 함께 컷오버.
- 결과: **결제 → 텔레그램 알림 → 딥링크로 Pi Browser 복귀 → 조치까지 전 흐름 실기기 성공 검증.**

### SANDBOX_FLAG (`NEXT_PUBLIC_PI_SANDBOX`) 정의 — 환경별 고정값

| 값 | Pi 환경 | 로그인 uid | 결제 |
|---|---|---|---|
| `true` | Pi Testnet(샌드박스) | 테스트넷 scoped | 테스트 Pi(가짜) |
| `false` / 미설정 | Pi Mainnet | 메인넷 scoped | 실제 Pi |
| (localhost) | 항상 Testnet (코드가 hostname으로 강제) | — | — |

| 환경 | 값 | 비고 |
|---|---|---|
| 로컬(dev) | 자동 `true` | 설정 불필요(hostname 강제) |
| **staging** | **`true`** | Testnet — 실제 돈 없이 검증 |
| **운영(cafepi)** | **`false`** | Mainnet 확정(2026-07-02) |

### 재발방지 (철칙)
1. **환경 내 플래그 고정** — 바꾸면 전 사용자 uid 재발급 → systemic 재동의·계정 분리(anakin2뿐 아니라 전원).
2. **변경 시 재배포 필수** — `NEXT_PUBLIC_*`는 빌드 인라인이라 env만 바꾸면 미반영.
3. **메인넷 전환은 세트 작업** — 클린 초기화 + 계정 마이그레이션 계획과 동반.
4. **삭제로 해결 불가** — 원인이 플래그면 계정을 지워도 재생성된다. 먼저 플래그를 고정하라.
5. (개선 권장) `getSessionUser` Pi 경로에 `pi_uid`(불변키) 순차 폴백 추가 — Google email 폴백과 대칭화(재적재 orphan 견고성). 단 이번 uid 변경 자체는 폴백으로 못 고침.

### ⛔ 절대 금지 (동반 확정 원칙)
- **실 환경(운영·staging)에 테스트/더미 사용자·거래를 생성하지 말 것.** Pi Network에서 **가짜 인간(다중·허위 계정)으로 대신 테스트하면 KYC·1인1계정 위반 → Pi 계정 영구제명** 위험(2026-07-02 마스터 "매우 매우 위험" 재강조). 검증은 실사용자 행위로만. 메모리 `no-test-dummy-data-in-real-env` 참조.

---

## [2026-07-02] pi_uid 재발급 근본수정 — username 재바인딩·재가입 부활·pi_username UNIQUE ⭐

> 위 `NEXT_PUBLIC_PI_SANDBOX` 사고의 **영구 해결편**. "플래그를 고정하라"(운영 수칙)만으로는
> 부족했다 — 메인넷 전환·포털 앱 변경 등 **uid 재발급은 앞으로도 반드시 또 온다**.
> 코드가 uid 재발급을 견디도록 구조를 바꿨다. 커밋 `95c2fd1` + `sql/161~163`.

### 증상 (한 원인의 3연쇄 — 같은 뿌리)
1. **계정 중복 재생성**: anakin2 원본(`ad41d0a7…`)이 있는데 로그인마다 새 행(`bdc3e9c2…`) 생성 + 약관 재동의.
2. **소유 매장 미표시**: DB엔 매장(`7b40372c…`)의 `seller_id=원본`인데 화면엔 0건 — `listMyShops(세션 user.id)`가 **중복 행 id**로 조회하기 때문. 데이터 손상이 아니라 세션이 다른 계정.
3. **헤더/본문 세션 불일치**(Pi Browser): 헤더는 anakin2 표시, 본문·푸터는 미인지 — 헤더=**Pi SDK `authenticate()` 클라이언트 결과**(서버 DB 무관), 본문=**서버 세션**(`POST /api/auth/pi` → `getSessionUser`). 서버 세션 발급이 실패하면 정확히 이 모양으로 갈라진다.

### 원인 (구조)
- Pi uid = **(포털 앱 등록 × Testnet/Mainnet) scoped 값**. sandbox 플립·메인넷 전환·포털 앱/도메인 변경 시 **전 사용자 uid 재발급**.
- `upsertPiUser`가 `onConflict:'pi_uid'` — "uid는 불변"이라는 암묵 가정 위에서, 처음 보는 uid는 무조건 신규 INSERT → 계정 분열(매장·Bean·결제·동의 전부 원본에 남고 세션만 새 계정).
- **오해 주의**: `PI_WALLET_PRIVATE_SEED`·`PI_API_KEY`는 로그인과 무관 (검증은 `/v2/me`에 사용자 토큰 Bearer만, 시드는 A2U 서명 전용). uid를 바꾸는 것은 오직 클라이언트 앱 스코프.

### 해결 (2026-07-02, 커밋 `95c2fd1`)
1. **username 재바인딩 폴백** (`users.ts`): 처음 보는 uid + 동일 `pi_username` 활성 계정 존재 → 신규 INSERT 대신 **그 행의 pi_uid를 UPDATE**. `pi_username`은 Pi 전역 유일 + `/v2/me` 검증값 = 사람의 불변 키. (Google `google_email` 폴백 45d02aa와 대칭 완성)
2. **재가입 부활 정책** (마스터 확정): 동일 username의 논리삭제 행 → 새 행 생성 금지, `del_yn` 해제 + `rejoin_dtm`(삭제 이전 기록 숨김 컷오프) + 동의 이력 논리삭제(재동의 유도). 부활은 `del_rsn_cd` WDRW·SYS_DUP만 — **ADMIN_BLCK(관리자 차단)·NULL은 부활 불가 + 로그인 거부**(차단 우회 방지).
3. **pi_username 활성 행 부분 UNIQUE 인덱스** (`sql/162`, `where del_yn='N'`): 중복 계정은 이제 조용히 생기는 대신 **즉시 에러**(fail-loud). 논리삭제 행은 제외라 del_yn 원칙과 공존.
4. **운영 중복 정리** (`sql/161`): 중복 행 논리삭제 + `pi_uid='DEL:'||pi_uid` 치환(UNIQUE 점유 해제 — 원본 재바인딩 선행 조건).

### ⛔ 적용 순서 (역순 금지)
**코드 배포 → sql/163(컬럼) → sql/161(정리) → sql/162(인덱스)**
— 인덱스를 코드보다 먼저 만들면 구코드의 신규 INSERT가 UNIQUE 충돌 → `POST /api/auth/pi` 500 → "헤더만 로그인" 증상이 오히려 전면화된다.

### 재발방지 (철칙)
1. **`pi_uid`를 사람의 영구 식별자로 쓰지 말 것** — 불변 키는 `pi_username`. 신규 인증·계정 로직의 사용자 매칭은 반드시 `uid → username` 순 폴백.
2. **계정 중복 발견 시 자산 쪽(seller_id 등)을 고치지 말 것** — 중복 계정을 정본으로 굳히는 대증요법 금지. 세션을 원본 계정으로 되돌리는 것(재바인딩+중복 정리)이 정답.
3. **"헤더 O / 본문 X" 진단 공식**: 헤더=클라이언트(SDK) / 본문=서버 세션. 갈라지면 무조건 `POST /api/auth/pi`(서버 세션 발급) 로그부터 확인.
4. **pi_username 유일성은 DB가 강제** — UNIQUE 위반 에러가 나면 인덱스를 지우지 말고 코드를 고칠 것.
5. 검증 신호: 재로그인 시 Vercel 로그 `[auth] pi_uid 재바인딩: @유저명 구uid → 신uid` 1줄 = 정상 동작.

---

## [2026-07-03] 운영 텔레그램 콜백 유실 — 환경별 봇 webhook 미등록 (자가치유 도입) ⭐

### 증상
- **스테이징(loginpi)**: 텔레그램 알림 발송 + 콜백(인용답장 릴레이·`/start` 연동) 모두 매끄러움.
- **운영(cafepi)**: 알림 **발송은 정상**인데 콜백만 매끄럽지 않음 — 답장이 앱으로 안 돌아오고 연동 확인이 늦거나 무응답.

### 원인 (실측으로 확정)
- 두 환경은 **서로 다른 봇** 사용: 스테이징=`cafe_pi_not_bot`, 운영=`cafe_pi_areal_bot` (각 배포 `/ko/support` 페이지 t.me 링크로 실측).
- 텔레그램 봇은 **토큰당 webhook URL이 전 세계에 단 1개**. 스테이징 봇은 `https://loginpi.vercel.app/api/telegram/webhook` 등록 완료(getWebhookInfo 실측), 운영 봇은 수동 setWebhook 절차(PRD_13 §11-4)가 누락/오등록.
- 발신(sendMessage)은 webhook과 무관해서 정상 → **"알림은 오는데 콜백만 죽는" 비대칭**이 특징적 지문.
- 배제된 용의자: 운영 env는 정상이었다 — `NEXT_PUBLIC_PI_APP_DOMAIN=cafe7092.pinet.com`·`NEXT_PUBLIC_APP_URL=cafepi.vercel.app` 모두 배포 번들 인라인 값으로 실측 확인(딥링크 브리지 무결).

### 해결 (근본수정 — 수동 절차 폐지)
1. **`src/lib/telegram-webhook.ts`**: `ensureTelegramWebhook()` — `getWebhookInfo`로 현재 URL을 기대값(`NEXT_PUBLIC_APP_URL + /api/telegram/webhook`)과 대조, 어긋나면 `setWebhook`(url+secret_token, PRD_13 §11-4 동일 형식) 자동 재등록. 성공 결과만 10분 스로틀 캐시(실패는 즉시 재시도).
2. **cron `chat-noti`(1분 주기)에 훅 연결**: 배포 후 최대 1분 내 자동 복구. 발송 로직과 분리되어 실패해도 알림 발송엔 영향 없음.
3. **`/api/admin/telegram/webhook`**: GET=진단(봇 username·등록 URL·기대 URL·pending·최근 오류), POST=강제 재등록(시크릿 로테이트용).

### 재발방지 (철칙)
1. **환경별 봇 분리 유지** — 봇 토큰을 두 환경이 공유하면 자가치유끼리 webhook을 뺏는 플립플롭 발생. 신규 환경 추가 시 반드시 새 봇 + env 3종(`TELEGRAM_BOT_TOKEN`·`TELEGRAM_BOT_USERNAME`·`TELEGRAM_WEBHOOK_SECRET`) 세팅.
2. **"발송 O / 콜백 X" 진단 공식**: 발신=토큰만 필요, 수신=webhook 등록 필요. 비대칭이면 무조건 `getWebhookInfo`부터 확인(관리자 GET 엔드포인트 활용).
3. webhook 수동 등록 절차는 더 이상 필수 아님 — cron 자가치유가 담당. 단 `NEXT_PUBLIC_APP_URL`이 도메인별 정합이어야 함(오설정 시 webhook도 그리로 등록됨).

### [속편 — 같은 날 2차 원인] 딥링크 세션 오리진 불일치 (진짜 "매끄럽지 않음"의 본체)

webhook 자가치유 배포 후에도 증상 지속 → 마스터 실기기 확인으로 2차 원인 확정:
- **증상 정밀화**: 버튼 → Pi Browser는 열리는데 ① 헤더가 Pi Browser 모드(플로팅)로 안 바뀜 ② 본문 세션 미인식(로그인 요구).
- **원인**: 마스터의 운영 세션(localStorage `pi_token`)은 **cafepi.vercel.app** 오리진에 있는데, 운영 `NEXT_PUBLIC_PI_APP_DOMAIN=cafe7092.pinet.com`이라 딥링크가 **다른 오리진**으로 열림. **localStorage는 오리진별 완전 격리** → 무조건 로그아웃 상태. 스테이징이 매끄러운 건 평소 사용 주소=딥링크 주소(apppilogintestbd3106.pinet.com 동일)이기 때문.
- **해결**: 운영 Vercel env `NEXT_PUBLIC_PI_APP_DOMAIN=cafepi.vercel.app`으로 변경(Vercel API PATCH) + 재배포. 코드 변경 없음(딥링크 base 우선순위 설계가 이미 지원). 채팅 알림(base=`NEXT_PUBLIC_APP_URL`)·주문 알림(base=이 env) 두 경로 모두 브리지가 이 env로 `pi://` host를 만들므로 단일 지점 수정으로 해결.
- **주의**: 이미 발송된 텔레그램 메시지의 버튼 URL은 불변(구 URL 고정) — 재배포 이후 **새로 발송된 알림**부터 정상. enqueue 시점에 도장 찍힌 미발송 outbox 행도 구 도메인일 수 있음.

### 재발방지 (철칙 추가)
- **딥링크 도메인 = 세션이 사는 오리진** (pinet 도메인이 정답이 아니라 "사용자가 실제 로그인해 쓰는 오리진"이 정답). `NEXT_PUBLIC_PI_APP_DOMAIN` 변경 전 반드시 "그 도메인에서 로그인 세션이 사는가"를 확인할 것.
- "Pi Browser는 열리는데 로그인만 풀려 있음" 증상 = 십중팔구 오리진 불일치. 주소창 도메인 vs 평소 사용 도메인부터 대조.

### ✅ 최종 해결 확정 (2026-07-03 마스터 실기기 검증)

운영 `NEXT_PUBLIC_PI_APP_DOMAIN=cafepi.vercel.app` 변경 후 **"정상 처리 됨" 확인**. 환경별 정답 값(현행):

| 환경 | 세션 오리진(평소 Pi Browser 사용 주소) | NEXT_PUBLIC_PI_APP_DOMAIN | 봇 | webhook |
|---|---|---|---|---|
| 스테이징(loginpi) | `apppilogintestbd3106.pinet.com` | `apppilogintestbd3106.pinet.com` (현행 유지 — vercel로 바꾸면 역으로 깨짐) | `cafe_pi_not_bot` | `loginpi.vercel.app/api/telegram/webhook` |
| 운영(cafepi) | `cafepi.vercel.app` | `cafepi.vercel.app` (✅ 교정 완료) | `cafe_pi_areal_bot` | `cafepi.vercel.app/api/telegram/webhook` (cron 자가치유) |

- 두 환경의 값 형태가 다른 것(스테이징=pinet / 운영=vercel)은 **의도된 정상 상태** — 각 환경의 실사용 진입 경로가 다르기 때문. "vercel로 통일" 같은 획일화 금지.
- 이미 발송된 텔레그램 메시지의 버튼은 구 URL 고정 — 검증·테스트는 반드시 새로 발송된 알림으로.

---

## [2026-07-07~08] 글로벌 i18n 대확장 — 구조 버그 5종 동시 발견·근본수정 ⭐

157개국 일괄 활성화(활성 locale 189개) 과정에서 잠복해 있던 구조 버그들이 연쇄 발견됨. 각각 독립 사고로 기록.

### ① 국기 이모지 베이스 오계산 (il=🇨🇫 엉뚱한 국기)
- **증상**: il(Israel)이 중앙아프리카공화국 국기(🇨🇫)로, et·ps·sq는 깨진 글자로 표시
- **원인**: `/api/admin/i18n/locale`의 toFlagEmoji가 영역 지시자 베이스를 **U+1F1E0**으로 계산(정상 U+1F1E6). 'IL'→I(+8)·L(+11)이 우연히 유효한 'CF'가 됨 — **유효하지만 틀린 값이 깨진 값보다 위험**
- **해결**: 베이스 0x1F1E6 수정(코드) + 기존 4건 데이터 보정(sql/167)

### ② i18n_cntry_mst FK 사일런트 실패 — 참조 대상이 i18n_locale이 아님
- **증상**: 157개국 활성화 후에도 국가-locale 연결이 전부 null
- **원인**: `fk_i18n_cntry_locale`이 **i18n_lang_mst(언어마스터, 18행뿐)**를 참조 — supabase-js는 예외를 던지지 않아 `{error}` 미확인 업데이트가 조용히 전멸(sql/156에서 FK 복구 시 대상 테이블 상이)
- **해결**: 언어마스터 178행 시드(scripts/i18n-lang-master-seed.mjs — 한글 언어명·원어명·RTL) 후 재연결 187/187
- **재발방지**: supabase-js 업데이트는 반드시 error 체크. FK 정의는 constraint 이름이 아니라 **참조 테이블**을 확인

### ③ 국가코드≠언어코드 — et(에티오피아)가 에스토니아어로 번역돼 있던 레거시
- **원인**: 국가 파생 locale 코드('et')를 언어코드로 오해석(ISO 639에서 et=에스토니아어). 자동번역이 언어명을 코드에서 유추
- **해결**: 국가→실제 주 언어 명시 매핑(`i18n-lang-map.mjs` 단일소스). et는 **암하라어로 재번역**, 기존 에스토니아어 콘텐츠는 신설 ee(에스토니아)가 승계. 유사 함정 전수 처리(br=포르투갈어·tw=번체중국어·am=아르메니아어 등)

### ④ 운영 대량 적재 — 69MB 단일 트랜잭션에서 연결 강제 종료
- **증상**: i18n 4종 pg_dump 복사 중 "server closed the connection unexpectedly" → 이후 일시 무응답
- **원인**: 운영 인스턴스(소형 컴퓨트)가 40만 행 단일 트랜잭션 COPY를 감당 못함(백엔드 사망 추정). --single-transaction이라 롤백돼 무손상
- **해결**: 소형 3테이블 일괄 + i18n_message **5만 행 × 9청크**(청크당 --single-transaction·재시도 3회) — 운영 런타임은 json을 읽으므로 적재 중 서비스 영향 0
- **재발방지**: 운영 대량 적재는 청크 분할이 기본. 실패 시 즉시 상태 검증(롤백 확인) 후 전략 변경

### ⑤ 죽은 키가 만든 "99% 번역률" — 삭제를 빈 값으로 구현한 잔재
- **증상**: 신규 locale 전부 2,230/2,231 = 99%로 표시
- **원인**: c7ce384(2026-06-16)에서 UI 부제 제거 시 키 삭제 대신 **ko 값만 ""로 비움** → 사용처 0인 죽은 키가 통계 분모에 잔존. 동기화 파이프라인에 "삭제 전파" 경로 없음(신규 키 채움만 존재)
- **해결**: ko.json 키 삭제 + 전 locale DB 삭제 + json 재생성. seed 스크립트에 '잉여 키 정리'(ko에 없는 키 삭제) 상시 장착
- **재발방지 (철칙)**: **번역키 폐기는 삭제, 빈 값 금지**. 분자·분모가 다른 정의(파일 vs DB)를 쓰는 통계는 반드시 정의 통일

---

## [2026-07-08] Pi Sign-In(OAuth) 도입 — 실기기 함정 2종 ⭐

일반 브라우저 Pi 로그인(Pi Sign-In, OAuth implicit) 구현 과정에서 실기기로 확인한 함정.

### ① "보안 검증에 실패했습니다" 오탐 — state 저장소가 탭 단위
- **증상**: 정상 인가 완료 후 콜백에서 CSRF state 불일치 오류
- **원인**: state를 sessionStorage에 저장 — **탭 단위 저장소**라 인가 복귀가 새 탭/컨텍스트로 떨어지면 소실. 첫 실패 후 새로고침도 state 소거 상태라 동일 오류 반복
- **해결**: **localStorage + 10분 만료**(오리진 경계 유지 = CSRF 방어력 동일) + 실패 화면 "다시 시도" 버튼(콜백에서 플로우 재시작·state 재발급) (5ae09f5)

### ② Pi의 OAuth 인가 페이지는 Pi Browser 내 접속 미지원
- **증상**: Pi Browser에서 OAuth 버튼 클릭 시 "Signing in from inside Pi Browser isn't supported yet" 안내에서 막힘
- **원인**: OAuth 버튼의 Pi Browser 숨김을 UA(/PiBrowser/)로 게이팅 — **실기기 UA가 패턴과 불일치**해 감지 실패(8bf8752 사고 계열)
- **해결 (철칙 재적용)**: UA를 더 다듬는 대신 **클릭 시점에 SDK signIn() 선시도(3초 상한)** — 성공(=authenticate 성공, 유일 신뢰 신호)이면 그 자리에서 SDK 로그인 완료, 실패 시에만 OAuth 진행하는 자기교정 (5362560)
- **재발방지**: Pi Browser 여부가 UX를 가르는 지점에서는 "감지 후 분기"가 아니라 **"시도 후 폴백"** 패턴을 기본으로

### ③ 콜백 state 오탐 2차 — 재마운트가 1회용 state를 선소거
- **증상**: QR 실승인 성공 후에도 "보안 검증에 실패했습니다"
- **원인**: 콜백 페이지 재마운트(언어 스위처의 선호 locale 자동 전환 네비게이션) 시 첫 실행이 state를 소거 → 두 번째 실행이 부재 판정
- **해결**: state는 peek(비소거) 검증·**세션 발급 성공 후에만 clear** + 1회 실행 가드를 모듈 변수로(재마운트 생존) + 콜백 경로는 locale 자동 전환 제외
- **동반 수정(잠복 버그)**: provider 마운트 세션 복원이 **비로그인이면 isLoading을 영원히 true**로 방치 → OAuth 버튼 disabled 굳음. 복원 완료 시 user 유무 무관 해제

### ④ 사용자 안내 — QR 스캔의 정확한 경로 (마스터 실기기 확인) ⭐
Pi Sign-In QR은 채굴 앱 스캐너·폰 카메라가 아니라 **파이지갑(Pi Wallet)** 으로 스캔한다:
1. 파이지갑 로그인
2. 동그란 **"Pay" 버튼** 클릭
3. **"QR 코드 스캔 및 표시"** 클릭
4. **"스캔" 탭** 클릭
5. PC 화면의 QR 스캔 → 승인
(QR 내용은 `https://accounts.pinet.com/swp-<세션ID>` 일반 URL — 실측 디코드 확인)

**모바일 일반 브라우저는 QR이 아예 없음(실측)** — 인가 페이지가 모바일 UA에서는
"Continue in the Pi Browser" + **[Open Pi Browser]** 딥링크(`pi://redirect.pi/pi-net/<swp URL>`)로
렌더링되어 **같은 폰의 Pi Browser 앱에서 승인** → 원래 브라우저가 상태 폴링으로 자동 진행.
기기 1대 완결 — "같은 폰으로 QR을 어떻게 찍나" 딜레마는 Pi가 기기별 렌더링으로 해결. ✅휴대폰 일반 브라우저 실기기 검증 완료(2026-07-08) — 3종 여정(PC QR·모바일 딥링크·Pi Browser SDK) 전부 통과.
