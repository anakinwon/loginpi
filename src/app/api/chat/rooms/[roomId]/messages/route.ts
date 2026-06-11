import { NextRequest, NextResponse, after } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember, getRoom, getRecentMsgCount } from '@/lib/chat'
import { getAiQuota } from '@/lib/chat-auth'
import { getThemeSystemPrompt, extractAiQuestion, generateAiReply } from '@/lib/chat-ai-prompts'
import { tryAwardBadge } from '@/lib/chat-badge'
import { broadcastToRoom } from '@/lib/realtime-broadcast'
import { recordActivity } from '@/lib/activity-log'
import { LOCALE_CD_RE } from '@/lib/chat-translate'
import { queueRoomTranslations } from '@/lib/chat-translate-dedup'
import { pushRoomWebhooks } from '@/lib/chat-webhook'

type Params = { params: Promise<{ roomId: string }> }

// GET /api/chat/rooms/[roomId]/messages?limit=50&before=<msg_id>&locale=<locale>
// cursor 기반 페이지네이션 — scroll-up 무한로드
// locale 전달 시 msg_trans 캐시된 번역을 trans_cont 필드로 pre-populate (PiTranslate™)
export async function GET(request: NextRequest, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr) return NextResponse.json({ error: '카페 멤버가 아닙니다' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 100)
  const before = searchParams.get('before') // msg_id cursor
  const locale = searchParams.get('locale')

  let query = getSupabaseAdmin()
    .from('msg_msg')
    .select('msg_id, room_id, snd_usr_id, snd_usr_nm, msg_cont, msg_tp_cd, attch_url, stkr_id, ref_msg_id, src_lang_cd, del_yn, reg_dtm')
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
    .limit(limit)

  // cursor 이전 메시지만 조회 (scroll-up 방향)
  if (before) {
    const { data: cursorMsg } = await getSupabaseAdmin()
      .from('msg_msg')
      .select('reg_dtm')
      .eq('msg_id', before)
      .single()
    if (cursorMsg) {
      query = query.lt('reg_dtm', cursorMsg.reg_dtm)
    }
  }

  const { data: messages, error } = await query

  if (error) return NextResponse.json({ error: '메시지 조회 실패' }, { status: 500 })

  const reversed = (messages ?? []).reverse()
  const hasMore = (messages ?? []).length === limit
  const oldestMsgId = reversed[0]?.msg_id ?? null

  // 캐시된 번역 pre-populate — 신규 번역은 발생하지 않음 (조회만)
  if (locale && LOCALE_CD_RE.test(locale) && reversed.length > 0) {
    const { data: transRows } = await getSupabaseAdmin()
      .from('msg_trans')
      .select('msg_id, trans_cont')
      .in('msg_id', reversed.map(m => m.msg_id))
      .eq('locale_cd', locale)
      .eq('del_yn', 'N')

    if (transRows && transRows.length > 0) {
      const transMap = new Map(transRows.map((t: { msg_id: string; trans_cont: string }) => [t.msg_id, t.trans_cont]))
      for (const msg of reversed as Array<{ msg_id: string; trans_cont?: string }>) {
        const trans = transMap.get(msg.msg_id)
        if (trans) msg.trans_cont = trans
      }
    }
  }

  return NextResponse.json({ messages: reversed, hasMore, oldestMsgId })
}

