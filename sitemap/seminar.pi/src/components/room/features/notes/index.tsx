'use client'
// AI 회의록(SubAgent7, 계획서 SA7·M-4, 설계서 15.6·15.9) — 발표자 ⋯ [AI 회의록] 켜기/끄기(menuitemcheckbox, 확인 대화상자 없음 15.2).
//  켜기 : POST /api/notes → ntId → 말하기 요청 quiet(자막 방송 없이 글로만 — 서버 /api/speech/chunk 가 기록 중 회의록에 조각 저장) → app 'state' {notes:true} 방송
//  → 무대(전원) 'AI 기록 중' 배지(자동 숨김 없음) + 시작·종료 토스트 3초. panel 은 배지만(말하기 요청 없음 — 서버가 panel 조각을 회의록에 넣지 않는다, D-1).
//  화면공유 중이면 1초마다 64×36 축소 프레임을 마지막 캡처와 비교 → 많이 바뀌면 캡처(분당 2장) → POST /api/notes/[id]/shot.
//  끄기 : state {notes:false} → POST /api/notes/[id]/end(요약, 기다리지 않음). 늦게 들어온 사람에겐 발표자가 참가자 수가 늘 때 1초 묶어 다시 방송(SIGNAL_API 3.6).
//  엔진 app 미지원이면 항목을 숨긴다(app:true — 전원 고지를 못 하면 시작하지 않는다 15.1). 호출은 전부 piFetch(Pi Browser 쿠키 없음)
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { Icon } from '../../control-bar'
import {
  BADGE_SLOT_ID,
  TOAST_SLOT_ID,
  featureStore,
  useStageSlot,
  useStore,
  wantSpeech,
  type RoomCtx,
  type RoomFeature,
} from '../../extensions'
import { APP_RETRY, latestOnly, sendRetry } from '../../app-retry'
import {
  frameDiff,
  noteGone,
  noteState,
  SHOT_DIFF,
  SHOT_H,
  SHOT_MAX_W,
  SHOT_QUALITY,
  SHOT_TICK_MS,
  SHOT_W,
  shotAllowed,
} from '@/lib/note-rules'
import { presenterGone, presenterResync } from '../../room-rules'

const TOAST_MS = 3000
const RESEND_MS = 1000
const NOTES_ICON = 'M3 18h12v-2H3v2zM3 6v2h18V6H3zm0 7h18v-2H3v2z'
// 전원 고지(M-4) — 한도·응답 없음이면 다시 보낸다(app-retry, 녹화와 같은 fail-open 방지)
const sendState = (ctx: RoomCtx, v: boolean, live: () => boolean) =>
  sendRetry(() => ctx.sendApp('state', { notes: v }), live)
const latest = latestOnly() // 켜기·끄기 고지 엇갈림 방지(녹화와 같음) — 끄기 재시도가 다시 켠 뒤에 도착하지 않게

const on = featureStore(false) // 내가(발표자) 켬 — ⋯ 항목 체크
const ntIdStore = featureStore<string | null>(null) // 내가 켠 회의록 ID
const roomOn = featureStore(false) // 방에 AI 기록 중(state 수신) — 배지
let busy = false
let onAt = 0 // 내가 켠 시각(noteGone — 켜기 전 조각의 늦은 응답을 믿지 않게)

// 내 회의록 내리기(끄기·다른 곳 종료) — 저장소·말하기 요청·전원 고지를 함께
function dropMine(ctx: RoomCtx) {
  on.set(false)
  ntIdStore.set(null)
  onAt = 0
  wantSpeech('notes', null)
  void sendState(ctx, false, latest()) // 켜기·끄기 엇갈림 방지(T06) — 늦은 끄기 재시도가 다시 켠 배지를 내리지 않게
}

function endNote(id: string) {
  // 퇴장 직후에도 끝까지 가게 keepalive(본문 없음 — 64KB 제한 무관)
  void piFetch(`/api/notes/${id}/end`, {
    method: 'POST',
    keepalive: true,
  }).catch(() => null)
}

