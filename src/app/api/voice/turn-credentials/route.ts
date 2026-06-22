import { createHmac } from 'crypto'
import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'

// POST /api/voice/turn-credentials
// Pi 토큰 검증 후 TTL 짧은 TURN 임시 자격증명 반환.
// 우선순위: ① Cloudflare Realtime TURN(운영 권장) → ② HMAC(자체 coturn·Metered) → ③ 무료 공개 TURN(검증용).
// 영구 비밀(Cloudflare API 토큰·TURN_SECRET)은 서버에만 머물고, 클라이언트엔 단기 자격증명만 내려간다.

// Cloudflare generate-ice-servers 응답 형태 (DOM RTCIceServer와 동형)
interface IceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

export async function POST() {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const ttl = Number(process.env.TURN_CREDENTIAL_TTL ?? 3600)

  // ── 1순위: Cloudflare Realtime TURN (운영 권장 — 무료 1TB/월, 신뢰성 최상) ──
  // 서버가 Cloudflare API를 호출해 TTL 짧은 username/credential을 발급받아 그대로 중계.
  // generate-ice-servers는 iceServers를 배열로 반환 → 클라이언트 포맷과 동일(자체 STUN 포함).
  const cfKeyId = process.env.CLOUDFLARE_TURN_TOKEN_ID
  const cfApiToken = process.env.CLOUDFLARE_TURN_API_TOKEN
  if (cfKeyId && cfApiToken) {
    try {
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${cfKeyId}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfApiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl }),
          // 통화 입장 흐름이 멈추지 않도록 4초 타임아웃 — 초과 시 폴백 경로로 우회
          signal: AbortSignal.timeout(4000),
        },
      )
      if (res.ok) {
        const data = (await res.json()) as { iceServers: IceServer[] }
        return NextResponse.json({ iceServers: data.iceServers, ttlSec: ttl })
      }
      // 인증 실패·쿼터 초과 등 — 조용히 죽이지 않고 로그로 흔적을 남긴 뒤
      // 아래 경로로 우아하게 폴백 (통화 가용성 우선)
      console.error(
        `[turn-credentials] Cloudflare TURN 발급 실패 (HTTP ${res.status}) — 폴백 경로 사용`,
      )
    } catch (e) {
      console.error(
        '[turn-credentials] Cloudflare TURN 요청 오류 — 폴백 경로 사용',
        e,
      )
    }
  }

  // ── 2순위: HMAC 자격증명 (자체 coturn·Metered 등 use-auth-secret 호환) ──
  // HMAC-SHA256 패턴: username=expiry:userId, credential=HMAC(TURN_SECRET, username)
  const host = process.env.TURN_HOST
  const secret = process.env.TURN_SECRET
  if (host && secret) {
    const expiry = Math.floor(Date.now() / 1000) + ttl
    const username = `${expiry}:${user.id}`
    const credential = createHmac('sha256', secret)
      .update(username)
      .digest('base64')

    return NextResponse.json({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: [
            `turn:${host}:3478?transport=udp`,
            `turn:${host}:3478?transport=tcp`,
            `turns:${host}:443?transport=tcp`,
          ],
          username,
          credential,
        },
      ],
      ttlSec: ttl,
    })
  }

  // ── 3순위: 무료 공개 TURN 폴백 (개발·검증 전용) ──
  // ⚠️ 공개 무료 TURN은 임시·검증용 — 음성은 DTLS-SRTP로 암호화 중계되나(내용 비노출),
  //    신뢰성·대역폭 무보장. 운영은 위 1~2순위(Cloudflare 또는 전용 coturn)로 설정.
  //    모바일 CGNAT(대칭 NAT) 환경에서는 relay가 유일한 연결 경로라 STUN만으로는 음성 전달 불가.
  return NextResponse.json({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun.relay.metered.ca:80' },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turns:openrelay.metered.ca:443?transport=tcp',
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ],
    ttlSec: 0,
  })
}
