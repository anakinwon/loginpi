'use client'
// 룸 무대(S4) — 레이아웃 6.2(발표자 고정·발표+패널·화면공유), 타일은 video-tile.tsx. 영상은 항상 muted 로 재생하고 소리는 별도 <audio>(useRemoteAudio)로만 낸다
// → 자동재생 정책으로 소리가 막혀도 영상은 나온다(설계서 14.5)
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { remoteVolume, useStore } from './extensions'
import { useLayerWatch } from './layer-watch'
import { followKey, groupTracks, nextPin, ringFor, type Layer, type PinState, type RoomLayout } from './room-rules'
import type { Peer, RemoteTrack, RoomState, SessionRole } from './use-room'
import { mirrorOn } from './features/mirror'
import { openRename } from './features/naming'
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
  const mirrorSelf = useStore(mirrorOn) // 내 화면 거울 보기(⋯ 메뉴, features/mirror) — 내 타일·미리보기만
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
      className={`h-full w-full object-contain ${mirror && mirrorSelf ? '-scale-x-100' : ''} ${className}`}
    />
  )
}

// 원격 소리 재생 — 거부되면 1초 간격 3회 재시도 후 blocked(하단 바 "소리 켜기" 노출). Jitsi AudioTrack 재시도 방식(설계서 14.5)
// stream 이 null(오류·끊김·나가기·발행자 퇴장)이면 srcObject 를 비우고 멈춘다 — 이전 소리가 계속 나지 않게
export function useRemoteAudio(ref: RefObject<HTMLAudioElement | null>, stream: MediaStream | null) {
  const [blocked, setBlocked] = useState(false)
  // 더빙 덕킹(extensions remoteVolume) — iOS WebKit 은 volume 이 읽기 전용이라 원음이 그대로 [확인중 : 실기기]
  const volume = useStore(remoteVolume)
  useEffect(() => {
    if (ref.current) ref.current.volume = volume
  }, [ref, volume])
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
    // 마이크·카메라를 켜는 순간(getUserMedia) 휴대폰이 오디오 세션을 바꾸며 재생 중인 소리 요소를 멈춘다(iOS WebKit·안드로이드 WebView) —
    // 스트림은 그대로라 위 효과가 다시 돌지 않아 상대 소리가 계속 안 들렸다(무대 참가자만 발표자 소리 무음, 마스터 2026-10-31). 멈추면 다시 재생 시도
    const onPause = () => {
      if (el.srcObject !== stream) return
      tries = 0
      clearTimeout(timer)
      timer = setTimeout(attempt, 300)
    }
    el.addEventListener('pause', onPause)
    return () => {
      clearTimeout(timer)
      el.removeEventListener('pause', onPause)
    }
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
  peerId?: string // 카메라 타일의 주인(발언자 링, v1.2) — 화면공유 타일은 없음
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
      peerId: selfId,
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
      name: t('tile.screen', {
        name: byId.get(tr.peerId)?.name ?? t('tile.presenter'),
      }),
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
      peerId: pid,
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
  speaker: string | null // ntf activeSpeaker(v1.2)
  engineSpeaker: boolean // 엔진 발언자 판정 사용 가능 — 아니면 타일이 직접 판정
  layout: RoomLayout | null // 발표자 레이아웃(ntf layout) — 청중·패널은 follow 면 따라 본다
  onPin?: (key: string | null) => void // 발표자가 작은 타일을 고정 → room.setLayout(null = 자동 배치로 되돌림)
  fit?: boolean // PC 맞춤 — 감싸개가 크기 컨테이너(cq 단위)일 때만 켠다(아니면 cqh 가 화면 높이로 잡힌다)
  stageTop?: ReactNode // 무대 영상 위에 늘 띄울 알림(손들기 등) — 전체 화면(이 상자만 보임)·가로 화면·PC 맞춤 어디서나 보이게(마스터 2026-10-31)
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

  // 따라 보기(v1.2 F) — 레이아웃이 바뀔 때마다 발표자 고정을 따른다. 그 뒤 내가 직접 고정하면 다음 레이아웃까지 내 고정
  const follow = followKey(props.layout, props.viewer)
  const [own, setOwn] = useState(false)
  useEffect(() => setOwn(false), [props.layout])
  const forced = !own && follow ? tiles.find((x) => x.key === follow) : undefined

  const live = props.state === 'joined' || props.state === 'reconnecting'
  const main =
    forced ?? tiles.find((x) => x.key === pin.pin) ?? tiles.find((x) => x.presenter && !x.screen) ?? tiles[0] ?? null
  const ring = (x: Tile | null) => ringFor(x?.peerId, props.speaker, props.engineSpeaker)
  const rest = tiles.filter((x) => x !== main)
  const notice = !live ? t('state.connecting') : !main ? t('waiting') : null
  const { box, full, toggle } = useFullscreen()
  return (
    <div
      ref={box}
      className={
        full
          ? `flex flex-col items-center justify-center bg-black ${full === 'css' ? 'fixed inset-0 z-50' : 'relative'}`
          : 'relative'
      }
    >
      {live && props.onPin && pin.pin && (
        // 발표자 전용 — 고정을 풀고 청중 화면도 자동 배치로(room.setLayout mode auto). 우상단 = 좌상단 녹화·AI 기록 배지 줄(15.6)과 겹치지 않게. v1.2 검토 지적 : 되돌릴 길이 없었음
        <button
          type="button"
          onClick={() => {
            setPin((p) => ({ ...p, pin: null, prev: null }))
            props.onPin?.(null)
          }}
          className="bg-surface/80 absolute top-2 right-2 z-20 rounded-full px-3 py-1 text-xs font-semibold"
        >
          {t('tile.unpin')}
        </button>
      )}
      {props.stageTop && (
        <div className="absolute inset-x-0 top-[calc(12px+env(safe-area-inset-top))] z-30 flex justify-center px-3">
          {props.stageTop}
        </div>
      )}
      {/* 대표 영상 더블클릭 = 전체 화면 토글, ESC = 원래대로 */}
      <div
        onDoubleClick={toggle}
        title={t('tile.fullscreen')}
        className={
          full
            ? 'relative w-full max-w-[calc(100dvh*16/9)]'
            : props.fit
              ? 'mx-auto w-[min(100cqw,calc(100cqh*16/9))]'
              : undefined
        }
      >
        <VideoTile
          video={main?.video ?? null}
          audio={main?.audio ?? null}
          name={live ? main?.name : undefined}
          micOff={!!main?.micOff}
          camOff={!!main?.camOff}
          mirror={main?.mirror}
          consumerId={main?.consumerId}
          onLayer={props.onLayer}
          speaking={ring(main)}
          // 대표 영상이 내 카메라면 이름표를 눌러 내 이름 바꾸기(작은 타일은 통째로 고정 버튼이라 중첩 버튼 금지 — ⋯ 메뉴로)
          onName={live && main && !main.screen && main.peerId === props.selfId ? openRename : undefined}
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
      </div>
      {live && rest.length > 0 && (
        <ul
          aria-label={t('tile.row')}
          className="mt-2 flex gap-2 overflow-x-auto md:absolute md:right-3 md:bottom-3 md:mt-0 md:max-w-[60%] md:justify-end md:overflow-visible"
        >
          {rest.map((x) => (
            <DragTile key={x.key} bound={box}>
              <button
                type="button"
                aria-label={t('tile.pin', { name: x.name })}
                onClick={() => {
                  setPin((s) => ({ ...s, pin: x.key, prev: null }))
                  setOwn(true)
                  props.onPin?.(x.key)
                }}
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
                  speaking={ring(x)}
                />
              </button>
              {/* 내 작은 타일 — 타일 전체가 고정 버튼이라 안에 버튼을 넣을 수 없어(중첩 금지) 이름표 자리에 형제 버튼을 겹쳐 둔다 */}
              {!x.screen && x.peerId === props.selfId && (
                <button
                  type="button"
                  onClick={openRename}
                  title={t('rename.tile')}
                  className="absolute bottom-2 left-2 z-10 flex max-w-[80%] items-center gap-1 rounded bg-black/80 px-2 py-1 text-xs hover:underline"
                >
                  <span className="truncate">{x.name}</span>
                  <span aria-hidden>✏️</span>
                  <span className="sr-only">{t('rename.tile')}</span>
                </button>
              )}
            </DragTile>
          ))}
        </ul>
      )}
    </div>
  )
}

