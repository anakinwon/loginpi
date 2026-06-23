import { NextRequest, NextResponse } from 'next/server'

// ────────────────────────────────────────────────────────────────────────────
// cafe.pi DDoS Guard  (Edge Runtime 호환 — Node.js API 미사용)
//
// Vercel 서버리스는 인스턴스 간 메모리를 공유하지 않으므로
// 이 모듈의 Map은 단일 인스턴스 내 단기 캐시 역할만 한다.
// 분산 rate limiting이 필요하면 Upstash Redis(@upstash/ratelimit)로 교체.
//
// 사용처: src/middleware.ts (페이지 라우트용) +
//         src/lib/api-guard.ts 에서 래핑해 API 라우트에 적용
// ────────────────────────────────────────────────────────────────────────────

// ── 엔드포인트 그룹별 rate limit 정책 ─────────────────────────────────────
// window: 슬라이딩 윈도우 초 단위 | limit: 요청 허용 수 | blockMs: 차단 유지 ms
export const RATE_POLICY = {
  AUTH: { window: 60, limit: 8, blockMs: 300_000 }, // /api/auth/** 5분 차단
  PAYMENT: { window: 60, limit: 12, blockMs: 180_000 }, // /api/payments/** 3분 차단
  ADMIN: { window: 60, limit: 40, blockMs: 60_000 }, // /api/admin/** 1분 차단
  CAMPAIGN: { window: 60, limit: 20, blockMs: 120_000 }, // /api/campaign/** 2분 차단
  CHAT: { window: 60, limit: 30, blockMs: 60_000 }, // /api/chat/**
  API_GENERAL: { window: 60, limit: 60, blockMs: 30_000 }, // 나머지 API
  PAGE: { window: 60, limit: 120, blockMs: 10_000 }, // 페이지 요청
} as const

type PolicyKey = keyof typeof RATE_POLICY

interface Bucket {
  count: number
  windowStart: number
  blockedUntil: number
}

// 단일 인스턴스 캐시 (분산 환경에서는 Upstash로 교체)
const buckets = new Map<string, Bucket>()

// 메모리 누수 방지: 10분마다 만료 버킷 정리
const CLEANUP_INTERVAL_MS = 600_000
let lastCleanup = Date.now()

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  for (const [key, b] of buckets) {
    if (now > b.blockedUntil && now - b.windowStart > 120_000) buckets.delete(key)
  }
  lastCleanup = now
}

// ── 핵심 rate limit 함수 ────────────────────────────────────────────────────
export function checkRateLimit(
  ip: string,
  policy: PolicyKey,
): { allowed: boolean; remaining: number; retryAfter: number } {
  const now = Date.now()
  cleanup(now)

  const p = RATE_POLICY[policy]
  const key = `${policy}:${ip}`
  const bucket = buckets.get(key) ?? { count: 0, windowStart: now, blockedUntil: 0 }

  // 차단 중
  if (now < bucket.blockedUntil) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((bucket.blockedUntil - now) / 1000) }
  }

  // 윈도우 만료 → 리셋
  if (now - bucket.windowStart > p.window * 1000) {
    bucket.count = 0
    bucket.windowStart = now
    bucket.blockedUntil = 0
  }

  bucket.count++
  buckets.set(key, bucket)

  if (bucket.count > p.limit) {
    bucket.blockedUntil = now + p.blockMs
    return { allowed: false, remaining: 0, retryAfter: Math.ceil(p.blockMs / 1000) }
  }

  return { allowed: true, remaining: p.limit - bucket.count, retryAfter: 0 }
}

// ── IP 추출 (Vercel edge 환경) ───────────────────────────────────────────────
// 우선순위: req.ip(Edge) > x-real-ip(Vercel이 override) > x-forwarded-for 마지막 항목
// x-forwarded-for 첫 번째 항목은 클라이언트가 위조 가능 (rate limit bypass 위험)
// → Vercel은 실제 클라이언트 IP를 맨 뒤에 append하므로 마지막 항목이 신뢰 가능
export function getClientIp(req: NextRequest): string {
  // 1) Edge runtime: Vercel이 주입한 값
  const edgeIp = (req as NextRequest & { ip?: string }).ip
  if (edgeIp) return edgeIp

  // 2) x-real-ip: Vercel Serverless가 클라이언트 원래 IP로 설정 (위조 불가)
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  // 3) x-forwarded-for: Vercel이 끝에 append — 마지막 항목이 실제 IP
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const last = forwarded.split(',').at(-1)?.trim()
    if (last) return last
  }

  return 'unknown'
}

// ── 경로 → 정책 매핑 ────────────────────────────────────────────────────────
export function getPolicyForPath(pathname: string): PolicyKey {
  if (pathname.startsWith('/api/auth/')) return 'AUTH'
  if (pathname.startsWith('/api/payments/') || pathname.startsWith('/api/tips/')) return 'PAYMENT'
  if (pathname.startsWith('/api/admin/')) return 'ADMIN'
  if (pathname.startsWith('/api/campaign/')) return 'CAMPAIGN'
  if (pathname.startsWith('/api/chat/')) return 'CHAT'
  if (pathname.startsWith('/api/')) return 'API_GENERAL'
  return 'PAGE'
}

// ── 의심 봇 User-Agent 목록 (알려진 공격 도구) ──────────────────────────────
const BOT_BLOCKLIST = [
  /sqlmap/i,
  /nikto/i,
  /havij/i,
  /masscan/i,
  /zgrab/i,
  /nuclei/i, // scanner
  /python-httpx\/\d/i, // raw Python(정상 SDK는 User-Agent 명시)
  /curl\/[0-6]\./i, // 구형 curl (자동화 공격 징조)
  /Go-http-client\/1\.1/i, // Go http 기본 클라이언트
]

export function isMaliciousAgent(ua: string | null): boolean {
  if (!ua) return false // Pi Browser는 UA 있음 — null만 차단하면 과도
  return BOT_BLOCKLIST.some((re) => re.test(ua))
}

// ── 공통 보안 헤더 ─────────────────────────────────────────────────────────
// ⚠️ CSP 제거 이유:
//   Pi Browser WebView는 네이티브 SDK 브릿지 + Google OAuth CDN 등 다양한 외부 출처를 사용.
//   CSP를 페이지 레벨에 적용하면 Pi SDK 로딩·connect-src 미등록 엔드포인트가 차단되어
//   Pi Browser에서 로그인 불가(핵심 제약 위반) — vercel.json에서도 CSP 미설정.
//   대신 rate limiting·input sanitize·withGuard 3중 방어로 XSS/인젝션 방어.
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self)',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
}

// ── DDoS 차단 응답 생성 ─────────────────────────────────────────────────────
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
  return new NextResponse(
    JSON.stringify({ error: 'forbidden', reason }),
    {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS },
    },
  )
}
