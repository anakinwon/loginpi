'use client'

import { useEffect, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { ChatListView, type RoomWithTheme } from './chat-list-view'

// Pi Browser 전용 카페 목록 게이트.
// 서버가 쿠키로 신원을 못 찾을 때(=쿠키 미저장 Pi Browser, 또는 비로그인) 렌더된다.
// localStorage 토큰을 X-Pi-Token 헤더로 실어(piFetch) 카페 목록을 클라이언트에서 로드한다.
export function ClientChatList() {
  const { user, isLoading: authLoading } = usePiAuth()
  const [myRooms, setMyRooms] = useState<RoomWithTheme[]>([])
  const [discoverRooms, setDiscoverRooms] = useState<RoomWithTheme[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    // 인증 완료(setPiToken→setUser) 전에는 토큰이 없어 401이 나므로 user 확정 후 로드
    if (!user) return
    let cancelled = false

    ;(async () => {
      const res = await piFetch('/api/chat/rooms?include=public')
      if (cancelled) return
      if (!res.ok) {
        setState('error')
        return
      }
      const data = (await res.json()) as {
        rooms?: RoomWithTheme[]
        publicRooms?: RoomWithTheme[]
      }
      const mine = data.rooms ?? []
      const mineIds = new Set(mine.map((r) => r.room_id))
      setMyRooms(mine)
      setDiscoverRooms(
        (data.publicRooms ?? []).filter((r) => !mineIds.has(r.room_id)),
      )
      setState('ready')
    })()

    return () => {
      cancelled = true
    }
  }, [user])

  // Pi SDK 인증 진행 중
  if (authLoading) {
    return (
      <div className="text-muted-foreground py-20 text-center text-sm">
        Pi 계정 인증 중…
      </div>
    )
  }
  // 인증이 끝났는데도 신원 없음 → 비로그인 (일반 브라우저 로그아웃 상태 등)
  if (!user) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground text-sm">
          카페는 로그인 후 이용할 수 있습니다
        </p>
        <Link
          href="/"
          className="text-primary mt-2 inline-block text-sm underline"
        >
          홈으로 이동
        </Link>
      </div>
    )
  }
  if (state === 'loading') {
    return (
      <div className="text-muted-foreground py-20 text-center text-sm">
        카페를 불러오는 중…
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div className="text-muted-foreground py-20 text-center text-sm">
        카페를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
      </div>
    )
  }

  return <ChatListView myRooms={myRooms} discoverRooms={discoverRooms} />
}
