import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'
import { LOCALE_CD_RE, baseLang } from '@/lib/chat-translate'
import { targetLangBase } from '@/lib/locale-lang'
import { getOrTranslateMessage } from '@/lib/chat-translate-dedup'
import { canAutoTranslate } from '@/lib/chat-auth'
import { recordUserAction } from '@/lib/event'
import { isOpenPromoActive } from '@/lib/fee-resolver'
import {
  consumeTransQuota,
  TRANSLATE_DAILY_FREE,
} from '@/lib/chat-translate-quota'
import { apiError } from '@/lib/api-errors'

type Params = { params: Promise<{ roomId: string }> }

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BATCH = 50

// POST /api/chat/rooms/[roomId]/translate-batch — 방 헤더 언어 콤보 강제 번역 (PyTranslate™)
// Body: { locale_cd: string, msg_ids: string[] }
// 캐시 히트는 즉시 수집, 미스는 최신순 순차 번역 — 각 fresh 번역은 broadcast로 점진 전달됨
export async function POST(request: NextRequest, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr) return apiError('CHAT_NOT_MEMBER', 403)

  // 자동번역은 구독 기능 — 미구독(FREE)은 차단. 단 오픈프로모 기간엔 누구나 무료 허용.
  //   프로모 종료 시 다시 구독자 전용으로 복귀(유료 전환). 서버 권위 판정(매 요청 DB 조회).
  const promoActive = await isOpenPromoActive()
  const subscribed = await canAutoTranslate(user.id)
  if (!promoActive && !subscribed) {
    return NextResponse.json(
      {
        error: 'PyTranslate™는 구독 후 이용할 수 있습니다',
        code: 'CHAT_TRANSLATE_SUBSCR_ONLY',
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
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const { locale_cd: localeCd, msg_ids: msgIds } = body as {
    locale_cd?: string
    msg_ids?: unknown
  }
  if (!localeCd || !LOCALE_CD_RE.test(localeCd)) {
    return apiError('CHAT_INVALID_LOCALE', 400)
  }
  if (!Array.isArray(msgIds) || msgIds.length === 0) {
    return apiError('CHAT_MSG_IDS_REQUIRED', 400)
  }

  const validIds = [
    ...new Set(
      msgIds.filter(
        (id): id is string => typeof id === 'string' && UUID_RE.test(id),
      ),
    ),
  ].slice(0, MAX_BATCH)
  if (validIds.length === 0) {
    return apiError('CHAT_NO_VALID_MSG_ID', 400)
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

  // 원본 언어가 대상과 같으면 번역 생략 — 원문 그대로(한도 미차감)
  // localeCd는 국가 파생 코드(er=영어 등)라 baseLang 직접 비교는 오판 → targetLangBase로 해석
  for (const msg of msgs) {
    if (translations[msg.msg_id]) continue
    if (
      msg.src_lang_cd &&
      baseLang(msg.src_lang_cd) === targetLangBase(localeCd)
    ) {
      translations[msg.msg_id] = msg.msg_cont as string
    }
  }

  // 캐시 미스(신규 번역 필요) 목록 — 최신순(reg_dtm desc) 유지
  const toTranslate = msgs.filter((m) => !translations[m.msg_id])

  // 비구독자(오픈프로모 무료)는 일일 무료 한도 적용 — 신규 건수만큼 소비, granted건만 번역.
  //   캐시 히트·원문(위에서 처리)은 미차감. 구독자는 무제한(한도 미적용).
  //   초과분은 번역하지 않고 원문 표시 + quotaExhausted 안내.
  let allowed = toTranslate
  let quotaExhausted = false
  let quotaUsed: number | null = null
  if (!subscribed && toTranslate.length > 0) {
    const q = await consumeTransQuota(user.id, toTranslate.length)
    allowed = toTranslate.slice(0, q.granted) // 최신 메시지 우선 번역
    quotaExhausted = q.granted < toTranslate.length
    quotaUsed = q.used
  }

  // 2. 캐시 미스 순차 번역 (Gemini rate limit 고려 — 병렬 금지)
  for (const msg of allowed) {
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

  // M3: 자동번역 사용 미션 기록 (방 언어 일괄 번역 = PyTranslate™ 자동번역 주력 경로)
  // 단건 번역(messages/[msgId]/translate)뿐 아니라 이 경로도 '자동번역 사용'으로 집계해야
  // M3(premium_cafe_create + cafe_translate_use) 누락이 발생하지 않는다.
  recordUserAction('cafe_translate_use', user.id, { roomId, localeCd })

  // quotaExhausted: 일일 무료 한도 소진으로 일부만 번역됨(클라이언트 안내용)
  return NextResponse.json({
    translations,
    quotaExhausted,
    quotaUsed,
    quota: TRANSLATE_DAILY_FREE,
  })
}
