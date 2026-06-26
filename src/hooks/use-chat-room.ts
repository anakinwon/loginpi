'use client'
import { useEffect, useRef, useCallback, useState } from 'react'
import { toast } from 'sonner'
import { getSupabaseClient } from '@/lib/supabase-client'
import { piFetch } from '@/lib/pi-fetch'

export interface ChatMessage {
  msg_id: string
  room_id: string
  snd_usr_id: string
  snd_usr_nm: string
  msg_cont: string | null
  msg_tp_cd: string
  attch_url: string | null
  stkr_id: string | null
  ref_msg_id: string | null
  src_lang_cd?: string | null // 원본 언어 코드 (PyTranslate™ 감지)
  trans_cont?: string | null // 번역된 텍스트 (PyTranslate™)
  trans_locale?: string | null // trans_cont가 번역된 대상 언어 — 캐시 비교용
  del_yn: 'Y' | 'N'
  reg_dtm: string
}

// 번역 broadcast 페이로드 (서버 getOrTranslateMessage → broadcastToRoom)
interface MsgTransPayload {
  msg_id: string
  locale_cd: string
  trans_cont: string
}

// 배지 수여 broadcast 페이로드 (TASK-062 Trigger 7 — 서버 tryAwardBadge)
export interface BadgeAwardPayload {
  usr_id: string
  badge_id: string
  theme_cd: string
  theme_nm: string
  theme_emoji: string
}

interface UseChatRoomOptions {
  currentUserId: string
  currentUserDisplayName: string
  userLocale?: string // 표시 언어 — 일치하는 msg_trans broadcast만 적용
  // 방 헤더 언어 콤보 선택 시 true — 로드된 모든 메시지(본인 과거 메시지 포함)를
  // userLocale로 일괄 번역하고, 이후 추가되는 메시지도 전부 번역한다
  forceTranslate?: boolean
  // @ai 멘션 전송 시 월 한도 초과 → panel에서 업그레이드 모달 표시
  onAiLimitExceeded?: (info?: {
    feeBean?: number
    insufficientBean?: boolean
    text?: string
  }) => void
  // 내 배지 수여 broadcast 수신 → panel에서 축하 팝업(Trigger 7) 표시
  onBadgeAward?: (badge: BadgeAwardPayload) => void
}

interface UseChatRoomReturn {
  messages: ChatMessage[]
  onlineUserIds: string[]
  sendMessage: (text: string, confirm?: boolean) => Promise<void>
  sendSticker: (stkrId: string, stkrUrl: string) => Promise<void>
  sendFile: (file: File) => Promise<void>
  prependMessages: (msgs: ChatMessage[]) => void
}

const BROADCAST_EVENT = 'new_msg'
const TRANS_EVENT = 'msg_trans'
const BADGE_EVENT = 'badge_award'

