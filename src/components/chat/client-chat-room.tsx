'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { ChatRoomPanel } from './chat-room-panel'
import type { ChatMessage } from '@/hooks/use-chat-room'

type RoomInfo = { room_nm: string; room_desc: string | null; theme_cd: string }
type PublicPreview = {
  room_nm: string
  theme_cd: string
  room_tp_cd?: 'D' | 'G' | 'E'
  entry_fee_pi?: number
  entry_expire_dtm?: string | null
}

// Pi Browser 전용 채팅방 게이트.
// 서버가 쿠키로 신원을 못 찾을 때 렌더되며, localStorage 토큰을 X-Pi-Token 헤더로 실어
// 방 정보·초기 메시지를 클라이언트에서 로드한 뒤 ChatRoomPanel(실시간 패널)에 전달한다.
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className='fixed inset-x-0 top-14 bottom-0 z-40 mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-2 bg-background text-center text-sm text-muted-foreground'>
      {children}
    </div>
  )
}

export function ClientChatRoom({ roomId }: { roomId: string }) {
  const { user, isLoading: authLoading } = usePiAuth()
  const userLocale = useLocale()
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [themeEmoji, setThemeEmoji] = useState('💬')
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'joinable' | 'joining' | 'forbidden' | 'error'>('loading')
  const [joinPreview, setJoinPreview] = useState<PublicPreview | null>(null)
  const [loadKey, setLoadKey] = useState(0)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    ;(async () => {
      setState('loading')
      const roomRes = await piFetch(`/api/chat/rooms/${roomId}`)
      if (cancelled) return
      if (roomRes.status === 403) {
        try {
          const errData = (await roomRes.json()) as { isPublic?: boolean; room?: PublicPreview }
          if (errData.isPublic && errData.room) {
            setJoinPreview(errData.room)
            setState('joinable')
          } else {
            setState('forbidden')
          }
        } catch {
          setState('forbidden')
        }
        return
      }
      if (!roomRes.ok) {
        setState('error')
        return
      }
      const roomData = (await roomRes.json()) as { room: RoomInfo; themeEmoji?: string }

      // locale 전달 → 캐시된 번역(trans_cont) pre-populate (PiTranslate™)
      const msgRes = await piFetch(`/api/chat/rooms/${roomId}/messages?limit=50&locale=${encodeURIComponent(userLocale)}`)
      if (cancelled) return
      if (!msgRes.ok) {
        setState('error')
        return
      }
      const msgData = (await msgRes.json()) as { messages: ChatMessage[] }

      setRoom(roomData.room)
      setThemeEmoji(roomData.themeEmoji ?? '💬')
      setInitialMessages(msgData.messages ?? [])
      setState('ready')
    })()

    return () => {
      cancelled = true
    }
  }, [user, roomId, loadKey, userLocale])

  const handleJoin = useCallback(async () => {
    setState('joining')
    try {
      const res = await piFetch(`/api/chat/rooms/${roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        setLoadKey((k) => k + 1)
      } else if (res.status === 402) {
        // 유료 이벤트방 — 결제 필요. 미리보기에 입장료를 채워 결제 CTA로 전환
        const d = (await res.json()) as { entryFeePi?: number }
        setJoinPreview(prev => prev
          ? { ...prev, room_tp_cd: 'E', entry_fee_pi: d.entryFeePi ?? 0 }
          : { room_nm: '', theme_cd: '', room_tp_cd: 'E', entry_fee_pi: d.entryFeePi ?? 0 })
        setState('joinable')
      } else {
        setState('forbidden')
      }
    } catch {
      setState('forbidden')
    }
  }, [roomId])

  // TASK-062 Trigger 8: 이벤트방 유료 입장 — Pi 결제 완료 시 payments/complete가 GUEST 삽입
  const handlePaidJoin = useCallback((entryFeePi: number, roomNm: string) => {
    if (!window.Pi) {
      setState('forbidden')
      return
    }
    setState('joining')
    window.Pi.createPayment(
      {
        amount: entryFeePi,
        memo: `이벤트방 입장: ${roomNm}`.slice(0, 100),
        metadata: { type: 'EVENT_ROOM_JOIN', room_id: roomId },
      },
      {
        onReadyForServerApproval: async (paymentId) => {
          await fetch('/api/payments/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId }),
          })
        },
        onReadyForServerCompletion: async (paymentId, txid) => {
          const res = await fetch('/api/payments/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId, txid }),
          })
          if (res.ok) setLoadKey((k) => k + 1)
          else setState('joinable')
        },
        onCancel: () => setState('joinable'),
        onError: () => setState('joinable'),
      },
    )
  }, [roomId])

  if (authLoading) return <Centered>Pi 계정 인증 중…</Centered>
  if (!user) {
    return (
      <Centered>
        채팅은 로그인 후 이용할 수 있습니다
        <Link href='/' className='text-primary underline'>홈으로 이동</Link>
      </Centered>
    )
  }
  if (state === 'loading') return <Centered>채팅방을 불러오는 중…</Centered>

  if (state === 'joinable' || state === 'joining') {
    const isPaidEvent = joinPreview?.room_tp_cd === 'E' && (joinPreview.entry_fee_pi ?? 0) > 0
    return (
      <Centered>
        {joinPreview?.room_nm && <p className='font-semibold'>{joinPreview.room_nm}</p>}
        {isPaidEvent ? (
          <>
            <p>🎟️ 유료 이벤트방입니다</p>
            <p className='text-lg font-bold text-primary'>입장료 π{joinPreview.entry_fee_pi}</p>
            {joinPreview.entry_expire_dtm && (
              <p className='text-xs'>
                이벤트 종료: {new Date(joinPreview.entry_expire_dtm).toLocaleString('ko-KR')}
              </p>
            )}
            <button
              type='button'
              disabled={state === 'joining'}
              onClick={() => handlePaidJoin(joinPreview.entry_fee_pi ?? 0, joinPreview.room_nm)}
              className='rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50'
            >
              {state === 'joining' ? '결제 진행 중…' : `π${joinPreview.entry_fee_pi} 결제하고 입장`}
            </button>
          </>
        ) : (
          <>
            <p>공개 채팅방입니다. 입장하시겠습니까?</p>
            <button
              type='button'
              disabled={state === 'joining'}
              onClick={handleJoin}
              className='rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50'
            >
              {state === 'joining' ? '입장 중…' : '입장하기'}
            </button>
          </>
        )}
        <Link href='/chat' className='text-xs text-muted-foreground underline'>
          목록으로
        </Link>
      </Centered>
    )
  }

  if (state === 'forbidden') {
    return (
      <Centered>
        채팅방 멤버가 아닙니다
        <Link href='/chat' className='text-primary underline'>채팅 목록으로</Link>
      </Centered>
    )
  }
  if (state === 'error') {
    return (
      <Centered>
        채팅방을 불러오지 못했습니다
        <Link href='/chat' className='text-primary underline'>채팅 목록으로</Link>
      </Centered>
    )
  }

  return (
    // 화면 직접 고정 프레임 (top-14 ~ bottom-0) — Footer 영향 없이 본문만 스크롤
    <div className='fixed inset-x-0 top-14 bottom-0 z-40 mx-auto flex w-full max-w-2xl flex-col overflow-hidden bg-background'>
      {/* 헤더(제목+언어콤보 고정)·메시지(스크롤)·입력창(고정)은 ChatRoomPanel이 렌더 */}
      <ChatRoomPanel
        roomId={roomId}
        initialMessages={initialMessages}
        currentUserId={user.userId}
        currentUserDisplayName={user.displayName}
        roomNm={room?.room_nm ?? ''}
        roomDesc={room?.room_desc}
        themeEmoji={themeEmoji}
      />
    </div>
  )
}
