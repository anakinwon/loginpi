# PRD_22: 실시간 시스템 모니터링 & 헬스 체크 대시보드

> **버전**: v1.0  
> **작성일**: 2026-06-25  
> **작성자**: 아소카 (시스템 성능 모니터링 에이전트)  
> **배포 URL**: https://cafe.pi/admin/monitor  
> **정본**: `docs/PRD_22_MONITOR.md`  

---

## 1. 개요

### 1.1 목적

cafe.pi는 **2026-06-26 일반 공개**를 앞두고, 실시간 **시스템 헬스·보안 위협·부하 모니터링** 화면이 필수다.

**관리자(아나킨)는 한눈에 다음을 파악할 수 있어야 한다:**
- ✅ 지금 이 순간 API가 정상인가? (응답시간, 에러율)
- ✅ DB가 병목인가? (느린 쿼리, 커넥션 수)
- ✅ 비정상 트래픽이 들어오는가? (DDoS, 폭주 패턴)
- ✅ Pi 결제(핵심 가치)가 작동하는가? (성공률)
- ✅ 지금 몇 명이 동시 접속 중인가? (로그인 중, 채팅 중)

**본 PRD는 `system-performance-monitor` 에이전트의 스펙 소스**로서, 무엇을 측정·계산·시각화할지의 계약서 역할을 한다.

---

### 1.2 범위: 실시간 시스템 vs 비즈니스 분석

| 구분 | 대상 | 예시 | 이 PRD |
|---|---|---|---|
| **실시간 시스템 헬스** | 지금 이 순간 상태 | API p95 응답시간, 4xx/5xx 에러율, DB 커넥션 수 | ✅ **포함** |
| **비즈니스 분석** | 과거 추세 & 누적 | DAU/WAU/MAU, 월간 매출, 주문 분포 | ❌ 제외 (기존 `/admin/stats`, `/admin/analytics`) |

---

## 2. 배경 및 목표

### 2.1 시스템 제약: Vercel Fluid Compute의 한계

cafe.pi는 **Vercel Pro**(서버리스 Fluid Compute) 배포 환경이다. OS 레벨 CPU/메모리 직접 측정이 불가능하므로, **대체 데이터 소스**로 구성한다:

| 소스 | 측정 가능 항목 | 신뢰도 | 지연 |
|---|---|---|---|
| **Vercel Analytics API** | 함수 호출 횟수, 에러율, 응답시간(p50/p95/p99) | 높음 | 1~2분 |
| **Vercel Functions Logs** | 직접 로그(stderr, stdout) | 높음 | 실시간 |
| **Supabase pg_stat_statements** | 느린 쿼리, 실행 시간, Row 수 | 높음 | 1분 |
| **Supabase 커넥션 정보** | 활성 커넥션 수, idle 시간 | 높음 | 실시간 |
| **앱 자체 계측** | 요청 헤더(`X-Request-ID`), 응답 시간, 사용자 행동 | 높음 | 실시간 |

**결론**: Vercel·Supabase 기존 메트릭 + **앱 자체 계측(미들웨어·API 래퍼)**로 모니터링 구성.

---

### 2.2 목표

| 지표 | 목표값 | 근거 |
|---|---|---|
| **API p95 응답시간** | ≤ 800ms | Pi Browser 네트워크 지연 고려 |
| **에러율(4xx/5xx)** | < 1% | 일반적 웹 서비스 기준 |
| **DB 응답시간(p95)** | ≤ 300ms | Supabase 표준 |
| **동시 활성 커넥션** | ≤ 20 | Supabase Free tier 한계 (추후 Pro 전환 검토) |
| **느린 쿼리(>500ms)** | 0건/시간 | 인덱스 최적화 목표 |
| **Pi 결제 성공률** | ≥ 99% | 핵심 가치 직결, 장애 시 즉시 대응 |
| **DDoS/폭주 탐지 임계치** | 분당 req/IP > 100 | 비정상 트래픽 자동 감지 |

---

## 3. 모니터링 영역 상세 정의

### 3.1 시스템 헬스 (System Health)

#### 3.1.1 API 응답시간

**측정 대상**: 전체 API 엔드포인트 (`/api/**`)

**메트릭**:
- **p50**: 중앙값 (50번째 백분위수)
- **p95**: 95% 요청이 이 시간 이내 응답
- **p99**: 99% 요청이 이 시간 이내 응답
- **avg**: 평균값

**데이터 소스**:
- 1차: Vercel Analytics API (`/v1/analytics`)의 `responseTime` 메트릭
- 2차: 미들웨어 자체 계측 → `metric_request_perf` 테이블에 저장 (1분 집계)

**시각화**: 
- 시계열 차트 (지난 24시간, 선택 시간 범위 3h/6h/12h/24h)
- 신호등: p95 < 500ms (🟢), 500~800ms (🟡), > 800ms (🔴)

**샘플 데이터 저장**:
```sql
-- 미들웨어에서 매 요청 후 기록 (선택사항, 성능 impact 모니터)
-- metric_request_perf 테이블 (아래 4.1 참조)
```

---

#### 3.1.2 에러율 & HTTP 상태코드 분포

**측정 대상**: 모든 API 응답의 상태코드

**메트릭**:
- **5xx 에러율**: 서버 오류 비중 (%)
- **4xx 에러율**: 클라이언트 오류 비중 (%)
- **2xx 성공률**: 정상 응답 비중 (%)
- **에러 종류별**: 주요 에러 Top-5 (410, 422, 500, 502, 503 등)

**데이터 소스**:
- Vercel Analytics API
- 미들웨어 자체 계측 → `metric_request_perf` 테이블

**시각화**:
- 영역 그래프(stacked): 시간대별 2xx/4xx/5xx 비중
- 신호등: 5xx < 0.1% (🟢), 0.1~1% (🟡), > 1% (🔴)

---

#### 3.1.3 가용성 (Uptime)

**측정 대상**: 핵심 헬스 체크 엔드포인트

**엔드포인트**:
- `/api/health` (응답 < 100ms)
- `/api/auth/session` (세션 서버 정상 여부)
- `/api/admin/analytics/orders` (DB 연결 정상 여부)