// 작은 타일 끌어 옮기기(md 이상 — 타일 줄이 무대 위에 떠 있을 때만, 모바일은 무대 아래 가로 스크롤이라 끄기) — 포인터로 끌면
//  자리에서 translate 로 옮기고 무대(bound) 밖으로는 못 나가게 자른다. 5px 미만 움직임은 클릭(고정)으로 두고, 끌었으면 그 클릭은 삼킨다
const DRAG_PX = 5
const WIDE = '(min-width: 768px)'
function DragTile({ bound, children }: { bound: RefObject<HTMLDivElement | null>; children: React.ReactNode }) {
  const [at, setAt] = useState({ x: 0, y: 0 })
  const li = useRef<HTMLLIElement>(null)
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; min: { x: number; y: number }; max: { x: number; y: number } } | null>(null)
  const moved = useRef(false)

  const down = (e: React.PointerEvent<HTMLLIElement>) => {
    if (e.button !== 0 || !window.matchMedia(WIDE).matches || !li.current || !bound.current) return
    // 끌 수 있는 범위 = 지금 타일 자리에서 무대 네 변까지(현재 이동분 포함)
    const t = li.current.getBoundingClientRect()
    const b = bound.current.getBoundingClientRect()
    drag.current = {
      sx: e.clientX,
      sy: e.clientY,
      ox: at.x,
      oy: at.y,
      min: { x: at.x + b.left - t.left, y: at.y + b.top - t.top },
      max: { x: at.x + b.right - t.right, y: at.y + b.bottom - t.bottom },
    }
    moved.current = false
  }
  const move = (e: React.PointerEvent<HTMLLIElement>) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (!moved.current) {
      if (Math.hypot(dx, dy) < DRAG_PX) return
      moved.current = true
      e.currentTarget.setPointerCapture(e.pointerId) // 빨리 끌어 타일 밖으로 나가도 계속 따라오게
    }
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
    setAt({ x: clamp(d.ox + dx, d.min.x, d.max.x), y: clamp(d.oy + dy, d.min.y, d.max.y) })
  }
  const up = () => {
    drag.current = null
  }

  return (
    <li
      ref={li}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClickCapture={(e) => {
        // 끈 뒤에 오는 클릭 = 고정·이름 바꾸기 아님
        if (!moved.current) return
        moved.current = false
        e.preventDefault()
        e.stopPropagation()
      }}
      style={at.x || at.y ? { transform: `translate(${at.x}px, ${at.y}px)` } : undefined}
      className="relative w-36 shrink-0 md:w-44 md:cursor-grab md:touch-none md:active:cursor-grabbing"
    >
      {children}
    </li>
  )
}

// 전체 화면 — Fullscreen API(ESC 는 브라우저가 처리) 우선, 없거나 거절되면(iOS Safari·일부 WebView) 화면 고정 오버레이 + ESC 키로 대체.
// full = 'api' | 'css' | null. 기능 탐지만 쓴다(UA 판정 금지)
function useFullscreen() {
  const box = useRef<HTMLDivElement>(null)
  const [api, setApi] = useState(false)
  const [css, setCss] = useState(false)
  useEffect(() => {
    const on = () => setApi(!!box.current && document.fullscreenElement === box.current)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  useEffect(() => {
    if (!css) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCss(false)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [css])
  const toggle = () => {
    if (document.fullscreenElement) return void document.exitFullscreen().catch(() => {})
    if (css) return setCss(false)
    const el = box.current
    if (el && document.fullscreenEnabled && el.requestFullscreen) el.requestFullscreen().catch(() => setCss(true))
    else setCss(true)
  }
  return {
    box,
    full: api ? ('api' as const) : css ? ('css' as const) : null,
    toggle,
  }
}
