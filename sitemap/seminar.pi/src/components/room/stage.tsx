'use client'
// 룸 무대(S4) — 레이아웃 6.2(발표자 고정·발표+패널·화면공유), 타일은 video-tile.tsx. 영상은 항상 muted 로 재생하고 소리는 별도 <audio>(useRemoteAudio)로만 낸다
// → 자동재생 정책으로 소리가 막혀도 영상은 나온다(설계서 14.5)
import { useEffect, useState, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { useLayerWatch } from './layer-watch'
import { groupTracks, nextPin, type Layer, type PinState } from './room-rules'
import type { Peer, RemoteTrack, RoomState, SessionRole } from './use-room'
import { VideoTile } from './video-tile'

const PLAY_RETRY_MS = 1000
const PLAY_RETRY_MAX = 3

// onLayer 가 있으면 렌더 높이·가시성으로 수신 화질을 정한다(원격 영상만, layer-watch.ts)
export type LayerFn = (consumerId: string, maxSpatial: Layer) => void
export function StreamVideo({
  stream,
  mirror,
  className = '',
  consumerId,
  onLayer,
}: {
  stream: MediaStream | null
  mirror?: boolean
  className?: string
  consumerId?: string
  onLayer?: LayerFn
}) {
  const [el, setEl] = useState<HTMLVideoElement | null>(null) // 콜백 ref — 관찰자가 요소를 받아야 한다
  useLayerWatch(el, consumerId, onLayer)
  useEffect(() => {
    if (!el) return
    el.srcObject = stream
    if (stream) el.play().catch(() => {})
  }, [el, stream])
  return (
    <video
      ref={setEl}
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

type Tile = {
  key: string // cam:<peerId> · screen:<producerId>(내 화면공유는 screen:self)
  name: string
  video: MediaStream | null
  audio: MediaStream | null
  micOff: boolean
  camOff: boolean
  mirror: boolean
  screen: boolean
  presenter: boolean
  consumerId?: string // 원격 영상만 — setLayer 대상
}

// 발행자 타일 목록 — 무대는 발행자만(청중은 인원 수·목록만, 설계서 14.1). 원격 트랙 주인은 consumerCreated.peer(room-rules ownerKey·groupTracks)
function buildTiles({
  t,
  viewer,
  selfId,
  selfName,
  peers,
  tracks,
  local,
  localScreen,
  localOn,
}: StageProps & { t: ReturnType<typeof useTranslations<'room'>> }): Tile[] {
  const out: Tile[] = []
  if (viewer === 'presenter' || (viewer === 'panel' && local?.getTracks().length)) {
    out.push({
      key: `cam:${selfId || 'self'}`,
      name: t('tile.self', { name: selfName }),
      video: local,
      audio: local,
      micOff: !localOn.audio,
      camOff: !localOn.video,
      mirror: true,
      screen: false,
      presenter: viewer === 'presenter',
    })
  }
  if (localScreen) {
    out.push({
      key: 'screen:self',
      name: t('tile.screen', { name: selfName }),
      video: localScreen,
      audio: null,
      micOff: false,
      camOff: false,
      mirror: false,
      screen: true,
      presenter: false,
    })
  }
  const byId = new Map(peers.map((p) => [p.peerId, p]))
  const { screens, groups } = groupTracks(tracks)
  for (const tr of screens) {
    out.push({
      key: `screen:${tr.producerId}`,
      name: t('tile.screen', { name: byId.get(tr.peerId)?.name ?? t('tile.presenter') }),
      video: tr.stream,
      consumerId: tr.consumerId,
      audio: null,
      micOff: false,
      camOff: tr.paused,
      mirror: false,
      screen: true,
      presenter: false,
    })
  }
  for (const [pid, g] of groups) {
    const p = byId.get(pid)
    out.push({
      key: `cam:${pid}`,
      name: p?.name ?? t('tile.presenter'),
      video: g.cam?.stream ?? null,
      consumerId: g.cam?.consumerId,
      audio: g.mic?.stream ?? null,
      micOff: !!g.mic?.paused,
      camOff: !!g.cam?.paused,
      mirror: false,
      screen: false,
      presenter: !p || p.role === 'presenter',
    })
  }
  return out
}

type StageProps = {
  viewer: SessionRole
  state: RoomState
  selfId: string
  selfName: string
  peers: Peer[]
  tracks: RemoteTrack[]
  local: MediaStream | null
  localScreen: MediaStream | null
  localOn: { audio: boolean; video: boolean }
  onLayer?: LayerFn
}

// 레이아웃(설계서 6.2) — 발표자 고정(발행자 1) / 발표 + 패널(큰 무대 1 + 작은 타일 줄 : 모바일 가로 스크롤, 데스크톱 우하단) /
// 화면공유 중(화면이 무대, 카메라는 작은 타일 — 새 공유는 1번만 자동 고정, 끝나면 이전 고정 복원 : nextPin). 작은 타일 탭 = 그 타일 고정
export function Stage(props: StageProps) {
  const t = useTranslations('room')
  const tiles = buildTiles({ ...props, t })
  const [pin, setPin] = useState<PinState>({ pin: null, prev: null, seen: [] })
  const keys = tiles.map((x) => x.key)
  const screenKeys = tiles.filter((x) => x.screen).map((x) => x.key)
  const sig = `${keys.join(',')}|${screenKeys.join(',')}`
  useEffect(() => {
    setPin((s) => nextPin(s, keys, screenKeys))
  }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps

  const live = props.state === 'joined' || props.state === 'reconnecting'
  const main = tiles.find((x) => x.key === pin.pin) ?? tiles.find((x) => x.presenter && !x.screen) ?? tiles[0] ?? null
  const rest = tiles.filter((x) => x !== main)
  const notice = !live ? t('state.connecting') : !main ? t('waiting') : null
  return (
    <div className="relative">
      <VideoTile
        video={main?.video ?? null}
        audio={main?.audio ?? null}
        name={live ? main?.name : undefined}
        micOff={!!main?.micOff}
        camOff={!!main?.camOff}
        mirror={main?.mirror}
        consumerId={main?.consumerId}
        onLayer={props.onLayer}
      >
        {notice && (
          <p className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-sm">
            {!live && <Spinner />}
            {notice}
          </p>
        )}
        {props.state === 'reconnecting' && (
          <div className="absolute inset-0 grid place-items-center bg-black/40" aria-hidden>
            <Spinner />
          </div>
        )}
      </VideoTile>
      {live && rest.length > 0 && (
        <ul
          aria-label={t('tile.row')}
          className="mt-2 flex gap-2 overflow-x-auto md:absolute md:right-3 md:bottom-3 md:mt-0 md:max-w-[60%] md:justify-end"
        >
          {rest.map((x) => (
            <li key={x.key} className="w-36 shrink-0 md:w-44">
              <button
                type="button"
                aria-label={t('tile.pin', { name: x.name })}
                onClick={() => setPin((s) => ({ ...s, pin: x.key, prev: null }))}
                className="block w-full rounded-xl text-left shadow-lg"
              >
                <VideoTile
                  video={x.video}
                  audio={x.audio}
                  name={x.name}
                  micOff={x.micOff}
                  camOff={x.camOff}
                  mirror={x.mirror}
                  consumerId={x.consumerId}
                  onLayer={props.onLayer}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