**메트릭**:
- **가용률**: (정상 응답 횟수 / 총 요청 횟수) × 100% [%]
- **가동 시간**: 최근 7일, 30일 누적

**데이터 소스**: 
- 1분마다 헬스 체크 엔드포인트 호출 → Vercel Function logs
- 매 요청 상태 → `metric_request_health` 테이블 저장 (선택사항)

**시각화**:
- 큰 숫자 카드: "가용률 99.87%"
- 히트맵: 일별 시간대별 가용률 (7일 × 24시간)
- 신호등: ≥ 99.5% (🟢), 99~99.5% (🟡), < 99% (🔴)

---

#### 3.1.4 함수 콜드스타트 (Cold Start)

**측정 대상**: Vercel Functions 초기 로드 시간

**메트릭**:
- **콜드스타트 비율**: 콜드스타트 횟수 / 전체 함수 호출 [%]
- **콜드스타트 평균 지연**: Cold Start 발생 시 추가 소요 시간 [ms]

**데이터 소스**: 
- Vercel Functions 로그의 `x-vercel-duration` 헤더
- 미들웨어에서 첫 요청 감지 후 `isColdStart` 플래그 기록

**시각화**:
- 시계열 차트: 시간대별 콜드스타트 비율 (%)
- 신호등: < 5% (🟢), 5~10% (🟡), > 10% (🔴)

**해석**: 콜드스타트가 많으면 함수 크기 또는 의존성 최적화 필요

---

### 3.2 데이터베이스 부하 (Database Load)

#### 3.2.1 느린 쿼리 탐지 (Slow Query Log)

**측정 대상**: Supabase PostgreSQL의 모든 쿼리

**메트릭**:
- **느린 쿼리 목록**: 실행 시간 > 500ms인 쿼리 Top-10
  - SQL 본문(normalize)
  - 평균 실행 시간
  - 최근 1시간 호출 횟수
  - Row 영향도
- **느린 쿼리 빈도**: 시간대별 느린 쿼리 개수

**데이터 소스**:
- Supabase `pg_stat_statements` 뷰 쿼리 (RPC via `fn_slow_queries`)
- 활성화: `shared_preload_libraries = 'pg_stat_statements'` (Supabase 기본)

