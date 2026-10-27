'use client'
// 음성 조각 훅(계획서 A-1) — 말하는 사람 자기 브라우저가 자기 마이크 트랙을 5초씩 녹음 → POST /api/speech/chunk(piFetch) → 글 →
// (방송 모드면) 엔진 app.send{topic:'caption', d:{text, ts, lang}}. 켜고 끄기는 on, 실패는 조용히 건너뛴다(자막은 없어도 회의는 계속).
// 조각마다 녹음기를 새로 시작한다 — start(timeslice) 의 2번째 조각부터는 머리(헤더)가 없어 단독 해독이 안 된다
// (Jitsi 배포본은 start(5e3) 조각을 ts-ebml 로 이어 붙여 한 파일로 고친다 — REA_04_UI_EXT R-S1). 형식 탐지 순서 근거 R-S2.
// 서버 계약 정본 = /api/speech/chunk 머리 주석 + @/lib/speech-rules(F-A) : multipart audio·smnId·durMs·lang → 200 {text, lang, ts}.
//  멈춤 = SPEECH_QUOTA(429, 세미나 한도 소진 — 이 세션 끝)·SPEECH_NOT_LIVE(409, 이번 켜기 끝)·SPEECH_NO_AGR(403, 서버에 동의 없음 → onNoAgr 로 다시 묻기).
//  그 밖(SPEECH_RATE·SPEECH_FAILED·네트워크·15초 초과)은 그 조각만 건너뛴다. 실험실 방(UUID 아님)은 서버 기록이 없어 보내지 않는다
import { useEffect, useRef, useState } from 'react'
import { piFetch } from '@pi/auth/client'
import { isUuid } from '@/lib/seminar-rules'
import { CHUNK_MIN_MS, CHUNK_MS } from '@/lib/speech-rules'

const UPLOAD_TIMEOUT_MS = 15_000 // 서버 외부 AI 10초(BUILD_DEFECTS 2.7) + 여유 — 넘으면 그 조각 포기

// 녹음 형식 기능 탐지(UA 판정 금지) — webm/opus → mp4(Safari). 서버 baseMime 이 받는 형식만. 없으면 null = 이 기기에선 음성 조각을 못 만든다
export function pickAudioMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return ['audio/webm;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) ?? null
}

export function useSpeech({
  track,
  seminarId,
  lang,
  on,
  broadcast,
  sendApp,
  onText,
  onNoAgr,
  field = 'smnId',
}: {
  track: MediaStreamTrack | null // 내 마이크(원본) — 없으면 쉰다
  seminarId: string // 대상 id — field 가 'ntId' 면 대면 노트 회의록 id(세미나 없음, SA2)
  field?: 'smnId' | 'ntId'
  lang: string // 말하는 언어(화면 locale) — 서버가 알아내면 응답 lang 이 우선
  on: boolean
  broadcast: boolean // true = 자막 방송(caption), false = 글로만(onText)
  sendApp: (topic: string, d: unknown) => Promise<string | null>
  onText?: (text: string, ts: number) => void
  onNoAgr?: () => void // 서버에 동의 기록이 없다(SPEECH_NO_AGR) — 이 기기 기록을 지우고 다시 묻는다(consent.tsx)
}) {
  const latest = useRef({ lang, broadcast, sendApp, onText, onNoAgr })
  useEffect(() => {
    latest.current = { lang, broadcast, sendApp, onText, onNoAgr }
  })
  const [limited, setLimited] = useState(false) // 세미나 음성 처리 한도 소진(A-5) — 이 세션에선 다시 시작하지 않는다

  useEffect(() => {
    const mime = pickAudioMime()
    if (!on || limited || !track || track.readyState !== 'live' || !mime || !isUuid(seminarId)) return
    let stopped = false
    let halted = false // 서버가 멈추라고 했다(한도·진행 아님·동의 없음) — 남은 조각도 보내지 않고, 늦게 온 같은 거절로 두 번 묻지 않는다
    let rec: MediaRecorder | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const stream = new MediaStream([track])

    async function upload(blob: Blob, durMs: number) {
      const l = latest.current
      const fd = new FormData()
      fd.append('audio', blob, 'chunk')
      fd.append(field, seminarId)
      fd.append('durMs', String(durMs))
      fd.append('lang', l.lang)
      const r = await piFetch('/api/speech/chunk', {
        method: 'POST',
        body: fd,
        // 기능 탐지 — AbortSignal.timeout 이 없는 옛 WebView(iOS 15 이하)는 시간 제한 없이 보낸다
        signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(UPLOAD_TIMEOUT_MS) : undefined,
      }).catch(() => null)
      if (!r) return
      const j = (await r.json().catch(() => null)) as { text?: string; lang?: string; ts?: number; code?: string } | null
      if (!r.ok) {
        const c = j?.code
        if (halted || (c !== 'SPEECH_QUOTA' && c !== 'SPEECH_NOT_LIVE' && c !== 'SPEECH_NO_AGR')) return
        halted = stopped = true
        if (c === 'SPEECH_QUOTA') setLimited(true)
        if (c === 'SPEECH_NO_AGR') l.onNoAgr?.()
        return
      }
      const text = j?.text?.trim()
      if (!text) return
      const ts = typeof j?.ts === 'number' ? j.ts : Date.now() - durMs // 조각 시작 시각 — 서버 추정값 우선
      l.onText?.(text, ts)
      if (l.broadcast) void l.sendApp('caption', { text, ts, lang: j?.lang || l.lang })
    }

    const next = () => {
      if (stopped || track.readyState !== 'live') return
      const ts = Date.now()
      const parts: Blob[] = []
      // ponytail: 꺼진 마이크(enabled=false)만 건너뛴다. 켜진 채 조용한 조각도 보낸다 — 비용이 문제면 음량 판정(VAD)을 더한다
      let spoke = track.enabled
      const r = new MediaRecorder(stream, { mimeType: mime })
      rec = r
      r.ondataavailable = (e) => {
        if (e.data.size) parts.push(e.data)
      }
      r.onstop = () => {
        spoke ||= track.enabled
        const dur = Date.now() - ts // 서버 chunkError 가 요구하는 조각 길이(0.5~10초) — 끄기 직전의 짧은 조각은 버린다
        if (!halted && parts.length && spoke && dur >= CHUNK_MIN_MS) void upload(new Blob(parts, { type: r.mimeType || mime }), dur)
        next()
      }
      try {
        r.start()
      } catch {
        return // 트랙이 막 끝남 등 — 이번 켜기는 포기(다음 on·track 변화 때 다시)
      }
      timer = setTimeout(() => {
        if (r.state === 'recording') r.stop()
      }, CHUNK_MS)
    }
    next()
    return () => {
      stopped = true
      clearTimeout(timer)
      // 마지막 조각은 보낸다(끄기 직전 말한 것까지 자막·기록에 남게) — onstop 이 upload 후 next 는 stopped 로 멈춤
      if (rec?.state === 'recording') rec.stop()
    }
  }, [on, limited, track, seminarId, field])

  return { limited }
}
