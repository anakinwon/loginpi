import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'
import { LOCALE_CD_RE, baseLang } from '@/lib/chat-translate'
import { getOrTranslateMessage } from '@/lib/chat-translate-dedup'
import { canAutoTranslate } from '@/lib/chat-auth'
import { recordUserAction } from '@/lib/event'

type Params = { params: Promise<{ roomId: string }> }

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BATCH = 50

// POST /api/chat/rooms/[roomId]/translate-batch — 방 헤더 언어 콤보 강제 번역 (PiTranslate™)
// Body: { locale_cd: string, msg_ids: string[] }
// 캐시 히트는 즉시 수집, 미스는 최신순 순차 번역 — 각 fresh 번역은 broadcast로 점진 전달됨
export async function POST(request: NextRequest, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr)
    return NextResponse.json({ error: '카페 멤버가 아닙니다' }, { status: 403 })

  // 자동번역은 구독 기능 — 미구독(FREE)은 차단
  if (!(await canAutoTranslate(user.id))) {
    return NextResponse.json(
      {
        error: '자동번역은 구독 후 이용할 수 있습니다',
        requiresSubscription: true,
        feature: 'AUTO_TRANSLATE',
      },
      { status: 403 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { locale_cd: localeCd, msg_ids: msgIds } = body as {
    locale_cd?: string
    msg_ids?: unknown
  }
  if (!localeCd || !LOCALE_CD_RE.test(localeCd)) {
    return NextResponse.json(
      { error: '유효하지 않은 locale 코드' },
      { status: 400 },
    )
  }
  if (!Array.isArray(msgIds) || msgIds.length === 0) {
    return NextResponse.json(
      { error: 'msg_ids 배열이 필요합니다' },
      { status: 400 },
    )
  }

  const validIds = [
    ...new Set(
      msgIds.filter(
        (id): id is string => typeof id === 'string' && UUID_RE.test(id),
      ),
    ),
  ].slice(0, MAX_BATCH)
  if (validIds.length === 0) {
    return NextResponse.json(
      { error: '유효한 msg_id가 없습니다' },
      { status: 400 },
    )
  }

  const supabase = getSupabaseAdmin()

  // 대상 메시지 — 이 방의 TEXT 메시지만 (다른 방 msg_id 섞임 방지)
  const { data: msgs } = await supabase
    .from('msg_msg')
    .select('msg_id, msg_cont, src_lang_cd, reg_dtm')
    .in('msg_id', validIds)
    .eq('room_id', roomId)
    .eq('msg_tp_cd', 'TEXT')
    .eq('del_yn', 'N')
    .not('msg_cont', 'is', null)
    .order('reg_dtm', { ascending: false }) // 최신 메시지(화면 하단)부터 번역

  if (!msgs || msgs.length === 0) return NextResponse.json({ translations: {} })

  const translations: Record<string, string> = {}

  // 1. 캐시 일괄 조회 — 히트는 번역 API 호출 없이 즉시 수집
  const { data: cachedRows } = await supabase
    .from('msg_trans')
    .select('msg_id, trans_cont')
    .in(
      'msg_id',
      msgs.map((m) => m.msg_id),
    )
    .eq('locale_cd', localeCd)
    .eq('del_yn', 'N')

  for (const row of cachedRows ?? []) {
    translations[row.msg_id as string] = row.trans_cont as string
  }

  // 2. 캐시 미스 순차 번역 (Gemini rate limit 고려 — 병렬 금지)
  for (const msg of msgs) {
    if (translations[msg.msg_id]) continue
    // 원본 언어가 대상과 같으면 번역 생략 — 원문 그대로 반환
    if (msg.src_lang_cd && baseLang(msg.src_lang_cd) === baseLang(localeCd)) {
      translations[msg.msg_id] = msg.msg_cont as string
      continue
    }
    try {
      const { transCont } = await getOrTranslateMessage({
        msgId: msg.msg_id,
        roomId,
        localeCd,
        msgCont: msg.msg_cont as string,
      })
      translations[msg.msg_id] = transCont
    } catch (err) {
      // 개별 실패는 건너뜀 — 해당 메시지는 원문 표시로 자연 폴백
      console.error(
        `[chat-translate] batch 항목 실패 msg:${msg.msg_id} locale:${localeCd}`,
        err,
      )
    }
  }

  // M3: 자동번역 사용 미션 기록 (방 언어 일괄 번역 = PiTranslate™ 자동번역 주력 경로)
  // 단건 번역(messages/[msgId]/translate)뿐 아니라 이 경로도 '자동번역 사용'으로 집계해야
  // M3(premium_cafe_create + cafe_translate_use) 누락이 발생하지 않는다.
  recordUserAction('cafe_translate_use', user.id, { roomId, localeCd })

  return NextResponse.json({ translations })
}
