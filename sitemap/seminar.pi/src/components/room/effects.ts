'use client'
// 영상 효과 파이프라인(F-U 슬롯, 설계서 15.5) — 원본 카메라 트랙 → 숨은 <video> → 켜진 효과 order 순 캔버스 그리기 → canvas.captureStream →
// 카메라 송신기 RTCRtpSender.replaceTrack(재협상 없음). 켜진 효과가 0개면 아무것도 만들지 않고 원본 그대로 보낸다(회귀 0).
// 근거(REA_04_UI_EXT R-E1·R-E2) : Jitsi·LiveKit 배포본 모두 효과 적용 = 같은 송신기의 replaceTrack, LiveKit 대체 경로 = captureStream + 워커 타이머
// (숨은 탭에서도 프레임이 멈추지 않게). 코드는 옮기지 않았다(S-2)
// 실패 경로(R-P5) : captureStream 등이 던지면 fxBroken·효과 끔·원본 트랙 유지(송신기 미변경), 앱 전환 복귀 땐 숨은 <video> 를 다시 재생해 거짓 멈춤을 막는다
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { featureStore, useStores, type VideoEffect } from './extensions'
import { failHit, fxFrameDue, onTrackEnd, swapSender } from './room-rules'
import { ticker } from './ticker'

// 효과 1단계 — src(이전 단계 결과) 를 out 캔버스(w×h)에 그린다. 동기 함수(프레임마다 호출)
export type EffectDraw = (out: CanvasRenderingContext2D, src: CanvasImageSource, w: number, h: number) => void

// 연속 실패 상한 — 넘으면 그 효과를 끈다(Jitsi 배포본 30회 후 원본 통과, REA jitsi-04 ②).
// stallMs — 카메라가 켜져 있는데 이 시간 동안 새 프레임을 한 장도 못 그리면 이 기기는 효과 불가로 본다(모바일 2026-10-31 마스터 보고)
export const FX = { fps: 30, failMax: 30, stallMs: 5000 }

// 이 기기에서 효과를 쓸 수 없음(프레임 멈춤·분리기 로드 실패·느려서 자동 끔) — true 면 ⋯ 메뉴의 효과 버튼을 숨긴다(마스터 2026-10-31).
// 기기 능력이라 퇴장해도 되돌리지 않는다(페이지를 새로 열면 다시 시도)
export const fxBroken = featureStore(false)

// 기능 탐지(UA 판정 금지) — 캔버스 송출이 없으면 효과를 켤 수 없다
export const canProcessVideo = () =>
  typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'

// 트랙이 살아 있는지(장치 끊김·앱 전환으로 끝나면 다시 그린다) — 끝난 카메라로는 효과가 적용되지 않으므로(useVideoEffects)
// 효과 시트가 배경·조명을 켤 수 있는 척하지 않고 '카메라를 켜면…' 안내를 보이게 한다
export function useTrackLive(t: MediaStreamTrack | null | undefined): boolean {
  const [, bump] = useReducer((x: number) => x + 1, 0)
  useEffect(() => (t ? onTrackEnd(t, bump) : undefined), [t])
  return !!t && t.readyState === 'live'
}

