'use client'
import { useState, useEffect, useCallback } from 'react'
import { useLocale } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { useChatRoom, type ChatMessage } from '@/hooks/use-chat-room'
import { piFetch } from '@/lib/pi-fetch'
import { ChatMessageList } from './chat-message-list'
import { ChatInput } from './chat-input'
import { ChatLocaleSelect } from './chat-locale-select'

interface ChatRoomPanelProps {
  roomId: string
  initialMessages: ChatMessage[]
  currentUserId: string
  currentUserDisplayName: string
  roomNm: string
  roomDesc?: string | null
  themeEmoji?: string
}

// 방별 번역 언어 localStorage 키 — 채팅룸은 독립 공간이므로 방마다 따로 저장
const viewLocaleKey = (roomId: string) => `chat_view_locale:${roomId}`

export function ChatRoomPanel({
  roomId,
  initialMessages,
  currentUserId,
  currentUserDisplayName,
  roomNm,
  roomDesc,
  themeEmoji = '💬',
}: ChatRoomPanelProps) {
  const urlLocale = useLocale()
  // '' = 자동 (URL locale 기준 수신 번역만) / locale 코드 = 이 방 전체 강제 번역
  const [viewLocale, setViewLocale] = useState('')
  const [canTip, setCanTip] = useState(false)
  // 구독 확인 전까지 false(fail-closed) — 비구독자가 짧은 틈에 강제 번역 사용하는 것 방지
  const [isSubscribed, setIsSubscribed] = useState(false)

  // 방 입장 시 이 방에 저장된 번역 언어 복원 (외부 저장소 구독 — 방별 독립)
  useEffect(() => {
    try { setViewLocale(localStorage.getItem(viewLocaleKey(roomId)) ?? '') } catch {}
  }, [roomId])

  const handleLocaleChange = useCallback((cd: string) => {
    setViewLocale(cd)
    try {
      if (cd) localStorage.setItem(viewLocaleKey(roomId), cd)
      else localStorage.removeItem(viewLocaleKey(roomId))
    } catch {}
  }, [roomId])

  // 콤보 선택 언어가 URL locale보다 우선 — 이 방의 모든 메시지가 해당 언어로 보임
  const effectiveLocale = viewLocale || urlLocale

  const { messages, sendMessage, prependMessages } = useChatRoom(
    roomId,
    initialMessages,
    {
      currentUserId,
      currentUserDisplayName,
      userLocale: effectiveLocale,
      // isSubscribed 이중 게이트 — localStorage에 남은 이전 viewLocale이 비구독자에게 활성화되는 것 방지
      forceTranslate: isSubscribed && !!viewLocale,
    },
  )

  useEffect(() => {
    piFetch('/api/subscriptions/check')
      .then(r => r.ok ? r.json() : null)
      .then((d: { canTip?: boolean; tier?: string } | null) => {
        if (d?.canTip) setCanTip(true)
        if (d?.tier && d.tier !== 'FREE') setIsSubscribed(true)
      })
      .catch(() => {})
  }, [])

  return (
    <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
      {/* 제목 섹션 — 고정 (스크롤 안 됨) */}
      <header className='flex shrink-0 items-center gap-3 border-b border-border/50 bg-zinc-200 px-4 py-3 shadow-md dark:bg-zinc-700'>
        <Link
          href='/chat'
          className='shrink-0 text-muted-foreground transition-colors hover:text-foreground'
          aria-label='채팅 목록으로'
        >
          ⬅️
        </Link>
        <span className='shrink-0 text-xl'>{themeEmoji}</span>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-sm font-semibold'>{roomNm}</p>
          {roomDesc && (
            <p className='truncate text-xs text-muted-foreground'>{roomDesc}</p>
          )}
        </div>
        {/* PiTranslate™ 방별 번역 언어 콤보 — 구독자 전용 특혜 */}
        <ChatLocaleSelect value={viewLocale} onChange={handleLocaleChange} isSubscribed={isSubscribed} />
      </header>

      {/* 채팅 본문 — 이 영역만 스크롤 (ChatMessageList 내부 overflow-y-auto) */}
      <ChatMessageList
        roomId={roomId}
        messages={messages}
        currentUserId={currentUserId}
        canTip={canTip}
        userLocale={effectiveLocale}
        prependMessages={prependMessages}
      />

      {/* 채팅 입력 섹션 — 고정 */}
      <ChatInput onSend={sendMessage} />
    </div>
  )
}
