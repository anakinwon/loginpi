'use client'
// 출석 기록(SubAgent4) — 룸에 들어가 있는 동안(joined·reconnecting) 입장 1회 + 60초 하트비트를 POST /api/seminars/[id]/attendance 로.
//  화면에는 아무것도 그리지 않는다(Overlay 자리를 수명 주기용으로만 씀). 실패는 조용히 넘긴다 — 다음 하트비트가 다시 시도(출석이 룸 사용을 막지 않게)
import { useEffect } from 'react'
import { HB_MS } from '@/lib/engage-rules'
import type { RoomCtx, RoomFeature } from '../../extensions'
import { api, engageable } from './shared'

function AttendBeat({ ctx }: { ctx: RoomCtx; barShown: boolean }) {
  const live = ctx.r.state === 'joined' || ctx.r.state === 'reconnecting'
  const id = ctx.seminarId
  useEffect(() => {
    if (!live || !engageable(id)) return
    const beat = () => void api(`/api/seminars/${id}/attendance`, 'POST')
    beat()
    const timer = setInterval(beat, HB_MS)
    return () => clearInterval(timer)
  }, [live, id])
  return null
}

export const attend: RoomFeature = { id: 'attend', Overlay: AttendBeat }
