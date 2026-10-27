'use client'
// 영상 효과 파이프라인(F-U 슬롯, 설계서 15.5) — 원본 카메라 트랙 → 숨은 <video> → 켜진 효과 order 순 캔버스 그리기 → canvas.captureStream →
// 카메라 송신기 RTCRtpSender.replaceTrack(재협상 없음). 켜진 효과가 0개면 아무것도 만들지 않고 원본 그대로 보낸다(회귀 0).
// 근거(REA_04_UI_EXT R-E1·R-E2) : Jitsi·LiveKit 배포본 모두 효과 적용 = 같은 송신기의 replaceTrack, LiveKit 대체 경로 = captureStream + 워커 타이머
// (숨은 탭에서도 프레임이 멈추지 않게). 코드는 옮기지 않았다(S-2)
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStores, type VideoEffect } from './extensions'
import { ticker } from './ticker'

// 효과 1단계 — src(이전 단계 결과) 를 out 캔버스(w×h)에 그린다. 동기 함수(프레임마다 호출)
export type EffectDraw = (out: CanvasRenderingContext2D, src: CanvasImageSource, w: number, h: number) => void

export const FX = { fps: 30, failMax: 30 } // 연속 실패 상한 — 넘으면 그 효과를 끈다(Jitsi 배포본 30회 후 원본 통과, REA jitsi-04 ②)

// 기능 탐지(UA 판정 금지) — 캔버스 송출이 없으면 효과를 켤 수 없다
export const canProcessVideo = () =>
  typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'

// 파이프라인 1개 — 켜진 효과 목록은 매 프레임 active() 로 읽는다(효과를 더하거나 빼도 송신 트랙을 다시 바꾸지 않아 원본이 새지 않음)
function startPipeline(track: MediaStreamTrack, active: () => VideoEffect[]) {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.srcObject = new MediaStream([track])
  video.play().catch(() => {})
  const out = document.createElement('canvas')
  const tmp: HTMLCanvasElement[] = []
  const fails = new Map<VideoEffect, number>()
  const output = out.captureStream(FX.fps).getVideoTracks()[0]
  let last = -1
  const frame = () => {
    const w = video.videoWidth
    const h = video.videoHeight
    // 새 프레임일 때만 그린다(타이머는 fps 의 2배로 돈다)
    if (!w || !h || video.readyState < 2 || video.currentTime === last) return
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
        if (e) {
          const n = (fails.get(e) ?? 0) + 1
          fails.set(e, n)
          if (n >= FX.failMax) e.on.set(false)
        }
      }
      src = c
    })
  }
  const stopTick = ticker(Math.round(1000 / (FX.fps * 2)), frame)
  return {
    track: output,
    stop() {
      stopTick()
      output.stop()
      video.pause()
      video.srcObject = null
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
    const p = startPipeline(track, () => activeRef.current)
    setOut(p.track)
    sender?.replaceTrack(p.track).catch(() => {})
    return () => {
      // 원본으로 되돌린 뒤 멈춘다 — 송신기가 이미 닫혔으면(강등·나가기) 되돌릴 것이 없다
      if (sender?.track === p.track) sender.replaceTrack(track.readyState === 'live' ? track : null).catch(() => {})
      p.stop()
      setOut(null)
    }
  }, [any, track, sender])
  return out
}
