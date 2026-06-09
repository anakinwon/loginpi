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
  const emoji = room.msg_theme?.[0]?.theme_emoji ?? '💬'
  const isPremium = room.msg_theme?.[0]?.theme_tp_cd === 'PREMIUM'
  const isDirect = room.room_tp_cd === 'D'

  let cls = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl select-none '
  if (isDirect) {
    cls += 'bg-blue-100 dark:bg-blue-900/40'
  } else if (isPremium) {
    cls += 'bg-amber-100 ring-2 ring-amber-300/70 dark:bg-amber-900/40 dark:ring-amber-600/50'
  } else {
    cls += 'bg-muted'
  }

  return <span className={cls}>{emoji}</span>
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
  // 구독 채팅방: 내가 참여 중인 방 중 PREMIUM 테마
  const subscriptionRooms = myRooms.filter(r => r.msg_theme?.[0]?.theme_tp_cd === 'PREMIUM')

  // 일반 채팅방: 내 비구독 방 + 탐색 가능한 공개 방, PREMIUM 테마 먼저
  const regularMyRooms = myRooms.filter(r => r.msg_theme?.[0]?.theme_tp_cd !== 'PREMIUM')
  const regularRooms = sortByPremiumFirst([...regularMyRooms, ...discoverRooms])

  const isEmpty = myRooms.length === 0 && discoverRooms.length === 0

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

      {/* 구독 채팅방 */}
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

      {/* 일반 채팅방 (내 비구독 방 + 탐색 공개 방, PREMIUM 테마 먼저) */}
      <section>
        <SectionHeader label='일반 채팅방' />
        {isEmpty ? (
          <div className='rounded-xl border border-dashed py-8 text-center'>
            <p className='text-sm text-muted-foreground'>아직 참여 중인 채팅방이 없습니다</p>
            <p className='mt-1 text-xs text-muted-foreground'>+ 채팅방 만들기로 첫 방을 개설해 보세요</p>
          </div>
        ) : regularRooms.length === 0 ? (
          <div className='rounded-xl border border-dashed py-6 text-center'>
            <p className='text-sm text-muted-foreground'>일반 채팅방이 없습니다</p>
          </div>
        ) : (
          <div className='space-y-2'>
            {regularRooms.map(room => (
              <RoomCard key={room.room_id} room={room} href={`/chat/${room.room_id}`} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
