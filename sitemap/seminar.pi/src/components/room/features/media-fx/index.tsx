'use client'
// 효과 시트 — 조명 보정 + 소음 줄이기(SA3, 설계서 15.5). ⋯ '효과'(presenter·panel) → 시트, 고르면 바로 적용([적용] 없음).
// 조명 = 영상 효과 슬롯(order 20, 배경 10 뒤) : 32×18 표본 평균 밝기 → ctx.filter brightness·contrast, 완화 이동(light.ts).
// 소음 = 마이크 트랙 applyConstraints(noiseSuppression·autoGainControl 토글, echoCancellation 늘 켬 — 끄면 하울링).
// 판단(REA jitsi-03 ①) : Jitsi 도 기본은 브라우저 내장 처리(noiseSuppression·echoCancellation·autoGainControl true)이고 RNNoise(wasm 워클릿)는
// 더보기의 '추가' 옵션일 뿐이다 → 우리는 브라우저 내장으로 충분하다고 보고 RNNoise·워클릿을 넣지 않는다(번들·CPU 0). 실기기 음질이 모자라면 그때 검토.
// 기능 탐지만(UA 판정 금지) : 조명 = captureStream + ctx.filter, 소음 = getSupportedConstraints().noiseSuppression
import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Icon } from '../../control-bar'
import { canProcessVideo, type EffectDraw } from '../../effects'
import { featureStore, useStore, type RoomCtx, type RoomFeature } from '../../extensions'
import { Sheet, SwitchRow } from '../sheet'
import { LIGHT, lightFilter, lightStep, meanLuma } from './light'

export const fxSheet = featureStore(false)
export const lightOn = featureStore(false)
export const noiseOn = featureStore(true) // 기본 켬 = 브라우저 기본값과 같다(getUserMedia audio:true)

// ── 조명 ──
const canFilter = () =>
  typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype
export const canLight = () => canProcessVideo() && canFilter()

let gain = 1
let n = 0
let sample: CanvasRenderingContext2D | null = null
const drawLight: EffectDraw = (out, src, w, h) => {
  if (n++ % LIGHT.every === 0) {
    sample ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    if (sample) {
      sample.canvas.width = LIGHT.sampleW
      sample.canvas.height = LIGHT.sampleH
      sample.drawImage(src, 0, 0, LIGHT.sampleW, LIGHT.sampleH)
      gain = lightStep(meanLuma(sample.getImageData(0, 0, LIGHT.sampleW, LIGHT.sampleH).data), gain)
    }
  }
  out.filter = lightFilter(gain)
  out.drawImage(src, 0, 0, w, h)
  out.filter = 'none'
}

// ── 소음 ──
const canNoise = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getSupportedConstraints?.().noiseSuppression

// 마이크 트랙이 바뀌거나(다시 켬) 토글이 바뀌면 맞춘다. 브라우저가 실시간 변경을 무시하면 실제 값으로 되돌리고 알린다(R-P5)
function useNoise(track: MediaStreamTrack | null, on: boolean, ctx: RoomCtx) {
  const notice = ctx.notice
  useEffect(() => {
    if (!track || track.readyState !== 'live' || !canNoise()) return
    if (track.getSettings().noiseSuppression === on) return
    let live = true
    track
      .applyConstraints({
        echoCancellation: true,
        noiseSuppression: on,
        autoGainControl: on,
      })
      .catch(() => {})
      .then(() => {
        const real = track.getSettings().noiseSuppression
        if (!live || real === undefined || real === on) return
        noiseOn.set(real)
        notice('room.effects.noiseFail')
      })
    return () => {
      live = false
    }
  }, [track, on]) // eslint-disable-line react-hooks/exhaustive-deps
}

function FxOverlay({ ctx }: { ctx: RoomCtx }) {
  const t = useTranslations('room.effects')
  const open = useStore(fxSheet)
  const light = useStore(lightOn)
  const noise = useStore(noiseOn)
  const mic = ctx.role !== 'audience' ? (ctx.r.localStream?.getAudioTracks()[0] ?? null) : null
  const cam = ctx.role !== 'audience' ? (ctx.r.localStream?.getVideoTracks()[0] ?? null) : null
  useNoise(mic, noise, ctx)
  // 청중으로 강등되면 조명 끄기(송신기가 닫혀 의미 없음)
  useEffect(() => {
    if (ctx.role === 'audience') {
      lightOn.set(false)
      fxSheet.set(false)
    }
  }, [ctx.role])
  const showLight = !!cam && canLight()
  const showNoise = !!mic && canNoise()
  return (
    <Sheet open={open} onClose={() => fxSheet.set(false)} title={t('title')} ctx={ctx}>
      {showLight && <SwitchRow label={t('light')} on={light} onChange={lightOn.set} />}
      {showNoise && <SwitchRow label={t('noise')} on={noise} onChange={noiseOn.set} />}
      {!showLight && !showNoise && <p className="text-muted-foreground">{t('none')}</p>}
    </Sheet>
  )
}

export const mediaFx: RoomFeature = {
  id: 'media-fx',
  more: [
    {
      id: 'effects',
      label: 'effects.title',
      icon: (
        <Icon d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4L12 2Zm7 13 1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5Z" />
      ),
      roles: ['presenter', 'panel'],
      sheet: true,
      onClick: () => fxSheet.set(true),
    },
  ],
  Overlay: FxOverlay,
  effect: { order: 20, on: lightOn, draw: drawLight },
  onReset: () => {
    fxSheet.reset()
    lightOn.reset()
    noiseOn.reset()
    gain = 1
    n = 0
  },
}