async function toggle(ctx: RoomCtx) {
  if (busy) return
  busy = true
  try {
    const id = ntIdStore.get()
    if (id) {
      dropMine(ctx)
      endNote(id)
      ctx.notice('notes.stoppedMine')
      return
    }
    const r = await piFetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ smnId: ctx.seminarId }),
    }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { ntId?: string } | null
    if (!r?.ok || !j?.ntId) return ctx.notice('notes.startFail')
    // 전원 고지가 먼저 — 방송이 실패하면 기록을 시작하지 않는다(M-4)
    if (await sendState(ctx, true, latest())) {
      // TIMEOUT 은 이미 방송됐을 수 있다 — 기록 없이 배지가 남지 않게 끄기도 보낸다(영구 오류면 엔진이 거절, 무해)
      void sendState(ctx, false, latest())
      endNote(j.ntId)
      return ctx.notice('notes.startFail')
    }
    ntIdStore.set(j.ntId)
    onAt = Date.now()
    on.set(true)
    wantSpeech('notes', 'quiet')
    ctx.notice('notes.startedMine')
  } finally {
    busy = false
  }
}

// 화면공유 캡처 — 발표자·켜짐·공유 중일 때만
function useShots(stream: MediaStream | null, ntId: string | null) {
  useEffect(() => {
    const track = stream?.getVideoTracks()[0]
    if (!track || !ntId) return
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.srcObject = new MediaStream([track])
    void v.play().catch(() => null)
    const small = document.createElement('canvas')
    small.width = SHOT_W
    small.height = SHOT_H
    const sc = small.getContext('2d', { willReadFrequently: true })
    let last: Uint8ClampedArray | null = null // 마지막으로 캡처한 축소 프레임
    const sent: number[] = []
    let sending = false
    const timer = setInterval(() => {
      if (!sc || sending || v.readyState < 2 || !v.videoWidth) return
      sc.drawImage(v, 0, 0, SHOT_W, SHOT_H)
      const cur = sc.getImageData(0, 0, SHOT_W, SHOT_H).data
      if (last && frameDiff(last, cur) < SHOT_DIFF) return
      const now = Date.now()
      if (!shotAllowed(sent, now)) return // 상한 — last 를 두어 상한이 풀리면 그때 화면을 찍는다
      last = cur
      sent.push(now)
      const w = Math.min(SHOT_MAX_W, v.videoWidth)
      const big = document.createElement('canvas')
      big.width = w
      big.height = Math.round((v.videoHeight * w) / v.videoWidth)
      big.getContext('2d')?.drawImage(v, 0, 0, big.width, big.height)
      sending = true
      big.toBlob(
        (blob) => {
          if (!blob) return void (sending = false)
          const fd = new FormData()
          fd.append('image', blob, 'shot.jpg')
          void piFetch(`/api/notes/${ntId}/shot`, { method: 'POST', body: fd })
            .catch(() => null)
            .finally(() => (sending = false))
        },
        'image/jpeg',
        SHOT_QUALITY,
      )
    }, SHOT_TICK_MS)
    return () => {
      clearInterval(timer)
      v.srcObject = null
    }
  }, [stream, ntId])
}

