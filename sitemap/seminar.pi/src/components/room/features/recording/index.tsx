'use client'
// 녹화(로컬 저장, SA6 — 설계서 15.6·계획서 M-4) — 발표자만 ⋯ [녹화 시작] → 고지 확인 대화상자 → 전원에게 state{recording:true} → 무대 합성 녹화.
// 끄면 state{recording:false} + 파일 다운로드(seminar-<id>-<시각>.webm|mp4). 받는 쪽은 빨간 '녹화 중' 배지(자동 숨김 없음) + 3초 토스트.
// 전원 고지를 못 하면(sendApp 실패) 시작하지 않는다. 늦게 들어온 사람에게는 녹화 중인 발표자가 1초 묶음으로 다시 알린다(SIGNAL_API 3.6).
// 고지는 fail-open 을 막으려고 시작·종료·재알림 모두 재시도(RATE_LIMITED·TIMEOUT)하고, 녹화 중에는 10초마다 현재 상태를 다시 보낸다(app-retry).
// d 약속 : { recording: boolean } — 같은 state 주제의 다른 키(AI 기록 등)는 이 기능이 무시한다(rules.ts readRecording·applyRec)
// 요금제(sql/023, 마스터 2026-10-29) — 세미나 방에서는 월간·연간 세미나 + 유료 남은 시간이 있을 때만 시작(서버 start 가 먼저 확인),
//  녹화 중 30초마다 beat 로 룸 시간과 따로 유료 이용권에서 한 번 더 차감, 유료 시간이 다 되면 멈추고 파일 저장. 실험실 방(UUID 아님)은 계량 없음
// 저장이 막히는 곳(앱 안 브라우저 등)을 위해 마지막 녹화 파일을 다음 녹화·퇴장·닫기 전까지 들고 [다시 저장](파일 공유 → 내려받기)을 띄운다
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { readApi } from '@/lib/client-api'
import { isUuid } from '@/lib/seminar-rules'
import { BADGE_SLOT_ID, TOAST_SLOT_ID, featureStore, useStageSlot, useStore, type RoomCtx, type RoomFeature } from '../../extensions'
import { APP_RETRY, latestOnly, sendRetry } from '../../app-retry'
import type { Recorder } from './recorder'
import { applyRec, othersRecording, pruneRec, recFileName, saveVia, stopToast, type RecBy } from './rules'

const RESEND_MS = 1000 // 늦은 입장자 재알림 묶음(초당 2건 한도 안)
const sendState = (ctx: RoomCtx, on: boolean, live: () => boolean) =>
  sendRetry(() => ctx.sendApp('state', { recording: on }), live)
const latest = latestOnly() // 켜기·끄기 고지 엇갈림 방지 — 끄기 재시도가 곧바로 다시 시작한 녹화의 '켜짐' 뒤에 도착하지 않게
// 끄기 고지(재시도) — 새 켜기 고지가 시작되면 멈춘다
const sendOff = (ctx: RoomCtx) => void sendState(ctx, false, latest())
const TOAST_MS = 3000

// ── 녹화 계량(sql/023) ── 녹화 하트비트 간격(서버는 90초 이하 경과만 차감 — 백그라운드 타이머 지연 1분까지 여유)
const METER_MS = 30_000
let meterTimer: ReturnType<typeof setInterval> | null = null
let meterSmn = '' // 계량 중인 세미나(없으면 계량 안 함)
const meter = (smnId: string, act: 'start' | 'beat' | 'stop') =>
  readApi<{ ok: true; paidSec: number; stop?: boolean }>(
    piFetch(`/api/seminars/${smnId}/recording`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ act }),
    }),
  )
// 시작 거절 사유 → room.recording.* 키
const meterDeny = (code?: string) =>
  code === 'REC_PAID_ONLY'
    ? 'recording.paidOnly'
    : code === 'PLAN_EXHAUSTED'
      ? 'recording.paidOut'
      : code === 'REC_NOT_IN_ROOM'
        ? 'recording.notInRoom'
        : 'recording.meterFailed'
