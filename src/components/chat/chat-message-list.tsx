'use client'
import { useEffect, useRef, useCallback, useState } from 'react'
import { piFetch } from '@/lib/pi-fetch'
import type { ChatMessage } from '@/hooks/use-chat-room'
import { PiTipButton } from './pi-tip-button'
import { TranslatedMessage } from './translated-message'

interface ChatMessageListProps {
  roomId: string
  messages: ChatMessage[]
  currentUserId: string
  canTip: boolean
  userLocale?: string // PiTranslate™ — scroll-up 로드 시 캐시된 번역 pre-populate
  prependMessages: (msgs: ChatMessage[]) => void
  onUpgradeForTip?: () => void
}

export function ChatMessageList({
  roomId,
  messages,
  currentUserId,
  canTip,
  userLocale,
  prependMessages,
  onUpgradeForTip,
}: ChatMessageListProps) {
  const [hasMore, setHasMore] = useState(messages.length >= 50)
  const [isLoading, setIsLoading] = useState(false)
  const [oldestMsgId, setOldestMsgId] = useState<string | null>(
    messages[0]?.msg_id ?? null,
  )
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isInitial = useRef(true)
  const lastMsgIdRef = useRef<string | null>(null)

  // 최초 렌더 시 맨 아래로 스크롤
  useEffect(() => {
    if (isInitial.current) {
      bottomRef.current?.scrollIntoView()
      isInitial.current = false
    }
  }, [])

  // 모바일 키보드가 올라오면(뷰포트 높이 감소) 항상 맨 아래로 스크롤
  // 주소창 표시/숨김(~60px) 변화는 무시하고 키보드 수준(100px 초과)의 감소만 반응
  useEffect(() => {
    const vv = window.visualViewport
    // 기준 높이 = 키보드 없는 상태의 뷰포트 높이 (커지면 갱신 — 키보드 내려감·회전 대응)
    let baseHeight = vv?.height ?? window.innerHeight
    const onResize = () => {
      const height = vv?.height ?? window.innerHeight
      if (height >= baseHeight) {
        baseHeight = height
        return
      }
      if (baseHeight - height <= 100) return
      requestAnimationFrame(() => {
        const c = containerRef.current
        if (c) c.scrollTop = c.scrollHeight
      })
    }
    vv?.addEventListener('resize', onResize)
    window.addEventListener('resize', onResize)
    return () => {
      vv?.removeEventListener('resize', onResize)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // 새 메시지가 추가될 때만 스크롤 (제자리 업데이트는 무시)
  // replaceMessage 인플레이스 교체 시 msg_id가 바뀌지 않으므로 이중 스크롤 방지
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (!last || last.msg_id === lastMsgIdRef.current) return
    lastMsgIdRef.current = last.msg_id
    if (last.snd_usr_id === currentUserId) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, currentUserId])

  // scroll-up 무한로드
  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading || !oldestMsgId) return
    setIsLoading(true)

    const container = containerRef.current
    const prevScrollHeight = container?.scrollHeight ?? 0

    const localeQuery = userLocale
      ? `&locale=${encodeURIComponent(userLocale)}`
      : ''
    const res = await piFetch(
      `/api/chat/rooms/${roomId}/messages?limit=50&before=${oldestMsgId}${localeQuery}`,
    )
    if (res.ok) {
      const {
        messages: older,
        hasMore: more,
        oldestMsgId: nextCursor,
      } = await res.json()
      prependMessages(older)
      setHasMore(more)
      setOldestMsgId(nextCursor)

      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight
        }
      })
    }
    setIsLoading(false)
  }, [hasMore, isLoading, oldestMsgId, roomId, userLocale, prependMessages])

  // 스크롤 최상단 감지 → loadMore 호출
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onScroll = () => {
      if (container.scrollTop < 80) loadMore()
    }
    container.addEventListener('scroll', onScroll)
    return () => container.removeEventListener('scroll', onScroll)
  }, [loadMore])

  // 카페 본문 — 유일한 스크롤 영역. overscroll-contain: 끝까지 스크롤해도 페이지 전체로 전파 안 됨
  return (
    <div
      ref={containerRef}
      className="bg-muted/30 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-4 shadow-inner"
    >
      {isLoading && (
        <div className="text-muted-foreground py-2 text-center text-sm">
          불러오는 중...
        </div>
      )}
      {!hasMore && messages.length > 0 && (
        <div className="text-muted-foreground py-2 text-center text-xs">
          대화의 시작입니다
        </div>
      )}
      {messages.map((msg, idx) => {
        const next = messages[idx + 1]
        // 다음 메시지가 동일 발신자 + 동일 분이면 현재 메시지의 시간 숨김
        const hideTime =
          !!next &&
          next.snd_usr_id === msg.snd_usr_id &&
          formatKoreanTime(next.reg_dtm) === formatKoreanTime(msg.reg_dtm) &&
          isSameDay(next.reg_dtm, msg.reg_dtm)
        return (
          <div key={msg.msg_id}>
            {(idx === 0 ||
              !isSameDay(messages[idx - 1].reg_dtm, msg.reg_dtm)) && (
              <DateDivider dtm={msg.reg_dtm} />
            )}
            <MessageBubble
              msg={msg}
              isMe={msg.snd_usr_id === currentUserId}
              canTip={canTip}
              roomId={roomId}
              hideTime={hideTime}
              onUpgradeForTip={onUpgradeForTip}
            />
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

function formatKoreanDate(dtm: string): string {
  const d = new Date(dtm)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DAY_NAMES[d.getDay()]}요일`
}

function DateDivider({ dtm }: { dtm: string }) {
  return (
    <div className="my-3 flex items-center gap-3">
      <div className="bg-border h-px flex-1" />
      <span className="text-muted-foreground text-xs">
        {formatKoreanDate(dtm)}
      </span>
      <div className="bg-border h-px flex-1" />
    </div>
  )
}

// Node.js는 ICU 없이 빌드되면 toLocaleTimeString('ko-KR')이 'PM HH:MM'을 반환해 hydration 불일치 발생.
// 직접 구현으로 서버·클라이언트 동일 출력 보장.
function formatKoreanTime(dtm: string): string {
  const d = new Date(dtm)
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const period = h < 12 ? '오전' : '오후'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${period} ${h12.toString().padStart(2, '0')}:${m}`
}

function MessageBubble({
  msg,
  isMe,
  canTip,
  roomId,
  hideTime,
  onUpgradeForTip,
}: {
  msg: ChatMessage
  isMe: boolean
  canTip: boolean
  roomId: string
  hideTime: boolean
  onUpgradeForTip?: () => void
}) {
  // BET_NOTI(TASK-071)는 SYSTEM과 동일한 중앙 정렬 알림 스타일
  if (
    msg.msg_tp_cd === 'SYSTEM' ||
    msg.msg_tp_cd === 'TIP_NOTI' ||
    msg.msg_tp_cd === 'BET_NOTI'
  ) {
    return (
      <div className="text-muted-foreground py-1 text-center text-xs">
        {/* Bean 알림은 🫘 이모지를 럭셔리 콩 이미지로 치환해 표시 (DB 텍스트는 이모지 유지) */}
        {msg.msg_tp_cd === 'TIP_NOTI' ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/bean-noti.png"
              alt="Bean"
              className="mr-1 inline-block h-7 w-7 align-text-bottom"
            />
            {(msg.msg_cont ?? '').replace(/^🫘\s*/, '')}
          </>
        ) : (
          msg.msg_cont
        )}
        {msg.msg_tp_cd === 'TIP_NOTI' && !canTip && onUpgradeForTip && (
          <button
            onClick={onUpgradeForTip}
            className="text-primary ml-1.5 underline"
          >
            나도 Bean 보내기
          </button>
        )}
      </div>
    )
  }

  if (msg.msg_tp_cd === 'STICKER') {
    return (
      <div
        className={`group flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}
      >
        {!isMe && (
          <span className="text-muted-foreground text-xs">
            {msg.snd_usr_nm}
          </span>
        )}
        {msg.attch_url ? (
          <img
            src={msg.attch_url}
            alt="스티커"
            className="h-24 w-24 rounded-xl object-contain"
          />
        ) : (
          <div className="bg-muted flex h-24 w-24 items-center justify-center rounded-xl text-4xl">
            🎭
          </div>
        )}
        {!hideTime && (
          <span className="text-muted-foreground text-[10px]">
            {formatKoreanTime(msg.reg_dtm)}
          </span>
        )}
      </div>
    )
  }

  // TASK-065: 이미지 첨부 — 클릭 시 원본 크기로 열림
  if (msg.msg_tp_cd === 'IMAGE') {
    return (
      <div
        className={`group flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}
      >
        {!isMe && (
          <span className="text-muted-foreground text-xs">
            {msg.snd_usr_nm}
          </span>
        )}
        {msg.attch_url ? (
          <a href={msg.attch_url} target="_blank" rel="noopener noreferrer">
            <img
              src={msg.attch_url}
              alt="이미지"
              className="max-h-60 max-w-[280px] rounded-xl object-cover"
            />
          </a>
        ) : (
          <div className="bg-muted text-muted-foreground flex h-20 w-40 items-center justify-center rounded-xl text-sm">
            이미지 없음
          </div>
        )}
        {!hideTime && (
          <span className="text-muted-foreground text-[10px]">
            {formatKoreanTime(msg.reg_dtm)}
          </span>
        )}
      </div>
    )
  }

  // TASK-065: 음성 파일 — 인라인 오디오 플레이어
  if (msg.msg_tp_cd === 'VOICE') {
    return (
      <div
        className={`group flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}
      >
        {!isMe && (
          <span className="text-muted-foreground text-xs">
            {msg.snd_usr_nm}
          </span>
        )}
        {msg.attch_url && (
          <audio
            controls
            src={msg.attch_url}
            className="max-w-[280px] rounded-xl"
          />
        )}
        {!hideTime && (
          <span className="text-muted-foreground text-[10px]">
            {formatKoreanTime(msg.reg_dtm)}
          </span>
        )}
      </div>
    )
  }

  // TASK-065: 일반 파일 — 다운로드 링크
  if (msg.msg_tp_cd === 'FILE') {
    return (
      <div
        className={`group flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}
      >
        {!isMe && (
          <span className="text-muted-foreground text-xs">
            {msg.snd_usr_nm}
          </span>
        )}
        <a
          href={msg.attch_url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-sm ${isMe ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-bl-sm'}`}
        >
          <span>📄</span>
          <span className="max-w-[200px] truncate">
            {msg.msg_cont ?? '파일'}
          </span>
        </a>
        {!hideTime && (
          <span className="text-muted-foreground text-[10px]">
            {formatKoreanTime(msg.reg_dtm)}
          </span>
        )}
      </div>
    )
  }

  // TASK-064: AI 봇 응답 — 보라색 말풍선 + 🤖 뱃지로 일반 사용자 메시지와 구분
  if (msg.msg_tp_cd === 'AI_REPLY') {
    return (
      <div className="group flex flex-col items-start gap-0.5">
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          <span>🤖</span>
          <span>PiCafé AI</span>
        </span>
        <div className="max-w-[70%] rounded-2xl rounded-bl-sm bg-violet-100 px-3 py-2 text-sm dark:bg-violet-900/40">
          {msg.msg_cont}
        </div>
        {!hideTime && (
          <span className="text-muted-foreground text-[10px]">
            {formatKoreanTime(msg.reg_dtm)}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      className={`group flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}
    >
      {!isMe && (
        <span className="text-muted-foreground text-xs">{msg.snd_usr_nm}</span>
      )}
      <div
        className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${
          isMe
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted rounded-bl-sm'
        }`}
      >
        {/* PiTranslate™ — 번역본이 있고 원문과 다르면 번역 표시 + 원문 토글 + 👍/👎 피드백 */}
        {msg.trans_cont && msg.trans_cont !== msg.msg_cont ? (
          <TranslatedMessage
            original={msg.msg_cont ?? ''}
            translated={msg.trans_cont}
            roomId={roomId}
            msgId={msg.msg_id}
            localeCd={msg.trans_locale}
          />
        ) : (
          msg.msg_cont
        )}
      </div>
      {!hideTime && (
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-[10px]">
            {formatKoreanTime(msg.reg_dtm)}
          </span>
          {!isMe && canTip && (
            <PiTipButton
              roomId={roomId}
              recipientId={msg.snd_usr_id}
              recipientName={msg.snd_usr_nm}
            />
          )}
        </div>
      )}
    </div>
  )
}
