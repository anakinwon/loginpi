'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { GroupRoomCreator } from '@/components/chat/group-room-creator'
import { ChatMarketplace } from '@/components/chat/chat-marketplace'
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll'

// 6 = 2칸(sm)·3칸(lg) 그리드 모두 균등하게 채워지는 페이지 단위
const PAGE_SIZE = 6

// 서버(SSR)·클라이언트(Pi Browser 게이트) 양쪽에서 공유하는 카페 목록 표현 컴포넌트.
// 데이터 로딩은 각 호출부가 담당하고, 이 컴포넌트는 렌더링만 책임진다.
export type RoomWithTheme = {
  room_id: string
  room_nm: string
  theme_cd: string
  room_tp_cd: string
  is_public_yn: string
  max_mbr_cnt?: number
  cur_mbr_cnt?: number
  expr_dtm?: string
  reg_dtm?: string // 생성일시 — 목록 최신순 정렬 기준
  // msg_room.theme_cd → msg_theme FK (forward reference) → PostgREST가 단일 객체로 반환
  msg_theme: {
    theme_nm: string
    theme_emoji: string
    theme_tp_cd: string
  } | null
}

type ListT = ReturnType<typeof useTranslations<'chat.list'>>

function exprLabel(
  exprDtm: string | undefined,
  t: ListT,
): { text: string; warn: boolean } | null {
  if (!exprDtm || exprDtm.startsWith('9999')) return null
  const daysLeft = Math.ceil(
    (new Date(exprDtm).getTime() - Date.now()) / 86_400_000,
  )
  if (daysLeft < 0) return { text: t('expired'), warn: true }
  if (daysLeft === 0) return { text: t('expiresToday'), warn: true }
  return { text: `D-${daysLeft}`, warn: daysLeft <= 3 }
}

function ThemeEmoji({ room }: { room: RoomWithTheme }) {
  const emoji =
    room.msg_theme?.theme_emoji ?? (room.room_tp_cd === 'D' ? '👤' : '🏠')
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center text-3xl select-none">
      {emoji}
    </span>
  )
}

function RoomCard({ room, href }: { room: RoomWithTheme; href: string }) {
  const t = useTranslations('chat.list')
  const themeName = room.msg_theme?.theme_nm ?? room.theme_cd
  const isPremium = room.msg_theme?.theme_tp_cd === 'PREMIUM'

  return (
    <Link
      href={href}
      className="bg-card hover:bg-muted/50 flex items-center gap-3 rounded-xl border p-3 transition-colors"
    >
      <ThemeEmoji room={room} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{room.room_nm}</p>
        <p className="text-muted-foreground text-xs">
          {themeName}
          {isPremium && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              PREMIUM
            </span>
          )}
          {room.room_tp_cd === 'G' &&
            (() => {
              const el = exprLabel(room.expr_dtm, t)
              if (!el) return null
              return (
                <span
                  className={`ml-1 ${el.warn ? 'text-orange-500 dark:text-orange-400' : 'text-muted-foreground/70'}`}
                >
                  · {el.text}
                </span>
              )
            })()}
          {room.room_tp_cd === 'G' && room.max_mbr_cnt != null && (
            <span className="text-muted-foreground/70 ml-1">
              {t('memberCount', {
                cur: room.cur_mbr_cnt ?? 0,
                max: room.max_mbr_cnt,
              })}
            </span>
          )}
          {room.room_tp_cd === 'D' && (
            <span className="text-muted-foreground/70 ml-1">
              · {t('direct')}
            </span>
          )}
        </p>
      </div>
    </Link>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
      <span className="bg-primary h-5 w-1 shrink-0 rounded-full" aria-hidden />
      {label}
    </h2>
  )
}

// 무한 스크롤 룸 목록 — 섹션마다 독립적인 노출 개수 상태를 가진다.
// 데이터는 호출부가 전부 로드해 두므로 추가 fetch 없이 스크롤 시 노출만 늘린다 (렌더 비용 절감).
function PagedRoomList({ rooms }: { rooms: RoomWithTheme[] }) {
  const t = useTranslations('chat.list')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const visible = useMemo(
    () => rooms.slice(0, visibleCount),
    [rooms, visibleCount],
  )
  const hasMore = visibleCount < rooms.length

  const sentinelRef = useInfiniteScroll({
    hasMore,
    loading: false,
    onLoadMore: () => setVisibleCount((c) => c + PAGE_SIZE),
  })

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((room) => (
          <RoomCard
            key={room.room_id}
            room={room}
            href={`/chat/${room.room_id}`}
          />
        ))}
      </div>
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-3">
          <span className="text-muted-foreground animate-pulse text-xs">
            {t('scrollMore')}
          </span>
        </div>
      )}
    </>
  )
}

