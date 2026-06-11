'use client'

import { useMemo, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { GroupRoomCreator } from '@/components/chat/group-room-creator'
import { ChatMarketplace } from '@/components/chat/chat-marketplace'
import { AdminPagination } from '@/components/admin/admin-pagination'

const PAGE_SIZE = 5

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
  open_bet_yn?: string // 진행 중(OPEN) Pi Bet 보유 여부 — 🎲 뱃지 표시
  // msg_room.theme_cd → msg_theme FK (forward reference) → PostgREST가 단일 객체로 반환
  msg_theme: {
    theme_nm: string
    theme_emoji: string
    theme_tp_cd: string
  } | null
}

function exprLabel(exprDtm?: string): { text: string; warn: boolean } | null {
  if (!exprDtm || exprDtm.startsWith('9999')) return null
  const daysLeft = Math.ceil(
    (new Date(exprDtm).getTime() - Date.now()) / 86_400_000,
  )
  if (daysLeft < 0) return { text: '만료됨', warn: true }
  if (daysLeft === 0) return { text: '오늘 만료', warn: true }
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
  const themeName = room.msg_theme?.theme_nm ?? room.theme_cd
  const isPremium = room.msg_theme?.theme_tp_cd === 'PREMIUM'

  return (
    <Link
      href={href}
      className="hover:bg-muted/50 flex items-center gap-3 rounded-xl border p-3 transition-colors"
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
          {room.open_bet_yn === 'Y' && (
            <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
              🎲 Pi Bet
            </span>
          )}
          {room.room_tp_cd === 'G' &&
            (() => {
              const el = exprLabel(room.expr_dtm)
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
              ({room.cur_mbr_cnt ?? 0}/{room.max_mbr_cnt}명)
            </span>
          )}
          {room.room_tp_cd === 'D' && (
            <span className="text-muted-foreground/70 ml-1">· 1:1</span>
          )}
        </p>
      </div>
    </Link>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <h2 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wider uppercase">
      {label}
    </h2>
  )
}

// 5개씩 클라이언트 페이지네이션 — 섹션마다 독립적인 page 상태를 가진다.
// 데이터는 호출부가 전부 로드해 두므로 추가 fetch 없이 슬라이스만 한다.
function PagedRoomList({ rooms }: { rooms: RoomWithTheme[] }) {
  const [page, setPage] = useState(1)
  const totalPages = Math.ceil(rooms.length / PAGE_SIZE)
  // 목록이 줄어 현재 page가 범위를 벗어나면 마지막 페이지로 보정
  const safePage = Math.min(page, Math.max(1, totalPages))
  const visible = useMemo(
    () => rooms.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [rooms, safePage],
  )

  return (
    <>
      <div className="space-y-2">
        {visible.map((room) => (
          <RoomCard
            key={room.room_id}
            room={room}
            href={`/chat/${room.room_id}`}
          />
        ))}
      </div>
      {totalPages > 1 && (
        <div className="mt-3">
          <AdminPagination
            page={safePage}
            totalPages={totalPages}
            onPage={setPage}
          />
        </div>
      )}
    </>
  )
}

function sortByPremiumFirst(rooms: RoomWithTheme[]): RoomWithTheme[] {
  return [...rooms].sort((a, b) => {
    const aP = a.msg_theme?.theme_tp_cd === 'PREMIUM' ? 0 : 1
    const bP = b.msg_theme?.theme_tp_cd === 'PREMIUM' ? 0 : 1
    return aP - bP
  })
}

export function ChatListView({
  myRooms,
  discoverRooms,
}: {
  myRooms: RoomWithTheme[]
  discoverRooms: RoomWithTheme[]
}) {
  // 내 카페를 구독/일반 두 섹션으로 분리 (discover와 완전히 별도)
  const subscriptionRooms = myRooms.filter(
    (r) => r.msg_theme?.theme_tp_cd === 'PREMIUM',
  )
  const regularRooms = sortByPremiumFirst(
    myRooms.filter((r) => r.msg_theme?.theme_tp_cd !== 'PREMIUM'),
  )
  const sortedDiscover = sortByPremiumFirst(discoverRooms)

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* 헤더 */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">PiCafé</h1>
          <p className="text-muted-foreground text-sm">Pi 커뮤니티 테마 카페</p>
        </div>
        <GroupRoomCreator />
      </div>

      {/* 구독 카페 — PREMIUM 테마 방만 */}
      {subscriptionRooms.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <SectionHeader label="구독 카페" />
            <span className="mb-3 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              PREMIUM
            </span>
          </div>
          <PagedRoomList rooms={subscriptionRooms} />
        </section>
      )}

      {/* 일반 카페 — 비PREMIUM 내 방, PREMIUM 테마 먼저 정렬 */}
      {(regularRooms.length > 0 || myRooms.length === 0) && (
        <section className="mb-8">
          <SectionHeader label="일반 카페" />
          {myRooms.length === 0 ? (
            <div className="rounded-xl border border-dashed py-8 text-center">
              <p className="text-muted-foreground text-sm">
                아직 참여 중인 카페가 없습니다
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                + 카페 만들기로 첫 방을 개설해 보세요
              </p>
            </div>
          ) : (
            <PagedRoomList rooms={regularRooms} />
          )}
        </section>
      )}

      {/* 공개 카페 탐색 — PREMIUM 테마 먼저 */}
      {sortedDiscover.length > 0 && (
        <section className="mb-8">
          <SectionHeader label="카페 탐색" />
          <PagedRoomList rooms={sortedDiscover} />
        </section>
      )}

      {/* TASK-070: 마켓플레이스 — 테마 필터 + 인기 랭킹 + 테마 팔로우 */}
      <ChatMarketplace />
    </div>
  )
}
