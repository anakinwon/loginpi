// 로컬 녹화기(SA6, 설계서 15.6·계획서 M-4) — 무대 상자 안의 <video> 들을 지금 보이는 자리 그대로 canvas 에 그리고,
// 원격 소리 + 내 마이크를 AudioContext 로 섞어 MediaRecorder 1초 조각으로 모은다. 종료하면 Blob 1개(발표자 기기에만, 서버 전송 없음).
// 처음 녹화할 때 동적 import 로만 불러온다(룸 첫 화면 JS 예산, 설계서 15.13). 순수 판정(pickMime·recFileName·fitRect)은 recorder.test.mjs
// 근거(REA jitsi ③) : 조각 단위 MediaRecorder + 탭 소리·마이크 AudioContext 합성. 우리는 탭 캡처(getDisplayMedia, 데스크톱 Chromium 한정) 대신
//  canvas 합성을 써 모바일·Pi Browser 에서도 기능 탐지로 시도한다. 코드는 옮기지 않았다(S-2)

const R = {
  w: 1280, // 녹화 화면 크기 — 무대 비율과 달라도 가운데 맞춤(남는 곳은 검정)
  h: 720,
  fps: 30,
  sliceMs: 1000, // 1초 조각
  videoBps: 1_500_000,
} as const

// 지원 형식 — 앞에서부터 처음 되는 것(iOS Safari 는 mp4 만). 없으면 '' = 브라우저 기본
export const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
] as const

export function pickMime(isSupported: (m: string) => boolean): string {
  return MIME_CANDIDATES.find((m) => isSupported(m)) ?? ''
}

// seminar-<id>-<YYYYMMDD-HHmmss>.<webm|mp4> — 시각은 기기 현지 시각
export function recFileName(seminarId: string, mime: string, at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const ts = `${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}`
  const id = seminarId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'room'
  return `seminar-${id}-${ts}.${mime.includes('mp4') ? 'mp4' : 'webm'}`
}

// 상자(box) 안에 원본(sw×sh)을 비율 유지로 가운데 맞춤(object-contain) — 그릴 사각형
export function fitRect(box: { x: number; y: number; w: number; h: number }, sw: number, sh: number) {
  if (!sw || !sh || !box.w || !box.h) return null
  const s = Math.min(box.w / sw, box.h / sh)
  const w = sw * s
  const h = sh * s
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
}

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
}

// stage = 무대 상자(relative). 그 안의 <video> 전부를 화면에 보이는 자리·좌우반전 그대로 그린다
export function startRecorder(stage: HTMLElement): Recorder {
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
      if (v.readyState < 2 || !v.videoWidth) continue
      const r = v.getBoundingClientRect()
      const box = { x: area.x + (r.left - sr.left) * k, y: area.y + (r.top - sr.top) * k, w: r.width * k, h: r.height * k }
      const d = fitRect(box, v.videoWidth, v.videoHeight)
      if (!d) continue
      if (v.classList.contains('-scale-x-100')) {
        g.save()
        g.translate(d.x * 2 + d.w, 0)
        g.scale(-1, 1)
        g.drawImage(v, d.x, d.y, d.w, d.h)
        g.restore()
      } else g.drawImage(v, d.x, d.y, d.w, d.h)
    }
  }
  // ponytail: setInterval 그리기 — 탭이 뒤로 가면 브라우저가 1초 1회로 늦춘다(영상이 멈춘 듯 보임). 필요하면 Worker 타이머로
  draw()
  const timer = setInterval(draw, 1000 / R.fps)

  const ac = new AudioContext()
  void ac.resume().catch(() => {})
  const dest = ac.createMediaStreamDestination()
  let sources: MediaStreamAudioSourceNode[] = []
  const setAudio = (streams: (MediaStream | null)[]) => {
    sources.forEach((s) => s.disconnect())
    sources = streams
      .filter((s): s is MediaStream => !!s?.getAudioTracks().length)
      .map((s) => {
        const n = ac.createMediaStreamSource(s)
        n.connect(dest) // destination(스피커)에는 잇지 않는다 — 소리는 기존 <audio> 가 낸다
        return n
      })
  }

  const mime = pickMime((m) => MediaRecorder.isTypeSupported(m))
  const stream = new MediaStream([...canvas.captureStream(R.fps).getVideoTracks(), ...dest.stream.getAudioTracks()])
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: R.videoBps })
  // ponytail: 조각을 메모리에 모은다(1.5Mbps ≈ 시간당 0.7GB) — 긴 녹화가 문제면 showSaveFilePicker 로 조각마다 디스크에 쓰기
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }
  rec.start(R.sliceMs)
  const type = rec.mimeType || mime || 'video/webm'

  const stop = () =>
    new Promise<Blob>((resolve) => {
      const done = () => {
        clearInterval(timer)
        stream.getTracks().forEach((t) => t.stop())
        sources.forEach((s) => s.disconnect())
        void ac.close().catch(() => {})
        resolve(new Blob(chunks, { type }))
      }
      if (rec.state === 'inactive') return done()
      rec.onstop = done
      rec.stop()
    })

  return { mime: type, setAudio, stop }
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
