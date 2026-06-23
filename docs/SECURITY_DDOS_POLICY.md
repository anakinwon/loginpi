# cafe.pi DDoS 방어 정책

> 최종 수정: 2026-06-23 | 담당: 아나킨 마스터 · 아소카  
> 배포 환경: Vercel Pro + Supabase + Pi Browser (Pi Network)

---

## 1. 공격 유형별 책임 계층

```
[인터넷]
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│  계층 1: Vercel Anycast 네트워크 (자동 방어)              │
│  • L3/L4 볼류메트릭 공격 (UDP flood, SYN flood, ICMP)   │
│  • 전 세계 PoP 분산 흡수 → cafe.pi 코드 무관             │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  계층 2: Vercel Firewall (Pro 플랜 — 대시보드 설정)      │
│  • IP 기반 rate limiting (edge에서 차단 → 비용 0)        │
│  • BotID: 알려진 봇 네트워크 차단                        │
│  • Geo-blocking (필요 시 특정 국가 차단)                 │
│  → 설정 위치: Vercel 대시보드 > Firewall                 │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  계층 3: Next.js Middleware (src/middleware.ts)          │
│  • 악성 User-Agent 즉시 차단 (403)                       │
│  • 페이지 라우트 rate limiting (IP 기반)                 │
│  • 보안 헤더 전 응답에 부착                              │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  계층 4: API Guard (src/lib/api-guard.ts)               │
│  • withGuard() / withAuthGuard() 래퍼                    │
│  • 엔드포인트별 rate limiting                            │
│  • Content-Length 초과 차단 (413)                        │
│  • Cross-origin 인증 차단                                │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  계층 5: Supabase (DB 보호)                             │
│  • 연결 풀 상한: Supabase 대시보드 설정                  │
│  • Statement timeout (현재 미설정 → 설정 권고)           │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Rate Limiting 정책표

| 엔드포인트 그룹 | 윈도우 | 허용 요청 수 | 차단 유지 | 적용 래퍼 |
|---|---|---|---|---|
| `/api/auth/**` | 60초 | 8건 | **5분** | `withAuthGuard` |
| `/api/payments/**`, `/api/tips/**` | 60초 | 12건 | **3분** | `withGuard` |
| `/api/admin/**` | 60초 | 40건 | 1분 | `withGuard` |
| `/api/campaign/**` | 60초 | 20건 | 2분 | `withGuard` |
| `/api/chat/**` | 60초 | 30건 | 1분 | `withGuard` |
| `/api/**` (기타) | 60초 | 60건 | 30초 | `withGuard` |
| 페이지 라우트 | 60초 | 120건 | 10초 | middleware |

> **Pi Browser 사용자 주의**: rate limit은 IP 기반. Pi Browser 공용 IP(NAT)에서 여러 사용자가 접속 시 공유 한도 적용. 차단 응답(429)에 `Retry-After` 헤더 포함.

---

## 3. 즉시 차단 목록 (403 응답)

### 3-1. 악성 User-Agent (src/lib/ddos-guard.ts `BOT_BLOCKLIST`)
| 패턴 | 설명 |
|---|---|
| `sqlmap` | SQL 인젝션 자동화 도구 |
| `nikto` | 웹 취약점 스캐너 |
| `havij` | SQL 인젝션 도구 |
| `masscan` | 포트 스캐너 |
| `zgrab` | TLS 스캐너 |
| `nuclei` | 취약점 스캐너 |
| `python-httpx/\d` | Raw Python HTTP 클라이언트 |
| `Go-http-client/1.1` | Go 기본 HTTP 클라이언트 |
| 구형 `curl/[0-6].*` | 자동화 공격 징조 |

### 3-2. 페이로드 크기 초과 (413 응답)
| 엔드포인트 | 최대 크기 |
|---|---|
| `/api/auth/pi` | 4KB |
| `/api/payments/**` | 8KB |
| `/api/board/**` | 100KB (파일 첨부) |
| 나머지 API | 64KB |

### 3-3. Cross-origin 인증 시도
`/api/auth/pi`에서 `Origin` 헤더가 자사 도메인이 아닌 경우 → 403 `cross_origin_auth`

---

## 4. 보안 헤더 정책

모든 응답에 자동 부착 (vercel.json + middleware 이중 적용):

| 헤더 | 값 | 목적 |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | HTTPS 강제 2년 |
| `X-Content-Type-Options` | `nosniff` | MIME 스니핑 방지 |
| `X-Frame-Options` | `SAMEORIGIN` | Clickjacking 방지 |
| `X-XSS-Protection` | `1; mode=block` | 구형 브라우저 XSS |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | 레퍼러 정보 최소화 |
| `Permissions-Policy` | `camera=(), microphone=(self)` | 불필요한 권한 차단 |
| `Content-Security-Policy` | (아래 상세) | XSS·인젝션 방지 |
| `X-Robots-Tag` | `noindex` (API만) | API 크롤링 방지 |
| `Cache-Control` | `no-store` (API만) | 민감 데이터 캐시 방지 |

**CSP 상세** (Pi Browser SDK 허용 포함):
```
default-src 'self'
script-src 'self' 'unsafe-inline' 'unsafe-eval' *.minepi.com cdn.jsdelivr.net
connect-src 'self' *.minepi.com *.supabase.co wss://*.supabase.co
img-src 'self' data: blob: *.supabase.co
frame-src 'self' *.minepi.com
```

---

## 5. Pi Browser 특수 고려사항

```
일반 DDoS 방어: IP 차단 → 끝
cafe.pi: IP 차단 → Pi Browser NAT 공유 IP → 정상 사용자 피해 가능
```

**대응 정책:**
1. 차단 시 즉시 영구 차단이 아닌 **시간제 차단** (5분~최대 30분)
2. 인증 토큰(`X-Pi-Token`) 보유 요청은 rate limit 완화 검토 (향후)
3. 429 응답에 반드시 `Retry-After` 초 단위 포함
4. Pi Network 공식 IP 대역은 whitelist 검토 (Pi 공식 발표 시)

---

## 6. Vercel 대시보드 수동 설정 (필수)

> 코드로 자동화 불가 — 아나킨 마스터 직접 설정 필요

### 6-1. Vercel Firewall 활성화
```
Vercel 대시보드 → [프로젝트] → Security → Firewall
→ Enable WAF (Pro 플랜 포함)
```

### 6-2. 권장 Firewall 규칙
| 규칙명 | 조건 | 동작 |
|---|---|---|
| Block scanner paths | 경로: `/.env`, `/.git/**`, `/wp-admin/**`, `/phpMyAdmin/**` | DENY |
| Rate limit auth | 경로: `/api/auth/*` + 1분 > 10회 | CHALLENGE |
| Block no-UA | User-Agent 없음 + 경로 `/api/**` | DENY |
| Geo challenge | (옵션) 특정 고위험 국가 | CHALLENGE |

### 6-3. Vercel BotID 활성화
```
Vercel 대시보드 → Security → Bot Protection → Enable
(2025-06 GA, Pro 플랜 포함)
```

### 6-4. Supabase Statement Timeout 설정
```sql
-- Supabase SQL Editor에서 실행
ALTER DATABASE postgres SET statement_timeout = '30s';
ALTER DATABASE postgres SET idle_in_transaction_session_timeout = '10s';
```

---

## 7. 분산 Rate Limiting 업그레이드 (권고)

현재 구현(메모리 기반)은 단일 Vercel 인스턴스 내에서만 동작합니다.  
트래픽 급증 시 Upstash Redis 기반으로 교체 권장:

```bash
# Vercel Marketplace에서 Upstash Redis 추가
# → 자동으로 UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN 환경변수 주입
pnpm add @upstash/ratelimit @upstash/redis
```

```typescript
// src/lib/ddos-guard.ts 교체 시 핵심 변경점
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(60, '60 s'),
  analytics: true, // Upstash 대시보드에서 rate limit 패턴 시각화
})
```

업그레이드 후 `src/env.ts`에 추가:
```typescript
UPSTASH_REDIS_REST_URL: z.string().url().optional(),
UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
```

---

## 8. 공격 감지 및 대응 절차

### 8-1. 공격 징후
- Vercel Analytics: 요청 수 급증 (평소 대비 5배 이상)
- 특정 엔드포인트 429 응답 급증
- Supabase: connection pool 포화 (오류 로그)
- 결제 API 이상 반복 호출

### 8-2. 대응 절차
```
1. 확인 (5분): Vercel 대시보드 → Analytics → 이상 IP 식별
2. 즉시 차단 (10분): Vercel Firewall → IP 추가 차단
3. 임시 강화 (30분): RATE_POLICY 한도 낮춤 → 배포
4. 수사 (1시간): 공격 패턴 분석, 에스컬레이션 여부 결정
5. 복구 후 조치 (24시간): 정책 조정, 재발 방지 문서화
```

### 8-3. 비상 연락처
| 상황 | 경로 |
|---|---|
| DDoS 지속 (> 1시간) | Vercel Support (Pro 우선 대응) |
| DB 침해 의심 | Supabase Dashboard → Pause project |
| Pi 결제 이상 | Pi Developer Portal → 앱 일시 중단 |

---

## 9. 정기 점검 체크리스트

### 월 1회
- [ ] `pnpm audit` 실행 → 취약 패키지 업데이트
- [ ] Vercel Analytics 이상 트래픽 패턴 검토
- [ ] 429 응답 비율 5% 미만 유지 확인

### 분기 1회
- [ ] rate limit 임계값 현실 트래픽 기준 재조정
- [ ] BOT_BLOCKLIST 최신 공격 도구 추가
- [ ] Vercel Firewall 규칙 효과 검토
- [ ] KISA 가이드 업데이트 확인

### 변경 시마다
- [ ] 신규 API 라우트에 `withGuard()` 적용 여부 확인
- [ ] Content-Security-Policy 신규 외부 도메인 허용 여부 검토
- [ ] Vercel Pro 플랜 보안 기능 신규 출시 확인

---

*이 정책은 `docs/PRD_2_SECURITY.md`와 연계 운영. 충돌 시 이 문서 우선.*
