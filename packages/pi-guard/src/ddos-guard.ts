// @pi/guard — DDoS 가드 코어(rate limit·IP 추출·악성 UA·보안 헤더). Edge/Node 런타임 호환(Node API 미사용).
// 출처: cafe.pi src/lib/ddos-guard.ts 복사 추출(PRD_28 §4). 사용처: 사이트 proxy(페이지)·api-guard(API).
import { NextRequest, NextResponse } from 'next/server'

// Vercel 서버리스는 인스턴스 간 메모리를 공유하지 않으므로 이 모듈의 Map은 단일 인스턴스 단기 캐시다.
// ponytail: 인스턴스 로컬 버킷 — 분산 rate limiting이 필요하면 Upstash Redis(@upstash/ratelimit)로 교체

// ── 엔드포인트 그룹별 rate limit 정책 ─────────────────────────────────────
// window: 슬라이딩 윈도우 초 단위 | limit: 요청 허용 수 | blockMs: 차단 유지 ms
export const RATE_POLICY = {
  AUTH: { window: 60, limit: 8, blockMs: 300_000 }, // /api/auth/** 5분 차단
  PAYMENT: { window: 60, limit: 12, blockMs: 180_000 }, // /api/payments/** 3분 차단
  ADMIN: { window: 60, limit: 40, blockMs: 60_000 }, // /api/admin/** 1분 차단
  API_GENERAL: { window: 60, limit: 60, blockMs: 30_000 }, // 나머지 API
  PAGE: { window: 60, limit: 120, blockMs: 10_000 }, // 페이지 요청
} as const

export type PolicyKey = keyof typeof RATE_POLICY

interface Bucket {
  count: number
  windowStart: number
  blockedUntil: number
}

const buckets = new Map<string, Bucket>()

// 메모리 누수 방지: 10분마다 만료 버킷 정리
const CLEANUP_INTERVAL_MS = 600_000
let lastCleanup = Date.now()

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  for (const [key, b] of buckets) {
    if (now > b.blockedUntil && now - b.windowStart > 120_000)
      buckets.delete(key)
  }
  lastCleanup = now
}

export function checkRateLimit(
  ip: string,
  policy: PolicyKey,
): { allowed: boolean; remaining: number; retryAfter: number } {
  const now = Date.now()
  cleanup(now)

  const p = RATE_POLICY[policy]
  const key = `${policy}:${ip}`
  const bucket = buckets.get(key) ?? {
    count: 0,
    windowStart: now,
    blockedUntil: 0,
  }

  if (now < bucket.blockedUntil) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((bucket.blockedUntil - now) / 1000),
    }
  }

  if (now - bucket.windowStart > p.window * 1000) {
    bucket.count = 0
    bucket.windowStart = now
    bucket.blockedUntil = 0
  }

  bucket.count++
  buckets.set(key, bucket)

  if (bucket.count > p.limit) {
    bucket.blockedUntil = now + p.blockMs
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil(p.blockMs / 1000),
    }
  }

  return { allowed: true, remaining: p.limit - bucket.count, retryAfter: 0 }
}

// IP 추출 우선순위: req.ip(Edge) > x-real-ip(Vercel override) > x-forwarded-for 마지막 항목
// x-forwarded-for 첫 항목은 클라이언트 위조 가능 → Vercel이 끝에 append한 마지막 항목만 신뢰
export function getClientIp(req: NextRequest): string {
  const edgeIp = (req as NextRequest & { ip?: string }).ip
  if (edgeIp) return edgeIp

  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const last = forwarded.split(',').at(-1)?.trim()
    if (last) return last
  }

  return 'unknown'
}

export function getPolicyForPath(pathname: string): PolicyKey {
  if (pathname.startsWith('/api/auth/')) return 'AUTH'
  if (pathname.startsWith('/api/payments/')) return 'PAYMENT'
  if (pathname.startsWith('/api/admin/')) return 'ADMIN'
  if (pathname.startsWith('/api/')) return 'API_GENERAL'
  return 'PAGE'
}

// 알려진 공격 도구 UA 목록 — Pi Browser 판정 용도가 아니다(UA 판정 금지 철칙과 무관한 봇 차단 전용)
const BOT_BLOCKLIST = [
  /sqlmap/i,
  /nikto/i,
  /havij/i,
  /masscan/i,
  /zgrab/i,
  /nuclei/i,
  /python-httpx\/\d/i,
  /curl\/[0-6]\./i,
  /Go-http-client\/1\.1/i,
]

export function isMaliciousAgent(ua: string | null): boolean {
  if (!ua) return false // UA 없음 차단은 과도(서버-투-서버 등)
  return BOT_BLOCKLIST.some((re) => re.test(ua))
}

// 공통 보안 헤더.
// ⚠️ CSP·X-Frame-Options·frame-ancestors 미설정 — Pi Browser WebView의 SDK 브릿지·임베드 부모 origin이
//    허용 목록에서 빠지면 로그인이 막힌다(핵심 가치 위반). 복원은 실기기에서 부모 origin 확인 후에만.
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self)',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
}

export function applySecurityHeaders(res: Response): void {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v)
}

export function rateLimitedResponse(retryAfter: number): NextResponse {
  return new NextResponse(
    JSON.stringify({ error: 'too_many_requests', retryAfter }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': '0',
        ...SECURITY_HEADERS,
      },
    },
  )
}

export function forbiddenResponse(reason: string): NextResponse {
  return new NextResponse(JSON.stringify({ error: 'forbidden', reason }), {
    status: 403,
    headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS },
  })
}
