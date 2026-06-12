import { createHmac } from 'crypto'
import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'

// POST /api/voice/turn-credentials
// Pi 토큰 검증 후 TTL 짧은 TURN 임시 자격증명 반환.
// HMAC-SHA256 패턴: username=expiry:userId, credential=HMAC(TURN_SECRET, username)
// coturn REST API 및 Metered 관리형 서비스 모두 이 패턴을 지원.
export async function POST() {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const host = process.env.TURN_HOST
  const secret = process.env.TURN_SECRET
  const ttl = Number(process.env.TURN_CREDENTIAL_TTL ?? 3600)

  // TURN 미설정 시 폴백: STUN + 무료 공개 TURN(Metered Open Relay).
  // ⚠️ 공개 무료 TURN은 임시·검증용 — 음성은 DTLS-SRTP로 암호화 중계되나(내용 비노출),
  //    신뢰성·대역폭 무보장. 운영은 TURN_HOST/TURN_SECRET(전용 coturn·관리형)으로 오버라이드.
  //    모바일 CGNAT(대칭 NAT) 환경에서는 relay가 유일한 연결 경로라 STUN만으로는 음성 전달 불가.
  if (!host || !secret) {
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
