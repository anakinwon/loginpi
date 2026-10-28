'use client'
// 출석 기록(SubAgent4) — 룸에 들어가 있는 동안(joined·reconnecting) 입장 1회 + 60초 하트비트를 POST /api/seminars/[id]/attendance 로.
//  화면에는 아무것도 그리지 않는다(Overlay 자리를 수명 주기용으로만 씀). 개최자 요금제(sql/015) — 응답 remainSec 이 10분·1분 아래로 내려가면 1번씩 알림, ended 면 종료 알림 후 멈춘다. 실패는 조용히 넘긴다 — 다음 하트비트가 다시 시도(출석이 룸 사용을 막지 않게), 다시 보내도 같은 거절(beatStops)이면 멈춘다. 화면이 다시 보이면 30초 이상 지났을 때 당겨 보낸다(beatDue)
import { useEffect, useRef } from 'react'
import { beatDue, beatStops, HB_MS } from '@/lib/engage-rules'
import type { RoomCtx, RoomFeature } from '../../extensions'
import { api, engageable } from './shared'

// 남은 시간 알림 문턱(초) — 큰 것부터. 각 문턱은 룸에 있는 동안 1번만
const WARN_SEC = [600, 60] as const

function AttendBeat({ ctx }: { ctx: RoomCtx; barShown: boolean }) {
  const live = ctx.r.state === 'joined' || ctx.r.state === 'reconnecting'
  const id = ctx.seminarId
  // ctx 는 렌더마다 새 객체 — 하트비트 수명은 live·id 로만 두고 알림 함수는 최신 것을 쓴다
  const notice = useRef(ctx.notice)
  useEffect(() => {
    notice.current = ctx.notice
  })
  useEffect(() => {
    if (!live || !engageable(id)) return
    // 종료·자격 없음(402·404·409)이면 멈춘다 — 다시 보내도 같은 거절이라 요청만 낭비(서버가 종료 세미나 갱신을 막음, 야간 시험 T04)
    let last = 0
    let stop = false
    const warned = new Set<number>()
    const beat = () => {
      if (stop) return
      last = Date.now()
      void api<{ remainSec?: number | null; ended?: boolean }>(`/api/seminars/${id}/attendance`, 'POST').then((r) => {
        if (!r.ok && beatStops(r.status)) {
          stop = true
          clearInterval(timer)
          return
        }
        if (!r.ok) return
        if (r.data.ended) {
          stop = true
          clearInterval(timer)
          notice.current('plan.ended')
          return
        }
        const left = r.data.remainSec
        if (left == null) return // 계량 대상 아님(개최자 아님·관리자)
        // 가장 작은 넘은 문턱 하나만 알린다(1분 아래로 처음 들어왔으면 10분 알림은 생략)
        const hit = WARN_SEC.filter((w) => left <= w && !warned.has(w))
        if (!hit.length) return
        WARN_SEC.filter((w) => left <= w).forEach((w) => warned.add(w))
        notice.current('plan.warn', { min: String(Math.max(1, Math.ceil(left / 60))) })
      })
    }
    // 다시 보이면 당겨 보낸다(beatDue) — 백그라운드에서 늦어진 마지막 접속 시각을 바로 맞춘다
    const onVis = () => {
      if (document.visibilityState === 'visible' && beatDue(last, Date.now())) beat()
    }
    const timer = setInterval(beat, HB_MS)
    document.addEventListener('visibilitychange', onVis)
    beat()
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [live, id])
  return null
}

export const attend: RoomFeature = { id: 'attend', Overlay: AttendBeat }
