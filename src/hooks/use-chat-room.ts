'use client'
import { useEffect, useRef, useCallback, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

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

interface UseChatRoomReturn {
  messages: ChatMessage[]
  onlineUserIds: string[]
  addMessage: (msg: ChatMessage) => void
  prependMessages: (msgs: ChatMessage[]) => void
}

export function useChatRoom(
  roomId: string,
  initialMessages: ChatMessage[],
): UseChatRoomReturn {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([])
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => {
      // 중복 방지 (낙관적 업데이트 + Realtime 이중 수신 시)
      if (prev.some(m => m.msg_id === msg.msg_id)) return prev
      return [...prev, msg]
    })
  }, [])

  // scroll-up 무한로드: 이전 메시지 앞에 추가
  const prependMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages(prev => {
      const existingIds = new Set(prev.map(m => m.msg_id))
      const newMsgs = msgs.filter(m => !existingIds.has(m.msg_id))
      return [...newMsgs, ...prev]
    })
  }, [])

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!url || !key) return

    const supabase = createClient(url, key)
    const channel = supabase.channel(`room:${roomId}`)

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'msg_msg',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => addMessage(payload.new as ChatMessage),
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ userId: string }>()
        const ids = Object.values(state).flat().map(p => p.userId)
        setOnlineUserIds([...new Set(ids)])
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, addMessage])

  return { messages, onlineUserIds, addMessage, prependMessages }
}