// 계량 끝 — 타이머 정리 + 마지막 경과 차감(stop). 퇴장·끊김에서도 부른다
function meterStop() {
  if (meterTimer) clearInterval(meterTimer)
  meterTimer = null
  if (meterSmn) void meter(meterSmn, 'stop').catch(() => {})
  meterSmn = ''
}
// 녹화 하트비트 — 유료 시간 소진(stop)·무료 구간·세미나 종료면 녹화를 멈추고 저장(파일은 지킨다). 네트워크 실패는 다음 번에 다시
async function beatRec() {
  const smn = meterSmn
  if (!smn) return
  const r = await meter(smn, 'beat').catch(() => null)
  if (!r || smn !== meterSmn) return
  const out = r.ok ? !!r.data.stop : ['PLAN_EXHAUSTED', 'REC_PAID_ONLY', 'SMN_CLOSED'].includes(r.body.code ?? '')
  if (!out) return
  const c = ctxNow?.() ?? null
  c?.notice('recording.planOut')
  void stopRec(c)
}

const recOn = featureStore(false) // 내가 녹화 중
const startedAt = featureStore(0)
const confirmOpen = featureStore(false)
const busy = featureStore(false) // 시작·종료 처리 중(두 번 누름 방지)
const recBy = featureStore<RecBy>({}) // 녹화 중이라고 알린 다른 발표자 peerId
const toast = featureStore<string | null>(null) // room.recording.* 아래 키
const lastSaved = featureStore(false) // 다시 저장할 마지막 녹화 파일이 있음(lastFile)
// 일시정지(마스터 2026-10-29) — 멈춘 동안은 녹화 계량도 멈춘다(추가 차감 없음). 경과 표시는 멈춘 시간을 뺀다
const paused = featureStore(false)
const pausedAt = featureStore(0) // 지금 멈춘 시각(멈춤 중일 때)
const pausedSum = featureStore(0) // 지난 멈춤 합(ms)

// 지금 녹화 중인가(나 또는 다른 발표자) — 다른 기능이 녹화 동안 화면 요소를 감출 때(예 남은 시간 카운트다운, 마스터 2026-10-29)
export function useRecordingNow() {
  const mine = useStore(recOn)
  const by = useStore(recBy)
  return mine || Object.keys(by).length > 0
}
let recorder: Recorder | null = null
let fileName = ''
let lastFile: File | null = null // ponytail: 메모리에 1개 보관(긴 녹화면 수백 MB) — 다음 녹화 시작·퇴장·[닫기] 때 놓는다

const dropLast = () => {
  lastFile = null
  lastSaved.set(false)
}

// 다시 저장 — 버튼 클릭(사용자 제스처) 안에서만 부른다. 파일 공유가 되면 공유 시트(파일에 저장), 아니면 <a download>
async function resave() {
  const f = lastFile
  if (!f) return
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  if (saveVia(nav, f) === 'share') {
    try {
      return await navigator.share({ files: [f] })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return // 사용자가 닫음
    }
  }
  ;(await import('./recorder')).saveBlob(f, f.name)
}
let ctxNow: (() => RoomCtx) | null = null // 최신 ctx(Overlay 가 맞춘다) — 녹화기 오류 콜백이 클릭 때의 낡은 ctx 로 고지하지 않게
let gen = 0 // 세대 — onReset(퇴장·끊김) 때 증가. startRec 의 await 사이에 바뀌면 시작하지 않는다

