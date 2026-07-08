'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { BeanIcon } from '@/components/ui/bean-icon'
import { ChatRoomPanel } from './chat-room-panel'
import type { ChatMessage } from '@/hooks/use-chat-room'

type RoomInfo = { room_nm: string; room_desc: string | null; theme_cd: string }
type PublicPreview = {
  room_nm: string
  theme_cd: string
}

// Pi Browser 전용 카페 게이트.
// 서버가 쿠키로 신원을 못 찾을 때 렌더되며, localStorage 토큰을 X-Pi-Token 헤더로 실어
// 방 정보·초기 메시지를 클라이언트에서 로드한 뒤 ChatRoomPanel(실시간 패널)에 전달한다.
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-muted-foreground fixed inset-x-0 top-[var(--chat-top,3.5rem)] bottom-0 z-40 mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-2 text-center text-sm">
      {children}
    </div>
  )
}

export function ClientChatRoom({ roomId }: { roomId: string }) {
  const { user, isLoading: authLoading } = usePiAuth()
  const userLocale = useLocale()
  const t = useTranslations('chat')
  const tc = useTranslations('common')
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [themeEmoji, setThemeEmoji] = useState('💬')
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([])
  const [state, setState] = useState<
    | 'loading'
    | 'ready'
    | 'joinable'
    | 'joining'
    | 'forbidden'
    | 'error'
    | 'expired'
  >('loading')
  const [joinPreview, setJoinPreview] = useState<PublicPreview | null>(null)
  // 남의 프리미엄방 입장 시 Bean 소진 사전 안내용 (서버 requiresBeanConfirm 응답)
  const [beanConfirm, setBeanConfirm] = useState<{
    feeBean: number
    balance: number
  } | null>(null)
  const [loadKey, setLoadKey] = useState(0)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    ;(async () => {
      setState('loading')
      const roomRes = await piFetch(`/api/chat/rooms/${roomId}`)
      if (cancelled) return
      if (roomRes.status === 410) {
        // 기간 만료 카페 — 방장·멤버 포함 입장 불가
        setState('expired')
        return
      }
      if (roomRes.status === 403) {
        try {
          const errData = (await roomRes.json()) as {
            isPublic?: boolean
            room?: PublicPreview
          }
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
      const roomData = (await roomRes.json()) as {
        room: RoomInfo
        themeEmoji?: string
      }

      // locale 전달 → 캐시된 번역(trans_cont) pre-populate (PyTranslate™)
      const msgRes = await piFetch(
        `/api/chat/rooms/${roomId}/messages?limit=50&locale=${encodeURIComponent(userLocale)}`,
      )
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

  // confirm=true이면 Bean 차감을 승인하고 입장 (소진 안내 후 사용자가 '입장' 누른 경우)
  const handleJoin = useCallback(
    async (confirm = false) => {
      setState('joining')
      try {
        const res = await piFetch(`/api/chat/rooms/${roomId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(confirm ? { confirm: true } : {}),
        })
        const d = (await res.json().catch(() => ({}))) as {
          requiresBeanConfirm?: boolean
          requiresBean?: boolean
          feeBean?: number
          balance?: number
        }

        // 1) Bean 소진 사전 안내 — 차감 전, 입장 여부 확인 UI로 전환
        //    (프리미엄 카페·이벤트방 입장료 모두 동일 Bean 확인 흐름을 탄다)
        if (d.requiresBeanConfirm) {
          setBeanConfirm({ feeBean: d.feeBean ?? 0, balance: d.balance ?? 0 })
          setState('joinable')
          return
        }
        if (res.ok) {
          setBeanConfirm(null)
          setLoadKey((k) => k + 1)
          return
        }
        // 2) Bean 잔액 부족
        if (res.status === 402 && d.requiresBean) {
          setBeanConfirm({ feeBean: d.feeBean ?? 0, balance: d.balance ?? 0 })
          setState('joinable')
          return
        }
        // 3) 기간 만료 카페·종료된 이벤트방
        if (res.status === 410) {
          setState('expired')
          return
        }
        setState('forbidden')
      } catch {
        setState('forbidden')
      }
    },
    [roomId],
  )

  // 이벤트방 입장료도 Bean으로 전환됨(PRD_15_FEE #6) — 별도 Pi 결제 핸들러 불필요.
  // 위 handleJoin이 /join 응답(requiresBeanConfirm)을 받아 동일 Bean 확인 흐름으로 처리한다.

  if (authLoading) return <Centered>{t('list.authenticating')}</Centered>
  if (!user) {
    return (
      <Centered>
        {t('list.loginRequired')}
        <Link href="/" className="text-primary underline">
          {t('list.goHome')}
        </Link>
      </Centered>
    )
  }
  if (state === 'loading')
    return <Centered>{t('clientRoom.loadingRoom')}</Centered>

  if (state === 'joinable' || state === 'joining') {
    return (
      <Centered>
        {joinPreview?.room_nm && (
          <p className="font-semibold">{joinPreview.room_nm}</p>
        )}
        {beanConfirm ? (
          beanConfirm.balance >= beanConfirm.feeBean ? (
            <>
              <p>
                <BeanIcon className="inline-block h-4 w-4 align-text-bottom" />{' '}
                {t.rich('clientRoom.beanEntryNotice', {
                  fee: beanConfirm.feeBean,
                  b: (chunks) => <b className="text-primary">{chunks}</b>,
                })}
              </p>
              <p className="text-xs">
                {t('clientRoom.beanBalanceAfter', {
                  balance: beanConfirm.balance,
                  after: beanConfirm.balance - beanConfirm.feeBean,
                })}
              </p>
              <button
                type="button"
                disabled={state === 'joining'}
                onClick={() => handleJoin(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {state === 'joining'
                  ? t('clientRoom.entering')
                  : t('clientRoom.spendBeanEnter', {
                      fee: beanConfirm.feeBean,
                    })}
              </button>
            </>
          ) : (
            <>
              <p>
                <BeanIcon className="inline-block h-4 w-4 align-text-bottom" />{' '}
                {t.rich('clientRoom.beanInsufficient', {
                  fee: beanConfirm.feeBean,
                  b: (chunks) => <b className="text-primary">{chunks}</b>,
                })}
              </p>
              <p className="text-xs">
                {t('clientRoom.currentBalance', {
                  balance: beanConfirm.balance,
                })}
              </p>
              <Link
                href="/bean"
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors"
              >
                {t('clientRoom.chargeBean')}
              </Link>
            </>
          )
        ) : (
          <>
            <p>{t('clientRoom.publicJoinConfirm')}</p>
            <button
              type="button"
              disabled={state === 'joining'}
              onClick={() => handleJoin()}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {state === 'joining'
                ? t('clientRoom.entering')
                : t('clientRoom.enter')}
            </button>
          </>
        )}
        <Link href="/chat" className="text-muted-foreground text-xs underline">
          {tc('backToList')}
        </Link>
      </Centered>
    )
  }

  if (state === 'expired') {
    return (
      <Centered>
        <p className="font-semibold">{t('clientRoom.expiredTitle')}</p>
        <p className="text-xs">{t('clientRoom.expiredDesc')}</p>
        <Link href="/chat" className="text-primary underline">
          {t('room.backToList')}
        </Link>
      </Centered>
    )
  }
  if (state === 'forbidden') {
    return (
      <Centered>
        {t('clientRoom.notMember')}
        <Link href="/chat" className="text-primary underline">
          {t('room.backToList')}
        </Link>
      </Centered>
    )
  }
  if (state === 'error') {
    return (
      <Centered>
        {t('clientRoom.loadFailed')}
        <Link href="/chat" className="text-primary underline">
          {t('room.backToList')}
        </Link>
      </Centered>
    )
  }

  return (
    // 화면 직접 고정 프레임 (top=헤더+배너 오프셋 ~ bottom-0) — Footer 영향 없이 본문만 스크롤
    //   top-[var(--chat-top,3.5rem)]: staging 배너 유무에 따라 layout이 주입한 오프셋(겹침 방지)
    <div className="bg-background fixed inset-x-0 top-[var(--chat-top,3.5rem)] bottom-0 z-40 mx-auto flex w-full max-w-2xl flex-col overflow-hidden">
      {/* 헤더(제목+언어콤보 고정)·메시지(스크롤)·입력창(고정)은 ChatRoomPanel이 렌더 */}
      <ChatRoomPanel
        roomId={roomId}
        initialMessages={initialMessages}
        currentUserId={user.userId}
        currentUserDisplayName={user.displayName}
        roomNm={room?.room_nm ?? ''}
        roomDesc={room?.room_desc}
        themeEmoji={themeEmoji}
        themeCd={room?.theme_cd}
      />
    </div>
  )
}
