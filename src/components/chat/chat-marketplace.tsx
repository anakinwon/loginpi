'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { AdminPagination } from '@/components/admin/admin-pagination'

const PAGE_SIZE = 10

// TASK-070: 카페 마켓플레이스 — 테마 필터 칩 + 인기 랭킹 + 테마 팔로우
// 데이터는 클라이언트에서 piFetch로 로드 (Pi Browser X-Pi-Token 이중 경로 자동 지원)

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
  const [page, setPage] = useState(1)

  const load = useCallback(async (theme: string | null) => {
    setLoading(true)
    setPage(1) // 테마 전환·재로드 시 첫 페이지로 리셋
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
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(null)
  }, [load])

  const totalPages = Math.ceil(rooms.length / PAGE_SIZE)
  const safePage = Math.min(page, Math.max(1, totalPages))
  // 현재 페이지 슬라이스 + 전역 순위(rank) 부여 — 🥇🥈🥉는 전역 TOP 3에만 표시
  const visibleRooms = useMemo(
    () =>
      rooms
        .slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
        .map((room, i) => ({ room, rank: (safePage - 1) * PAGE_SIZE + i })),
    [rooms, safePage],
  )

  function selectTheme(theme: string | null) {
    setActiveTheme(theme)
    void load(theme)
  }

  async function toggleFollow(themeCd: string) {
    const isFollowing = followed.has(themeCd)
    // 낙관적 업데이트 — 실패 시 롤백
    setFollowed(prev => {
      const next = new Set(prev)
      if (isFollowing) next.delete(themeCd)
      else next.add(themeCd)
      return next
    })
    const res = await piFetch(`/api/chat/themes/${themeCd}/follow`, {
      method: isFollowing ? 'DELETE' : 'POST',
    })
    if (!res.ok) {
      setFollowed(prev => {
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
    <section>
      <div className='mb-3 flex items-center justify-between'>
        <h2 className='text-sm font-semibold uppercase tracking-wider text-muted-foreground'>
          마켓플레이스 — 인기 카페
        </h2>
      </div>

      {/* 테마 필터 칩 */}
      <div className='mb-4 flex gap-1.5 overflow-x-auto pb-1'>
        <button
          onClick={() => selectTheme(null)}
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            activeTheme === null ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
          }`}
        >
          전체
        </button>
        {themes.map(t => (
          <button
            key={t.theme_cd}
            onClick={() => selectTheme(t.theme_cd)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              activeTheme === t.theme_cd ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
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
          {followed.has(activeTheme) ? '✓ 팔로우 중 — 이벤트방 알림 ON' : '+ 이 테마 팔로우 (이벤트방 알림)'}
        </button>
      )}

      {loading ? (
        <div className='space-y-2'>
          {[0, 1, 2].map(i => (
            <div key={i} className='h-16 animate-pulse rounded-xl border bg-muted/40' />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className='rounded-xl border border-dashed py-8 text-center'>
          <p className='text-sm text-muted-foreground'>해당 테마의 공개 카페가 아직 없습니다</p>
        </div>
      ) : (
        <>
          <div className='space-y-2'>
            {visibleRooms.map(({ room, rank }) => (
              <Link
                key={room.room_id}
                href={`/chat/${room.room_id}`}
                className='flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/50'
              >
                <span className='flex h-10 w-10 shrink-0 items-center justify-center text-3xl select-none'>
                  {room.theme_emoji}
                </span>
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-medium'>
                    {rank < 3 ? (
                      <span className='mr-1'>{RANK_BADGES[rank]}</span>
                    ) : (
                      <span className='mr-1 text-muted-foreground'>{rank + 1}.</span>
                    )}
                    {room.room_nm}
                    {room.room_tp_cd === 'E' && (
                      <span className='ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'>
                        이벤트 π{room.entry_fee_pi}
                      </span>
                    )}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {room.theme_nm} · 멤버 {room.mbr_cnt}명 · 주간 메시지 {room.msg_cnt_7d}건
                    {Number(room.tip_amt_7d) > 0 && <span> · 주간 Tip π{room.tip_amt_7d}</span>}
                  </p>
                </div>
              </Link>
            ))}
          </div>
          {totalPages > 1 && (
            <div className='mt-3'>
              <AdminPagination page={safePage} totalPages={totalPages} onPage={setPage} />
            </div>
          )}
        </>
      )}
    </section>
  )
}