// POST /api/chat/rooms/[roomId]/messages — 메시지 전송
export async function POST(request: NextRequest, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr) return NextResponse.json({ error: '카페 멤버가 아닙니다' }, { status: 403 })

  // 메시지 전송 = 가장 명확한 활성 사용자 신호
  recordActivity(user.id, 'MSG')

  // rate limiting: 1초 5건 초과 방지
  const recentCount = await getRecentMsgCount(roomId, user.id)
  if (recentCount >= 5) {
    return NextResponse.json({ error: '너무 빠르게 메시지를 전송하고 있습니다' }, { status: 429 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { msg_id: clientMsgId, msg_cont, msg_tp_cd = 'TEXT', ref_msg_id, stkr_id, attch_url } = body as {
    msg_id?: string
    msg_cont?: string
    msg_tp_cd?: string
    ref_msg_id?: string
    stkr_id?: string
    attch_url?: string
  }

  // 클라이언트가 broadcast와 동일한 UUID를 전달하면 DB primary key로 사용 (broadcast-DB msg_id 일치)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const validMsgId = clientMsgId && UUID_RE.test(clientMsgId) ? clientMsgId : undefined

  if (msg_tp_cd === 'TEXT' && !msg_cont?.trim()) {
    return NextResponse.json({ error: '메시지 내용을 입력해주세요' }, { status: 400 })
  }

  if (msg_tp_cd === 'STICKER' && !stkr_id) {
    return NextResponse.json({ error: '스티커 ID가 필요합니다' }, { status: 400 })
  }

  const validTypes = ['TEXT', 'IMAGE', 'FILE', 'VOICE', 'STICKER', 'SYSTEM']
  if (!validTypes.includes(msg_tp_cd)) {
    return NextResponse.json({ error: '유효하지 않은 메시지 타입' }, { status: 400 })
  }

  // TASK-065 보안: IMAGE/FILE/VOICE의 attch_url은 이 방의 Storage 공개 URL만 허용
  // 외부 URL(피싱·XSS)과 타 카페 파일 cross-attach를 차단한다
  if (msg_tp_cd === 'IMAGE' || msg_tp_cd === 'FILE' || msg_tp_cd === 'VOICE') {
    const expectedPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/chat-attachments/${roomId}/`
    if (!attch_url || !attch_url.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: '유효하지 않은 첨부 파일 URL입니다' }, { status: 400 })
    }
  }

  // TASK-064: @ai 멘션 시 한도 사전 체크 — 초과면 메시지 삽입 없이 402 반환
  const isAiMention = msg_tp_cd === 'TEXT' && /^@ai\s/i.test(msg_cont?.trim() ?? '')
  if (isAiMention && process.env.ANTHROPIC_API_KEY) {
    const quota = await getAiQuota(user.id)
    if (quota.remaining === 0) {
      return NextResponse.json(
        { error: 'AI 월 호출 한도를 초과했습니다', aiLimitExceeded: true },
        { status: 402 },
      )
    }
  }

  // STICKER: 소유권 검증 + 서버 stkr_url 사용 (클라이언트 attch_url 무시)
  let resolvedAttchUrl: string | null = attch_url ?? null
  if (msg_tp_cd === 'STICKER' && stkr_id) {
    const db = getSupabaseAdmin()
    const { data: stkrRow } = await db
      .from('msg_stkr')
      .select('stkr_id, pack_id, stkr_url')
      .eq('stkr_id', stkr_id)
      .eq('del_yn', 'N')
      .maybeSingle()

    if (!stkrRow) {
      return NextResponse.json({ error: '존재하지 않는 스티커입니다' }, { status: 404 })
    }

    const { data: packRow } = await db
      .from('msg_stkr_pack')
      .select('pack_id, price_pi, is_dflt_yn')
      .eq('pack_id', (stkrRow as { pack_id: string }).pack_id)
      .eq('del_yn', 'N')
      .maybeSingle()

    if (!packRow) {
      return NextResponse.json({ error: '스티커 팩을 찾을 수 없습니다' }, { status: 404 })
    }

    const pack = packRow as { pack_id: string; price_pi: number; is_dflt_yn: string }
    const isFree = pack.is_dflt_yn === 'Y' || Number(pack.price_pi) === 0

    if (!isFree) {
      const { data: ownership } = await db
        .from('msg_usr_stkr')
        .select('pack_id')
        .eq('usr_id', user.id)
        .eq('pack_id', pack.pack_id)
        .eq('del_yn', 'N')
        .maybeSingle()

      if (!ownership) {
        return NextResponse.json({ error: '이 스티커 팩을 구매하지 않았습니다' }, { status: 403 })
      }
    }

    // 클라이언트 URL을 신뢰하지 않고 DB에서 검증된 URL 사용
    resolvedAttchUrl = (stkrRow as { stkr_url: string }).stkr_url
  }

  const { data, error } = await getSupabaseAdmin()
    .from('msg_msg')
    .insert({
      ...(validMsgId ? { msg_id: validMsgId } : {}),
      room_id: roomId,
      snd_usr_id: user.id,
      snd_usr_nm: user.display_name,
      msg_cont: msg_cont?.trim() ?? null,
      msg_tp_cd,
      attch_url: resolvedAttchUrl,
      ref_msg_id: ref_msg_id ?? null,
      stkr_id: stkr_id ?? null,
      regr_id: user.display_name.slice(0, 20),
      modr_id: user.display_name.slice(0, 20),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: '메시지 전송 실패' }, { status: 500 })

  // 카페 mod_dtm 갱신 + 서버 브로드캐스트를 병렬 실행
  // 브로드캐스트는 서비스 롤 키 + REST API로 전송 → 클라이언트 직접 broadcast 불필요
  // (클라이언트 broadcast는 snd_usr_id 스푸핑 가능 — 서버에서만 발송해야 신원 보장됨)
  await Promise.all([
    getSupabaseAdmin()
      .from('msg_room')
      .update({ modr_id: user.display_name.slice(0, 20) })
      .eq('room_id', roomId),
    broadcastToRoom(roomId, 'new_msg', data),
  ])

  // PiTranslate™ 번역 큐 (TASK-094) — 응답을 막지 않는 백그라운드 실행
  // after(): 응답 전송 후에도 서버리스 인스턴스가 종료되지 않고 작업을 완료함
  // 방 참가자들의 display_locale_cd 목록으로 자동 번역 → msg_trans 캐시 + broadcast
  if (data.msg_tp_cd === 'TEXT' && data.msg_cont) {
    after(() =>
      queueRoomTranslations({
        roomId,
        msgId: data.msg_id,
        msgCont: data.msg_cont,
      }).catch(err => console.error('[chat-translate] 번역 큐 오류', err)),
    )
  }

  // TASK-072: 등록된 Webhook으로 신규 메시지 push (백그라운드 — Business 봇 연동)
  after(() =>
    pushRoomWebhooks(roomId, data).catch(err =>
      console.error('[chat-webhook] push 오류', err),
    ),
  )

  // TASK-062 Trigger 7: 테마 활동 배지 수여 체크 (백그라운드)
  // 배지 보유 시 RPC가 인덱스 1회 조회로 즉시 반환 — 매 메시지 비용 최소
  if (msg_tp_cd === 'TEXT' || msg_tp_cd === 'IMAGE' || msg_tp_cd === 'FILE' || msg_tp_cd === 'VOICE') {
    after(() =>
      tryAwardBadge({ userId: user.id, roomId, displayName: user.display_name })
        .catch(err => console.error('[chat-badge] 배지 수여 체크 실패', err)),
    )
  }

  // TASK-064: @ai 멘션 감지 → AI_REPLY 생성 (백그라운드)
  // 한도 체크는 위에서 완료 — after()에서는 생성만 담당
  if (isAiMention && process.env.ANTHROPIC_API_KEY) {
    after(async () => {
      try {
        const room = await getRoom(roomId)
        const systemPrompt = getThemeSystemPrompt(room?.theme_cd ?? '')
        const question = extractAiQuestion(msg_cont ?? '')
        const aiText = await generateAiReply(systemPrompt, question)

        const { data: aiMsg } = await getSupabaseAdmin()
          .from('msg_msg')
          .insert({
            room_id: roomId,
            snd_usr_id: user.id, // FK 안전 — 요청자 ID 재사용
            snd_usr_nm: 'PiCafé AI',
            msg_cont: aiText,
            msg_tp_cd: 'AI_REPLY',
            ref_msg_id: data.msg_id,
            regr_id: 'SYSTEM',
            modr_id: 'SYSTEM',
          })
          .select()
          .single()

        if (aiMsg) await broadcastToRoom(roomId, 'new_msg', aiMsg)
      } catch (err) {
        console.error('[chat-ai] AI 응답 생성 실패', err)
      }
    })
  }

  return NextResponse.json({ message: data }, { status: 201 })
}
