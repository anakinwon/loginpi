// 로컬 녹화기(SA6, 설계서 15.6·계획서 M-4) — 무대 상자 안의 <video> 들을 지금 보이는 자리 그대로 canvas 에 그리고,
// 원격 소리 + 내 마이크를 AudioContext 로 섞어 MediaRecorder 1초 조각으로 모은다. 종료하면 Blob 1개(발표자 기기에만, 서버 전송 없음).
// 처음 녹화할 때 동적 import 로만 불러온다(룸 첫 화면 JS 예산, 설계서 15.13). 순수 판정(pickMime·recFileName·fitRect 등)은 rules.ts·rules.test.mjs
// 근거(REA jitsi ③) : 조각 단위 MediaRecorder + 탭 소리·마이크 AudioContext 합성. 우리는 탭 캡처(getDisplayMedia, 데스크톱 Chromium 한정) 대신
//  canvas 합성을 써 모바일·Pi Browser 에서도 기능 탐지로 시도한다. 코드는 옮기지 않았다(S-2)
import { ticker } from '../../ticker'
import { fitRect, meetRect, pickMime } from './rules'

// 영상 비트레이트 — webm 으로 녹화된 것을 MP4 로 다시 인코딩할 때도 같은 값(to-mp4.ts)
export const VIDEO_BPS = 1_500_000
const R = {
  w: 1280, // 녹화 화면 크기 — 무대 비율과 달라도 가운데 맞춤(남는 곳은 검정)
  h: 720,
  fps: 30,
  sliceMs: 1000, // 1초 조각
  videoBps: VIDEO_BPS,
  // 메모리 안전 상한 — 조각을 메모리에 모으므로 넘으면 자동 종료·저장(탭이 메모리 부족으로 죽으면 녹화 전체를 잃는다).
  // 1.5Mbps 기준 약 3시간. ponytail: 고정값 — 기기 메모리별 조정이 필요하면 navigator.deviceMemory 로 낮추기
  maxBytes: 2 * 1024 ** 3,
} as const

// 기능 탐지 — UA 로 막지 않는다. 셋 중 하나라도 없으면 녹화 불가 안내
export function canRecord(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof AudioContext !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  )
}

export type Recorder = {
  mime: string
  setAudio: (streams: (MediaStream | null)[]) => void // 소리 원본이 바뀌면(참가자 입퇴장) 다시 연결
  stop: () => Promise<Blob>
  pause: () => void // 일시정지(마스터 2026-10-29) — 녹화 중일 때만, 그리기는 계속(다시 시작 때 바로 이어지게)
  resume: () => void
}

