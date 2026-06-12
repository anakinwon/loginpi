'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { readCache, writeCache } from '@/lib/client-cache'
import { ChatListView, type RoomWithTheme } from './chat-list-view'

// 카페 목록 캐시 — Pi Browser는 HTTP 캐시 보장이 없으므로 localStorage SWR로 재방문 즉시 표시
const CACHE_MAX_AGE_MS = 10 * 60_000 // 10분 — 초과 시 캐시 무시하고 스켈레톤부터

interface RoomsPayload {
  rooms: RoomWithTheme[]
  publicRooms: RoomWithTheme[]
}

// Pi Browser 전용 카페 목록 게이트.
// 서버가 쿠키로 신원을 못 찾을 때(=쿠키 미저장 Pi Browser, 또는 비로그인) 렌더된다.
// localStorage 토큰을 X-Pi-Token 헤더로 실어(piFetch) 카페 목록을 클라이언트에서 로드한다.
// 성능: ① 캐시된 목록 즉시 표시(SWR) ② ChatListView를 로딩 완료 전에 렌더해
//        마켓플레이스 fetch가 카페 목록 fetch와 병렬로 시작되도록 한다.
export function ClientChatList() {
  const t = useTranslations('chat.list')
  const { user, isLoading: authLoading } = usePiAuth()
  const [myRooms, setMyRooms] = useState<RoomWithTheme[]>([])
  const [discoverRooms, setDiscoverRooms] = useState<RoomWithTheme[]>([])
  // loading: 캐시도 네트워크 응답도 없는 상태 (섹션 스켈레톤 표시)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    // 인증 완료(setPiToken→setUser) 전에는 토큰이 없어 401이 나므로 user 확정 후 로드
    if (!user) return
    let cancelled = false
    const cacheKey = `chat_list_${user.userId}`

    const apply = (data: RoomsPayload) => {
      const mine = data.rooms ?? []
      const mineIds = new Set(mine.map((r) => r.room_id))
      setMyRooms(mine)
      setDiscoverRooms(
        (data.publicRooms ?? []).filter((r) => !mineIds.has(r.room_id)),
      )
      setLoading(false)
    }

    // 1) 캐시 즉시 표시 (stale) — 재방문 시 스켈레톤 없이 0ms 렌더
    const cached = readCache<RoomsPayload>(cacheKey, CACHE_MAX_AGE_MS)
    if (cached) apply(cached)

    // 2) 백그라운드 재검증 (revalidate) — 최신 데이터로 교체 + 캐시 갱신
    ;(async () => {
      const res = await piFetch('/api/chat/rooms?include=public').catch(
        () => null,
      )
      if (cancelled) return
      if (!res?.ok) {
        // 네트워크 실패여도 캐시를 이미 표시했다면 그대로 유지
        if (!cached) {
          setLoading(false)
          setError(true)
        }
        return
      }
      const data = (await res.json()) as RoomsPayload
      if (cancelled) return
      apply(data)
      writeCache(cacheKey, data)
    })()

    return () => {
      cancelled = true
    }
  }, [user])

  // Pi SDK 인증 진행 중
  if (authLoading) {
    return (
      <div className="text-muted-foreground py-20 text-center text-sm">
        {t('authenticating')}
      </div>
    )
  }
  // 인증이 끝났는데도 신원 없음 → 비로그인 (일반 브라우저 로그아웃 상태 등)
  if (!user) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground text-sm">
          {t('loginRequired')}
        </p>
        <Link
          href="/"
          className="text-primary mt-2 inline-block text-sm underline"
        >
          {t('goHome')}
        </Link>
      </div>
    )
  }
  if (error) {
    return (
      <div className="text-muted-foreground py-20 text-center text-sm">
        {t('loadFailed')}
      </div>
    )
  }

  // 로딩 중에도 ChatListView를 렌더 — 마켓플레이스가 즉시 마운트되어 병렬 fetch 시작
  return (
    <ChatListView
      myRooms={myRooms}
      discoverRooms={discoverRooms}
      roomsLoading={loading}
    />
  )
}
