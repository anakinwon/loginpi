'use client'
// 배경 효과 엔진 — 사람 분리(@mediapipe/tasks-vision ImageSegmenter, Apache-2.0, wasm·모델 자체 호스팅 /mediapipe/*) + 캔버스 합성.
// 파이프라인(effects.ts)이 프레임마다 draw 를 부른다 : 입력을 256×144 로 줄여 분리 → 마스크로 사람만 오려 → 흐림/배경 위에 얹는다.
// 근거(REA mediapipe-01·04·05, jitsi-04 ②) : CPU 경로도 WebGL 필수, 인스턴스는 1개 재사용(만들 때마다 wasm 재다운로드),
// 사용 지표를 odml.pa.googleapis.com 로 보내며 끄는 옵션이 없음(1회 실패면 주기 전송 중단). 코드는 옮기지 않았다(S-2)
import type { ImageSegmenter } from '@mediapipe/tasks-vision'
import { featureStore } from '../../extensions'
import { BG, coverRect, slowWatch } from './rules'

// 선택 — none · blur · p:<프리셋> · m:<내 이미지 id>
export const choice = featureStore<string>('none')
export const bgOn = featureStore(false) // 파이프라인 효과 켜짐(30회 연속 실패면 파이프라인이 false 로)
export const status = featureStore<'idle' | 'loading'>('idle')
export const autoOff = featureStore(0) // 성능 자동 끔 시각(0 = 없음) — 오버레이가 경고 토스트

// 기능 탐지(UA 판정 금지) — 분리 입력 업로드에 webgl2/webgl 이 필요하다(REA mediapipe-04 gpu_cpu)
export function canSegment() {
  if (typeof document === 'undefined') return false
  const c = document.createElement('canvas')
  return !!(c.getContext('webgl2') || c.getContext('webgl'))
}

// 사용 지표 전송 차단 — 이 주소 하나만 실패시킨다(라이브러리가 1회 실패 뒤 타이머를 멈춤). 영상은 기기 밖으로 안 나간다(README Privacy Notice)
const TELEMETRY_HOST = 'odml.pa.googleapis.com'
function blockTelemetry() {
  const w = window as Window & { __smnFetchGuard?: true }
  if (w.__smnFetchGuard) return
  w.__smnFetchGuard = true
  const orig = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes(TELEMETRY_HOST)) return Promise.reject(new TypeError('blocked'))
    return orig(input, init)
  }
}

// wasm 경로 버전 — 장기 캐시(immutable, next.config)라 버전이 바뀌면 경로도 바뀌어야 한다. package.json 과 다르면 copy-mediapipe 가 빌드를 막는다
const MP_VER = '1.1.1'

let seg: ImageSegmenter | null = null
let loading: Promise<ImageSegmenter> | null = null
function loadSegmenter(): Promise<ImageSegmenter> {
  return (loading ??= (async () => {
    blockTelemetry()
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision') // 처음 고를 때만(첫 화면 JS 예산, 설계 15.15)
    const files = await FilesetResolver.forVisionTasks(`/mediapipe/wasm/${MP_VER}`) // basePath 필수(생략하면 사이트 루트를 찾음)
    seg = await ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/mediapipe/models/selfie_segmenter_landscape.tflite', delegate: 'CPU' },
      runningMode: 'VIDEO',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    })
    return seg
  })().catch((e) => {
    loading = null // 다음에 다시 시도
    throw e
  }))
}

let backdrop: HTMLCanvasElement | null = null
const canvas = () => document.createElement('canvas')
let pick = 0 // 고르는 중 다른 것을 고르면 앞 결과를 버린다

// 배경을 고를 때 1번만 출력 크기 근처(1280×720 을 덮는 크기)로 래스터해 둔다 — 매 프레임 대형 비트맵 축소·SVG 래스터 비용을 없앤다
async function toBackdrop(next: string, blob?: Blob): Promise<HTMLCanvasElement> {
  let src: CanvasImageSource
  let sw: number
  let sh: number
  let bmp: ImageBitmap | null = null
  if (blob) {
    bmp = await createImageBitmap(blob) // 못 읽는 형식(HEIC 등)은 여기서 실패 → bgFailed
    // 해상도 상한 — 원본을 다 디코드한 뒤에야 크기를 알 수 있어 이 1회 메모리는 막지 못한다(바이트 2MB 상한이 1차 방어, 영향은 자기 기기뿐).
    // 넘으면 바로 놓고 거부해 1280×720 래스터·저장으로 이어지지 않게 한다
    if (bmp.width > BG.myPx || bmp.height > BG.myPx) {
      bmp.close()
      throw new Error('too large')
    }
    src = bmp
    sw = bmp.width
    sh = bmp.height
  } else {
    const el = new Image()
    el.src = `/backgrounds/${next.slice(2)}.svg`
    await el.decode()
    src = el
    sw = el.naturalWidth || 1280
    sh = el.naturalHeight || 720
  }
  const k = Math.min(1, Math.max(BG.outW / sw, BG.outH / sh)) // 키우지는 않는다
  const c = canvas()
  c.width = Math.max(1, Math.round(sw * k))
  c.height = Math.max(1, Math.round(sh * k))
  const x = c.getContext('2d')!
  x.imageSmoothingQuality = 'medium'
  x.drawImage(src, 0, 0, c.width, c.height)
  bmp?.close() // 원본 해상도 비트맵(수십 MB 가능)은 바로 놓는다
  return c
}

