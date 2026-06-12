'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { readCache, writeCache } from '@/lib/client-cache'
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll'

const PAGE_SIZE = 10
// 기본(전체 테마) 뷰만 localStorage SWR 캐시 — 재방문 시 즉시 표시 후 백그라운드 갱신
// rooms·themes는 공용 데이터라 사용자 무관 캐시 안전. followedThemes(사용자별)는 네트워크 전용
const MARKET_CACHE_KEY = 'chat_market_all'
const MARKET_CACHE_MAX_AGE_MS = 10 * 60_000

// TASK-070: 카페 마켓플레이스 — 테마 필터 칩 + 인기 랭킹 + 테마 팔로우
// 데이터는 클라이언트에서 piFetch로 로드 (Pi Browser X-Pi-Token 이중 경로 자동 지원)
// 목록은 무한 스크롤 — PAGE_SIZE씩 노출하고 스크롤 끝 도달 시 추가 렌더 (성능 튜닝)

interface MarketRoom {
  room_id: string
  room_nm: string
  room_desc: string | null
  theme_cd: string
  theme_nm: string
  theme_emoji: string
  theme_tp_cd: string
  room_tp_cd: string
  max_mbr_cnt: number
  entry_fee_pi: number
  entry_expire_dtm: string | null
  mbr_cnt: number
  msg_cnt_7d: number
  tip_amt_7d: number
  score: number
}

interface MarketTheme {
  theme_cd: string
  theme_nm: string
  theme_emoji: string
  theme_tp_cd: string
}

const RANK_BADGES = ['🥇', '🥈', '🥉'] as const

export function ChatMarketplace() {
  const [rooms, setRooms] = useState<MarketRoom[]>([])
  const [themes, setThemes] = useState<MarketTheme[]>([])
  const [followed, setFollowed] = useState<Set<string>>(new Set())
  const [activeTheme, setActiveTheme] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const load = useCallback(async (theme: string | null) => {
    setVisibleCount(PAGE_SIZE) // 테마 전환·재로드 시 첫 페이지 분량으로 리셋

    // 기본 뷰: 캐시 즉시 표시 (stale) → 아래 네트워크 응답으로 교체 (revalidate)
    let servedFromCache = false
    if (!theme) {
      const cached = readCache<{ rooms: MarketRoom[]; themes: MarketTheme[] }>(
        MARKET_CACHE_KEY,
        MARKET_CACHE_MAX_AGE_MS,
      )
      if (cached) {
        setRooms(cached.rooms)
        setThemes(cached.themes)
        servedFromCache = true
      }
    }
    setLoading(!servedFromCache)

    try {
      const qs = theme ? `?theme=${encodeURIComponent(theme)}` : ''
      const res = await piFetch(`/api/chat/marketplace${qs}`)
      if (!res.ok) return
      const data = (await res.json()) as {
        rooms: MarketRoom[]
        themes: MarketTheme[]
        followedThemes: string[]
      }
      setRooms(data.rooms)
      setThemes(data.themes)
      setFollowed(new Set(data.followedThemes))
      if (!theme) {
        writeCache(MARKET_CACHE_KEY, { rooms: data.rooms, themes: data.themes })
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(null)
  }, [load])

  // 앞에서부터 visibleCount개 노출 + 전역 순위(rank) 부여 — 🥇🥈🥉는 전역 TOP 3에만 표시
  const visibleRooms = useMemo(
    () => rooms.slice(0, visibleCount).map((room, i) => ({ room, rank: i })),
    [rooms, visibleCount],
  )
  const hasMore = visibleCount < rooms.length

  // 스크롤 끝 sentinel 도달 시 PAGE_SIZE만큼 추가 노출
  const sentinelRef = useInfiniteScroll({
    hasMore,
    loading,
    onLoadMore: () => setVisibleCount((c) => c + PAGE_SIZE),
  })

  function selectTheme(theme: string | null) {
    setActiveTheme(theme)
    void load(theme)
  }

  async function toggleFollow(themeCd: string) {
    const isFollowing = followed.has(themeCd)
    // 낙관적 업데이트 — 실패 시 롤백
    setFollowed((prev) => {
      const next = new Set(prev)
      if (isFollowing) next.delete(themeCd)
      else next.add(themeCd)
      return next
    })
    const res = await piFetch(`/api/chat/themes/${themeCd}/follow`, {
      method: isFollowing ? 'DELETE' : 'POST',
    })
    if (!res.ok) {
      setFollowed((prev) => {
        const next = new Set(prev)
        if (isFollowing) next.add(themeCd)
        else next.delete(themeCd)
        return next
      })
      toast.error('팔로우 변경에 실패했습니다')
    } else if (!isFollowing) {
      toast.success('테마를 팔로우했습니다 — 신규 이벤트방 알림을 받습니다')
    }
  }

  return (
    <section className="bg-muted/30 rounded-2xl p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <span
            className="bg-primary h-5 w-1 shrink-0 rounded-full"
            aria-hidden
          />
          마켓플레이스 — 인기 카페
        </h2>
      </div>

      {/* 테마 필터 칩 */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => selectTheme(null)}
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            activeTheme === null
              ? 'border-primary bg-primary text-primary-foreground'
              : 'hover:bg-muted'
          }`}
        >
          전체
        </button>
        {themes.map((t) => (
          <button
            key={t.theme_cd}
            onClick={() => selectTheme(t.theme_cd)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              activeTheme === t.theme_cd
                ? 'border-primary bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
          >
            {t.theme_emoji} {t.theme_nm}
          </button>
        ))}
      </div>

      {/* 선택 테마 팔로우 토글 */}
      {activeTheme && (
        <button
          onClick={() => toggleFollow(activeTheme)}
          className={`mb-4 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            followed.has(activeTheme)
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          {followed.has(activeTheme)
            ? '✓ 팔로우 중 — 이벤트방 알림 ON'
            : '+ 이 테마 팔로우 (이벤트방 알림)'}
        </button>
      )}

      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-muted/40 h-16 animate-pulse rounded-xl border"
            />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="rounded-xl border border-dashed py-8 text-center">
          <p className="text-muted-foreground text-sm">
            해당 테마의 공개 카페가 아직 없습니다
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visibleRooms.map(({ room, rank }) => (
              <Link
                key={room.room_id}
                href={`/chat/${room.room_id}`}
                className="bg-card hover:bg-muted/50 flex items-center gap-3 rounded-xl border p-3 transition-colors"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center text-3xl select-none">
                  {room.theme_emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {rank < 3 ? (
                      <span className="mr-1">{RANK_BADGES[rank]}</span>
                    ) : (
                      <span className="text-muted-foreground mr-1">
                        {rank + 1}.
                      </span>
                    )}
                    {room.room_nm}
                    {room.room_tp_cd === 'E' && (
                      <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                        이벤트 π{room.entry_fee_pi}
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {room.theme_nm} · 멤버 {room.mbr_cnt}명 · 주간 메시지{' '}
                    {room.msg_cnt_7d}건
                    {Number(room.tip_amt_7d) > 0 && (
                      <span> · 주간 Bean π{room.tip_amt_7d}</span>
                    )}
                  </p>
                </div>
              </Link>
            ))}
          </div>
          {/* 무한 스크롤 sentinel — 뷰포트 진입 시 다음 분량 자동 로드 */}
          {hasMore && (
            <div ref={sentinelRef} className="flex justify-center py-3">
              <span className="text-muted-foreground animate-pulse text-xs">
                스크롤하여 더 보기…
              </span>
            </div>
          )}
        </>
      )}
    </section>
  )
}