// 종료 — 파일 저장 + 전원 알림. ctx 가 없으면(퇴장·끊김) 알림 없이 저장만(데이터 유실 방지)
async function stopRec(ctx: RoomCtx | null, auto = false) {
  const rec = recorder
  if (!rec) return
  recorder = null
  meterStop()
  paused.set(false)
  pausedAt.set(0)
  pausedSum.set(0)
  busy.set(true)
  recOn.set(false)
  startedAt.set(0)
  // 종료 알림은 파일 저장을 기다리지 않고 먼저 — 한도에 걸리면 다시 보낸다(사이에 새 녹화가 시작되면 그만). 역할을 잃었으면 엔진이 거절하고 받는 쪽이 역할로 내린다
  if (ctx) sendOff(ctx)
  try {
    const blob = await rec.stop()
    if (blob.size) {
      ;(await import('./recorder')).saveBlob(blob, fileName)
      // 퇴장·끊김(ctx 없음)이면 들지 않는다 — 룸을 떠나면 다시 저장 단추도 없다
      if (ctx && typeof File !== 'undefined') {
        lastFile = new File([blob], fileName, { type: blob.type })
        lastSaved.set(true)
      }
    }
    toast.set(stopToast(blob.size, auto))
  } catch {
    toast.set('saveFailed')
  } finally {
    busy.set(false)
  }
}

// 일시정지 — 녹화기 멈춤 + 녹화 계량 끊기(그때까지만 차감, stop). 세미나 계량 대상(meterSmn)은 다시 시작용으로 남긴다
function pauseRec() {
  if (!recorder || paused.get() || busy.get()) return
  recorder.pause()
  paused.set(true)
  pausedAt.set(Date.now())
  if (meterTimer) clearInterval(meterTimer)
  meterTimer = null
  if (meterSmn) void meter(meterSmn, 'stop').catch(() => {})
}
// 다시 시작 — 서버가 유료 시간을 다시 확인(START)해야 이어 녹화. 소진·무료 구간·종료면 녹화를 끝내고 파일 저장
async function resumeRec(ctx: RoomCtx) {
  const rec = recorder
  if (!rec || !paused.get() || busy.get()) return
  busy.set(true)
  try {
    if (meterSmn) {
      const m = await meter(meterSmn, 'start').catch(() => null)
      if (recorder !== rec) return // 그사이 종료됨
      if (!m?.ok) {
        ctx.notice(meterDeny(m && !m.ok ? m.body.code : undefined))
        busy.set(false)
        return void stopRec(ctx)
      }
      meterTimer = setInterval(() => void beatRec(), METER_MS)
    }
    rec.resume()
    pausedSum.set(pausedSum.get() + (Date.now() - pausedAt.get()))
    pausedAt.set(0)
    paused.set(false)
  } finally {
    busy.set(false)
  }
}

