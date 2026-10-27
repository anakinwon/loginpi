'use client'
// 녹화(로컬 저장, SA6 — 설계서 15.6·계획서 M-4) — 발표자만 ⋯ [녹화 시작] → 고지 확인 대화상자 → 전원에게 state{recording:true} → 무대 합성 녹화.
// 끄면 state{recording:false} + 파일 다운로드(seminar-<id>-<시각>.webm|mp4). 받는 쪽은 빨간 '녹화 중' 배지(자동 숨김 없음) + 3초 토스트.
// 전원 고지를 못 하면(sendApp 실패) 시작하지 않는다. 늦게 들어온 사람에게는 녹화 중인 발표자가 1초 묶음으로 다시 알린다(SIGNAL_API 3.6).
// d 약속 : { recording: boolean } — 같은 state 주제의 다른 키(AI 기록 등)는 이 기능이 무시한다
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { featureStore, useStore, type RoomCtx, type RoomFeature } from '../../extensions'
import type { Recorder } from './recorder'

const RESEND_MS = 1000 // 늦은 입장자 재알림 묶음(초당 2건 한도 안)
const TOAST_MS = 3000

const recOn = featureStore(false) // 내가 녹화 중
const startedAt = featureStore(0)
const confirmOpen = featureStore(false)
const busy = featureStore(false) // 시작·종료 처리 중(두 번 누름 방지)
const recBy = featureStore<Readonly<Record<string, true>>>({}) // 녹화 중이라고 알린 다른 발표자 peerId
const toast = featureStore<string | null>(null) // room.recording.* 아래 키
let recorder: Recorder | null = null
let fileName = ''

// d 검사 — 엔진은 모양을 보지 않으므로 받는 쪽이 거른다
export function readRecording(d: unknown): boolean | null {
  if (!d || typeof d !== 'object') return null
  const v = (d as { recording?: unknown }).recording
  return typeof v === 'boolean' ? v : null
}

// 종료 — 파일 저장 + 전원 알림. ctx 가 없으면(퇴장·끊김) 알림 없이 저장만(데이터 유실 방지)
async function stopRec(ctx: RoomCtx | null) {
  const rec = recorder
  if (!rec) return
  recorder = null
  busy.set(true)
  recOn.set(false)
  startedAt.set(0)
  try {
    const blob = await rec.stop()
    if (blob.size) (await import('./recorder')).saveBlob(blob, fileName)
    toast.set(blob.size ? 'saved' : 'empty')
  } catch {
    toast.set('saveFailed')
  } finally {
    busy.set(false)
  }
  if (ctx) void ctx.sendApp('state', { recording: false })
}

async function startRec(ctx: RoomCtx, stage: HTMLElement) {
  if (recorder || busy.get()) return
  busy.set(true)
  try {
    const mod = await import('./recorder')
    if (!mod.canRecord()) return ctx.notice('recording.unsupported')
    // 먼저 전원에게 알린다 — 실패하면 시작하지 않는다(M-4)
    if (await ctx.sendApp('state', { recording: true })) return ctx.notice('recording.notifyFailed')
    try {
      recorder = mod.startRecorder(stage)
    } catch {
      void ctx.sendApp('state', { recording: false })
      return ctx.notice('recording.unsupported')
    }
    fileName = mod.recFileName(ctx.seminarId, recorder.mime, new Date())
    recorder.setAudio([ctx.r.remoteAudio, ctx.r.localStream])
    recOn.set(true)
    startedAt.set(Date.now())
    toast.set('started')
  } finally {
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
  const since = useStore(startedAt)
  const open = useStore(confirmOpen)
  const isBusy = useStore(busy)
  const by = useStore(recBy)
  const msg = useStore(toast)
  const [now, setNow] = useState(0)
  const { r, role, hold } = ctx
  const ids = new Set(r.peers.map((p) => p.peerId))
  // 알린 발표자가 나갔으면 배지를 내린다(종료 신호를 못 보내고 끊긴 경우)
  const others = Object.keys(by).some((id) => ids.has(id))

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

  // 소리 원본이 바뀌면(참가자 입퇴장·마이크 추가) 녹음 연결을 다시
  useEffect(() => {
    if (mine) recorder?.setAudio([r.remoteAudio, r.localStream])
  }, [mine, r.remoteAudio, r.localStream])

  // 발표자 역할을 잃으면 녹화를 끝낸다(파일은 저장)
  useEffect(() => {
    if (mine && role !== 'presenter') void stopRec(ctx)
  }, [mine, role]) // eslint-disable-line react-hooks/exhaustive-deps

  // 늦은 입장자 — 참가자 구성이 바뀌면 1초 묶어서 현재 상태를 다시 알린다
  const peerKey = [...ids].sort().join(',')
  useEffect(() => {
    if (!mine) return
    const timer = setTimeout(() => void ctx.sendApp('state', { recording: true }), RESEND_MS)
    return () => clearTimeout(timer)
  }, [mine, peerKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const btn = 'h-9 shrink-0 rounded-full px-4 text-sm font-semibold disabled:opacity-40'
  return (
    <>
      <span ref={anchor} hidden />
      {(mine || others) && (
        <div
          role="status"
          className="bg-danger pointer-events-none absolute top-[calc(12px+env(safe-area-inset-top))] left-3 z-10 inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold text-white"
        >
          <span aria-hidden className="size-2 animate-pulse rounded-full bg-white" />
          {t('badge')}
          {mine && since > 0 && <span className="tabular-nums">{mmss(now - since)}</span>}
        </div>
      )}
      {msg && (
        <div
          aria-hidden
          className="bg-surface-raised pointer-events-none absolute top-12 left-1/2 z-10 max-w-[92%] -translate-x-1/2 rounded-xl px-4 py-2 text-sm shadow"
        >
          {t(`toast.${msg}`)}
        </div>
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
        <p className="text-muted-foreground mb-4 text-xs">{t('confirm.download')}</p>
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
              if (stage) void startRec(ctx, stage)
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
  more: [
    {
      id: 'recording',
      label: 'recording.title',
      icon: REC_ICON,
      roles: ['presenter'],
      app: true, // 전원 고지가 안 되면 숨김
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
    const on = readRecording(m.d)
    if (on === null || on === !!recBy.get()[m.from]) return
    recBy.set((s) => {
      const next = { ...s }
      if (on) next[m.from] = true
      else delete next[m.from]
      return next
    })
    toast.set(on ? 'startedBy' : 'stoppedBy') // 토스트 + polite 낭독은 Overlay
  },
  onReset: () => {
    void stopRec(null)
    confirmOpen.reset()
    recBy.reset()
  },
}
