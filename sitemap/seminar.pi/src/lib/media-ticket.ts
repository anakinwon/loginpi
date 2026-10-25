// 미디어 엔진(Galápagos) 입장권 발급 — JWT HS256(MEDIA_TOKEN_SECRET), 수명 60초·jti 128비트 일회용·aud "seminar-media"(PRD_02 5.3·D-11).
// 클레임 이름은 엔진 media/internal/signal/ticket.go Ticket 과 같아야 한다. 수명·일회용 정책은 C-8 마스터 승인 대기.
import 'server-only'
import { createHmac, randomBytes } from 'node:crypto'

export const MEDIA_AUDIENCE = 'seminar-media'
export const MEDIA_TICKET_TTL_SEC = 60 // C-8 승인 대기
export const DEFAULT_ROOM_CAP = 31 // 발표 1 + 청중 30 [TBD : 방 설정은 F-02 이후 DB 에서]

export type MediaRole = 'presenter' | 'panel' | 'audience'

export interface MediaTicketInput {
  room: string
  sub: string // sys_user.usr_id
  name: string
  role: MediaRole
  cap?: number
  end?: number // 방 종료 시각(유닉스 초, 선택)
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url')
const HEADER = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))

// 서명 키 미설정(32자 미만)이면 null — 호출자가 503 으로 응답
export function signMediaTicket(
  input: MediaTicketInput,
  now = Date.now(),
): string | null {
  const secret = process.env.MEDIA_TOKEN_SECRET
  if (!secret || secret.length < 32) return null
  const iat = Math.floor(now / 1000)
  const claims = {
    aud: MEDIA_AUDIENCE,
    room: input.room,
    sub: input.sub,
    name: input.name,
    role: input.role,
    cap: input.cap ?? DEFAULT_ROOM_CAP,
    iat,
    exp: iat + MEDIA_TICKET_TTL_SEC,
    jti: randomBytes(16).toString('base64url'),
    ...(input.end ? { end: input.end } : {}),
  }
  const body = `${HEADER}.${b64url(JSON.stringify(claims))}`
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}
