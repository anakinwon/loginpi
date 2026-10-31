// TURN 단기 자격 증명 발급 — POST → {iceServers, ttl}. 로그인 필수(쿠키 OR X-Pi-Token, null 이면 401 — redirect 금지). cafe.pi /api/voice/turn-credentials 이식(M2 ⑨).
// 우선순위 : ① Cloudflare Realtime TURN(서버 키로 단기 발급, 2초 타임아웃·짧은 캐시) → ② HMAC(coturn use-auth-secret·Metered, 만료 시각 붙은 username) → ③ STUN 만.
// 영구 비밀(CLOUDFLARE_TURN_API_TOKEN·TURN_SECRET)은 서버에만 머물고 클라이언트엔 단기 자격 증명만 내려간다.
import { createHmac } from 'crypto'
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { getSessionUser } from '@/lib/auth'

interface IceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

const noStore = { 'Cache-Control': 'no-store' }
const STUN: IceServer = { urls: 'stun:stun.l.google.com:19302' }
// Cloudflare 응답 캐시 상한 — 발급분은 사용자에 묶이지 않아 짧게 공유(R-P4)
const CF_CACHE_MAX_SEC = 300
const CF_TIMEOUT_MS = 2000

// ponytail: 인스턴스별 모듈 캐시 — 서버리스 인스턴스 간 공유 안 됨, 발급 쿼터가 문제 되면 KV 로
let cfCache: { iceServers: IceServer[]; expiresAt: number; credUntil: number } | null = null

// TTL 60초~24시간으로 제한(잘못된 env 로 무기한 자격 증명이 나가지 않게)
function ttlSec() {
  const n = Number(process.env.TURN_CREDENTIAL_TTL ?? 3600)
  return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 60), 86400) : 3600
}

// 반환 ttl = 자격 증명의 남은 수명(캐시 재사용분은 발급 시점부터 줄어 있다)
async function cloudflareIce(
  ttl: number,
): Promise<{ iceServers: IceServer[]; ttl: number } | null> {
  const keyId = process.env.CLOUDFLARE_TURN_TOKEN_ID
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN
  if (!keyId || !apiToken) return null
  const now = Date.now()
  if (cfCache && cfCache.expiresAt > now)
    return {
      iceServers: cfCache.iceServers,
      ttl: Math.floor((cfCache.credUntil - now) / 1000),
    }
  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl }),
        signal: AbortSignal.timeout(CF_TIMEOUT_MS),
        cache: 'no-store',
      },
    )
    if (!res.ok) {
      // 인증 실패·쿼터 초과 — 흔적만 남기고 다음 경로로(입장 흐름 우선)
      console.error(`[media/turn] Cloudflare 발급 실패 HTTP ${res.status} — 폴백`)
      return null
    }
    const data = (await res.json()) as { iceServers?: IceServer[] }
    if (!Array.isArray(data.iceServers) || data.iceServers.length === 0) return null
    // 남은 수명이 넉넉할 때만 재사용 — 캐시 기간은 TTL 절반과 상한 중 작은 값
    cfCache = {
      iceServers: data.iceServers,
      expiresAt: now + Math.min(ttl / 2, CF_CACHE_MAX_SEC) * 1000,
      credUntil: now + ttl * 1000,
    }
    return { iceServers: data.iceServers, ttl }
  } catch (e) {
    console.error('[media/turn] Cloudflare 요청 오류 — 폴백', e)
    return null
  }
}

// coturn use-auth-secret 규약 : username = 만료epoch:사용자, credential = base64(HMAC-SHA1(secret, username)).
// cafe.pi 는 SHA-256 을 쓰지만 coturn 기본(REST API 초안)은 SHA-1 — 운영 coturn(media/scripts/vps-turn-setup.sh) 과 일치 확인(2026-10-31 relay 실증)
// 만료는 TTL 칸 경계로 맞춘다(같은 칸 안의 재요청 = 같은 username) — coturn user-quota 가 username 단위라, 매번 새 만료를 쓰면
//  재요청만으로 사용자당 할당 상한을 비껴간다(보안 검토 2026-10-31). 실제 유효 기간은 ttl 이상 2·ttl 미만, 클라이언트엔 보수적으로 ttl 을 알린다
function hmacIce(ttl: number, userId: string): IceServer[] | null {
  const host = process.env.TURN_HOST
  const secret = process.env.TURN_SECRET
  if (!host || !secret) return null
  const username = `${(Math.floor(Date.now() / 1000 / ttl) + 2) * ttl}:${userId}`
  const credential = createHmac('sha1', secret).update(username).digest('base64')
  return [
    STUN,
    {
      urls: [
        `turn:${host}:3478?transport=udp`,
        `turn:${host}:3478?transport=tcp`,
        `turns:${host}:443?transport=tcp`,
      ],
      username,
      credential,
    },
  ]
}

export const POST = withAuthGuard(async (req) => {
  const user = await getSessionUser(req)
  if (!user)
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: noStore },
    )
  const ttl = ttlSec()

  const cf = await cloudflareIce(ttl)
  if (cf) return NextResponse.json(cf, { headers: noStore })

  const hm = hmacIce(ttl, user.id)
  if (hm) return NextResponse.json({ iceServers: hm, ttl }, { headers: noStore })

  // TURN 미설정 — STUN 만(대칭 NAT·CGNAT 에선 연결 안 될 수 있음, ttl 0 = 자격 증명 없음)
  return NextResponse.json({ iceServers: [STUN], ttl: 0 }, { headers: noStore })
})
