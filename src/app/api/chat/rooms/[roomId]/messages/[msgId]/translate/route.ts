import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'
import { LOCALE_CD_RE, baseLang } from '@/lib/chat-translate'
import { getOrTranslateMessage } from '@/lib/chat-translate-dedup'
import { canAutoTranslate } from '@/lib/chat-auth'
import { applyBean, getBalance } from '@/lib/bean'
import { TRANSLATE_ONCE_BEAN } from '@/lib/bean-fee'
import { applyPromoGate } from '@/lib/fee-resolver'
import { consumeTransQuota } from '@/lib/chat-translate-quota'
import { recordUserAction } from '@/lib/event'
import { apiError } from '@/lib/api-errors'

type Params = { params: Promise<{ roomId: string; msgId: string }> }

// POST /api/chat/rooms/[roomId]/messages/[msgId]/translate — PyTranslate™ (TASK-093)
// Body: { locale_cd: string }
// 흐름: msg_trans DB 캐시 → in-memory pending map → Gemini Flash → UPSERT → broadcast
export async function POST(request: NextRequest, { params }: Params) {
  const { roomId, msgId } = await params
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr) return apiError('CHAT_NOT_MEMBER', 403)

  // 자동번역 과금: 구독자(TRANSLATE/PyCafé™)는 무료, 비구독자는 건당 Bean 과금(맛보기·전환 유도)
  const isSubscriber = await canAutoTranslate(user.id)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const { locale_cd: localeCd, confirm } = body as {
    locale_cd?: string
    confirm?: boolean
  }
  if (!localeCd || !LOCALE_CD_RE.test(localeCd)) {
    return apiError('CHAT_INVALID_LOCALE', 400)
  }

  const { data: msg } = await getSupabaseAdmin()
    .from('msg_msg')
    .select('msg_id, room_id, msg_cont, msg_tp_cd, src_lang_cd, del_yn')
    .eq('msg_id', msgId)
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!msg) return apiError('CHAT_MSG_NOT_FOUND', 404)
  if (msg.msg_tp_cd !== 'TEXT' || !msg.msg_cont) {
    return apiError('CHAT_TRANSLATE_TEXT_ONLY', 400)
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

  // 비구독자 건당 과금 — 동의 없는 자동 호출은 과금 금지(원문 폴백), confirm=true(수동 번역 클릭)만 과금.
  // 번역 요금은 오픈프로모로만 무료/유료 통제(마스터 지시): 프로모 ON → 0(무료),
  //   프로모 OFF → 정상요금(Bean 과금)으로 자동 복귀. PI 마이크로 무료화(microFeeBean)
  //   대상에서 번역은 제외한다 — 그래야 프로모 종료 시 유료 전환이 보장된다. PRD_26
  const normalFeeBean = TRANSLATE_ONCE_BEAN
  const feeBean = await applyPromoGate(normalFeeBean)
  if (!isSubscriber && feeBean > 0) {
    if (confirm !== true) {
      // 자동 번역 경로: 비구독자는 번역하지 않고 건당 과금 안내만 반환 → 클라이언트는 원문 유지
      return NextResponse.json(
        {
          error: 'PyTranslate™는 구독자 전용입니다',
          code: 'CHAT_TRANSLATE_SUBSCRIBER_ONLY',
          requiresBean: true,
          requiresConfirm: true,
          feeBean,
          requiresSubscription: true,
          feature: 'AUTO_TRANSLATE',
        },
        { status: 402 },
      )
    }
    const bal = await getBalance(user.id)
    if (bal < feeBean) {
      return NextResponse.json(
        {
          error: `번역 1회에 ${feeBean} Bean이 필요합니다. Bean을 충전하거나 PyTranslate™를 구독하세요.`,
          code: 'CHAT_TRANSLATE_FEE_REQUIRED',
          params: { fee: feeBean },
          requiresBean: true,
          feeBean,
          requiresSubscription: true,
          feature: 'AUTO_TRANSLATE',
        },
        { status: 402 },
      )
    }
  }

  // 비구독자 무료(프로모) 신규 번역은 일일 한도 사전 차단 — 캐시 히트는 무차감·허용(이미 번역됨).
  //   ⚠️ 사후 카운팅이면 granted=0이어도 이미 번역돼 차단 불가(무제한 번역 버그) → 반드시 번역 전 확인.
  if (!isSubscriber && feeBean === 0) {
    const { data: cacheHit } = await getSupabaseAdmin()
      .from('msg_trans')
      .select('msg_id')
      .eq('msg_id', msgId)
      .eq('locale_cd', localeCd)
      .eq('del_yn', 'N')
      .maybeSingle()
    if (!cacheHit) {
      const q = await consumeTransQuota(user.id, 1)
      if (q.granted < 1) {
        return NextResponse.json(
          {
            error:
              '오늘 무료 번역 한도(10건)를 모두 사용했습니다. 내일 다시 이용해 주세요.',
            code: 'CHAT_TRANSLATE_DAILY_LIMIT',
            quotaExhausted: true,
          },
          { status: 429 },
        )
      }
    }
  }

  try {
    const { transCont, cached } = await getOrTranslateMessage({
      msgId,
      roomId,
      localeCd,
      msgCont: msg.msg_cont,
    })

    // 비구독자 + 신규 번역(캐시 미스)만 과금 — 캐시 재사용·PI 모드(feeBean=0)는 무료
    if (!isSubscriber && feeBean > 0 && !cached) {
      const charge = await applyBean({
        usrId: user.id,
        txnTp: 'SPEND',
        beanAmt: -feeBean,
        refTp: 'TRANSLATE_ONCE',
        refId: msgId,
        memo: 'PyTranslate™ 건당',
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
    return apiError('CHAT_TRANSLATE_FAILED', 502)
  }
}