// 최신 카페가 항상 상단 — 생성일시(reg_dtm) 내림차순, reg_dtm 없는 행은 맨 뒤
function sortByNewest(rooms: RoomWithTheme[]): RoomWithTheme[] {
  return [...rooms].sort((a, b) => {
    const aT = a.reg_dtm ? new Date(a.reg_dtm).getTime() : 0
    const bT = b.reg_dtm ? new Date(b.reg_dtm).getTime() : 0
    return bT - aT
  })
}

// 카페 섹션 스켈레톤 — 목록 로딩 중에도 페이지 골격·마켓플레이스는 먼저 렌더된다
function RoomListSkeleton() {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-muted/40 h-16 animate-pulse rounded-xl border"
        />
      ))}
    </div>
  )
}

export function ChatListView({
  myRooms,
  discoverRooms,
  roomsLoading = false,
}: {
  myRooms: RoomWithTheme[]
  discoverRooms: RoomWithTheme[]
  // Pi Browser 클라이언트 게이트가 목록 fetch 중일 때 true — 섹션 스켈레톤 표시
  roomsLoading?: boolean
}) {
  const t = useTranslations('chat.list')
  // 내 카페를 구독/일반 두 섹션으로 분리 (discover와 완전히 별도) — 각 섹션 내 최신 생성순
  const subscriptionRooms = sortByNewest(
    myRooms.filter((r) => r.msg_theme?.theme_tp_cd === 'PREMIUM'),
  )
  const regularRooms = sortByNewest(
    myRooms.filter((r) => r.msg_theme?.theme_tp_cd !== 'PREMIUM'),
  )
  const sortedDiscover = sortByNewest(discoverRooms)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* 헤더 */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">PiCafé</h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
        <GroupRoomCreator />
      </div>

      {/* 목록 로딩 중 — 섹션 스켈레톤 (마켓플레이스는 아래에서 병렬 로드) */}
      {roomsLoading && (
        <section className="bg-muted/30 mb-6 rounded-2xl p-4 sm:p-5">
          <SectionHeader label={t('myCafes')} />
          <RoomListSkeleton />
        </section>
      )}

      {/* 구독 카페 — PREMIUM 테마 방만 */}
      {!roomsLoading && subscriptionRooms.length > 0 && (
        <section className="bg-muted/30 mb-6 rounded-2xl p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <SectionHeader label={t('subscriptionCafes')} />
            <span className="mb-3 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              PREMIUM
            </span>
          </div>
          <PagedRoomList rooms={subscriptionRooms} />
        </section>
      )}

      {/* 일반 카페 — 비PREMIUM 내 방, 최신 생성순 */}
      {!roomsLoading && (regularRooms.length > 0 || myRooms.length === 0) && (
        <section className="bg-muted/30 mb-6 rounded-2xl p-4 sm:p-5">
          <SectionHeader label={t('regularCafes')} />
          {myRooms.length === 0 ? (
            <div className="rounded-xl border border-dashed py-8 text-center">
              <p className="text-muted-foreground text-sm">{t('noCafes')}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {t('noCafesHint')}
              </p>
            </div>
          ) : (
            <PagedRoomList rooms={regularRooms} />
          )}
        </section>
      )}

      {/* 공개 카페 탐색 — 최신 생성순 */}
      {!roomsLoading && sortedDiscover.length > 0 && (
        <section className="bg-muted/30 mb-6 rounded-2xl p-4 sm:p-5">
          <SectionHeader label={t('discover')} />
          <PagedRoomList rooms={sortedDiscover} />
        </section>
      )}

      {/* TASK-070: 마켓플레이스 — 테마 필터 + 인기 랭킹 + 테마 팔로우 */}
      <ChatMarketplace />
    </div>
  )
}