export function useChatRoom(
  roomId: string,
  initialMessages: ChatMessage[],
  {
    currentUserId,
    currentUserDisplayName,
    userLocale,
    forceTranslate = false,
    onAiLimitExceeded,
    onBadgeAward,
  }: UseChatRoomOptions,
): UseChatRoomReturn {
  // 초기 메시지에 trans_locale 세팅 — 서버가 trans_cont를 미리 채운 경우 현재 locale로 표시
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    userLocale
      ? initialMessages.map((m) =>
          m.trans_cont ? { ...m, trans_locale: userLocale } : m,
        )
      : initialMessages,
  )
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([])
  const channelRef = useRef<ReturnType<
    ReturnType<typeof getSupabaseClient>['channel']
  > | null>(null)
  // 이미 번역 요청한 msg_id — broadcast 수신마다 중복 POST 방지
  const requestedTransRef = useRef<Set<string>>(new Set())
  // 배지 수여 콜백 최신 참조 — 콜백 변경 시 채널 재구독 방지
  const onBadgeAwardRef = useRef(onBadgeAward)
  useEffect(() => {
    onBadgeAwardRef.current = onBadgeAward
  }, [onBadgeAward])

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.msg_id === msg.msg_id)) return prev
      return [...prev, msg]
    })
  }, [])

  // 메시지 번역 텍스트 교체 — localeCd도 기록해 언어 전환 시 캐시 재사용 (PyTranslate™)
  const applyTranslation = useCallback(
    (msgId: string, transCont: string, localeCd: string) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.msg_id === msgId
            ? { ...m, trans_cont: transCont, trans_locale: localeCd }
            : m,
        ),
      )
    },
    [],
  )

  // 일괄 번역 (forceTranslate — 방 헤더 언어 콤보): 캐시 히트는 응답 map으로,
  // fresh 번역은 진행 중 msg_trans broadcast로도 점진 도착한다 (50건씩 청크)
  const batchTranslate = useCallback(
    async (msgIds: string[]) => {
      if (!userLocale) return
      const locale = userLocale // 클로저 캡처 — async 완료 시점과 일치 보장
      let totalApplied = 0
      let attempted = 0
      for (let i = 0; i < msgIds.length; i += 50) {
        const chunk = msgIds.slice(i, i + 50)
        attempted += chunk.length
        try {
          const res = await piFetch(
            `/api/chat/rooms/${roomId}/translate-batch`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ locale_cd: locale, msg_ids: chunk }),
            },
          )
          if (!res.ok) continue
          const { translations } = (await res.json()) as {
            translations: Record<string, string>
          }
          totalApplied += Object.keys(translations).length
          // trans_locale 기록: 언어 재전환 시 이 번역을 캐시로 재사용
          setMessages((prev) =>
            prev.map((m) =>
              translations[m.msg_id] !== undefined
                ? {
                    ...m,
                    trans_cont: translations[m.msg_id],
                    trans_locale: locale,
                  }
                : m,
            ),
          )
        } catch {} // 실패 청크는 원문 표시 폴백
      }
      // 요청 전부가 실패하면 번역 엔진 장애(API 크레딧 소진 등) — 사용자에게 1회 안내
      if (attempted > 0 && totalApplied === 0) {
        toast.error(
          '번역 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',
        )
      }
    },
    [roomId, userLocale],
  )

  // 수신 메시지 번역 요청 — 두 모드를 단일 함수로 통합.
  // • forceTranslate: batchTranslate를 즉시 호출해 새 수신 메시지도 누락 없이 번역.
  //   (effect만 의존하면 React 배치 타이밍에 따라 신규 메시지가 누락될 수 있음)
  // • 일반 모드: 단건 번역 API로 서버 display_locale_cd 큐를 보완.
  // requestedTransRef dedup으로 두 경로 모두 중복 호출 방지.
  const requestTranslation = useCallback(
    (msg: ChatMessage) => {
      if (!userLocale) return
      if (msg.msg_tp_cd !== 'TEXT' || !msg.msg_cont) return
      if (requestedTransRef.current.has(msg.msg_id)) return
      requestedTransRef.current.add(msg.msg_id)

      if (forceTranslate) {
        // forceTranslate 모드: batchTranslate로 즉시 번역 (캐시 우선 — DB 미스 시 Gemini 호출)
        void batchTranslate([msg.msg_id])
      } else {
        piFetch(`/api/chat/rooms/${roomId}/messages/${msg.msg_id}/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale_cd: userLocale }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data: { trans_cont?: string; same_lang?: boolean } | null) => {
            if (data?.trans_cont && !data.same_lang)
              applyTranslation(msg.msg_id, data.trans_cont, userLocale)
          })
          .catch(() => {}) // 번역 실패는 원문 표시로 자연 폴백 — 카페 흐름을 막지 않음
      }
    },
    [roomId, userLocale, forceTranslate, applyTranslation, batchTranslate],
  )

  // ─── WebSocket(broadcast) 실패 시 polling 폴백 ──────────────────────
  // Pi Browser WebView는 환경에 따라 WebSocket을 차단할 수 있다. broadcast 구독이
  // 실패/끊김 상태가 되면 5초 간격 polling으로 신규 메시지를 따라잡는다 (addMessage dedup).
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // polling 커서 — 마지막 수신 메시지 id (초기/broadcast/polling 모두 최신값 유지)
  const lastMsgIdRef = useRef<string | null>(
    initialMessages.at(-1)?.msg_id ?? null,
  )
  useEffect(() => {
    const last = messages.at(-1)
    if (last) lastMsgIdRef.current = last.msg_id
  }, [messages])

  const pollMessages = useCallback(async () => {
    const params = new URLSearchParams({ limit: '100' })
    if (lastMsgIdRef.current) params.set('after', lastMsgIdRef.current)
    if (userLocale) params.set('locale', userLocale)
    try {
      const res = await piFetch(`/api/chat/rooms/${roomId}/messages?${params}`)
      if (!res.ok) return
      const { messages: newMsgs } = (await res.json()) as {
        messages: ChatMessage[]
      }
      for (const m of newMsgs) {
        addMessage(m)
        requestTranslation(m) // 타인 메시지면 내 언어로 번역 요청 (dedup 내장)
      }
    } catch {} // polling 실패는 다음 주기에 재시도 — 카페 흐름을 막지 않음
  }, [roomId, userLocale, addMessage, requestTranslation])

  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return // 이미 polling 중
    void pollMessages() // 즉시 1회 — 끊긴 동안 쌓인 메시지 즉시 복구
    pollIntervalRef.current = setInterval(() => void pollMessages(), 5000)
  }, [pollMessages])

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  // 표시 언어 변경 시: 대상 언어와 다른 번역만 비움 — 이미 이 언어로 번역된 것은 캐시 유지
  const prevLocaleRef = useRef<string | undefined>(userLocale)
  useEffect(() => {
    if (prevLocaleRef.current === userLocale) return
    prevLocaleRef.current = userLocale
    requestedTransRef.current.clear()
    setMessages((prev) =>
      prev.map((m) => {
        if (m.trans_locale === userLocale) return m // 대상 언어 캐시 유지 (언어 재선택 빠른 복원)
        return m.trans_cont != null
          ? { ...m, trans_cont: null, trans_locale: null }
          : m
      }),
    )
  }, [userLocale])

  // forceTranslate: 초기 로드·scroll-up prepend·언어 변경 후 미번역 메시지 일괄 번역
  // 신규 수신 메시지는 requestTranslation이 즉시 처리하므로 여기서 중복 처리 안 됨 (requestedTransRef dedup)
  useEffect(() => {
    if (!forceTranslate || !userLocale) return
    const ids = messages
      .filter(
        (m) =>
          m.msg_tp_cd === 'TEXT' &&
          m.msg_cont &&
          m.trans_cont == null &&
          !requestedTransRef.current.has(m.msg_id),
      )
      .map((m) => m.msg_id)
    if (ids.length === 0) return
    ids.forEach((id) => requestedTransRef.current.add(id))
    void batchTranslate(ids)
  }, [messages, forceTranslate, userLocale, batchTranslate])

  const removeMessage = useCallback((msgId: string) => {
    setMessages((prev) => prev.filter((m) => m.msg_id !== msgId))
  }, [])

  // 서버 응답으로 낙관적 temp 메시지를 교체
  // 서버가 클라이언트 UUID를 그대로 사용하므로 tempId === realMsg.msg_id 가 일반적
  // → 이 경우 제자리 업데이트(서버 타임스탬프 반영), 삭제 후 재추가 안 함
  // → 이후 도착하는 브로드캐스트는 addMessage dedup으로 무시됨
  const replaceMessage = useCallback((tempId: string, realMsg: ChatMessage) => {
    setMessages((prev) => {
      if (tempId === realMsg.msg_id) {
        // 서버가 클라이언트 UUID 그대로 사용 — 제자리 교체
        return prev.map((m) => (m.msg_id === tempId ? realMsg : m))
      }
      // 서버가 새 UUID를 생성한 경우 (레거시 경로)
      if (prev.some((m) => m.msg_id === realMsg.msg_id)) {
        // 브로드캐스트가 먼저 도착 → temp만 제거
        return prev.filter((m) => m.msg_id !== tempId)
      }
      // API 응답이 먼저 도착 → temp → real 교체
      return prev.map((m) => (m.msg_id === tempId ? realMsg : m))
    })
  }, [])

  const prependMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.msg_id))
      const newMsgs = msgs.filter((m) => !existingIds.has(m.msg_id))
      return [...newMsgs, ...prev]
    })
  }, [])

  // 서버 브로드캐스트 수신 (클라이언트는 수신만 — 발송은 API 서버가 담당)
  // postgres_changes 대신 broadcast를 사용하므로 RLS 설정 불필요
  useEffect(() => {
    const supabase = getSupabaseClient()
    const channel = supabase.channel(`room:${roomId}`)

    channel
      .on('broadcast', { event: BROADCAST_EVENT }, ({ payload }) => {
        const msg = payload as ChatMessage
        addMessage(msg)
        // 다른 사용자의 메시지 → 내 표시 언어로 자동 번역 요청 (백그라운드)
        requestTranslation(msg)
      })
      .on('broadcast', { event: TRANS_EVENT }, ({ payload }) => {
        const { msg_id, locale_cd, trans_cont } = payload as MsgTransPayload
        // 내 표시 언어와 일치하는 번역만 적용 — 1회 번역이 같은 locale 전원에게 동시 전달됨
        if (userLocale && locale_cd === userLocale) {
          applyTranslation(msg_id, trans_cont, locale_cd)
        }
      })
      .on('broadcast', { event: BADGE_EVENT }, ({ payload }) => {
        const badge = payload as BadgeAwardPayload
        // 내 배지 수여만 축하 팝업 — 다른 참가자는 SYSTEM 메시지로 확인
        if (badge.usr_id === currentUserId) onBadgeAwardRef.current?.(badge)
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ userId: string }>()
        const ids = Object.values(state)
          .flat()
          .map((p) => p.userId)
        setOnlineUserIds([...new Set(ids)])
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          stopPolling() // WebSocket 정상 — polling 폴백 불필요(복구 시 자동 중지)
          await channel.track({ userId: currentUserId })
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          // Pi Browser WebView가 WebSocket을 막거나 연결이 끊김 → polling 폴백 활성화
          console.warn('[chat] Realtime 연결 실패 — polling 폴백 활성화:', status)
          startPolling()
        }
      })

    channelRef.current = channel

    return () => {
      stopPolling()
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [
    roomId,
    currentUserId,
    userLocale,
    addMessage,
    applyTranslation,
    requestTranslation,
    startPolling,
    stopPolling,
  ])

  const sendMessage = useCallback(
    async (text: string, confirm = false) => {
      const trimmed = text.trim()
      if (!trimmed) return

      const tempId = crypto.randomUUID()
      requestedTransRef.current.add(tempId)
      const tempMsg: ChatMessage = {
        msg_id: tempId,
        room_id: roomId,
        snd_usr_id: currentUserId,
        snd_usr_nm: currentUserDisplayName,
        msg_cont: trimmed,
        msg_tp_cd: 'TEXT',
        attch_url: null,
        stkr_id: null,
        ref_msg_id: null,
        del_yn: 'N',
        reg_dtm: new Date().toISOString(),
      }
      addMessage(tempMsg)

      try {
        const res = await piFetch(`/api/chat/rooms/${roomId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            msg_id: tempId,
            msg_cont: trimmed,
            msg_tp_cd: 'TEXT',
            ...(confirm ? { confirm: true } : {}),
          }),
        })

        if (res.status === 429) {
          removeMessage(tempId)
          throw new Error('rate_limit')
        }
        if (res.status === 402) {
          // @ai 멘션 → 월 한도 초과 → 추가 호출(건당 과금) 또는 구독 유도
          removeMessage(tempId)
          const d = (await res.json().catch(() => ({}))) as {
            feeBean?: number
            insufficientBean?: boolean
          }
          onAiLimitExceeded?.({
            feeBean: d.feeBean,
            insufficientBean: d.insufficientBean,
            text: trimmed,
          })
          return
        }
        if (!res.ok) {
          removeMessage(tempId)
          throw new Error('send_failed')
        }

        const { message } = (await res.json()) as { message: ChatMessage }
        replaceMessage(tempId, message)
      } catch (err) {
        throw err
      }
    },
    [
      roomId,
      currentUserId,
      currentUserDisplayName,
      addMessage,
      removeMessage,
      replaceMessage,
      onAiLimitExceeded,
    ],
  )

  const sendSticker = useCallback(
    async (stkrId: string, stkrUrl: string) => {
      const tempId = crypto.randomUUID()
      // 스티커는 번역 대상 아님 — dedup Set에 미리 추가해 forceTranslate 모드에서도 번역 API 호출 방지
      requestedTransRef.current.add(tempId)
      const tempMsg: ChatMessage = {
        msg_id: tempId,
        room_id: roomId,
        snd_usr_id: currentUserId,
        snd_usr_nm: currentUserDisplayName,
        msg_cont: null,
        msg_tp_cd: 'STICKER',
        attch_url: stkrUrl,
        stkr_id: stkrId,
        ref_msg_id: null,
        del_yn: 'N',
        reg_dtm: new Date().toISOString(),
      }
      addMessage(tempMsg)

      try {
        const res = await piFetch(`/api/chat/rooms/${roomId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            msg_id: tempId,
            msg_tp_cd: 'STICKER',
            stkr_id: stkrId,
            attch_url: stkrUrl,
          }),
        })

        if (!res.ok) {
          removeMessage(tempId)
          throw new Error('send_failed')
        }

        const { message } = (await res.json()) as { message: ChatMessage }
        replaceMessage(tempId, message)
      } catch (err) {
        throw err
      }
    },
    [
      roomId,
      currentUserId,
      currentUserDisplayName,
      addMessage,
      removeMessage,
      replaceMessage,
    ],
  )

  const sendFile = useCallback(
    async (file: File) => {
      const form = new FormData()
      form.append('file', file)

      const uploadRes = await piFetch(`/api/chat/rooms/${roomId}/upload`, {
        method: 'POST',
        body: form,
      })
      if (!uploadRes.ok) throw new Error('upload_failed')

      const { url, msg_tp_cd, file_name } = (await uploadRes.json()) as {
        url: string
        msg_tp_cd: 'IMAGE' | 'VOICE' | 'FILE'
        file_name: string
      }

      const tempId = crypto.randomUUID()
      requestedTransRef.current.add(tempId)
      const tempMsg: ChatMessage = {
        msg_id: tempId,
        room_id: roomId,
        snd_usr_id: currentUserId,
        snd_usr_nm: currentUserDisplayName,
        msg_cont: msg_tp_cd === 'FILE' ? file_name : null,
        msg_tp_cd,
        attch_url: url,
        stkr_id: null,
        ref_msg_id: null,
        del_yn: 'N',
        reg_dtm: new Date().toISOString(),
      }
      addMessage(tempMsg)

      const res = await piFetch(`/api/chat/rooms/${roomId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_id: tempId,
          msg_tp_cd,
          attch_url: url,
          msg_cont: msg_tp_cd === 'FILE' ? file_name : null,
        }),
      })

      if (!res.ok) {
        removeMessage(tempId)
        throw new Error('send_failed')
      }

      const { message } = (await res.json()) as { message: ChatMessage }
      replaceMessage(tempId, message)
    },
    [
      roomId,
      currentUserId,
      currentUserDisplayName,
      addMessage,
      removeMessage,
      replaceMessage,
    ],
  )

  return {
    messages,
    onlineUserIds,
    sendMessage,
    sendSticker,
    sendFile,
    prependMessages,
  }
}