**SQL 예시**:
```sql
SELECT 
  query,
  calls,
  mean_exec_time::int as avg_ms,
  max_exec_time::int as max_ms,
  rows
FROM pg_stat_statements
WHERE mean_exec_time > 500  -- 500ms 이상
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**시각화**:
- 테이블: 느린 쿼리 목록 (SQL, 횟수, 평균 시간, 최대 시간)
- 시계열: 시간대별 느린 쿼리 개수 (분당)
- 신호등: 0건/시간 (🟢), 1~5건/시간 (🟡), > 5건/시간 (🔴)

**인덱스 추천**: 느린 쿼리와 `pg_trgm` GIN 인덱스 매핑 (sql/076 참조)

---

#### 3.2.2 활성 커넥션 수

**측정 대상**: PostgreSQL 백엔드 프로세스

**메트릭**:
- **활성 커넥션**: 쿼리 실행 중인 커넥션 수
- **idle 커넥션**: 유휴(트랜잭션 대기 중) 커넥션 수
- **최대 커넥션**: 설정된 `max_connections` 대비 사용률 [%]

**데이터 소스**:
- Supabase RPC 호출: `SELECT count(*) FROM pg_stat_activity WHERE state != 'idle'`
- 또는 Supabase Dashboard의 "Connections" 정보 API

**시각화**:
- 스택형 영역 차트: 활성/idle 커넥션 시간 추이
- 신호등: < 10 (🟢), 10~20 (🟡), > 20 (🔴) [Free tier 한계 기준]

**임계치 초과 시**:
- 자동 알림: "DB 커넥션 부하 높음 (15/20)"
- 권장사항: 커넥션 풀 크기 조정 또는 Supabase Pro 전환

---

#### 3.2.3 pg_trgm 인덱스 가속 여부

**측정 대상**: 검색 쿼리의 인덱스 활용도

**메트릭**:
- **인덱스 히트율**: 풀스캔 대비 인덱스 사용 비율 [%]
  - 검색 쿼리(`.ilike()`) 중 pg_trgm GIN 인덱스를 탄 쿼리 비중
- **풀스캔 횟수**: pg_trgm 인덱스를 못 탄 검색 쿼리 개수

**데이터 소스**:
- `pg_stat_user_indexes`: `idx_mps_item_nm_trgm`, `idx_sys_user_nick_nm_trgm` 등의 `idx_scan` vs 전체 스캔 비교
- RPC via `fn_index_hit_ratio`

**SQL 예시**:
```sql
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexname LIKE '%trgm%'
ORDER BY idx_scan DESC;
```

**시각화**:
- 테이블: 인덱스별 scan 횟수, tup read/fetch 비율
- 신호등: > 95% hit rate (🟢), 80~95% (🟡), < 80% (🔴)

**N+1 의심 신호**: 특정 테이블의 seq_scan이 매우 높으면 쿼리 구조 재검토 필요

---

### 3.3 트래픽 & 보안 (Traffic & Security)

#### 3.3.1 분당 요청률 (Request Rate)

**측정 대상**: 전체 API + 페이지 로드

**메트릭**:
- **req/min (분당 요청)**: 지난 1분간의 평균
- **req/sec (초당 요청)**: 피크 값
- **요청 분포**: 엔드포인트별 Top-10 (req/min)

**데이터 소스**:
- Vercel Analytics API
- 미들웨어 자체 계측 → `metric_request_volume` 테이블 (1분 집계)

**시각화**:
- 시계열 라인 차트: 지난 24시간 분당 요청 추이
- 신호등: < 50 req/min (🟢), 50~200 (🟡), > 200 (🔴) [일반적 안정 범위]

---

#### 3.3.2 IP별 집중도 & DDoS 탐지

**측정 대상**: 특정 IP에서 오는 요청 패턴

**메트릭**:
- **Top-10 IP 목록**: 가장 많은 요청을 보낸 IP (req/min)
- **비정상 IP 플래그**: 분당 요청 수 > 100인 IP (잠재적 DDoS)
- **IP 다양도**: 고유 IP 개수 (변화 추이)

**데이터 소스**:
- 미들웨어에서 `req.headers['x-forwarded-for']` 또는 `req.ip` 수집 → `metric_request_by_ip` 테이블
- 1분 집계로 `ip_address`, `req_count`, `flagged_suspicious` 저장

**테이블 정의** (아래 4.1 참조):
```sql
CREATE TABLE metric_request_by_ip (
  ip_address INET,
  metric_minute TIMESTAMPTZ,
  req_count INT,
  flagged_suspicious BOOLEAN DEFAULT FALSE,
  ...
)
```

**시각화**:
- Top-10 IP 테이블 (IP, 요청수, 지역, 의심 여부)
- 신호등: 의심 IP 0개 (🟢), 1~3개 (🟡), ≥4개 (🔴)

**자동 차단**: 의심 IP는 `x-suspected-ddos` 헤더 마킹, 향후 rate-limit 미들웨어 연계

---

#### 3.3.3 인증 실패율 (Authentication Failures)

**측정 대상**: 로그인 시도 및 세션 검증 실패

**메트릭**:
- **로그인 성공**: Pi/Google OAuth 성공 횟수/시간
- **로그인 실패**: 실패 횟수/시간 (비밀번호 오류, OTP 불일치 등)
- **실패율**: 실패 / (성공 + 실패) × 100% [%]
- **비정상 패턴**: 같은 사용자의 실패 5회 이상/분

**데이터 소스**:
- `/api/auth/pi` 및 `/api/auth/callback/google` 응답 상태
- 미들웨어 자체 계측 → `metric_auth_attempt` 테이블

**테이블 정의**:
```sql
CREATE TABLE metric_auth_attempt (
  user_id UUID,
  auth_type VARCHAR(10), -- 'PI' | 'GOOGLE'
  success BOOLEAN,
  failure_reason VARCHAR(100), -- 'INVALID_OTP', 'SESSION_EXPIRED', 'RATE_LIMIT'
  attempt_dtm TIMESTAMPTZ,
  ip_address INET,
  ...
)
```

**시각화**:
- 시계열: 시간대별 로그인 성공/실패 개수
- 신호등: 실패율 < 5% (🟢), 5~10% (🟡), > 10% (🔴)
- 경고: 같은 IP의 실패 > 5회/분 → "의심 로그인 시도 탐지"

---

#### 3.3.4 Rate Limit 적중

**측정 대상**: 속도 제한 규칙 위반

**메트릭**:
- **rate-limit 적중 횟수**: `/분`
- **차단된 IP**: 임시 차단된 IP 개수
- **리셋 대기 중인 사용자**: 다음 시도까지의 초 단위

**데이터 소스**:
- 미들웨어 rate-limit 규칙 → `metric_rate_limit_hit` 테이블 (선택사항)
- Redis 기반 카운터 (Vercel KV 또는 로컬 메모리)

**현재 규칙** (예시):
- `/api/chat/message`: 10 req/min/user
- `/api/auth/pi`: 5 req/min/ip
- `/api/search`: 30 req/min/user

**시각화**:
- 시계열: 시간대별 rate-limit 적중 횟수
- 신호등: 0건/시간 (🟢), 1~10건/시간 (🟡), > 10건/시간 (🔴)

---

### 3.4 비즈니스 실시간 지표 (Business Realtime Metrics)

#### 3.4.1 동시 접속 사용자 수 (Concurrent Users)

**측정 대상**: 지금 이 순간 활성 사용자

**메트릭**:
- **전체 동시 접속**: 로그인 상태인 활성 사용자 수
- **카페 중인 사용자**: 카페 방(`chat_room`) 입장 중인 사용자
- **채팅 중인 사용자**: 메시지 송수신 활성 사용자
- **검색 중인 사용자**: 현재 페이지 로드/검색 중인 사용자

**데이터 소스**:
- Supabase Realtime `presence`: 각 사용자의 마지막 활동 시간 추적
- 미들웨어에서 요청 시 `user_id` + `action` (view/chat/search) 기록 → `metric_concurrent_user` 테이블

**테이블 정의**:
```sql
CREATE TABLE metric_concurrent_user (
  user_id UUID,
  action VARCHAR(20), -- 'ONLINE' | 'IN_CAFE' | 'CHATTING' | 'SEARCHING'
  last_activity_dtm TIMESTAMPTZ,
  metric_minute TIMESTAMPTZ,
  regr_id TEXT, modr_id TEXT, reg_dtm TIMESTAMPTZ, mod_dtm TIMESTAMPTZ, del_yn CHAR(1)
)
```

**계산 로직**:
```sql
SELECT 
  COUNT(DISTINCT user_id) as concurrent_users,
  COUNT(CASE WHEN action = 'IN_CAFE' THEN 1 END) as in_cafe,
  COUNT(CASE WHEN action = 'CHATTING' THEN 1 END) as chatting,
  COUNT(CASE WHEN action = 'SEARCHING' THEN 1 END) as searching
