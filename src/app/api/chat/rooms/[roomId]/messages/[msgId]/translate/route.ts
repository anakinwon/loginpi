import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'
import { LOCALE_CD_RE, baseLang } from '@/lib/chat-translate'
import { getOrTranslateMessage } from '@/lib/chat-translate-dedup'

type Params = { params: Promise<{ roomId: string; msgId: string }> }

// POST /api/chat/rooms/[roomId]/messages/[msgId]/translate — PiTranslate™ (TASK-093)
// Body: { locale_cd: string }
// 흐름: msg_trans DB 캐시 → in-memory pending map → Gemini Flash → UPSERT → broadcast
export async function POST(request: NextRequest, { params }: Params) {
  const { roomId, msgId } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr) return NextResponse.json({ error: '카페 멤버가 아닙니다' }, { status: 403 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { locale_cd: localeCd } = body as { locale_cd?: string }
  if (!localeCd || !LOCALE_CD_RE.test(localeCd)) {
    return NextResponse.json({ error: '유효하지 않은 locale 코드' }, { status: 400 })
  }

  const { data: msg } = await getSupabaseAdmin()
    .from('msg_msg')
    .select('msg_id, room_id, msg_cont, msg_tp_cd, src_lang_cd, del_yn')
    .eq('msg_id', msgId)
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!msg) return NextResponse.json({ error: '메시지를 찾을 수 없습니다' }, { status: 404 })
  if (msg.msg_tp_cd !== 'TEXT' || !msg.msg_cont) {
    return NextResponse.json({ error: '텍스트 메시지만 번역할 수 있습니다' }, { status: 400 })
  }

  // 원본 언어가 이미 감지되어 있고 대상 언어와 같으면 번역 불필요
  if (msg.src_lang_cd && baseLang(msg.src_lang_cd) === baseLang(localeCd)) {
    return NextResponse.json({ trans_cont: msg.msg_cont, cached: true, same_lang: true })
  }

  try {
    const { transCont, cached } = await getOrTranslateMessage({
      msgId,
      roomId,
      localeCd,
      msgCont: msg.msg_cont,
    })
    return NextResponse.json({ trans_cont: transCont, cached })
  } catch (err) {
    console.error(`[chat-translate] 번역 실패 msg:${msgId} locale:${localeCd}`, err)
    return NextResponse.json({ error: '번역에 실패했습니다' }, { status: 502 })
  }
}
