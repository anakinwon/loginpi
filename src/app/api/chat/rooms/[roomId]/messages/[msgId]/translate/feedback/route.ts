import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'
import { LOCALE_CD_RE } from '@/lib/chat-translate'

type Params = { params: Promise<{ roomId: string; msgId: string }> }

// POST /api/chat/rooms/[roomId]/messages/[msgId]/translate/feedback — 번역 품질 피드백 (TASK-099)
// Body: { locale_cd: string, feedback: 'Y' | 'N' }
// msg_trans.feedback_yn 갱신 — 같은 사용자가 다시 누르면 마지막 값으로 덮어씀 (향후 fine-tune 데이터)
export async function POST(request: NextRequest, { params }: Params) {
  const { roomId, msgId } = await params
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr)
    return NextResponse.json({ error: '카페 멤버가 아닙니다' }, { status: 403 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { locale_cd: localeCd, feedback } = body as {
    locale_cd?: string
    feedback?: string
  }
  if (!localeCd || !LOCALE_CD_RE.test(localeCd)) {
    return NextResponse.json(
      { error: '유효하지 않은 locale 코드' },
      { status: 400 },
    )
  }
  if (feedback !== 'Y' && feedback !== 'N') {
    return NextResponse.json(
      { error: 'feedback은 Y 또는 N이어야 합니다' },
      { status: 400 },
    )
  }

  const slug = String(user.display_name ?? 'user').slice(0, 20)
  const { data, error } = await getSupabaseAdmin()
    .from('msg_trans')
    .update({
      feedback_yn: feedback,
      modr_id: slug,
      mod_dtm: new Date().toISOString(),
    })
    .eq('msg_id', msgId)
    .eq('locale_cd', localeCd)
    .eq('del_yn', 'N')
    .select('trans_id')
    .maybeSingle()

  if (error)
    return NextResponse.json({ error: '피드백 저장 실패' }, { status: 500 })
  if (!data)
    return NextResponse.json(
      { error: '번역 캐시를 찾을 수 없습니다' },
      { status: 404 },
    )

  return NextResponse.json({ success: true, feedback })
}