// 파이프라인 1개 — 켜진 효과 목록은 매 프레임 active() 로 읽는다(효과를 더하거나 빼도 송신 트랙을 다시 바꾸지 않아 원본이 새지 않음)
function startPipeline(track: MediaStreamTrack, active: () => VideoEffect[], onStall: () => void) {
  // 던질 수 있는 captureStream 을 맨 먼저 — DOM 부착·리스너 등록 전에 실패해야 호출자 catch 뒤에 숨은 <video>·리스너가 남지 않는다(검토 2026-10-31)
  const out = document.createElement('canvas')
  const output = out.captureStream(FX.fps).getVideoTracks()[0]
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  // 문서에 붙인다(거의 안 보이게) — 안드로이드 Chrome·WebView 는 화면 밖(문서에 없는) 무음 자동재생 영상을 멈추고, iOS 는 붙지 않은 영상의
  // 프레임을 디코드하지 않는다 → currentTime 이 안 움직여 효과가 한 장도 안 그려졌다(모바일 효과 안 나타남, 마스터 2026-10-31)
  video.setAttribute('aria-hidden', 'true')
  video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1'
  document.body.appendChild(video)
  video.srcObject = new MediaStream([track])
  const play = () => video.play().catch(() => {})
  play()
  // 앱 전환·탭 숨김에서 돌아오면 WebView(특히 iOS)가 숨은 영상을 paused 로 남길 수 있다 — 다시 재생하지 않으면 stallMs 뒤 거짓 멈춤 판정
  const onVis = () => {
    if (document.visibilityState === 'visible') play()
  }
  document.addEventListener('visibilitychange', onVis)
  let drewAt = performance.now()
  let stalled = false
  const tmp: HTMLCanvasElement[] = []
  const fails = new Map<VideoEffect, number>()
  let last = -1
  const frame = () => {
    const w = video.videoWidth
    const h = video.videoHeight
    // 새 프레임이고 카메라가 켜졌을 때만 그린다(타이머는 fps 의 2배로 돈다, 판정 room-rules fxFrameDue)
    if (!fxFrameDue({ enabled: track.enabled, w, h, ready: video.readyState, time: video.currentTime, last })) {
      // 카메라가 켜져 있는데 프레임이 멈춤 — 이 기기는 효과 불가(1번만 알린다). 카메라를 끈 동안은 시계를 다시 맞춘다
      const now = performance.now()
      // 숨은 탭·앱 전환 중엔 브라우저가 영상 디코드를 멈출 수 있다 — 기기 불가로 오판하지 않게 그동안도 시계를 맞춘다
      if (!track.enabled || track.readyState !== 'live' || document.visibilityState === 'hidden') drewAt = now
      else if (!stalled && now - drewAt > FX.stallMs) {
        stalled = true
        onStall()
      }
      return
    }
    drewAt = performance.now()
    last = video.currentTime
    const list = active()
    // 마지막 효과가 막 꺼져 파이프라인이 닫히기 직전이면 원본을 그대로 통과(null 단계)
    const steps: (VideoEffect | null)[] = list.length ? list : [null]
    let src: CanvasImageSource = video
    steps.forEach((e, i) => {
      const c = i === steps.length - 1 ? out : (tmp[i] ??= document.createElement('canvas'))
      if (c.width !== w || c.height !== h) {
        c.width = w
        c.height = h
      }
      const ctx = c.getContext('2d')
      if (!ctx) return
      try {
        if (e) e.draw(ctx, src, w, h)
        else ctx.drawImage(src, 0, 0, w, h)
        if (e) fails.delete(e)
      } catch {
        ctx.drawImage(src, 0, 0, w, h)
        if (e && failHit(fails, e, FX.failMax)) e.on.set(false)
      }
      src = c
    })
  }
  const stopTick = ticker(Math.round(1000 / (FX.fps * 2)), frame)
  return {
    track: output,
    stop() {
      stopTick()
      document.removeEventListener('visibilitychange', onVis)
      output.stop()
      video.pause()
      video.srcObject = null
      video.remove()
    },
  }
}

// 효과가 하나라도 켜지면 파이프라인을 만들고 송신기를 처리 트랙으로 바꾼다. 반환 = 처리된 트랙(내 미리보기용, 효과 없으면 null).
// effects 는 모듈 상수(features 등록부에서 뽑은 목록), track = 원본 카메라, sender = 카메라 송신기(발행 전 null)
export function useVideoEffects(
  effects: readonly VideoEffect[],
  track: MediaStreamTrack | null,
  sender: RTCRtpSender | null,
): MediaStreamTrack | null {
  const stores = useMemo(() => effects.map((e) => e.on), [effects])
  const on = useStores(stores)
  const active = effects.filter((_, i) => on[i])
  const activeRef = useRef(active)
  useEffect(() => {
    activeRef.current = active
  })
  const any = active.length > 0 && canProcessVideo()
  const [out, setOut] = useState<MediaStreamTrack | null>(null)
  useEffect(() => {
    if (!any || !track || track.readyState !== 'live') return
    // 멈춤 = 효과를 모두 끄고(원본 송출로 복귀) 효과 버튼을 숨긴다
    const broken = () => {
      fxBroken.set(true)
      for (const e of effects) e.on.set(false)
    }
    let p: ReturnType<typeof startPipeline>
    try {
      p = startPipeline(track, () => activeRef.current, broken)
    } catch {
      // captureStream 이 있어도 던지는 WebView — 룸을 깨뜨리지 않고(미처리 예외 금지) 원본 트랙 그대로 보낸다
      broken()
      return
    }
    setOut(p.track)
    const revert = swapSender(sender, p.track, () => (track.readyState === 'live' ? track : null))
    return () => {
      // 원본으로 되돌린 뒤 멈춘다 — 교체가 아직 대기 중이어도 되돌린다(swapSender). 송신기가 닫혔으면 되돌리기 요청은 조용히 실패
      revert()
      p.stop()
      setOut(null)
    }
  }, [any, track, sender])
  return out
}
