'use client'
// 출석 기록(SubAgent4) — 룸에 들어가 있는 동안(joined·reconnecting) 입장 1회 + 60초 하트비트를 POST /api/seminars/[id]/attendance 로.
//  화면에는 아무것도 그리지 않는다(Overlay 자리를 수명 주기용으로만 씀). 실패는 조용히 넘긴다 — 다음 하트비트가 다시 시도(출석이 룸 사용을 막지 않게), 다시 보내도 같은 거절(beatStops)이면 멈춘다
import { useEffect } from 'react'
import { beatStops, HB_MS } from '@/lib/engage-rules'
import type { RoomCtx, RoomFeature } from '../../extensions'
import { api, engageable } from './shared'

function AttendBeat({ ctx }: { ctx: RoomCtx; barShown: boolean }) {
  const live = ctx.r.state === 'joined' || ctx.r.state === 'reconnecting'
  const id = ctx.seminarId
  useEffect(() => {
    if (!live || !engageable(id)) return
    // 종료·자격 없음(402·404·409)이면 멈춘다 — 다시 보내도 같은 거절이라 요청만 낭비(서버가 종료 세미나 갱신을 막음, 야간 시험 T04)
    const beat = () =>
      void api(`/api/seminars/${id}/attendance`, 'POST').then((r) => {
        if (!r.ok && beatStops(r.status)) clearInterval(timer)
      })
    const timer = setInterval(beat, HB_MS)
    beat()
    return () => clearInterval(timer)
  }, [live, id])
  return null
}

export const attend: RoomFeature = { id: 'attend', Overlay: AttendBeat }