FROM metric_concurrent_user
WHERE last_activity_dtm > NOW() - INTERVAL '5 minutes'  -- 마지막 활동이 5분 이내
GROUP BY DATE_TRUNC('minute', metric_minute)
```

**시각화**:
- 큰 숫자 카드: "현재 동시 접속: 234명"
- 스택형 영역 차트: 시간대별 카페/채팅/검색 사용자 분포
- 신호등: < 100 (🟢), 100~500 (🟡), > 500 (🔴) [일반 기준, 성장 시 조정]

---

#### 3.4.2 분당 로그인 성공/실패

**측정 대상**: 인증 이벤트

**메트릭**:
- **로그인 성공/분**: Pi, Google 각각
- **로그인 실패/분**: 실패 원인별 분류
- **계정 연동 시도/분**: OTP 인증 시도

**데이터 소스**: 
- `metric_auth_attempt` 테이블 (위 3.3.3 참조)

**시각화**:
- 시계열 라인: 분당 성공/실패 추이 (지난 12시간)
- 신호등: 실패율 < 5% (🟢), 5~10% (🟡), > 10% (🔴)

**해석**: 실패 급증 → 서버 인증 오류 또는 비정상 로그인 시도

---

#### 3.4.3 Pi 결제 성공률 (핵심 가치 직결) ⭐

**측정 대상**: Pi Coin 결제 프로세스 성공 여부

**메트릭**:
- **결제 성공**: `pi_pymnt.status = 'COMPLETED'` 건수/시간
- **결제 실패**: `pi_pymnt.status = 'FAILED'` 또는 `'CANCELLED'` 건수/시간
- **미완료 결제**: `pi_pymnt.status = 'INITIATED'` (타임아웃 위험) 건수
- **성공률**: 성공 / (성공 + 실패) × 100% [%]
- **평균 결제 시간**: 결제 시작(`created_at`) ~ 완료(`completed_at`) [초]

**데이터 소스**:
- `pi_pymnt` 테이블 쿼리
- 실시간: Supabase RPC `fn_pi_payment_status` 호출

**RPC 정의**:
```sql
CREATE OR REPLACE FUNCTION fn_pi_payment_status()
RETURNS TABLE(
  completed_count INT,
  failed_count INT,
  initiated_count INT,
  avg_duration_sec NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) FILTER (WHERE status = 'COMPLETED')::INT,
    COUNT(*) FILTER (WHERE status = 'FAILED')::INT,
    COUNT(*) FILTER (WHERE status = 'INITIATED' AND reg_dtm < NOW() - INTERVAL '5 min')::INT,
    CEIL(AVG(EXTRACT(EPOCH FROM (completed_at - reg_dtm))))::NUMERIC
  FROM pi_pymnt
  WHERE reg_dtm > NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;