function NotesOverlay({ ctx }: { ctx: RoomCtx; barShown: boolean }) {
  const t = useTranslations('room.notes')
  const mine = useStore(on)
  const ntId = useStore(ntIdStore)
  const shown = useStore(roomOn) || mine
  const slot = useStageSlot(BADGE_SLOT_ID)
  const toastSlot = useStageSlot(TOAST_SLOT_ID)
  const [toast, setToast] = useState<string | null>(null)
  const prev = useRef(shown)
  const isPresenter = ctx.role === 'presenter'
  useShots(isPresenter ? ctx.r.localScreen : null, isPresenter ? ntId : null)

  // 탭 닫기·새로 고침·앱 전환 종료 — onReset 이 안 도는 길. 켜 둔 회의록을 keepalive 로 끝낸다(M-4, 기록 중 고착 방지)
  useEffect(() => {
    const bye = () => {
      const id = ntIdStore.get()
      if (!id) return
      ntIdStore.reset()
      on.reset()
      endNote(id)
    }
    window.addEventListener('pagehide', bye)
    return () => window.removeEventListener('pagehide', bye)
  }, [])

  // 시작·종료 토스트 3초(전원) + 낭독
  useEffect(() => {
    if (prev.current === shown) return
    prev.current = shown
    const text = t(shown ? 'started' : 'stopped')
    setToast(text)
    ctx.announce(text)
    const tm = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(tm)
  }, [shown]) // eslint-disable-line react-hooks/exhaustive-deps

  // 발표자가 끊김 신호 없이 나가면(창 닫힘·망 단절) 배지와 panel 음성 요청을 내린다 — 발표자 회의록은 pagehide·onReset 으로 이미 끝났다(M-4·R-P5).
  // 다시 들어오면 발표자가 현재 값을 방송한다(아래)
  const gone = presenterGone(ctx.role, ctx.r.selfId, ctx.r.peers)
  useEffect(() => {
    if (!gone) return
    roomOn.set(false)
  }, [gone])

  // 발표자 입장·재입장 — 자기 현재 값을 1번 방송(새로 고침 뒤엔 false — 남은 panel 의 배지·음성 요청을 맞춘다)
  const selfId = ctx.r.selfId
  useEffect(() => {
    if (presenterResync(ctx.role, ctx.appSupported, selfId)) void sendState(ctx, on.get(), latest()) // 한도에 빠지지 않게 재시도(T03 r5)
  }, [ctx.role, ctx.appSupported, selfId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 늦게 들어온 사람 — 참가자 수가 늘면 1초 묶어 현재 상태 다시 방송(초당 2건 한도 안)
  const n = ctx.r.peers.length
  const prevN = useRef(n)
  useEffect(() => {
    const grew = n > prevN.current
    prevN.current = n
    if (!mine || !grew) return
    const tm = setTimeout(() => void sendState(ctx, true, on.get), RESEND_MS)
    return () => clearTimeout(tm)
  }, [n, mine]) // eslint-disable-line react-hooks/exhaustive-deps

  // 기록 중 10초 주기 재알림 — 묶음 재알림이 한도에 걸려 빠진 사람도 배지를 본다(M-4)
  const ctxRef = useRef(ctx)
  useEffect(() => {
    ctxRef.current = ctx
  })
  useEffect(() => {
    if (!mine) return
    const tm = setInterval(() => void sendState(ctxRef.current, true, on.get), APP_RETRY.heartbeatMs)
    return () => clearInterval(tm)
  }, [mine])

  return (
    <>
      {shown &&
        slot &&
        createPortal(
          <div role="status" className="bg-accent inline-flex h-6 items-center rounded-full px-3 text-[13px] text-white">
            {t('badge')}
          </div>,
          slot,
        )}
      {toast &&
        toastSlot &&
        createPortal(<div className="bg-surface-raised rounded-lg px-3 py-2 text-sm shadow">{toast}</div>, toastSlot)}
    </>
  )
}

export const notes: RoomFeature = {
  id: 'notes',
  consent: true,
  more: [
    {
      id: 'notes',
      label: 'notes.on',
      icon: <Icon d={NOTES_ICON} />,
      roles: ['presenter'],
      app: true,
      checked: on,
      onClick: (ctx) => void toggle(ctx),
    },
  ],
  Overlay: NotesOverlay,
  onApp: (m, ctx) => {
    if (m.topic !== 'state') return
    const v = noteState(m.d)
    if (v === null) return
    roomOn.set(v)
    // 무대 역할(panel)은 말하기를 요청하지 않는다 — 서버가 회의록에 남기는 조각은 기록 시작자·개최자·ADMIN 것뿐(canRecordSeg, D-1)이라
    //  panel 의 quiet 조각은 자막 방송도 저장도 없이 외부 AI 사용량만 쓴다(r3 T07). 자막이 켜져 있으면 captions 가 따로 요청한다
  },
  // 회의록이 회의록 화면에서 삭제·[기록 끝내고 요약]으로 끝남 — 서버가 조각 응답에 rec=false 를 실어 보낸다.
  //  배지·회의록용 음성 조각을 내린다(전에는 발표자가 끌 때까지 배지가 남고 외부 AI 사용량이 계속 들었다, r2·r3 승계)
  onSpeech: (_text, _ts, ctx, meta) => {
    if (busy || !on.get() || !noteGone(meta?.rec, Date.now(), onAt)) return
    dropMine(ctx)
    ctx.notice('notes.gone')
  },
  onReset: () => {
    // 퇴장·끊김 — 켜 둔 회의록은 끝낸다(배지가 사라지는데 기록이 계속되면 안 된다, M-4)
    // ponytail: 잠깐 끊겨도 회의록이 나뉜다 — 문제가 되면 재접속 유예(예 30초) 뒤에 끝내기
    const id = ntIdStore.get()
    if (id) endNote(id)
    on.reset()
    ntIdStore.reset()
    roomOn.reset()
    busy = false
    onAt = 0
  },
}
