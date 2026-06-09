'use client'

import { Link } from '@/i18n/navigation'
import { GroupRoomCreator } from '@/components/chat/group-room-creator'

// 서버(SSR)·클라이언트(Pi Browser 게이트) 양쪽에서 공유하는 채팅 목록 표현 컴포넌트.
// 데이터 로딩은 각 호출부가 담당하고, 이 컴포넌트는 렌더링만 책임진다.
export type RoomWithTheme = {
  room_id: string
  room_nm: string
  theme_cd: string
  room_tp_cd: string
  is_public_yn: string
  // Supabase PostgREST JOIN은 1:1 FK라도 배열로 반환
  msg_theme: { theme_nm: string; theme_emoji: string; theme_tp_cd: string }[] | null
}

function ThemeEmoji({ room }: { room: RoomWithTheme }) {
  // 말풍선(💬) 배경 컨테이너 제거 — 테마 이모지 자체를 컬러 아이콘으로 직접 표시
  const emoji = room.msg_theme?.[0]?.theme_emoji
    ?? (room.room_tp_cd === 'D' ? '👤' : '🏠')
  return (
    <span className='flex h-10 w-10 shrink-0 items-center justify-center text-3xl select-none'>
      {emoji}
    </span>
  )
}

function RoomCard({ room, href }: { room: RoomWithTheme; href: string }) {
  const themeName = room.msg_theme?.[0]?.theme_nm ?? room.theme_cd
  const isPremium = room.msg_theme?.[0]?.theme_tp_cd === 'PREMIUM'

  return (
    <Link
      href={href}
      className='flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/50'
    >
      <ThemeEmoji room={room} />
      <div className='min-w-0 flex-1'>
        <p className='truncate font-medium text-sm'>{room.room_nm}</p>
        <p className='text-xs text-muted-foreground'>
          {themeName}
          {isPremium && (
            <span className='ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'>
              PREMIUM
            </span>
          )}
          {room.room_tp_cd === 'G' && room.is_public_yn === 'Y' && (
            <span className='ml-1 text-muted-foreground/70'>· 공개</span>
          )}
          {room.room_tp_cd === 'G' && room.is_public_yn === 'N' && (
            <span className='ml-1 text-muted-foreground/70'>· 비공개</span>
          )}
          {room.room_tp_cd === 'D' && (
            <span className='ml-1 text-muted-foreground/70'>· 1:1</span>
          )}
        </p>
      </div>
    </Link>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <h2 className='mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground'>
      {label}
    </h2>
  )
}

function sortByPremiumFirst(rooms: RoomWithTheme[]): RoomWithTheme[] {
  return [...rooms].sort((a, b) => {
    const aP = a.msg_theme?.[0]?.theme_tp_cd === 'PREMIUM' ? 0 : 1
    const bP = b.msg_theme?.[0]?.theme_tp_cd === 'PREMIUM' ? 0 : 1
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
  // 내 채팅방을 구독/일반 두 섹션으로 분리 (discover와 완전히 별도)
  const subscriptionRooms = myRooms.filter(r => r.msg_theme?.[0]?.theme_tp_cd === 'PREMIUM')
  const regularRooms = sortByPremiumFirst(
    myRooms.filter(r => r.msg_theme?.[0]?.theme_tp_cd !== 'PREMIUM')
  )
  const sortedDiscover = sortByPremiumFirst(discoverRooms)

  return (
    <div className='mx-auto max-w-2xl px-4 py-8'>
      {/* 헤더 */}
      <div className='mb-8 flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>PiChat</h1>
          <p className='text-sm text-muted-foreground'>Pi 커뮤니티 테마 채팅</p>
        </div>
        <GroupRoomCreator />
      </div>

      {/* 구독 채팅방 — PREMIUM 테마 방만 */}
      {subscriptionRooms.length > 0 && (
        <section className='mb-8'>
          <div className='mb-3 flex items-center gap-2'>
            <SectionHeader label='구독 채팅방' />
            <span className='mb-3 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'>
              PREMIUM
            </span>
          </div>
          <div className='space-y-2'>
            {subscriptionRooms.map(room => (
              <RoomCard key={room.room_id} room={room} href={`/chat/${room.room_id}`} />
            ))}
          </div>
        </section>
      )}

      {/* 일반 채팅방 — 비PREMIUM 내 방, PREMIUM 테마 먼저 정렬 */}
      {(regularRooms.length > 0 || myRooms.length === 0) && (
        <section className='mb-8'>
          <SectionHeader label='일반 채팅방' />
          {myRooms.length === 0 ? (
            <div className='rounded-xl border border-dashed py-8 text-center'>
              <p className='text-sm text-muted-foreground'>아직 참여 중인 채팅방이 없습니다</p>
              <p className='mt-1 text-xs text-muted-foreground'>+ 채팅방 만들기로 첫 방을 개설해 보세요</p>
            </div>
          ) : (
            <div className='space-y-2'>
              {regularRooms.map(room => (
                <RoomCard key={room.room_id} room={room} href={`/chat/${room.room_id}`} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* 공개 채팅방 탐색 — PREMIUM 테마 먼저 */}
      {sortedDiscover.length > 0 && (
        <section>
          <SectionHeader label='채팅방 탐색' />
          <div className='space-y-2'>
            {sortedDiscover.map(room => (
              <RoomCard key={room.room_id} room={room} href={`/chat/${room.room_id}`} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
