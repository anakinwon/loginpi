'use client'
// 영상 타일 — 이름·마이크 꺼짐 아이콘·카메라 끔 아바타 원·말하기 링(설계서 6.3·14.1·G7). 영상은 항상 muted(소리는 useRemoteAudio)
// 말하기 판정은 엔진 ntf activeSpeaker(v1.2 G)가 정본, 구 엔진이면 클라이언트 AudioContext 레벨 — 켤 때 0.2s·끌 때 0.5s 유지돼야 바뀐다(화면 흔들림 방지)
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ICON, Icon } from './control-bar'
import { nextSpeaking, SPEAK } from './room-rules'
import { StreamVideo, type LayerFn } from './stage'

// 공용 AudioContext 1개 — 브라우저마다 동시 컨텍스트 수 상한이 있어 타일마다 만들지 않는다. 트랙마다 analyser 만 따로,
// 마지막 사용자가 빠지면 닫는다(다음 사용 때 새로 만든다)
const shared: { ctx: AudioContext | null; users: number } = { ctx: null, users: 0 }
export function acquireCtx(): AudioContext {
  if (!shared.ctx || shared.ctx.state === 'closed') shared.ctx = new AudioContext()
  shared.users++
  return shared.ctx
}
export function releaseCtx() {
  if (--shared.users > 0) return
  shared.users = 0
  shared.ctx?.close().catch(() => {})
  shared.ctx = null
}

export function useSpeaking(stream: MediaStream | null, enabled: boolean) {
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => {
    const track = stream?.getAudioTracks()[0]
    if (!enabled || !track || typeof AudioContext === 'undefined') {
      setSpeaking(false)
      return
    }
    const ctx = acquireCtx()
    const src = ctx.createMediaStreamSource(new MediaStream([track]))
    const an = ctx.createAnalyser()
    an.fftSize = 512
    src.connect(an) // destination 에 잇지 않는다 — 소리는 <audio> 가 낸다(이중 재생 방지)
    ctx.resume().catch(() => {})
    const buf = new Float32Array(an.fftSize)
    let st = { on: false, since: 0 }
    const timer = setInterval(() => {
      an.getFloatTimeDomainData(buf)
      let sum = 0
      for (const v of buf) sum += v * v
      const next = nextSpeaking(st, Math.sqrt(sum / buf.length) > SPEAK.level, performance.now())
      if (next.on !== st.on) setSpeaking(next.on)
      st = next
    }, SPEAK.pollMs)
    return () => {
      clearInterval(timer)
      src.disconnect()
      releaseCtx()
      setSpeaking(false)
    }
  }, [stream, enabled])
  return speaking
}

export function VideoTile({
  video,
  audio,
  name,
  micOff,
  camOff,
  mirror,
  consumerId,
  onLayer,
  speaking: engineSpeaking,
  children,
}: {
  video: MediaStream | null
  audio: MediaStream | null
  name?: string // 없으면 이름 줄 숨김(발행자 없음)
  micOff: boolean
  camOff: boolean
  mirror?: boolean
  consumerId?: string // 원격 영상이면 그 consumer(수신 화질 판정, 설계서 14.2)
  onLayer?: LayerFn
  speaking?: boolean // 엔진 발언자 판정(ntf activeSpeaker, v1.2) — 없으면(구 엔진) 이 타일이 AudioContext 로 판정
  children?: ReactNode // 타일 위 안내·스피너
}) {
  const t = useTranslations('room')
  const hasVideo = !!video?.getVideoTracks().length
  const hasAudio = !!audio?.getAudioTracks().length
  const local = useSpeaking(audio, engineSpeaking === undefined && hasAudio && !micOff)
  const speaking = engineSpeaking ?? local
  const showAvatar = !!name && (!hasVideo || camOff)
  return (
    <div className="bg-surface relative aspect-video w-full overflow-hidden rounded-xl">
      {hasVideo && (
        <StreamVideo
          stream={video}
          mirror={mirror}
          className={camOff ? 'invisible' : ''}
          consumerId={consumerId}
          onLayer={onLayer}
        />
      )}
      {showAvatar && (
        <div className="absolute inset-0 grid place-items-center" aria-hidden>
          <span className="bg-surface-raised grid size-20 place-items-center rounded-full text-3xl font-bold uppercase">
            {[...name][0]}
          </span>
        </div>
      )}
      {children}
      {/* 말하기 링 — 영상 위 테두리(영상이 inset 그림자를 덮으므로 별도 층), 페이드는 reduced-motion 이면 끔 */}
      <span
        aria-hidden
        className={`border-speaking pointer-events-none absolute inset-0 rounded-xl border-4 transition-opacity duration-200 motion-reduce:transition-none ${speaking ? 'opacity-100' : 'opacity-0'}`}
      />
      {name && (
        <span className="absolute bottom-2 left-2 flex max-w-[80%] items-center gap-1 rounded bg-black/60 px-2 py-1 text-xs">
          {hasAudio && micOff && (
            <span className="text-danger" role="img" aria-label={t('tile.micOff')}>
              <Icon d={ICON.audio} off small />
            </span>
          )}
          <span className="truncate">{name}</span>
        </span>
      )}
    </div>
  )
}
