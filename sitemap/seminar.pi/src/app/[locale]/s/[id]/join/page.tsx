// 세미나 화상 룸(/s/[id]/join) — 대기실(S3) → 룸(S4). [id] = 방 코드(세미나 DB 는 F-02·F-03 전이라 임시, 입장권 API 와 같은 형식)
// 서버는 로그인 판정·redirect 를 하지 않는다(Pi Browser 무한 루프 금지) — 클라이언트 LoginGate 가 처리
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { RoomView } from '@/components/room/room-view'
import { env } from '@/env'

const ROOM_RE = /^[A-Za-z0-9_-]{1,64}$/

export default async function JoinPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  if (!ROOM_RE.test(id)) notFound()
  return <RoomView room={id} wsUrl={env.NEXT_PUBLIC_MEDIA_WS_URL} />
}