// 배경 고르기 — 반환 = 오류 문구 키(room.effects.*) 또는 null. blob = 내 이미지일 때
export async function choose(next: string, blob?: Blob): Promise<string | null> {
  const my = ++pick
  autoOff.set(0)
  if (next === 'none') {
    bgOn.set(false)
    choice.set('none')
    status.set('idle')
    return null
  }
  choice.set(next)
  status.set('loading')
  try {
    const img = next.startsWith('p:') || blob ? await toBackdrop(next, blob) : null
    await loadSegmenter()
    if (my !== pick) return null
    backdrop = img
    watch = slowWatch()
    status.set('idle')
    bgOn.set(true)
    return null
  } catch {
    if (my !== pick) return null
    status.set('idle')
    choice.set('none')
    bgOn.set(false)
    return 'bgFailed'
  }
}

// 파이프라인이 꺼 버리면(연속 실패) 선택도 '없음'으로
bgOn.sub(() => {
  if (!bgOn.get() && status.get() === 'idle' && choice.get() !== 'none') choice.set('none')
})

let small: HTMLCanvasElement | null = null // 분리 입력(축소)
let mask: HTMLCanvasElement | null = null // 사람 마스크(알파 = 사람일 확률)
let person: HTMLCanvasElement | null = null // 오려 낸 사람
let tiny: HTMLCanvasElement | null = null // 흐림용 축소본
let maskData: ImageData | null = null
let watch = slowWatch()

function fit(c: HTMLCanvasElement, w: number, h: number) {
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
  return c.getContext('2d')!
}

// 프레임 1장(동기) — 분리기가 아직 없으면 원본 통과
export function draw(out: CanvasRenderingContext2D, src: CanvasImageSource, w: number, h: number) {
  if (!seg) return void out.drawImage(src, 0, 0, w, h)
  const t0 = performance.now()
  const sctx = fit((small ??= canvas()), BG.inW, BG.inH)
  sctx.drawImage(src, 0, 0, BG.inW, BG.inH)
  seg.segmentForVideo(small, t0, (res) => {
    // 모델 출력 마지막 채널 = 사람(1채널 모델이면 [0], 배경·사람 2채널이면 [1]) [확인중 : 모델 파일 넣은 뒤 실측]
    const m = res.confidenceMasks?.at(-1)
    if (!m) return
    const a = m.getAsFloat32Array()
    const mctx = fit((mask ??= canvas()), m.width, m.height)
    if (maskData?.width !== m.width || maskData.height !== m.height) maskData = new ImageData(m.width, m.height)
    for (let i = 0; i < a.length; i++) maskData.data[i * 4 + 3] = a[i] * 255
    mctx.putImageData(maskData, 0, 0)
  })
  // 사람 = 원본 ∩ 마스크(늘릴 때 보간으로 경계가 부드러워진다)
  const pctx = fit((person ??= canvas()), w, h)
  pctx.globalCompositeOperation = 'source-over'
  pctx.clearRect(0, 0, w, h)
  pctx.drawImage(src, 0, 0, w, h)
  if (mask) {
    pctx.globalCompositeOperation = 'destination-in'
    pctx.drawImage(mask, 0, 0, w, h)
  }
  // 배경 — 이미지면 꽉 채움, 아니면 흐림(줄였다 늘리기 : ctx.filter 없는 브라우저도 같게)
  if (backdrop) {
    const r = coverRect(backdrop.width, backdrop.height, w, h)
    out.drawImage(backdrop, r.x, r.y, r.w, r.h)
  } else {
    const tw = Math.max(1, Math.round(w / BG.blurDiv))
    const th = Math.max(1, Math.round(h / BG.blurDiv))
    fit((tiny ??= canvas()), tw, th).drawImage(src, 0, 0, tw, th)
    out.imageSmoothingQuality = 'high'
    out.drawImage(tiny, 0, 0, w, h)
  }
  out.drawImage(person, 0, 0)
  if (watch(performance.now() - t0, t0)) {
    void choose('none')
    autoOff.set(Date.now())
  }
}

// 퇴장 — 선택만 처음으로(분리기 인스턴스는 다음 방에서 재사용)
export function reset() {
  void choose('none')
  autoOff.set(0)
}
