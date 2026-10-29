'use client'
// 출석 기록(SubAgent4) — 룸에 들어가 있는 동안(joined·reconnecting) 입장 1회 + 60초 하트비트를 POST /api/seminars/[id]/attendance 로.
//  좌상단 배지 줄에 방 남은 시간 카운트다운 — 개최자 본인만(서버가 개최자에게만 남은 시간을 보냄, 참가자는 무료·카운트다운 없음 마스터 2026-10-29)(녹화 중 숨김·10초 뒤 50% 투명·5분 미만 진하게) — 이원화(sql/021) : 유료 세미나 = "월간 28:59:41 · 무료 1:00:00"(유료 먼저 줄고 0 이면 무료가 준다, 지금 쓰는 쪽 굵게), 무료 세미나 = "무료 59:12" — 응답 left 를 받은 뒤 1초마다 줄이고, 5분 미만이면 붉은 글자 깜빡임(움직임 줄이기 설정이면 깜빡임 없음).
//  0 이 되면 바로 하트비트 1번 → 서버가 소진을 확인하면(ended) 종료 알림 후 자동으로 룸에서 나간다(마스터 2026-10-29). 방이 닫혀 409 여도 나간다.
//  개최자 응답 remainSec 이 10분·1분 아래로 내려가면 1번씩 알림. 실패는 조용히 넘긴다 — 다음 하트비트가 다시 시도(출석이 룸 사용을 막지 않게), 다시 보내도 같은 거절(beatStops)이면 멈춘다. 화면이 다시 보이면 30초 이상 지났을 때 당겨 보낸다(beatDue)
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { beatDue, beatStops, fmtDur, HB_MS, LOW_LEFT_SEC, splitLeft } from '@/lib/engage-rules'
import { BADGE_SLOT_ID, useStageSlot, type RoomCtx, type RoomFeature } from '../../extensions'
import { useRecordingNow } from '../recording'
import { api, engageable } from './shared'

// 남은 시간 알림 문턱(초) — 큰 것부터. 각 문턱은 룸에 있는 동안 1번만
const WARN_SEC = [600, 60] as const
const DIM_AFTER_MS = 10_000 // 처음 보인 뒤 이 시간이 지나면 50% 투명(무대를 덜 가리게)
const PLAN_KEY: Record<string, 'free' | 'monthly' | 'yearly'> = { FREE: 'free', M: 'monthly', Y: 'yearly' }

type Beat = { away?: boolean; remainSec?: number | null; left?: number | null; plan?: string; paid?: number | null; free?: number | null; ticking?: boolean; ended?: boolean }
// ticking = 지금 실제로 차감 중(개최자가 룸에 있음) — 아니면 받은 값 그대로 멈춰 보인다(나간 뒤에도 줄어 보이던 결함)
type Clock = { paid: number | null; free: number; at: number; plan: string; ticking: boolean }

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
    let awayTold = false // 개최자 부재 알림 — 부재 1번에 1번(돌아오면 다시 알릴 수 있게 푼다)
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
        // 방이 닫힘(시간 소진·개최자 종료) 또는 개최자가 5분 넘게 없음(HOST_AWAY, 마스터 2026-10-29) — 룸에서 나간다
        if (!r.ok && r.status === 409) return out(r.body.code === 'HOST_AWAY' ? 'plan.hostGone' : 'plan.closed')
        if (!r.ok && beatStops(r.status)) {
          stop = true
          clearInterval(timer)
          return
        }
        if (!r.ok) return
        if (r.data.ended) return out('plan.ended')
        // 참가자 — 개최자가 90초 넘게 없으면 5분 안에 안 오면 퇴장된다고 1번 알린다
        if (r.data.away && !awayTold) notice.current('plan.hostAway')
        awayTold = !!r.data.away
        if (r.data.free != null) setClock({ paid: r.data.paid ?? null, free: r.data.free, at: Date.now(), plan: r.data.plan ?? 'FREE', ticking: r.data.ticking !== false })
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
  const split = clock ? splitLeft(clock.paid, clock.free, clock.at, clock.ticking ? now : clock.at) : null
  const sec = split ? (split.paid ?? 0) + split.free : null

  // 0 도달 → 하트비트 1번(같은 응답 값에 1번만). 서버가 아직 몇 초 남았다고 하면 그 값으로 다시 세고, 소진이면 ended → 나간다
  // 위치·녹화·흐리게(마스터 2026-10-29) — 좌상단 배지 줄(녹화·AI 기록 배지와 같은 자리)에 넣고, 녹화 중이면 감추고, 처음 보인 뒤 10초면 50% 투명
  const slot = useStageSlot(BADGE_SLOT_ID)
  const recording = useRecordingNow()
  const shown = live && clock !== null
  const [dim, setDim] = useState(false)
  useEffect(() => {
    if (!shown) return
    const timer = setTimeout(() => setDim(true), DIM_AFTER_MS)
    return () => clearTimeout(timer)
  }, [shown])
  const fired = useRef<Clock | null>(null)
  useEffect(() => {
    if (sec === 0 && clock && fired.current !== clock) {
      fired.current = clock
      kick.current()
    }
  }, [sec, clock])

  if (!live || sec === null || !clock || !split || !slot || recording) return null
  const low = sec < LOW_LEFT_SEC // 5분 미만 = 유료·무료 합 기준 — 경고라 흐리게 하지 않는다
  const paidOn = split.paid !== null && split.paid > 0 // 지금 유료를 쓰는 중
  return createPortal(
    <div
      role="timer"
      aria-label={t('plan.left')}
      className={`bg-surface/80 rounded-full px-3 py-1 text-xs whitespace-nowrap tabular-nums transition-opacity duration-700 ${
        low ? 'text-danger motion-safe:animate-pulse' : dim ? 'opacity-50' : ''
      }`}
    >
      {split.paid !== null && (
        <>
          <span className={paidOn ? 'font-bold' : 'opacity-60'}>
            {tp(PLAN_KEY[clock.plan] ?? 'monthly')} {fmtDur(split.paid)}
          </span>
          {' · '}
        </>
      )}
      <span className={paidOn ? 'opacity-60' : 'font-bold'}>
        {tp('free')} {fmtDur(split.free)}
      </span>
    </div>,
    slot,
  )
}

export const attend: RoomFeature = { id: 'attend', Overlay: AttendBeat }