// stage = 무대 상자(relative). 그 안의 <video> 전부를 화면에 보이는 자리 그대로 그린다
// ac = 클릭 핸들러에서 동기로 만든 AudioContext(iOS Safari 등 사용자 활성화 요구 — await 뒤에 만들면 suspended 로 무음)
// onFail = 녹화 중 브라우저가 녹화를 멈췄을 때(MediaRecorder error)
export function startRecorder(stage: HTMLElement, ac: AudioContext, onFail?: () => void): Recorder {
  const canvas = document.createElement('canvas')
  canvas.width = R.w
  canvas.height = R.h
  const g = canvas.getContext('2d')
  if (!g) throw new Error('NO_2D')

  const draw = () => {
    g.fillStyle = '#000'
    g.fillRect(0, 0, R.w, R.h)
    const sr = stage.getBoundingClientRect()
    const area = fitRect({ x: 0, y: 0, w: R.w, h: R.h }, sr.width, sr.height)
    if (!area) return
    const k = area.w / sr.width
    for (const v of stage.querySelectorAll('video')) {
      // 대화상자(효과 시트 미리보기 등) 안 영상은 무대가 아니다 — 열린 채 녹화하면 무대 위에 미리보기가 덧그려졌다
      if (v.readyState < 2 || !v.videoWidth || v.closest('dialog')) continue
      const r = v.getBoundingClientRect()
      // 화면에서 보이는 만큼만 — 넘침을 자르는 조상(패널 타일 가로 스크롤 줄 등)과 무대 밖은 잘라 낸다.
      // 전에는 스크롤로 밀려난 타일이 주 화면·좌우 검은 띠 위에 그대로 찍혔다
      let vis = meetRect(r, sr)
      for (let el = v.parentElement; vis && el && el !== stage; el = el.parentElement)
        if (getComputedStyle(el).overflow !== 'visible') vis = meetRect(vis, el.getBoundingClientRect())
      if (!vis) continue
      const box = { x: area.x + (r.left - sr.left) * k, y: area.y + (r.top - sr.top) * k, w: r.width * k, h: r.height * k }
      const d = fitRect(box, v.videoWidth, v.videoHeight)
      if (!d) continue
      g.save()
      g.beginPath()
      g.rect(area.x + (vis.left - sr.left) * k, area.y + (vis.top - sr.top) * k, (vis.right - vis.left) * k, (vis.bottom - vis.top) * k)
      g.clip()
      // 미리보기 거울상(-scale-x-100)은 화면 표시 전용 — 녹화는 참가자가 받는 송출본처럼 반전 없이
      g.drawImage(v, d.x, d.y, d.w, d.h)
      g.restore()
    }
  }
  draw()

  const dest = ac.createMediaStreamDestination()
  let sources: MediaStreamAudioSourceNode[] = []
  const setAudio = (streams: (MediaStream | null)[]) => {
    sources.forEach((s) => s.disconnect())
    // 트랙 단위 — MediaStreamAudioSourceNode 는 스트림의 오디오 트랙 중 id 사전순 첫 1개만 쓴다(Web Audio 명세).
    // remoteAudio 는 원격 트랙 전부를 담은 스트림 1개라 스트림 단위로 만들면 발언자 1명 소리만 남는다
    sources = streams
      .flatMap((s) => s?.getAudioTracks() ?? [])
      .map((t) => {
        const n = ac.createMediaStreamSource(new MediaStream([t]))
        n.connect(dest) // destination(스피커)에는 잇지 않는다 — 소리는 기존 <audio> 가 낸다
        return n
      })
  }

  const mime = pickMime((m) => MediaRecorder.isTypeSupported(m))
  const stream = new MediaStream([...canvas.captureStream(R.fps).getVideoTracks(), ...dest.stream.getAudioTracks()])
  // ponytail: 조각을 메모리에 모은다(1.5Mbps ≈ 시간당 0.7GB) — 긴 녹화가 문제면 showSaveFilePicker 로 조각마다 디스크에 쓰기
  const chunks: Blob[] = []
  let bytes = 0
  let rec: MediaRecorder
  try {
    rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: R.videoBps })
    rec.ondataavailable = (e) => {
      if (!e.data.size) return
      chunks.push(e.data)
      // 상한을 넘으면 1번만 알린다 — 부른 쪽이 오류 때와 같이 종료·저장·고지 해제
      if (bytes < R.maxBytes && (bytes += e.data.size) >= R.maxBytes) onFail?.()
    }
    // 녹화 중 오류(인코더 중단 등) — 브라우저가 녹화를 멈추므로 부른 쪽이 종료·저장·'녹화 중' 고지 해제
    rec.onerror = () => onFail?.()
    rec.start(R.sliceMs)
  } catch (e) {
    // 시작 실패(형식 미지원 등) — 만든 트랙을 닫고 그리기 타이머는 돌리지 않는다(전에는 실패해도 30fps 그리기가 계속 돌았다)
    stream.getTracks().forEach((t) => t.stop())
    throw e
  }
  // 워커 타이머 — 발표자가 다른 탭·창을 화면 공유하느라 이 탭이 숨어도 녹화가 초당 1프레임으로 멈추지 않게(창 타이머는 숨은 탭에서 1초 1회)
  const stopTick = ticker(Math.round(1000 / R.fps), draw)
  const type = rec.mimeType || mime || 'video/webm'

  const stop = () =>
    new Promise<Blob>((resolve) => {
      const done = () => {
        stopTick()
        stream.getTracks().forEach((t) => t.stop())
        sources.forEach((s) => s.disconnect())
        void ac.close().catch(() => {})
        resolve(new Blob(chunks, { type }))
      }
      if (rec.state === 'inactive') return done()
      rec.onstop = done
      rec.stop()
    })

  const pause = () => {
    if (rec.state === 'recording') rec.pause()
  }
  const resume = () => {
    if (rec.state === 'paused') rec.resume()
  }

  return { mime: type, setAudio, stop, pause, resume }
}

// Blob 다운로드 — <a download>. 막히는 환경(앱 안 브라우저 등)은 화면 안내로 대신한다(호출한 쪽)
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 바로 해제하면 일부 브라우저가 저장을 시작하지 못한다
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
