'use client'
// 음성 조각 훅(계획서 A-1) — 말하는 사람 자기 브라우저가 자기 마이크 트랙을 5초씩 녹음 → POST /api/speech/chunk(piFetch) → 글 →
// (방송 모드면) 엔진 app.send{topic:'caption', d:{text, ts, lang}}. 켜고 끄기는 on, 실패는 조용히 건너뛴다(자막은 없어도 회의는 계속).
// 조각마다 녹음기를 새로 시작한다 — start(timeslice) 의 2번째 조각부터는 머리(헤더)가 없어 단독 해독이 안 된다
// (Jitsi 배포본은 start(5e3) 조각을 ts-ebml 로 이어 붙여 한 파일로 고친다 — REA_04_UI_EXT R-S1). 형식 탐지 순서 근거 R-S2.
// 서버 계약 : multipart audio(Blob)·smn(세미나 ID)·lang(말한 언어 locale)·ts(조각 시작 ms) → 200 {text, lang?} | 429 {code:'SPEECH_LIMIT'} = 세미나 한도 소진(멈춤)
import { useEffect, useRef, useState } from 'react'
import { piFetch } from '@pi/auth/client'

export const SPEECH = { chunkMs: 5000 }

// 녹음 형식 기능 탐지(UA 판정 금지) — webm/opus → mp4(Safari). 없으면 null = 이 기기에선 음성 조각을 못 만든다
export function pickAudioMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return ['audio/webm;codecs=opus', 'audio/mp4', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) ?? null
}

export function useSpeech({
  track,
  seminarId,
  lang,
  on,
  broadcast,
  sendApp,
  onText,
}: {
  track: MediaStreamTrack | null // 내 마이크(원본) — 없으면 쉰다
  seminarId: string
  lang: string // 말하는 언어(화면 locale) — 서버가 알아내면 응답 lang 이 우선
  on: boolean
  broadcast: boolean // true = 자막 방송(caption), false = 글로만(onText)
  sendApp: (topic: string, d: unknown) => Promise<string | null>
  onText?: (text: string, ts: number) => void
}) {
  const latest = useRef({ lang, broadcast, sendApp, onText })
  useEffect(() => {
    latest.current = { lang, broadcast, sendApp, onText }
  })
  const [limited, setLimited] = useState(false) // 세미나 음성 처리 한도 소진(A-5) — 이 세션에선 다시 시작하지 않는다

  useEffect(() => {
    const mime = pickAudioMime()
    if (!on || limited || !track || track.readyState !== 'live' || !mime) return
    let stopped = false
    let rec: MediaRecorder | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const stream = new MediaStream([track])

    async function upload(blob: Blob, ts: number) {
      const l = latest.current
      const fd = new FormData()
      fd.append('audio', blob, 'chunk')
      fd.append('smn', seminarId)
      fd.append('lang', l.lang)
      fd.append('ts', String(ts))
      const r = await piFetch('/api/speech/chunk', { method: 'POST', body: fd }).catch(() => null)
      if (!r) return
      const j = (await r.json().catch(() => null)) as { text?: string; lang?: string; code?: string } | null
      if (!r.ok) {
        if (j?.code === 'SPEECH_LIMIT') {
          stopped = true
          setLimited(true)
        }
        return
      }
      const text = j?.text?.trim()
      if (!text) return
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
        if (parts.length && spoke) void upload(new Blob(parts, { type: r.mimeType || mime }), ts)
        next()
      }
      try {
        r.start()
      } catch {
        return // 트랙이 막 끝남 등 — 이번 켜기는 포기(다음 on·track 변화 때 다시)
      }
      timer = setTimeout(() => {
        if (r.state === 'recording') r.stop()
      }, SPEECH.chunkMs)
    }
    next()
    return () => {
      stopped = true
      clearTimeout(timer)
      // 마지막 조각은 보낸다(끄기 직전 말한 것까지 자막·기록에 남게) — onstop 이 upload 후 next 는 stopped 로 멈춤
      if (rec?.state === 'recording') rec.stop()
    }
  }, [on, limited, track, seminarId])

  return { limited }
}
