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
  msg_theme: { theme_nm: string; theme_emoji: string }[] | null
}

function RoomCard({ room, href }: { room: RoomWithTheme; href: string }) {
  return (
    <Link
      href={href}
      className='flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/50'
    >
      <span className='text-2xl'>{room.msg_theme?.[0]?.theme_emoji ?? '💬'}</span>
      <div className='min-w-0'>
        <p className='truncate font-medium text-sm'>{room.room_nm}</p>
        <p className='text-xs text-muted-foreground'>
          {room.msg_theme?.[0]?.theme_nm ?? room.theme_cd}
          {room.room_tp_cd === 'G' && room.is_public_yn === 'Y' && ' · 공개'}
          {room.room_tp_cd === 'G' && room.is_public_yn === 'N' && ' · 비공개'}
          {room.room_tp_cd === 'D' && ' · 1:1'}
        </p>
      </div>
    </Link>
  )
}

export function ChatListView({
  myRooms,
  discoverRooms,
}: {
  myRooms: RoomWithTheme[]
  discoverRooms: RoomWithTheme[]
}) {
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

      {/* 내 채팅방 */}
      <section className='mb-8'>
        <h2 className='mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground'>
          내 채팅방
        </h2>
        {myRooms.length === 0 ? (
          <div className='rounded-xl border border-dashed py-8 text-center'>
            <p className='text-sm text-muted-foreground'>아직 참여 중인 채팅방이 없습니다</p>
            <p className='mt-1 text-xs text-muted-foreground'>+ 채팅방 만들기로 첫 방을 개설해 보세요</p>
          </div>
        ) : (
          <div className='space-y-2'>
            {myRooms.map(room => (
              <RoomCard key={room.room_id} room={room} href={`/chat/${room.room_id}`} />
            ))}
          </div>
        )}
      </section>

      {/* 공개 채팅방 탐색 */}
      {discoverRooms.length > 0 && (
        <section>
          <h2 className='mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground'>
            공개 채팅방 탐색
          </h2>
          <div className='space-y-2'>
            {discoverRooms.map(room => (
              <RoomCard key={room.room_id} room={room} href={`/chat/${room.room_id}`} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