// ac = 클릭 핸들러에서 동기로 만든 AudioContext(사용자 활성화). 시작하지 못하면 여기서 닫는다
async function startRec(ctx: RoomCtx, stage: HTMLElement, ac: AudioContext | null) {
  if (recorder || busy.get() || !ac) {
    void ac?.close().catch(() => {})
    if (!ac) ctx.notice('recording.unsupported')
    return
  }
  const g = gen
  busy.set(true)
  let started = false
  const metered = isUuid(ctx.seminarId) // 세미나 방만 계량(실험실 방 제외)
  let meterOn = false
  try {
    const mod = await import('./recorder')
    if (g !== gen) return
    if (!mod.canRecord()) return ctx.notice('recording.unsupported')
    // 요금제 확인 + 계량 시작 — 무료 세미나·유료 시간 소진이면 고지 전에 멈춘다(서버가 정본)
    if (metered) {
      const m = await meter(ctx.seminarId, 'start').catch(() => null)
      if (g !== gen) return
      if (!m?.ok) return ctx.notice(meterDeny(m && !m.ok ? m.body.code : undefined))
      meterOn = true
    }
    // 먼저 전원에게 알린다 — 실패하면 시작하지 않는다(M-4)
    const cur = latest() // 앞 녹화의 끄기 재시도는 여기서 멈춘다
    const err = await sendState(ctx, true, () => g === gen && cur())
    if (err === 'CANCELLED') return
    if (err) {
      // TIMEOUT 은 엔진이 이미 방송했을 수 있다 — 녹화 없이 배지가 남지 않게 끄기도 보낸다(영구 오류면 엔진이 거절, 무해)
      sendOff(ctx)
      return ctx.notice('recording.notifyFailed')
    }
    dropLast() // 새 녹화가 시작되면 이전 파일은 놓는다(메모리에 둘을 들지 않게) — 시작 못 하면 남겨 둔다
    // 기다리는 사이 퇴장·끊김(onReset)이면 시작하지 않고 알림을 되돌린다(재시도 — 1회만 보내면 한도에 걸려 배지가 남는다)
    if (g !== gen) return sendOff(ctx)
    try {
      // 녹화 중 브라우저가 녹화를 멈추거나(오류) 메모리 상한(recorder.ts R.maxBytes)에 닿으면 종료·저장·고지 해제 — 이 녹화기일 때만(다음 녹화를 끄지 않게)
      const rec = mod.startRecorder(stage, ac, () => {
        if (recorder === rec) void stopRec(ctxNow?.() ?? null, true)
      })
      recorder = rec
      started = true
    } catch {
      // 이미 '녹화 중'을 알렸으니 해제도 재시도 — 1회만 보내 한도에 걸리면 받는 쪽 배지가 녹화 없이 남는다(배지는 명시적 false 로만 내림)
      sendOff(ctx)
      return ctx.notice('recording.unsupported')
    }
    if (ac.state !== 'running') ctx.notice('recording.audioSuspended')
    fileName = recFileName(ctx.seminarId, recorder.mime, new Date())
    recorder.setAudio([ctx.r.remoteAudio, ctx.r.localStream])
    recOn.set(true)
    startedAt.set(Date.now())
    toast.set('started')
    if (meterOn) {
      // 기준 시각을 실제 녹화 시작으로 다시 — 앞의 START~전원 고지(재시도 최대 약 45초) 대기는 차감하지 않는다(검토 지적)
      void meter(ctx.seminarId, 'start').catch(() => {})
      meterSmn = ctx.seminarId
      meterTimer = setInterval(() => void beatRec(), METER_MS)
    }
  } finally {
    if (!started) {
      void ac.close().catch(() => {})
      // 계량만 시작하고 녹화는 못 함 — stop 을 보내면 고지 대기 시간이 차감되므로 보내지 않는다(남은 기준 시각은 다음 START 가 덮어쓰고, 녹화 중이 아니면 BEAT·STOP 이 없다)
    }
    busy.set(false)
  }
}

const REC_ICON = (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" />
  </svg>
)

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const p = (n: number) => String(n).padStart(2, '0')
  return s >= 3600 ? `${Math.floor(s / 3600)}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}` : `${p(Math.floor(s / 60))}:${p(s % 60)}`
}

