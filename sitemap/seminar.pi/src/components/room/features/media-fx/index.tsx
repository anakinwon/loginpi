'use client'
// 조명 보정 + 소음 줄이기(SA3, 설계서 15.5). 줄(FxRows)은 배경 기능의 효과 시트 '배경' 절 아래에 붙는다(⋯ '효과' 1개 = 시트 1개), 고르면 바로 적용.
// 조명 = 영상 효과 슬롯(LIGHT.order 10, 배경 20 앞 — 카메라 원본만 재고 고친다) : 32×18 표본 평균 밝기 → ctx.filter brightness·contrast, 완화 이동(light.ts).
// 소음 = 마이크 트랙 applyConstraints(noiseSuppression·autoGainControl 토글, echoCancellation 늘 켬 — 끄면 하울링). 못 바꾸면(Chromium) 새 제약으로 마이크 재획득 + replaceTrack(noise.ts).
// 판단(REA jitsi-03 ①) : Jitsi 도 기본은 브라우저 내장 처리(noiseSuppression·echoCancellation·autoGainControl true)이고 RNNoise(wasm 워클릿)는
// 더보기의 '추가' 옵션일 뿐이다 → 우리는 브라우저 내장으로 충분하다고 보고 RNNoise·워클릿을 넣지 않는다(번들·CPU 0). 실기기 음질이 모자라면 그때 검토.
// 기능 탐지만(UA 판정 금지) : 조명 = captureStream + ctx.filter 실동작 프로브(1×1 캔버스, 1회 캐시 — WebKit 은 플래그 뒤에서 속성만 노출하고 무효과),
// 소음 = getSupportedConstraints().noiseSuppression. 미지원이면 줄을 숨기지 않고 까닭 문구(lightUnsupported·noiseUnsupported)를 보인다(F-13 패턴)
import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { canProcessVideo, useTrackLive, type EffectDraw } from '../../effects'
import {
  featureStore,
  useStore,
  type RoomCtx,
  type RoomFeature,
} from '../../extensions'
import { SwitchRow } from '../sheet'
import { LIGHT, lightFilter, lightTracker, meanLuma } from './light'
import { syncNoise } from './noise'

export const lightOn = featureStore(false)
export const noiseOn = featureStore(true) // 기본 켬 = 브라우저 기본값과 같다(getUserMedia audio:true)

// ── 조명 ──
// 'filter' in prototype 은 기능 검사가 아니다 — 흰 픽셀을 brightness(0) 으로 칠해 검정이 되는지 1회만 실제로 본다(engine.ts canSegment 와 같은 캐시 패턴)
let filterOk: boolean | undefined
const canFilter = () => {
  if (typeof document === 'undefined') return false
  if (filterOk === undefined) {
    try {
      const c = document.createElement('canvas')
      c.width = c.height = 1
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (!ctx) filterOk = false
      else {
        ctx.filter = 'brightness(0)'
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, 1, 1)
        filterOk = ctx.getImageData(0, 0, 1, 1).data[0] === 0
      }
    } catch {
      filterOk = false
    }
  }
  return filterOk
}
export const canLight = () => canProcessVideo() && canFilter()

const light = lightTracker(lightOn) // 끄면 배율 1 로(다시 켤 때 옛 장면 배율로 시작하지 않게)
let sample: CanvasRenderingContext2D | null = null
const drawLight: EffectDraw = (out, src, w, h) => {
  if (light.due()) {
    sample ??= document
      .createElement('canvas')
      .getContext('2d', { willReadFrequently: true })
    if (sample) {
      sample.canvas.width = LIGHT.sampleW
      sample.canvas.height = LIGHT.sampleH
      sample.drawImage(src, 0, 0, LIGHT.sampleW, LIGHT.sampleH)
      light.sample(
        meanLuma(sample.getImageData(0, 0, LIGHT.sampleW, LIGHT.sampleH).data),
      )
    }
  }
  out.filter = lightFilter(light.gain())
  out.drawImage(src, 0, 0, w, h)
  out.filter = 'none'
}

// ── 소음 ──
const canNoise = () =>
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getSupportedConstraints?.().noiseSuppression

// 마이크 트랙이 바뀌거나(다시 켬) 토글이 바뀌면 맞춘다. 브라우저가 실시간 변경을 무시하면 실제 값으로 되돌리고 알린다(R-P5)
function useNoise(track: MediaStreamTrack | null, on: boolean, ctx: RoomCtx) {
  const notice = ctx.notice
  useEffect(() => {
    if (!track || track.readyState !== 'live' || !canNoise()) return
    let live = true
    // 줄 세워 실행 — 빠른 연타에도 마지막 스위치 값으로 맞춘다(noise.ts)
    // applyConstraints 를 못 하면(Chromium) 마이크를 새 제약으로 다시 열어 송신기에 끼운다 — 발행 전·경합이면 swapMic 이 null(알림)
    void syncNoise(track, noiseOn.get, () => live, ctx.r.swapMic).then((real) => {
      if (real === null) return
      noiseOn.set(real)
      notice('effects.noiseFail')
    })
    return () => {
      live = false
    }
  }, [track, on]) // eslint-disable-line react-hooks/exhaustive-deps
}

const micOf = (ctx: RoomCtx) =>
  ctx.role !== 'audience'
    ? (ctx.r.localStream?.getAudioTracks()[0] ?? null)
    : null

// 시트와 무관하게 늘 도는 부분 — 소음 제약 맞추기·강등 시 조명 끄기(그리는 것 없음)
function FxOverlay({ ctx }: { ctx: RoomCtx }) {
  const noise = useStore(noiseOn)
  useNoise(micOf(ctx), noise, ctx)
  // 청중으로 강등되면 조명 끄기(송신기가 닫혀 의미 없음)
  useEffect(() => {
    if (ctx.role === 'audience') lightOn.set(false)
  }, [ctx.role])
  return null
}

// 효과 시트(backgrounds) 안의 조명·소음 줄 — 카메라 있으면 조명, 마이크 있으면 소음. 장치는 있는데 기기가 못 하면 스위치 자리에 까닭 문구
export function FxRows({ ctx }: { ctx: RoomCtx }) {
  const t = useTranslations('room.effects')
  const light = useStore(lightOn)
  const noise = useStore(noiseOn)
  const cam =
    ctx.role !== 'audience'
      ? (ctx.r.localStream?.getVideoTracks()[0] ?? null)
      : null
  const camLive = useTrackLive(cam) // 끝난 카메라는 조명 보정이 적용되지 않는다 — 줄을 숨긴다(배경 '카메라를 켜면…' 안내와 같은 판정)
  const mic = !!micOf(ctx)
  const showLight = camLive && canLight()
  const showNoise = mic && canNoise()
  if (!camLive && !mic) return null
  return (
    <div className="mt-3 space-y-1 text-sm">
      {camLive &&
        (showLight ? (
          <SwitchRow label={t('light')} on={light} onChange={lightOn.set} />
        ) : (
          <p className="text-muted-foreground">{t('lightUnsupported')}</p>
        ))}
      {mic &&
        (showNoise ? (
          <SwitchRow label={t('noise')} on={noise} onChange={noiseOn.set} />
        ) : (
          <p className="text-muted-foreground">{t('noiseUnsupported')}</p>
        ))}
    </div>
  )
}

export const mediaFx: RoomFeature = {
  id: 'media-fx',
  Overlay: FxOverlay,
  effect: { order: LIGHT.order, on: lightOn, draw: drawLight },
  onReset: () => {
    lightOn.reset()
    noiseOn.reset()
    light.reset()
  },
}
