// 세미나 화상 룸(/s/[id]/join) — 대기실(S3) → 룸(S4). [id] = smn_id(PRD D-8) — 세미나 제목을 머리에 표시.
// uuid 가 아닌 방 코드는 실험실(M0~M3) 방 — 실험실이 열린 환경에서만(R-P6, 입장권 API 와 같은 기준)
// 서버는 로그인 판정·redirect 를 하지 않는다(Pi Browser 무한 루프 금지) — 클라이언트 LoginGate 가 처리. 입장 자격은 입장권 API 가 판정
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { getSupabaseAdmin, resolveDbConfig } from '@pi/db'
import { RoomView } from '@/components/room/room-view'
import { env } from '@/env'
import { isUuid } from '@/lib/seminar-rules'

const ROOM_RE = /^[A-Za-z0-9_-]{1,64}$/

// 제목만(R-P3). DB 미설정·오류는 제목 없이 진행 — 입장권 API 가 다시 막는다
async function seminarTitle(id: string) {
  const { url, key } = resolveDbConfig()
  if (!url || !key) return null
  const { data, error } = await getSupabaseAdmin()
    .from('smn_mst')
    .select('smn_nm')
    .eq('smn_id', id)
    .eq('del_yn', 'N')
    .maybeSingle<{ smn_nm: string }>()
  if (error) return null
  return data ? data.smn_nm : undefined // undefined = 없는 세미나 → 404
}

export default async function JoinPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  let title: string | null | undefined = null
  if (isUuid(id)) {
    title = await seminarTitle(id)
    if (title === undefined) notFound()
  } else if (!ROOM_RE.test(id) || (process.env.NODE_ENV === 'production' && env.LAB_ENABLED !== '1')) notFound()
  return (
    <>
      {title && <h1 className="mb-3 text-lg font-bold break-words">{title}</h1>}
      <RoomView room={id} wsUrl={env.NEXT_PUBLIC_MEDIA_WS_URL} />
    </>
  )
}
