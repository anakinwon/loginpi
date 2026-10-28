'use client'
// 출석 기록(SubAgent4) — 룸에 들어가 있는 동안(joined·reconnecting) 입장 1회 + 60초 하트비트를 POST /api/seminars/[id]/attendance 로.
//  무대 위 가운데에 방 남은 시간 카운트다운(세미나 요금제 이름 · 남은 시간, sql/018) — 응답 left 를 받은 뒤 1초마다 줄이고, 5분 미만이면 붉은 글자 깜빡임(움직임 줄이기 설정이면 깜빡임 없음).
//  0 이 되면 바로 하트비트 1번 → 서버가 소진을 확인하면(ended) 종료 알림 후 자동으로 룸에서 나간다(마스터 2026-10-29). 방이 닫혀 409 여도 나간다.
//  개최자 응답 remainSec 이 10분·1분 아래로 내려가면 1번씩 알림. 실패는 조용히 넘긴다 — 다음 하트비트가 다시 시도(출석이 룸 사용을 막지 않게), 다시 보내도 같은 거절(beatStops)이면 멈춘다. 화면이 다시 보이면 30초 이상 지났을 때 당겨 보낸다(beatDue)
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { beatDue, beatStops, fmtDur, HB_MS, leftNow, LOW_LEFT_SEC } from '@/lib/engage-rules'
import type { RoomCtx, RoomFeature } from '../../extensions'
import { api, engageable } from './shared'

// 남은 시간 알림 문턱(초) — 큰 것부터. 각 문턱은 룸에 있는 동안 1번만
const WARN_SEC = [600, 60] as const
const PLAN_KEY: Record<string, 'free' | 'monthly' | 'yearly'> = { FREE: 'free', M: 'monthly', Y: 'yearly' }

type Beat = { remainSec?: number | null; left?: number | null; plan?: string; ended?: boolean }
type Clock = { left: number; at: number; plan: string }

function AttendBeat({ ctx }: { ctx: RoomCtx; barShown: boolean }) {
  const tp = useTranslations('plan')
  const t = useTranslations('room')
  const live = ctx.r.state === 'joined' || ctx.r.state === 'reconnecting'
  const id = ctx.seminarId
  // ctx 는 렌더마다 새 객체 — 하트비트 수명은 live·id 로만 두고 알림·나가기 함수는 최신 것을 쓴다
  const notice = useRef(ctx.notice)
  const leave = useRef(ctx.r.leave)
  useEffect(() => {
    notice.current = ctx.notice
    leave.current = ctx.r.leave
  })
  const [clock, setClock] = useState<Clock | null>(null)
  const [now, setNow] = useState(0)
  const kick = useRef<() => void>(() => {}) // 카운트다운 0 → 바로 하트비트

  useEffect(() => {
    if (!live || !engageable(id)) return
    // 종료·자격 없음(402·404·409)이면 멈춘다 — 다시 보내도 같은 거절이라 요청만 낭비(서버가 종료 세미나 갱신을 막음, 야간 시험 T04)
    let last = 0
    let stop = false
    const warned = new Set<number>()
    const out = (key: string) => {
      stop = true
      clearInterval(timer)
      notice.current(key)
      leave.current()
    }
    const beat = () => {
      if (stop) return
      last = Date.now()
      void api<Beat>(`/api/seminars/${id}/attendance`, 'POST').then((r) => {
        if (!r.ok && r.status === 409) return out('plan.closed') // 방이 닫힘(시간 소진·개최자 종료) — 룸에서 나간다
        if (!r.ok && beatStops(r.status)) {
          stop = true
          clearInterval(timer)
          return
        }
        if (!r.ok) return
        if (r.data.ended) return out('plan.ended')
        if (r.data.left != null) setClock({ left: r.data.left, at: Date.now(), plan: r.data.plan ?? 'FREE' })
        const left = r.data.remainSec
        if (left == null) return // 계량 대상 아님(개최자 아님)
        // 가장 작은 넘은 문턱 하나만 알린다(1분 아래로 처음 들어왔으면 10분 알림은 생략)
        const hit = WARN_SEC.filter((w) => left <= w && !warned.has(w))
        if (!hit.length) return
        WARN_SEC.filter((w) => left <= w).forEach((w) => warned.add(w))
        notice.current('plan.warn', { min: String(Math.max(1, Math.ceil(left / 60))) })
      })
    }
    kick.current = beat
    // 다시 보이면 당겨 보낸다(beatDue) — 백그라운드에서 늦어진 마지막 접속 시각을 바로 맞춘다
    const onVis = () => {
      if (document.visibilityState === 'visible' && beatDue(last, Date.now())) beat()
    }
    const timer = setInterval(beat, HB_MS)
    document.addEventListener('visibilitychange', onVis)
    beat()
    return () => {
      kick.current = () => {}
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [live, id])

  // 1초 시계 — 남은 시간을 받은 동안만
  useEffect(() => {
    if (!clock) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [clock])
  const sec = clock ? leftNow(clock.left, clock.at, now) : null

  // 0 도달 → 하트비트 1번(같은 응답 값에 1번만). 서버가 아직 몇 초 남았다고 하면 그 값으로 다시 세고, 소진이면 ended → 나간다
  const fired = useRef<Clock | null>(null)
  useEffect(() => {
    if (sec === 0 && clock && fired.current !== clock) {
      fired.current = clock
      kick.current()
    }
  }, [sec, clock])

  if (!live || sec === null || !clock) return null
  const low = sec < LOW_LEFT_SEC
  return (
    <div
      role="timer"
      aria-label={t('plan.left')}
      className={`bg-surface/80 absolute top-2 left-1/2 z-20 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap tabular-nums ${low ? 'text-danger motion-safe:animate-pulse' : ''}`}
    >
      {tp(PLAN_KEY[clock.plan] ?? 'free')} · {fmtDur(sec)}
    </div>
  )
}

export const attend: RoomFeature = { id: 'attend', Overlay: AttendBeat }
