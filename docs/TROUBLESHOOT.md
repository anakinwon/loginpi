# Troubleshoot — 운영 이슈 기록

> 배포·인프라·서비스 제약으로 인해 발생한 이슈와 해결책을 기록합니다.
> 코드 버그가 아닌 **플랫폼 제약·정책·환경 차이**로 인한 이슈를 여기에 기록합니다.
>
> 본 문서는 두 부분으로 구성됩니다.
> - **A. 성능 리스크 레지스터** (proactive) — 아직 안 터졌지만 동접·거래량 증가 시 예측되는 병목.
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

# B. 운영 이슈 기록 (Operational Issues)

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

## [2026-06-16] PiVoice™ TURN 서버 운영 설정

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

#### Option A: Metered.ca 관리형 서비스 (권장, S0~S1 단계)

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

#### Option B: 자체 coturn (S2 이후, 검증 완료 후 전환)

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

### 영향 범위

- `TURN_HOST` / `TURN_SECRET` 설정 시: HMAC-SHA256 임시 자격증명 발급 (TTL 기본 1시간)
- 미설정 시: Metered Open Relay 폴백 (개발·검증용) — 자동 적용, 코드 변경 불필요
- `TURN_CREDENTIAL_TTL`: 기본 3600초, 운영 보안 강화 시 300~600으로 단축 권장
