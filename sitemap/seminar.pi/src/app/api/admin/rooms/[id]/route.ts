// 방 강제 종료(M5 방 관리) — DELETE, ADMIN 전용. 세미나 방(uuid) = DB ENDED 먼저(룸 화면 [세미나 종료]·시간 소진과 같은 순서 —
//  엔진만 닫으면 입장권이 다시 나가 방이 새로 열린다) → 엔진 방 닫기를 기다려 결과를 돌려준다(화면이 바로 목록을 다시 읽음), 남은 회의록은 응답 뒤 마무리.
//  실험실 방(uuid 아님) = 엔진만. 방이 이미 없으면(404) 성공. 비로그인 401·비관리자 403(redirect 없음)
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, dbRoute, requireAdmin } from '@/lib/api'
import { closeEngineRoom, endSeminar, engineAdminOn } from '@/lib/plan'
import { isUuid } from '@/lib/seminar-rules'

const noStore = { 'Cache-Control': 'no-store' }
const ROOM_RE = /^[A-Za-z0-9_-]{1,64}$/ // 엔진 방 ID 규칙(입장권 room 과 같다)

export const DELETE = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const [user, { id }] = await Promise.all([
      requireAdmin(req),
      (ctx as { params: Promise<{ id: string }> }).params,
    ])
    if (user instanceof NextResponse) return user
    if (!ROOM_RE.test(id)) return apiError('INVALID_INPUT', 400)
    if (!engineAdminOn()) return apiError('ENGINE_OFF', 503)
    // 세미나 방 ID 는 입장권이 소문자로 통일한다(media/ticket S3)
    const ok = isUuid(id) ? await endSeminar(id.toLowerCase(), user.id, true) : await closeEngineRoom(id)
    return ok
      ? NextResponse.json({ ok: true }, { headers: noStore })
      : apiError('ENGINE_UNAVAILABLE', 503)
  }),
)
