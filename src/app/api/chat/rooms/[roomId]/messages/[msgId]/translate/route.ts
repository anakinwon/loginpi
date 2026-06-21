import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'
import { LOCALE_CD_RE, baseLang } from '@/lib/chat-translate'
import { getOrTranslateMessage } from '@/lib/chat-translate-dedup'
import { canAutoTranslate } from '@/lib/chat-auth'
import { applyBean, getBalance } from '@/lib/bean'
import { TRANSLATE_ONCE_BEAN } from '@/lib/bean-fee'
import { recordUserAction } from '@/lib/event'

type Params = { params: Promise<{ roomId: string; msgId: string }> }

// POST /api/chat/rooms/[roomId]/messages/[msgId]/translate — PiTranslate™ (TASK-093)
// Body: { locale_cd: string }
// 흐름: msg_trans DB 캐시 → in-memory pending map → Gemini Flash → UPSERT → broadcast
export async function POST(request: NextRequest, { params }: Params) {
  const { roomId, msgId } = await params
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr)
    return NextResponse.json({ error: '카페 멤버가 아닙니다' }, { status: 403 })

  // 자동번역 과금: 구독자(TRANSLATE/PiCafe)는 무료, 비구독자는 건당 Bean 과금(맛보기·전환 유도)
  const isSubscriber = await canAutoTranslate(user.id)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { locale_cd: localeCd, confirm } = body as {
    locale_cd?: string
    confirm?: boolean
  }
  if (!localeCd || !LOCALE_CD_RE.test(localeCd)) {
    return NextResponse.json(
      { error: '유효하지 않은 locale 코드' },
      { status: 400 },
    )
  }

  const { data: msg } = await getSupabaseAdmin()
    .from('msg_msg')
    .select('msg_id, room_id, msg_cont, msg_tp_cd, src_lang_cd, del_yn')
    .eq('msg_id', msgId)
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!msg)
    return NextResponse.json(
      { error: '메시지를 찾을 수 없습니다' },
      { status: 404 },
    )
  if (msg.msg_tp_cd !== 'TEXT' || !msg.msg_cont) {
    return NextResponse.json(
      { error: '텍스트 메시지만 번역할 수 있습니다' },
      { status: 400 },
    )
  }

  // M3.2: 자동번역 기능 사용 미션 기록 (비블로킹)
  // 검증 통과 직후 기록 — same_lang early return 경로에서도 누락되지 않도록 분기 이전에 둔다
  recordUserAction('cafe_translate_use', user.id, { roomId, localeCd }).catch(
    (err) => console.error(`[M3.2] 미션 기록 실패: ${err.message}`),
  )

  // 원본 언어가 이미 감지되어 있고 대상 언어와 같으면 번역 불필요 (과금 없음)
  if (msg.src_lang_cd && baseLang(msg.src_lang_cd) === baseLang(localeCd)) {
    return NextResponse.json({
      trans_cont: msg.msg_cont,
      cached: true,
      same_lang: true,
    })
  }

  // 비구독자 건당 과금 — 동의 없는 자동 호출은 과금 금지(원문 폴백), confirm=true(수동 번역 클릭)만 과금
  if (!isSubscriber) {
    if (confirm !== true) {
      // 자동 번역 경로: 비구독자는 번역하지 않고 건당 과금 안내만 반환 → 클라이언트는 원문 유지
      return NextResponse.json(
        {
          error: '자동번역은 구독자 전용입니다',
          requiresBean: true,
          requiresConfirm: true,
          feeBean: TRANSLATE_ONCE_BEAN,
          requiresSubscription: true,
          feature: 'AUTO_TRANSLATE',
        },
        { status: 402 },
      )
    }
    const bal = await getBalance(user.id)
    if (bal < TRANSLATE_ONCE_BEAN) {
      return NextResponse.json(
        {
          error: `번역 1회에 ${TRANSLATE_ONCE_BEAN} Bean이 필요합니다. Bean을 충전하거나 자동번역을 구독하세요.`,
          requiresBean: true,
          feeBean: TRANSLATE_ONCE_BEAN,
          requiresSubscription: true,
          feature: 'AUTO_TRANSLATE',
        },
        { status: 402 },
      )
    }
  }

  try {
    const { transCont, cached } = await getOrTranslateMessage({
      msgId,
      roomId,
      localeCd,
      msgCont: msg.msg_cont,
    })

    // 비구독자 + 신규 번역(캐시 미스)만 과금 — 캐시 재사용은 무료(실제 번역 비용 없음)
    if (!isSubscriber && !cached) {
      const charge = await applyBean({
        usrId: user.id,
        txnTp: 'SPEND',
        beanAmt: -TRANSLATE_ONCE_BEAN,
        refTp: 'TRANSLATE_ONCE',
        refId: msgId,
        memo: '자동번역 건당',
        regrId: user.display_name.slice(0, 20),
      })
      if (!charge.ok)
        console.error(
          `[자동번역] 건당 과금 실패 user:${user.id} msg:${msgId} (${charge.error})`,
        )
    }

    return NextResponse.json({
      trans_cont: transCont,
      cached,
      charged: !isSubscriber && !cached,
    })
  } catch (err) {
    console.error(
      `[chat-translate] 번역 실패 msg:${msgId} locale:${localeCd}`,
      err,
    )
    return NextResponse.json({ error: '번역에 실패했습니다' }, { status: 502 })
  }
}