function Overlay({ ctx }: { ctx: RoomCtx; barShown: boolean }) {
  const t = useTranslations('room.recording')
  const anchor = useRef<HTMLSpanElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const mine = useStore(recOn)
  const slot = useStageSlot(BADGE_SLOT_ID)
  const toastSlot = useStageSlot(TOAST_SLOT_ID)
  const since = useStore(startedAt)
  const isPaused = useStore(paused)
  const pAt = useStore(pausedAt)
  const pSum = useStore(pausedSum)
  const open = useStore(confirmOpen)
  const isBusy = useStore(busy)
  const by = useStore(recBy)
  const msg = useStore(toast)
  const canResave = useStore(lastSaved)
  const [now, setNow] = useState(0)
  const { r, role, hold } = ctx
  const ids = new Set(r.peers.map((p) => p.peerId))
  const others = othersRecording(by, r.peers) // 알린 사람이 지금도 방의 발표자일 때만(퇴장·강등이면 내림)

  // 확인 대화상자 — 열려 있는 동안 바 자동 숨김 보류
  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
    hold(open)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // 경과 시간(발표자 화면만)
  useEffect(() => {
    if (!mine) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [mine])

  // 토스트 3초 + polite 낭독
  useEffect(() => {
    if (!msg) return
    ctx.announce(t(`toast.${msg}`))
    const timer = setTimeout(() => toast.set(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [msg]) // eslint-disable-line react-hooks/exhaustive-deps

  // 녹화 중 탭 닫기·새로 고침 — 메모리의 조각을 잃으므로 경고
  useEffect(() => {
    if (!mine) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [mine])

  // 소리 원본이 바뀌면(참가자 입퇴장·마이크 추가) 녹음 연결을 다시
  useEffect(() => {
    if (mine) recorder?.setAudio([r.remoteAudio, r.localStream])
  }, [mine, r.remoteAudio, r.localStream])

  // 발표자 역할을 잃으면 녹화를 끝낸다(파일은 저장). 열려 있던 시작 확인 대화상자도 닫는다(누르면 엔진이 거절해 '알리지 못함'만 뜬다)
  useEffect(() => {
    if (role === 'presenter') return
    confirmOpen.set(false)
    if (mine) void stopRec(ctx)
  }, [mine, role]) // eslint-disable-line react-hooks/exhaustive-deps

  // 받는 쪽 — 강등·퇴장한 사람의 녹화 표시를 지운다(다시 발표자가 됐을 때 녹화 없이 배지가 켜지지 않게, rules.ts pruneRec)
  const roleKey = r.peers.map((p) => `${p.peerId}:${p.role}`).join(',')
  useEffect(() => {
    const next = pruneRec(recBy.get(), r.peers)
    if (next) recBy.set(next)
  }, [roleKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // 늦은 입장자 — 참가자 구성이 바뀌면 1초 묶어서 현재 상태를 다시 알린다
  const peerKey = [...ids].sort().join(',')
  const ctxRef = useRef(ctx)
  useEffect(() => {
    ctxRef.current = ctx
    ctxNow = () => ctxRef.current
  })
  useEffect(() => {
    if (!mine) return
    const timer = setTimeout(() => void sendState(ctxRef.current, true, recOn.get), RESEND_MS)
    return () => clearTimeout(timer)
  }, [mine, peerKey])

  // 녹화 중 주기 재알림 — 묶음 재알림이 한도에 걸렸거나 신호를 놓친 사람도 10초 안에 배지를 본다(M-4 고지 fail-open 방지)
  useEffect(() => {
    if (!mine) return
    const timer = setInterval(() => void sendState(ctxRef.current, true, recOn.get), APP_RETRY.heartbeatMs)
    return () => clearInterval(timer)
  }, [mine])

  const btn = 'h-9 shrink-0 rounded-full px-4 text-sm font-semibold disabled:opacity-40'
  return (
    <>
      <span ref={anchor} hidden />
      {(mine || others) &&
        slot &&
        createPortal(
          <div
            role="status"
            className="bg-danger inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold text-white"
          >
            <span aria-hidden className={`size-2 rounded-full bg-white ${isPaused ? '' : 'animate-pulse'}`} />
            {t(mine && isPaused ? 'pausedBadge' : 'badge')}
            {mine && since > 0 && <span className="tabular-nums">{mmss(now - since - pSum - (isPaused && pAt ? now - pAt : 0))}</span>}
          </div>,
          slot,
        )}
      {/* 내 녹화 조작 — 일시정지·다시 시작·종료(마스터 2026-10-29). 배지 줄은 pointer-events-none 이라 버튼만 켠다 */}
      {mine &&
        slot &&
        createPortal(
          <div role="group" aria-label={t('controls')} className="pointer-events-auto inline-flex h-6 items-center gap-1">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => (isPaused ? void resumeRec(ctx) : pauseRec())}
              className="bg-surface-raised hover:bg-surface h-6 rounded-full px-2.5 text-[13px] font-semibold disabled:opacity-40"
            >
              {isPaused ? `▶ ${t('resume')}` : `⏸ ${t('pause')}`}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void stopRec(ctx)}
              className="bg-surface-raised hover:bg-surface h-6 rounded-full px-2.5 text-[13px] font-semibold disabled:opacity-40"
            >
              ■ {t('stop')}
            </button>
          </div>,
          slot,
        )}
      {/* 다시 저장 칩 — 토스트 줄(세로 쌓기)에 넣는다. 따로 absolute(top 44px)면 같은 순간 뜨는 '저장했어요' 토스트(top 48px)와 3초간 겹쳤다 */}
      {canResave &&
        !mine &&
        toastSlot &&
        createPortal(
          <div
            role="group"
            aria-label={t('resave.label')}
            className="bg-surface-raised pointer-events-auto inline-flex max-w-full items-center gap-1 rounded-full py-1 pr-1 pl-3 text-[13px] shadow"
          >
            <span className="truncate">{t('resave.label')}</span>
            <button type="button" onClick={() => void resave()} className="bg-danger h-8 shrink-0 rounded-full px-3 font-semibold text-white">
              {t('resave.save')}
            </button>
            <button
              type="button"
              onClick={dropLast}
              aria-label={t('resave.dismiss')}
              className="hover:bg-surface h-8 w-8 shrink-0 rounded-full"
            >
              <span aria-hidden>×</span>
            </button>
          </div>,
          toastSlot,
        )}
      {msg &&
        toastSlot &&
        createPortal(
          <div aria-hidden className="bg-surface-raised max-w-[92%] rounded-xl px-4 py-2 text-sm shadow">
            {t(`toast.${msg}`)}
          </div>,
          toastSlot,
        )}
      <dialog
        ref={dialog}
        aria-labelledby="rec-title"
        onCancel={(e) => {
          e.preventDefault()
          confirmOpen.set(false)
        }}
        className="bg-surface text-foreground m-auto w-[min(92vw,440px)] rounded-xl p-6 backdrop:bg-black/60"
      >
        <h2 id="rec-title" className="mb-2 font-bold">
          {t('confirm.title')}
        </h2>
        <p className="text-muted-foreground mb-2 text-sm">{t('confirm.body')}</p>
        <p className="text-muted-foreground mb-2 text-xs">{t('confirm.download')}</p>
        {/* 녹화 시간 추가 차감 고지(sql/023) — 세미나 방만 */}
        {isUuid(ctx.seminarId) && <p className="text-warning mb-4 text-xs">{t('confirm.charge')}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => confirmOpen.set(false)} className={`${btn} bg-surface-raised`}>
            {t('confirm.cancel')}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              confirmOpen.set(false)
              const stage = anchor.current?.parentElement
              if (!stage) return
              // 클릭 직후 동기로 만들고 resume — await 뒤에 만들면 iOS Safari 등에서 suspended(무음 녹화)
              let ac: AudioContext | null = null
              try {
                ac = new AudioContext()
                void ac.resume().catch(() => {})
              } catch {}
              void startRec(ctx, stage, ac)
            }}
            className={`${btn} bg-danger text-white`}
          >
            {t('confirm.start')}
          </button>
        </div>
      </dialog>
    </>
  )
}

export const recording: RoomFeature = {
  id: 'recording',
  // 발언자 음성을 녹음하므로 대기실 고지·마이크 동의 대상(M-4·A-6).
  // 동의를 거부한 발언자의 음성을 녹화에서 뺄지는 [확인중 : 마스터] — 지금은 거부해도 녹음된다
  consent: true,
  more: [
    {
      id: 'recording',
      label: 'recording.title',
      icon: REC_ICON,
      roles: ['presenter'],
      // 엔진 app 중계가 없어도 보인다 — 전원 고지는 채팅 표식으로 이어 보낸다(use-room sendApp 'state', 마스터 2026-10-29). 고지 실패면 여전히 시작하지 않음(M-4)
      checked: recOn,
      onClick: (ctx) => {
        if (busy.get()) return
        if (recOn.get()) void stopRec(ctx)
        else confirmOpen.set(true)
      },
    },
  ],
  Overlay,
  onApp: (m) => {
    if (m.topic !== 'state') return
    const next = applyRec(recBy.get(), m.from, m.d)
    if (!next) return
    const on = !!next[m.from]
    recBy.set(next)
    toast.set(on ? 'startedBy' : 'stoppedBy') // 토스트 + polite 낭독은 Overlay
  },
  onReset: () => {
    gen++
    void stopRec(null)
    confirmOpen.reset()
    recBy.reset()
    dropLast() // 퇴장하면 다시 저장 파일도 놓는다
  },
}
