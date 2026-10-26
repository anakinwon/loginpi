// 미디어 입장권 발급 — POST {room, cap:'present'|'watch'} → {ticket, wsUrl}. 로그인 필수(쿠키 OR X-Pi-Token, null 이면 401 — redirect 금지).
// cap=present 는 관리자만 [TBD : 개최자 권한은 F-02 이후]. 결제 확인은 F-04 에서 이 자리에 연결.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { getSessionUser, isAdmin } from '@/lib/auth'
import { signMediaTicket } from '@/lib/media-ticket'

const Body = z.object({
  room: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  cap: z.enum(['present', 'watch']),
})

const noStore = { 'Cache-Control': 'no-store' }

export const POST = withAuthGuard(async (req) => {
  // 서로 의존 없는 세션 확인·본문 파싱은 병렬(R-P1)
  const [user, raw] = await Promise.all([
    getSessionUser(req),
    req.json().catch(() => null),
  ])
  if (!user)
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: noStore },
    )
  const parsed = Body.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'bad_request' },
      { status: 400, headers: noStore },
    )
  const { room, cap } = parsed.data
  if (cap === 'present' && !isAdmin(user))
    return NextResponse.json(
      { error: 'forbidden' },
      { status: 403, headers: noStore },
    )

  // TODO F-04 : 결제 확인 훅 자리 — cap=watch 는 해당 방(세미나) 결제 완료 사용자만 발급. 결제 기능 생기면 여기서 확인 후 402/403.

  const wsUrl = process.env.NEXT_PUBLIC_MEDIA_WS_URL
  const ticket = signMediaTicket({
    room,
    sub: user.id,
    name: user.display_name || user.pi_username || '',
    role: cap === 'present' ? 'presenter' : 'audience',
  })
  // wsUrl 은 참고값 — 시험 단계는 화면에서 엔진 주소(임시 터널)를 직접 넣으므로 없어도 발급
  if (!ticket)
    return NextResponse.json(
      { error: 'media_unavailable' },
      { status: 503, headers: noStore },
    )
  return NextResponse.json({ ticket, wsUrl: wsUrl ?? null }, { headers: noStore })
})
