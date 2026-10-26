'use client'
// 룸 무대(S4) — 발표자 고정 1화면(설계서 6.2). 영상은 항상 muted 로 재생하고 소리는 별도 <audio>(useRemoteAudio)로만 낸다
// → 자동재생 정책으로 소리가 막혀도 영상은 나온다(설계서 14.5)
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import type { Role, RoomState } from './use-room'

const PLAY_RETRY_MS = 1000
const PLAY_RETRY_MAX = 3

export function StreamVideo({
  stream,
  mirror,
  className = '',
}: {
  stream: MediaStream | null
  mirror?: boolean
  className?: string
}) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.srcObject = stream
    if (stream) el.play().catch(() => {})
  }, [stream])
  return (
    <video
      ref={ref}
      muted
      playsInline
      autoPlay
      className={`h-full w-full object-contain ${mirror ? '-scale-x-100' : ''} ${className}`}
    />
  )
}

// 원격 소리 재생 — 거부되면 1초 간격 3회 재시도 후 blocked(하단 바 "소리 켜기" 노출). Jitsi AudioTrack 재시도 방식(설계서 14.5)
// stream 이 null(오류·끊김·나가기·발행자 퇴장)이면 srcObject 를 비우고 멈춘다 — 이전 소리가 계속 나지 않게
export function useRemoteAudio(ref: RefObject<HTMLAudioElement | null>, stream: MediaStream | null) {
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!stream?.getAudioTracks().length) {
      el.pause()
      el.srcObject = null
      setBlocked(false)
      return
    }
    el.srcObject = stream
    let tries = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const attempt = () =>
      el.play().then(
        () => setBlocked(false),
        () => {
          if (++tries < PLAY_RETRY_MAX) timer = setTimeout(attempt, PLAY_RETRY_MS)
          else setBlocked(true)
        },
      )
    attempt()
    return () => clearTimeout(timer)
  }, [ref, stream])
  const enable = () =>
    ref.current?.play().then(
      () => setBlocked(false),
      () => {},
    )
  return { blocked, enable }
}

// 진행 표시 — reduced-motion 이면 globals.css 가 회전을 멈춘다
export function Spinner() {
  return <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
}

export function Stage({
  role,
  state,
  local,
  remoteVideo,
  remoteAudio,
  localOn,
  remotePaused,
}: {
  role: Role
  state: RoomState
  local: MediaStream | null
  remoteVideo: MediaStream | null
  remoteAudio: MediaStream | null
  localOn: { audio: boolean; video: boolean }
  remotePaused: { audio: boolean; video: boolean }
}) {
  const t = useTranslations('room')
  // 발표자는 내 카메라, 청중은 받은 영상
  const main = role === 'presenter' ? local : remoteVideo
  const hasVideo = !!main?.getVideoTracks().length
  const videoOff = role === 'presenter' ? !localOn.video : remotePaused.video
  const notice =
    state !== 'joined'
      ? t('state.connecting')
      : !hasVideo
        ? t(role === 'presenter' ? 'noCameraSelf' : 'waiting')
        : videoOff
          ? t(role === 'presenter' ? 'camOffSelf' : 'camOff')
          : null

  return (
    <div className="bg-surface relative aspect-video w-full overflow-hidden rounded-xl">
      {hasVideo && (
        <StreamVideo stream={main} mirror={role === 'presenter'} className={videoOff ? 'invisible' : ''} />
      )}
      {notice && (
        <p className="text-muted-foreground absolute inset-0 grid place-items-center p-4 text-center text-sm">
          {notice}
        </p>
      )}
      {role === 'audience' && remoteAudio && remotePaused.audio && (
        <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs">{t('micOff')}</span>
      )}
    </div>
  )
}
