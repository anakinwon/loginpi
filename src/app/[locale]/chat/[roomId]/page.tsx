import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  getRoom,
  getRoomMember,
  isRoomExpired,
  resolveRoomGrade,
  joinRoomMember,
} from '@/lib/chat'
import { getChatPlan } from '@/lib/chat-auth'
import { getRoomFeeBean } from '@/lib/bean-fee'
import { eventEntryFeeBean } from '@/lib/bean-shared'
import { getBalance } from '@/lib/bean'
import { ChatRoomPanel } from '@/components/chat/chat-room-panel'
import { ClientChatRoom } from '@/components/chat/client-chat-room'
import { RoomEntryFeeGate } from '@/components/chat/room-entry-fee-gate'
import type { ChatMessage } from '@/hooks/use-chat-room'

type Params = { params: Promise<{ locale: string; roomId: string }> }

export default async function ChatRoomPage({ params }: Params) {
  const { locale, roomId } = await params
  const user = await getSessionUser()

  // 쿠키로 신원을 못 찾으면(Pi Browser는 Set-Cookie 미저장) redirect 대신 클라이언트 게이트로 위임.
  // 클라이언트가 localStorage 토큰을 X-Pi-Token 헤더로 실어 방 정보·메시지를 로드한다.
  if (!user) {
    return <ClientChatRoom roomId={roomId} />
  }

  const [room, mbr] = await Promise.all([
    getRoom(roomId),
    getRoomMember(roomId, user.id),
  ])

  if (!room) redirect(`/${locale}/chat`)

  // 비멤버: 공개 그룹방·공개 이벤트방만 입장 허용 (비공개·1:1은 목록으로)
  if (!mbr) {
    const isEvent = room.room_tp_cd === 'E'
    const isPublicGroup = room.room_tp_cd === 'G' && room.is_public_yn === 'Y'
    if (isPublicGroup || (isEvent && room.is_public_yn === 'Y')) {
      // 기간 만료 카페(무료방 7일 초과)는 신규 입장 불가 — join API·GET 410과 동일 룰
      if (isRoomExpired(room)) redirect(`/${locale}/chat`)
      // 종료된 이벤트방도 신규 입장 불가
      if (
        isEvent &&
        room.entry_expire_dtm &&
        new Date(room.entry_expire_dtm) <= new Date()
      )
        redirect(`/${locale}/chat`)

      const { count } = await getSupabaseAdmin()
        .from('msg_room_mbr')
        .select('room_mbr_id', { count: 'exact', head: true })
        .eq('room_id', roomId)
        .eq('del_yn', 'N')
      if ((count ?? 0) >= room.max_mbr_cnt) redirect(`/${locale}/chat`)

      // 입장료(Bean): 이벤트방=호스트 지정가(entry_fee_pi×100), 그 외=등급 정액(구독자·BASIC 테마 0).
      // 요금이 있으면 사일런트 자동입장 금지 → Bean 소진 동의 게이트로 위임(확인 후 차감).
      let enterFeeBean = 0
      if (isEvent) {
        enterFeeBean = eventEntryFeeBean(room.entry_fee_pi)
      } else {
        const grade = await resolveRoomGrade(room)
        const plan = await getChatPlan(user.id)
        enterFeeBean = getRoomFeeBean('ENTER', grade, plan.tier !== 'FREE')
      }
      if (enterFeeBean > 0) {
        const balance = await getBalance(user.id)
        return (
          <RoomEntryFeeGate
            roomId={roomId}
            roomNm={room.room_nm}
            feeBean={enterFeeBean}
            balance={balance}
          />
        )
      }

      // 무료 입장 — 이벤트방은 GUEST+종료시각, 그 외 일반 MEMBER. 재가입 시 논리삭제 복구.
      await joinRoomMember(
        roomId,
        user.id,
        user.display_name,
        isEvent
          ? { role: 'GUEST', expireDtm: room.entry_expire_dtm }
          : undefined,
      )
    } else {
      redirect(`/${locale}/chat`)
    }
  }

  // 초기 메시지 50건 + 현재 멤버 수를 병렬 조회
  const [{ data: rawMsgs }, { count: mbrCount }] = await Promise.all([
    getSupabaseAdmin()
      .from('msg_msg')
      .select(
        'msg_id, room_id, snd_usr_id, snd_usr_nm, msg_cont, msg_tp_cd, attch_url, stkr_id, ref_msg_id, src_lang_cd, del_yn, reg_dtm',
      )
      .eq('room_id', roomId)
      .eq('del_yn', 'N')
      .order('reg_dtm', { ascending: false })
      .limit(50),
    getSupabaseAdmin()
      .from('msg_room_mbr')
      .select('room_mbr_id', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .eq('del_yn', 'N'),
  ])

  const isOwner = mbr?.mbr_role_cd === 'OWNER'
  const capacityAlert = isOwner && (mbrCount ?? 0) >= room.max_mbr_cnt

  const initialMessages = ((rawMsgs ?? []) as ChatMessage[]).reverse()

  // PiTranslate™ — 현재 locale의 캐시된 번역을 trans_cont로 pre-populate (조회만, 신규 번역 없음)
  if (initialMessages.length > 0) {
    const { data: transRows } = await getSupabaseAdmin()
      .from('msg_trans')
      .select('msg_id, trans_cont')
      .in(
        'msg_id',
        initialMessages.map((m) => m.msg_id),
      )
      .eq('locale_cd', locale)
      .eq('del_yn', 'N')

    if (transRows && transRows.length > 0) {
      const transMap = new Map(
        transRows.map((t: { msg_id: string; trans_cont: string }) => [
          t.msg_id,
          t.trans_cont,
        ]),
      )
      for (const msg of initialMessages) {
        const trans = transMap.get(msg.msg_id)
        if (trans) msg.trans_cont = trans
      }
    }
  }

  // msg_theme JOIN으로 테마 이모지 가져오기
  const { data: themeData } = await getSupabaseAdmin()
    .from('msg_theme')
    .select('theme_emoji')
    .eq('theme_cd', room.theme_cd)
    .single()

  const themeEmoji =
    (themeData as { theme_emoji?: string } | null)?.theme_emoji ?? '💬'

  return (
    // 화면 직접 고정 프레임: top-14(사이트 헤더 아래) ~ bottom-0(화면 바닥).
    // fixed는 뷰포트 기준이라 URL바·키보드 변화를 자동 추적하고,
    // 레이아웃의 Footer가 아래에 있어도 페이지 전체 스크롤이 생기지 않는다 (본문만 스크롤).
    <div className="bg-background fixed inset-x-0 top-14 bottom-0 z-40 mx-auto flex w-full max-w-2xl flex-col overflow-hidden">
      {/* 헤더(제목+언어콤보 고정)·메시지(스크롤)·입력창(고정)은 ChatRoomPanel이 렌더 */}
      <ChatRoomPanel
        roomId={roomId}
        initialMessages={initialMessages}
        currentUserId={user.id}
        currentUserDisplayName={user.display_name}
        roomNm={room.room_nm}
        roomDesc={room.room_desc}
        themeEmoji={themeEmoji}
        themeCd={room.theme_cd}
        capacityAlert={capacityAlert}
      />
    </div>
  )
}
