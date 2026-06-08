'use client'
import { useEffect, useRef, useCallback, useState } from 'react'
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
  del_yn: 'Y' | 'N'
  reg_dtm: string
}

interface UseChatRoomOptions {
  currentUserId: string
  currentUserDisplayName: string
}

interface UseChatRoomReturn {
  messages: ChatMessage[]
  onlineUserIds: string[]
  sendMessage: (text: string) => Promise<void>
  prependMessages: (msgs: ChatMessage[]) => void
}

const BROADCAST_EVENT = 'new_msg'

export function useChatRoom(
  roomId: string,
  initialMessages: ChatMessage[],
  { currentUserId, currentUserDisplayName }: UseChatRoomOptions,
): UseChatRoomReturn {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([])
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseClient>['channel']> | null>(null)

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => {
      if (prev.some(m => m.msg_id === msg.msg_id)) return prev
      return [...prev, msg]
    })
  }, [])

  const removeMessage = useCallback((msgId: string) => {
    setMessages(prev => prev.filter(m => m.msg_id !== msgId))
  }, [])

  // 서버 응답(real msg_id)과 서버 브로드캐스트 간 경쟁 조건 처리:
  // - 브로드캐스트가 먼저 도착한 경우: real msg_id가 이미 존재 → temp만 제거
  // - API 응답이 먼저 도착한 경우: temp → real로 교체 → 이후 브로드캐스트는 dedup으로 무시
  const replaceMessage = useCallback((tempId: string, realMsg: ChatMessage) => {
    setMessages(prev => {
      if (prev.some(m => m.msg_id === realMsg.msg_id)) {
        return prev.filter(m => m.msg_id !== tempId)
      }
      return prev.map(m => m.msg_id === tempId ? realMsg : m)
    })
  }, [])

  const prependMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages(prev => {
      const existingIds = new Set(prev.map(m => m.msg_id))
      const newMsgs = msgs.filter(m => !existingIds.has(m.msg_id))
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
        addMessage(payload as ChatMessage)
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ userId: string }>()
        const ids = Object.values(state).flat().map(p => p.userId)
        setOnlineUserIds([...new Set(ids)])
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ userId: currentUserId })
        }
      })

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [roomId, currentUserId, addMessage])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    // 발신자 낙관적 업데이트: 서버 응답을 기다리지 않고 즉시 표시
    // tempId는 클라이언트에서만 유효한 임시 식별자
    // 다른 클라이언트는 서버 브로드캐스트(API POST 후)로 메시지를 수신함 — 신원 검증됨
    const tempId = crypto.randomUUID()
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
      // piFetch: Pi Browser는 X-Pi-Token 헤더, 일반 브라우저는 쿠키로 인증
      const res = await piFetch(`/api/chat/rooms/${roomId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg_cont: trimmed, msg_tp_cd: 'TEXT' }),
      })

      if (res.status === 429) {
        removeMessage(tempId)
        throw new Error('rate_limit')
      }
      if (!res.ok) {
        removeMessage(tempId)
        throw new Error('send_failed')
      }

      const { message } = await res.json() as { message: ChatMessage }
      // API 응답의 실제 메시지로 교체 (서버 타임스탬프 + 검증된 신원)
      replaceMessage(tempId, message)
    } catch (err) {
      throw err
    }
  }, [roomId, currentUserId, currentUserDisplayName, addMessage, removeMessage, replaceMessage])

  return { messages, onlineUserIds, sendMessage, prependMessages }
}