```

**시각화**:
- **큰 숫자 카드**: "Pi 결제 성공률 98.5%" (🟢 if ≥ 99%)
- **시계열**: 시간대별 성공/실패/미완료 건수
- **신호등**: ≥ 99% (🟢), 95~99% (🟡), < 95% (🔴)
- **경고**: 미완료 건수 > 5 → "결제 미완료 대기 중, 확인 필요"

**자동 응답**:
- 성공률 < 95% → 즉시 알림 + 마스터 호출
- 미완료 > 5건 → RPC `fn_recover_incomplete_payments` 트리거 (자동 복구)

---

#### 3.4.4 진행 중인 주문 (Active Orders)

**측정 대상**: MPS 주문 상태 분포

**메트릭**:
- **대기 중**: `mps_order.order_status = 'CREATED'` (결제 완료, 판매자 확인 대기)
- **처리 중**: `'CONFIRMED'` (판매자가 준비 중)
- **배송/픽업 중**: `'SHIPPED'` 또는 `'DELIVERED'` (거래 진행 중)
- **완료**: `'COMPLETED'` (지난 1시간)
- **분쟁/취소**: `'DISPUTE'` 또는 `'CANCELLED'`

**데이터 소스**:
- `mps_order` 테이블 상태 분포
- RPC `fn_active_order_status`

**시각화**:
- 파이/도넛 차트: 상태별 주문 건수
- 테이블: 주요 주문 Top-10 (주문ID, 금액, 상태, 진행 시간)
- 신호등: 대기 < 50건 (🟢), 50~100 (🟡), > 100 (🔴)

**해석**: 대기 건수 많음 → 판매자 응답 지연 의심

---

### 3.5 기능별 상세 메트릭

#### 3.5.1 채팅 성능 (Chat Performance)

**측정 대상**: PiChat 메시지 송수신

**메트릭**:
- **메시지 처리량**: msg/초
- **메시지 지연**: 송신 ~ 수신 평균 시간 [ms]
- **Realtime 브로드캐스트 지연**: 구독자 전달 시간 [ms]
- **비정상 메시지**: 너무 긴 메시지, 검열 대상 등

**데이터 소스**:
- API `/api/chat/message` 응답 시간
- Supabase Realtime `broadcast` 이벤트 지연
- `msg_msg` 테이블 INSERT 시간

**시각화**:
- 시계열: 시간대별 메시지 처리량 (msg/sec)
- 신호등: < 50ms avg 지연 (🟢), 50~100ms (🟡), > 100ms (🔴)

---

#### 3.5.2 게시판 성능 (Board Performance)

**측정 대상**: 게시판 검색 및 리스트 조회

**메트릭**:
- **게시물 조회 시간**: `/api/board/list` 응답 시간
- **검색 응답 시간**: `/api/board/search` (pg_trgm 인덱스 사용 여부)
- **댓글 처리 시간**: `/api/board/*/comments` POST 시간

**데이터 소스**:
- API 응답 헤더 `x-db-query-ms`
- pg_trgm 인덱스 hit rate (위 3.2.3 참조)

**시각화**:
- 시계열: 조회/검색/댓글 응답시간 추이
- 신호등: < 200ms (🟢), 200~500ms (🟡), > 500ms (🔴)

---

#### 3.5.3 검색 성능 (Search Performance)

**측정 대상**: 전역 검색 기능

**메트릭**:
- **검색 응답 시간**: `/api/search?q=...` 평균 [ms]
- **pg_trgm 히트율**: 풀스캔 대비 인덱스 사용 비율 [%]
- **결과 건수**: 검색 쿼리당 평균 Row 수

**데이터 소스**:
- `pg_stat_statements`에서 `ILIKE` 패턴 쿼리 추출
- 미들웨어에서 검색 응답 시간 계측

**시각화**:
- 테이블: 검색 키워드별 응답 시간, hit rate
- 신호등: 모두 pg_trgm 히트 + < 200ms (🟢), 일부 풀스캔 또는 200~500ms (🟡), 많은 풀스캔 또는 > 500ms (🔴)

---

### 3.6 알림 및 임계치 관리 (Alerts & Thresholds)

#### 3.6.1 알림 채널

**기본 채널** (구현 후보):
1. **관리자 대시보드 푸시** — `/admin/monitor` 탭 상단 "경고 배너"
2. **Telegram Bot** (기존) — 관리자 개인 채팅
3. **슬랙 채널** (선택사항) — #alert 채널로 자동 포스팅
4. **이메일** (향후) — 심각 장애만

#### 3.6.2 임계치 정의 및 심각도

| 메트릭 | 정상 🟢 | 경고 🟡 | 위험 🔴 | 액션 |
|---|---|---|---|---|
| **API p95 응답시간** | < 500ms | 500~800ms | > 800ms | 쿼리 최적화 검토 |
| **5xx 에러율** | < 0.1% | 0.1~1% | > 1% | 서버 로그 확인, 재배포 검토 |
| **DB 활성 커넥션** | < 10 | 10~20 | > 20 | 커넥션 풀 조정, Supabase Pro 전환 검토 |
| **느린 쿼리** (> 500ms/h) | 0건 | 1~5건 | > 5건 | 인덱스 추가 또는 쿼리 재작성 |
| **의심 IP (req/min > 100)** | 0개 | 1~3개 | ≥4개 | IP 차단, DDoS 대응 |
| **로그인 실패율** | < 5% | 5~10% | > 10% | 인증 서비스 상태 확인 |
| **Pi 결제 성공률** | ≥ 99% | 95~99% | < 95% | ⭐ 즉시 알림 + 마스터 호출 |
| **동시 접속** | < 100 | 100~500 | > 500 | 성장 신호, 확장 검토 |
| **미완료 결제** | < 2건 | 2~5건 | > 5건 | 자동 복구 + 로그 분석 |

#### 3.6.3 알림 규칙 설정

**예시 규칙** (앞으로 DB에 저장, 관리자가 수정 가능):

```json
{
  "alert_id": "api_p95_response_time",
  "metric": "api_response_time_p95",
  "condition": "> 800",
  "duration": "5min",  // 5분 이상 지속
  "severity": "HIGH",
  "channels": ["telegram", "dashboard"],
  "message": "🔴 API p95 응답시간 {value}ms (임계치: 800ms) — 쿼리 최적화 필요"
}
```

**자동 응답 (향후)**:
- Pi 결제 성공률 < 95% → 마스터 전화 + 자동 재배포 제안
- 의심 IP 4개 이상 → 임시 IP 차단 적용
- DB 커넥션 > 20 → 슬랙 알림 + 수동 개입 대기

---

## 4. 데이터 모델 (DB 스키마)

### 4.1 모니터링 테이블 정의

**원칙**: DA 표준 준수 (시스템 컬럼 4개, 논리삭제, timestamptz)

#### 4.1.1 metric_request_perf (API 응답 성능)

```sql
CREATE TABLE metric_request_perf (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 요청 정보
  endpoint VARCHAR(255) NOT NULL,          -- e.g., "/api/chat/message"
  method VARCHAR(10) NOT NULL,              -- GET, POST, PUT, DELETE
  status_code INT NOT NULL,                 -- 200, 404, 500 등
  
  -- 성능 메트릭
  response_time_ms INT NOT NULL,            -- 응답 시간 (ms)
  db_query_time_ms INT,                     -- DB 쿼리 시간 (ms, null이면 미계측)
  is_cold_start BOOLEAN DEFAULT FALSE,      -- Vercel 콜드스타트 여부
  
  -- 요청 메타
  user_id UUID,
  ip_address INET,
  request_id VARCHAR(100),                  -- X-Request-ID 헤더
  
  -- 시스템 컬럼
  regr_id TEXT NOT NULL DEFAULT 'SYSTEM',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'SYSTEM',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn CHAR(1) DEFAULT 'N',
  del_dtm TIMESTAMPTZ,
  
  -- 인덱스
  CHECK (status_code BETWEEN 100 AND 599)
);

CREATE INDEX idx_metric_request_perf_endpoint_time ON metric_request_perf(endpoint, reg_dtm DESC);
CREATE INDEX idx_metric_request_perf_status_time ON metric_request_perf(status_code, reg_dtm DESC);
CREATE INDEX idx_metric_request_perf_user_time ON metric_request_perf(user_id, reg_dtm DESC);
```

#### 4.1.2 metric_request_by_ip (IP별 요청 집계)

```sql
CREATE TABLE metric_request_by_ip (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  ip_address INET NOT NULL,
  metric_minute TIMESTAMPTZ NOT NULL,       -- 1분 단위 버킷
  req_count INT NOT NULL DEFAULT 0,         -- 분당 요청 수
  flagged_suspicious BOOLEAN DEFAULT FALSE, -- 분당 req > 100
  error_count INT DEFAULT 0,                -- 4xx/5xx 에러 개수
  
  -- 시스템 컬럼
  regr_id TEXT NOT NULL DEFAULT 'SYSTEM',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'SYSTEM',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn CHAR(1) DEFAULT 'N',
  del_dtm TIMESTAMPTZ,
  
  -- 복합 인덱스
  UNIQUE(ip_address, metric_minute)
);

CREATE INDEX idx_metric_request_by_ip_flagged ON metric_request_by_ip(flagged_suspicious, metric_minute DESC);
```

#### 4.1.3 metric_auth_attempt (인증 시도)

```sql
CREATE TABLE metric_auth_attempt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID,                              -- null이면 미로그인 시도
  auth_type VARCHAR(10) NOT NULL,            -- 'PI' | 'GOOGLE'
  success BOOLEAN NOT NULL,
  failure_reason VARCHAR(100),               -- 'INVALID_OTP', 'SESSION_EXPIRED' 등
  ip_address INET,
  
  -- 시스템 컬럼
  regr_id TEXT NOT NULL DEFAULT 'SYSTEM',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'SYSTEM',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn CHAR(1) DEFAULT 'N',
  del_dtm TIMESTAMPTZ
);

CREATE INDEX idx_metric_auth_attempt_user_time ON metric_auth_attempt(user_id, reg_dtm DESC);
CREATE INDEX idx_metric_auth_attempt_success_time ON metric_auth_attempt(success, reg_dtm DESC);
CREATE INDEX idx_metric_auth_attempt_ip_time ON metric_auth_attempt(ip_address, reg_dtm DESC);
```

#### 4.1.4 metric_concurrent_user (동시 접속)

```sql
CREATE TABLE metric_concurrent_user (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL,               -- 'ONLINE' | 'IN_CAFE' | 'CHATTING' | 'SEARCHING'
  last_activity_dtm TIMESTAMPTZ NOT NULL,
  metric_minute TIMESTAMPTZ NOT NULL,        -- 1분 단위 스냅샷
  
  -- 시스템 컬럼
  regr_id TEXT NOT NULL DEFAULT 'SYSTEM',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'SYSTEM',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  del_yn CHAR(1) DEFAULT 'N',
  del_dtm TIMESTAMPTZ
);

CREATE INDEX idx_metric_concurrent_user_action_time ON metric_concurrent_user(action, metric_minute DESC);
CREATE INDEX idx_metric_concurrent_user_user_time ON metric_concurrent_user(user_id, metric_minute DESC);
```

---

### 4.2 집계 RPC (Real-time 계산)

```sql
-- API 응답 통계 (지난 1시간)
CREATE OR REPLACE FUNCTION fn_api_response_stats()
RETURNS TABLE(
  response_time_p50 INT,
  response_time_p95 INT,
  response_time_p99 INT,
  error_rate_pct NUMERIC,
  total_requests INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time_ms)::INT,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms)::INT,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms)::INT,
    ROUND(COUNT(*) FILTER (WHERE status_code >= 400)::NUMERIC / COUNT(*) * 100, 2),
    COUNT(*)
  FROM metric_request_perf
  WHERE reg_dtm > NOW() - INTERVAL '1 hour' AND del_yn = 'N';
END;
$$ LANGUAGE plpgsql;

-- 의심 IP 목록
CREATE OR REPLACE FUNCTION fn_suspicious_ips()
RETURNS TABLE(
  ip_address INET,
  req_count INT,
  error_count INT,
  error_rate_pct NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ip_address,
    req_count,
    error_count,
    ROUND(error_count::NUMERIC / req_count * 100, 2)
  FROM metric_request_by_ip
  WHERE metric_minute > NOW() - INTERVAL '1 hour'
    AND flagged_suspicious = TRUE
    AND del_yn = 'N'
  ORDER BY req_count DESC;
END;
$$ LANGUAGE plpgsql;
```

---

## 5. 데이터 수집 방식

### 5.1 계측 레이어 (Instrumentation)

#### 5.1.1 미들웨어 수준 (모든 요청)

**파일**: `src/middleware.ts` 또는 `src/middleware/monitoring.ts`

```typescript
// 요청 시작
const startTime = performance.now()
const requestId = crypto.randomUUID()

// ... 요청 처리 ...

// 요청 완료 시
const endTime = performance.now()
const responseTimeMs = Math.round(endTime - startTime)

// DB에 기록 (비동기, 논블로킹)
recordMetric({
  endpoint: request.nextUrl.pathname,
  method: request.method,
  statusCode: response.status,
  responseTimeMs,
  userId: session?.user?.id,
  ipAddress: request.ip,
  requestId,
  isColdStart: !!process.env.VERCEL_REGION // 추측값
})
```

**영향**: 요청당 1~2ms 오버헤드 (비동기 백그라운드 저장)

#### 5.1.2 API 응답 헤더

**전체 API에 추가**:

```typescript
// src/lib/api-response.ts
export function withMetricHeaders(response: NextResponse) {
  const dbQueryMs = response.headers.get('x-db-query-ms') || '0'
  
  response.headers.set('x-response-time', dbQueryMs)
  response.headers.set('x-request-id', requestId)
  
  return response
}
```

**클라이언트에서 수집 가능**:

```typescript
// 성능 분석
const perfData = {
  responseTime: parseInt(response.headers.get('x-response-time')),
  dbQueryTime: parseInt(response.headers.get('x-db-query-ms'))
}
```

#### 5.1.3 RPC 호출 (집계 쿼리)

**매 분마다** (Vercel Cron):
```typescript
// api/cron/metrics-aggregate
const apiStats = await db.rpc('fn_api_response_stats')
const suspiciousIps = await db.rpc('fn_suspicious_ips')
// → `metric_*_summary` 테이블에 저장 (선택사항)
```

**매 5분마다** (자동):
- `fn_pi_payment_status()` 호출 → 결제 상태 확인
- 의심 IP 목록 갱신 → 알림 트리거

---

### 5.2 외부 데이터 소스 연계

#### 5.2.1 Vercel Analytics API

**Endpoint**: `https://api.vercel.com/v1/analytics`

**필수 헤더**:
```
Authorization: Bearer $VERCEL_TOKEN
```

**쿼리 예시**:
```json
{
  "deploymentId": "...",
  "metrics": ["responseTime", "statusCode", "errorRate"],
  "granularity": "1m"
}
```

**갱신 주기**: 1~2분 지연

#### 5.2.2 Supabase pg_stat_statements

**RPC 호출**:
```typescript
const { data } = await db.rpc('fn_slow_queries', {})
// 느린 쿼리 목록 수집
```

**갱신 주기**: 실시간 (매 쿼리 기록)

#### 5.2.3 Supabase 커넥션 상태

**직접 쿼리**:
```sql
SELECT COUNT(*) FROM pg_stat_activity WHERE state != 'idle'
```

**갱신 주기**: 실시간

---

## 6. 화면 구조 (UI/UX)

### 6.1 진입점

**경로**: `/admin/monitor`

**권한**: 관리자 전용 (`isAdmin(user) === true`)

**라우트 파일**:
```
src/app/[locale]/(admin)/admin/monitor/
├── page.tsx                    # 메인 대시보드
├── layout.tsx                  # 관리자 레이아웃 공유
└── components/
    ├── monitor-header.tsx       # 타이틀, 새로고침 버튼, 기간 선택
    ├── health-cards.tsx         # 4대 카드 (API/DB/Traffic/Business)
    ├── api-performance.tsx       # API 응답 시간 차트
    ├── error-distribution.tsx    # 에러율 시각화
    ├── database-metrics.tsx      # DB 부하, 느린 쿼리
    ├── traffic-security.tsx      # IP 집중도, DDoS 의심
    ├── pi-payment-status.tsx     # Pi 결제 성공률 (⭐ 강조)
    ├── concurrent-users.tsx      # 동시 접속 추이
    └── alerts-panel.tsx          # 경고 배너 (상단 고정)
```

---

### 6.2 텍스트 와이어프레임

```
┌─────────────────────────────────────────────────────────────────────┐
│ ADMIN > SYSTEM MONITOR                     🔄 새로고침  [24h ▼]     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ⚠️ 경고 (1건): API p95 응답시간 850ms (임계치: 800ms) — 계속 지켜보기 │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│  4대 핵심 지표                                                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐│
│  │ 🟢 API 응답   │  │ 🟢 DB 부하   │  │ 🟡 의심 IP   │  │ ⭐ Pi 결제 ││
│  │   p95: 650ms │  │ 커넥션: 8/20 │  │  의심: 2개   │  │ 성공: 98.3%││
│  │ 에러: 0.3%   │  │ 느린쿼리: 0건 │  │ req/min:150  │  │ 미완료: 0건 ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────┘│
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│  API 응답 시간 (지난 24시간)                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  (시계열 라인 차트 — p50/p95/p99 추이)                               │
│                                                                      │
│  시간:  00 04 08 12 16 20 00                                        │
│  p50:   320ms (안정적)                                              │
│  p95:   650ms (정상)                                                │
│  p99:   900ms (경보 임계치 근처)                                     │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│  에러율 분포 & 상태코드                                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 2xx 정상 99.7% │ 4xx 클라이언트 0.2% │ 5xx 서버 0.1% │       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  주요 에러 (TOP-5):                                                  │
│  1. 422 Unprocessable Entity  (23건/1h) — 검증 실패                  │
│  2. 500 Internal Server       (8건/1h)  — 쿼리 타임아웃             │
│  3. 429 Too Many Requests     (5건/1h)  — Rate-limit                │
│  4. 404 Not Found             (3건/1h)  — 매뉴얼 확인               │
│  5. 503 Service Unavailable   (1건/1h)  — DB 연결 문제              │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│  DB 부하 & 느린 쿼리                                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  활성 커넥션: 8 / 20 (40%)  🟢                                       │
│                                                                      │
│  느린 쿼리 (> 500ms/1h): 0건                                        │
│                                                                      │
│  pg_trgm 인덱스 히트율: 97.2% 🟢                                     │
│  (검색 쿼리 62개 중 60개가 인덱스 사용)                              │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│  트래픽 & 보안 모니터링                                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  분당 요청률: 145 req/min 🟢                                         │
│                                                                      │
│  의심 IP 목록 (분당 req > 100):                                     │
│  1. 203.0.113.45  — 218 req/min  [차단됨]                          │
│  2. 198.51.100.67 — 105 req/min  [감시 중]                         │
│                                                                      │
│  로그인 성공/실패:                                                   │
│  - Pi: 12 성공 / 2 실패 (실패율 14.3% — 주의)                        │
│  - Google: 8 성공 / 0 실패 (100% 정상)                              │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│  Pi 결제 상태 (⭐ 핵심 가치)                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  성공률: 98.3% 🟢 (임계치 ≥ 99%)                                     │
│                                                                      │
│  지난 1시간:                                                         │
│  - 완료: 58건                                                       │
│  - 실패: 1건 (이유: USER_CANCELLED)                                 │
│  - 미완료: 0건                                                      │
│  - 평균 처리시간: 3.2초                                             │
│                                                                      │
│  미완료 결제 > 5분 대기:                                            │
│  - 없음 🟢                                                          │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│  비즈니스 실시간 지표                                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  동시 접속: 234명                                                    │
│  ├─ 온라인: 234명                                                   │
│  ├─ 카페 중: 87명                                                   │
│  ├─ 채팅 중: 156명                                                  │
│  └─ 검색 중: 23명                                                   │
│                                                                      │
│  진행 중인 주문 (MPS):                                               │
│  - 대기 중: 12건 (결제 완료, 판매자 확인 대기)                       │
│  - 처리 중: 5건                                                     │
│  - 배송 중: 8건                                                     │
│  - 분쟁/취소: 0건                                                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 6.3 상세 화면 (탭 구조)

**상단 탭** (선택사항, 모바일 고려 시 생략):
- **Overview** (기본) — 위 와이어프레임
- **API Performance** — 엔드포인트별 상세
- **Database** — 쿼리, 인덱스, 커넥션 상세
- **Security** — IP 화이트/블랙리스트, 로그인 시도 분석
- **Alerts** — 경고 규칙 설정, 히스토리

---

## 7. 실시간 갱신 방식 비교 및 선택

### 7.1 후보 기술

| 방식 | 지연 | 비용 | 클라이언트 영향 | 추천 |
|---|---|---|---|---|
| **폴링 (10초 주기)** | 5~10초 | 낮음 | 네트워크 부하 증가 | ❌ |
| **SSE (Server-Sent Events)** | 실시간 | 중간 | 단방향, 연결 유지 | ⭐ **선택** |
| **WebSocket** | 실시간 | 중간 | 양방향, 복잡도 높음 | ⛔ (과도) |
| **Supabase Realtime** | 실시간 | 중간 | JWT 검증 필요, 대역폭 | ⭐ **대안** |

### 7.2 선택안: SSE (Server-Sent Events)

**이유**:
- ✅ 단방향 스트리밍으로 충분 (관리자 → 서버 피드만 필요)
- ✅ HTTP 기반, Pi Browser 호환
- ✅ 자동 재연결 지원
- ✅ 구현 단순

**구현**:

```typescript
// src/app/api/monitor/metrics-stream.ts
export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!isAdmin(user)) return new Response('Unauthorized', { status: 401 })
  
  const encoder = new TextEncoder()
  
  const stream = new ReadableStream({
    async start(controller) {
      // 1초마다 메트릭 푸시
      const interval = setInterval(async () => {
        const metrics = await fetchMetrics()
        
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(metrics)}\n\n`)
        )
      }, 1000)
      
      req.signal.addEventListener('abort', () => clearInterval(interval))
    }
  })
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })
}
```

**클라이언트**:

```typescript
// src/components/admin/monitor/metrics-stream.tsx
useEffect(() => {
  const eventSource = new EventSource('/api/monitor/metrics-stream')
  
  eventSource.onmessage = (event) => {
    const metrics = JSON.parse(event.data)
    setMetrics(metrics)  // 실시간 갱신
  }
  
  return () => eventSource.close()
}, [])
```

---

## 8. 로드맵 (MVP → 확장)

### Phase 1: MVP (2026-06-26 오픈 당일)

**목표**: 핵심 지표 실시간 확인 + 긴급 알림

**구현 항목**:
- ✅ 4대 카드 (API/DB/Traffic/Business)
- ✅ API p95 응답시간 차트
- ✅ 에러율 분포
- ✅ DB 활성 커넥션 수
- ✅ 의심 IP 목록
- ✅ Pi 결제 성공률 (⭐ 강조)
- ✅ 동시 접속 숫자
- ✅ 경고 배너 (상단)
- ✅ SSE 실시간 갱신 (1초 주기)

**데이터 소스**:
- Vercel Analytics (분 단위)
- Supabase 직접 쿼리 (실시간)
- 앱 자체 계측 (메트릭_* 테이블)

**UI**:
- 단순 한 페이지 대시보드
- 모바일 반응형 (카드 스택)
- 다크모드 지원

---

### Phase 2: 고도화 (2026-07-01 이후)

**추가 항목**:
- 엔드포인트별 성능 상세 (Top-20)
- 느린 쿼리 Top-10 + 인덱스 제안
- 사용자별 활동 로그 (선택적)
- 이메일/슬랙 알림 채널
- 알림 규칙 UI (임계치 수정)
- 7일/30일 트렌드 보고서

---

### Phase 3: 자동화 (2026-08-01 이후)

**기능**:
- 자동 IP 차단 (Vercel Firewall API)
- 자동 재배포 (성공률 < 95%)
- 자동 쿼리 최적화 제안 (AI)
- 예측 분석 (트래픽 급증 예측)

---

## 9. 미해결 과제 & 선결조건

### 9.1 기술적 선결조건

| 항목 | 상태 | 우선순위 | 비고 |
|---|---|---|---|
| **미들웨어 계측 구현** | ❌ 미완료 | 1순위 | `src/middleware/monitoring.ts` 신규 개발 필요 |
| **metric_* 테이블 생성** | ❌ 미완료 | 1순위 | DA 표준 준수 + Supabase 마이그레이션 필요 |
| **Vercel Analytics API 통합** | ❌ 미완료 | 2순위 | VERCEL_TOKEN 환경변수 + 권한 확인 필요 |
| **SSE 엔드포인트** | ❌ 미완료 | 1순위 | `/api/monitor/metrics-stream` 개발 필요 |
| **시각화 컴포넌트** | ⚠️ 부분 완료 | 2순위 | recharts/plotly 기존 사용, 추가 커스터마이징 필요 |
| **RPC 함수 (fn_*)** | ❌ 미완료 | 1순위 | `fn_api_response_stats`, `fn_suspicious_ips` 등 4개 |

### 9.2 운영 선결조건

| 항목 | 대안 | 우선순위 |
|---|---|---|
| **Telegram 알림 채널** | 기존 `/admin/alerts` 활용 가능 | 2순위 |
| **알림 임계치 설정 UI** | 하드코딩 후 나중에 DB화 | 3순위 |
| **관리자 권한 검증** | 기존 `isAdmin()` 재사용 | 완료 ✅ |

### 9.3 설계 의사결정 대기

| 항목 | 선택지 | 추천 | 확정 필요 |
|---|---|---|---|
| **메트릭 저장 정책** | a) 전체 저장 b) 샘플링 10% | b) 비용/성능 균형 | ❓ |
| **메트릭 보존 기간** | a) 7일 b) 30일 | a) 비용 절감 | ❓ |
| **실시간 갱신 주기** | a) 1초 b) 5초 | a) UX 우선 | ❓ |
| **Supabase Pro 전환 시점** | 커넥션 limit 도달 시 | 사용량 추적 | ❓ |

---

## 10. 성공 기준

### 10.1 MVP 완성도

| 체크항목 | 기준 | 상태 |
|---|---|---|
| **화면 진입 가능** | /admin/monitor 정상 진입 | ❌ |
| **4대 카드 정상 표시** | 모든 메트릭 값 로드 | ❌ |
| **실시간 갱신** | 1초마다 SSE 업데이트 | ❌ |
| **Pi 결제 성공률** | 🟢 / 🟡 / 🔴 신호등 작동 | ❌ |
| **경고 배너** | 임계치 초과 시 표시 | ❌ |
| **데이터 일관성** | Vercel·Supabase·앱 메트릭 오차 < 5% | ❌ |

### 10.2 운영 기준

| 항목 | 목표 | 측정 방법 |
|---|---|---|
| **알림 응답 시간** | 문제 발생 후 1분 이내 대시보드 표시 | 테스트 시뮬레이션 |
| **관리자 이해도** | 아나킨이 모든 지표 의미 파악 | 사용성 인터뷰 |
| **거짓 양성 (false positive)** | 임계치 오경보 < 5% | 1주간 모니터링 |

---

## 11. 참고자료 & 용어 정의

### 11.1 용어

| 용어 | 정의 | 예시 |
|---|---|---|
| **p50, p95, p99** | 응답시간의 백분위수 | 95% 사용자가 800ms 이내 응답 받음 |
| **에러율** | (4xx + 5xx 응답) / 전체 응답 × 100% | 1시간에 1000개 요청 중 10개 에러 = 1% |
| **콜드스타트** | Vercel Function 초기 로드 지연 | 함수 시작 후 첫 요청은 +200ms |
| **풀스캔** | DB 전체 테이블 스캔 (인덱스 미사용) | pg_trgm 인덱스 없으면 username 검색 느림 |
| **DDoS** | 비정상적 대량 트래픽 공격 | 같은 IP에서 분당 1000개 요청 |
| **rate-limit** | API 호출 제한 정책 | 사용자당 분당 10회 이상 호출 차단 |

### 11.2 참고 문서

- [Vercel Analytics API](https://vercel.com/docs/analytics)
- [Supabase PostgreSQL Stats](https://supabase.com/docs/guides/database/postgres/getting-started)
- [Next.js Monitoring](https://nextjs.org/docs/app/building-your-application/optimizing/monitoring)
- [cafe.pi 성능 최적화 (PRD_18_PERFORM.md)](./PRD_18_PERFORM.md)
- [cafe.pi 보안 (PRD_2_SECURITY.md)](./PRD_2_SECURITY.md)

---

## 12. 변경 이력

| 버전 | 날짜 | 변경사항 | 작성자 |
|---|---|---|---|
| v1.0 | 2026-06-25 | 초안 작성 (MVP 스펙) | 아소카 |

---

**문서 끝**
