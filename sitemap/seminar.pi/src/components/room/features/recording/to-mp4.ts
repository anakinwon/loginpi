// webm 녹화 → MP4(마스터 2026-10-29 : 저장은 MP4, webm 원본은 남기지 않음) — MP4 녹화가 안 되는 브라우저(Firefox 등)에서만, 녹화를 끝낼 때 동적 import.
//  mediabunny = WebCodecs, 기기 안에서만(서버 전송 없음). 영상 H.264(녹화와 같은 비트레이트로 압축) + 소리 AAC.
//  AAC 인코딩이 없으면 소리는 Opus 그대로, H.264 인코딩도 없으면 원래 코덱 그대로 MP4 에 담는다. 안 되면 null → 부른 쪽이 원본 저장(녹화를 잃지 않게)
//  MP4(H.264)로 녹화된 것은 부르지 않는다 — 이미 재생·길이 표시가 되는 MP4(2026-10-29 Chrome 156 시험)라 바꿀 이득보다 메모리 위험이 크다
import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, Quality } from 'mediabunny'
import type { ConversionAudioOptions, ConversionVideoOptions, InputVideoTrack } from 'mediabunny'

// ponytail: 결과를 메모리(BufferTarget, 두 배씩 늘림 + 마무리 복사)에 만든다 — 최고점 원본의 약 3~4배. 넘으면 바꾸지 않고 원본 저장(탭이 죽으면 녹화 전체를 잃음).
//  512MiB ≈ 1.5Mbps 로 약 45분. 더 긴 녹화도 바꾸려면 StreamTarget(fastStart 'fragmented') 조각을 Blob[] 로 모으기
export const CONVERT_MAX_BYTES = 512 * 1024 ** 2
// ponytail: 진행이 30초 없으면 인코더가 멈춘 것으로 보고 취소(원본 저장) — 아주 느린 기기에서 될 변환을 끊을 수 있다
const STALL_MS = 30_000

type Try = { video?: (t: InputVideoTrack) => ConversionVideoOptions; audio?: ConversionAudioOptions }

export async function toMp4(blob: Blob, bps: number, onProgress: (p: number) => void): Promise<Blob | null> {
  if (blob.size > CONVERT_MAX_BYTES) return null
  // new Quality(숫자) 는 0~1 품질 배수다 — 1_500_000 을 그대로 주면 Infinity bps 로 인코더가 실패했다(2026-10-29 Chrome 156 시험). 비트레이트는 { bitrate }
  const q = new Quality({ bitrate: bps })
  const avc = (t: InputVideoTrack): ConversionVideoOptions => (t.codec === 'avc' ? { codec: 'avc' } : { codec: 'avc', quality: q })
  const tries: Try[] = [{ video: avc, audio: { codec: 'aac' } }, { video: avc }, {}]
  for (const o of tries) {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) })
    let stalled = false
    let watch: ReturnType<typeof setInterval> | undefined
    try {
      // fastStart false = 조각을 만드는 대로 버퍼에 쓴다(마무리까지 조각을 따로 들지 않음)
      const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: new BufferTarget() })
      const c = await Conversion.init({ input, output, ...o })
      // 버려지는 트랙(인코딩 불가 코덱)이 있으면 다음 방법 — 소리 없는 MP4 를 만들지 않는다
      if (!c.isValid || c.discardedTracks.length) continue
      let last = Date.now()
      c.onProgress = (p) => {
        last = Date.now()
        onProgress(p)
      }
      // 멈춘 인코더 — cancel 도 멈춘 인코더를 기다릴 수 있어 기다리지 않고 바로 실패로 끝낸다
      const stall = new Promise<never>((_, rej) => {
        watch = setInterval(() => {
          if (Date.now() - last < STALL_MS) return
          stalled = true
          void c.cancel().catch(() => {})
          rej(new Error('STALLED'))
        }, 5000)
      })
      await Promise.race([c.execute(), stall])
      const buf = output.target.buffer
      if (buf) return new Blob([buf], { type: 'video/mp4' })
    } catch {
      // 열기·인코더 실패 — 다음 방법. 멈춤이면 다음 방법도 같은 인코더라 그만
      if (stalled) return null
    } finally {
      clearInterval(watch)
      input.dispose()
    }
  }
  return null
}
