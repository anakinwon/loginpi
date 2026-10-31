'use client'
// 음성 조각 훅(계획서 A-1) — 말하는 사람 자기 브라우저가 자기 마이크 트랙을 3초씩(CHUNK_MS) 녹음 → POST /api/speech/chunk(piFetch) → 글 →
// (방송 모드면) 엔진 app.send{topic:'caption', d:{text, ts, lang}}. 켜고 끄기는 on, 실패는 조용히 건너뛴다(자막은 없어도 회의는 계속).
// 조각마다 녹음기를 새로 시작한다 — start(timeslice) 의 2번째 조각부터는 머리(헤더)가 없어 단독 해독이 안 된다
// (Jitsi 배포본은 start(5e3) 조각을 ts-ebml 로 이어 붙여 한 파일로 고친다 — REA_04_UI_EXT R-S1). 형식 탐지 순서 근거 R-S2.
// 서버 계약 정본 = /api/speech/chunk 머리 주석 + @/lib/speech-rules(F-A) : multipart audio·smnId·durMs·lang → 200 {text, lang, ts}.
//  멈춤 = SPEECH_QUOTA(429, 세미나 한도 소진 — 이 세션 끝)·SPEECH_NOT_LIVE(409, 이번 켜기 끝)·SPEECH_NO_AGR(403, 서버에 동의 없음 → onNoAgr 로 다시 묻기)
//  ·NOT_FOUND·FORBIDDEN(대상 삭제·권한 잃음, 이번 켜기 끝) — 판정 = speechHalt, 멈추면 onHalt 로 알린다.
//  그 밖(SPEECH_RATE·SPEECH_FAILED·네트워크·15초 초과)은 그 조각만 건너뛴다. 실험실 방(UUID 아님)은 서버 기록이 없어 보내지 않는다
// 보내기 전 검사 = chunkSendable(길이 0.5~10초·크기 ≤160KB, 서버 chunkError 와 같은 상수) — 백그라운드 복귀로 길어진 조각·iOS AAC 큰 조각은 보내지 않는다.
//  녹음 비트레이트는 SPEECH_BPS(32kbps) 고정(F-U A1)
import { useCallback, useEffect, useRef, useState } from 'react'
import { piFetch } from '@pi/auth/client'
import { isUuid } from '@/lib/seminar-rules'
import { captionFresh, chunkHeard, chunkSendable, CHUNK_MS, NOTE_CTX, settleWithin, SPEECH_BPS, speechHalt, type SpeechHalt, VAD } from '@/lib/speech-rules'
import type { SpeechMeta } from './extensions'
import { fitCaption } from './features/captions/caption-rules'
import { acquireCtx, releaseCtx } from './video-tile'

export const UPLOAD_TIMEOUT_MS = 15_000 // 서버 외부 AI 10초(BUILD_DEFECTS 2.7) + 여유 — 넘으면 그 조각 포기

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
  onHalt,
  field = 'smnId',
  chunkMs = CHUNK_MS,
  vadLevel = VAD.level,
  title,
}: {
  track: MediaStreamTrack | null // 내 마이크(원본) — 없으면 쉰다
  seminarId: string // 대상 id — field 가 'ntId' 면 대면 노트 회의록 id(세미나 없음, SA2)
  field?: 'smnId' | 'ntId'
  lang: string // 말하는 언어(화면 locale) — 서버가 알아내면 응답 lang 이 우선
  on: boolean
  broadcast: boolean // true = 자막 방송(caption), false = 글로만(onText)
  sendApp: (topic: string, d: unknown) => Promise<string | null>
  onText?: (text: string, ts: number, meta: SpeechMeta) => void
  onNoAgr?: () => void // 서버에 동의 기록이 없다(SPEECH_NO_AGR) — 이 기기 기록을 지우고 다시 묻는다(consent.tsx)
  onHalt?: (why: SpeechHalt) => void // 서버가 멈추라고 했다(이번 켜기 끝) — 화면이 '기록 중'으로 남지 않게(대면 노트)
  chunkMs?: number // 조각 길이 — 대면 노트는 CHUNK_NOTE_MS(문맥이 길수록 덜 빠뜨린다)
  vadLevel?: number // 무음 거르기 기준 — 대면 노트는 VAD.noteLevel(먼 사람 말)
  title?: string // 대면 노트 회의 제목 — 주면 제목·직전 2문장을 전사 문맥으로 같이 보낸다(세미나 자막은 안 보냄 — 지연·비용 그대로)
}) {
  const latest = useRef({ lang, broadcast, sendApp, onText, onNoAgr, onHalt, title })
  useEffect(() => {
    latest.current = { lang, broadcast, sendApp, onText, onNoAgr, onHalt, title }
  })
  const [limited, setLimited] = useState(false) // 세미나 음성 처리 한도 소진(A-5) — 이 세션에선 다시 시작하지 않는다
  const pending = useRef(new Set<Promise<void>>()) // 진행 중 조각 업로드(flush 가 기다린다)
  const halt = useRef<() => Promise<void>>(async () => {}) // 지금 녹음을 멈추고 마지막 조각이 업로드 대기열에 오를 때까지

  useEffect(() => {
    const mime = pickAudioMime()
    if (!on || limited || !track || track.readyState !== 'live' || !mime || !isUuid(seminarId)) return
    let stopped = false
    let halted = false // 서버가 멈추라고 했다(한도·진행 아님·동의 없음) — 남은 조각도 보내지 않고, 늦게 온 같은 거절로 두 번 묻지 않는다
    let rec: MediaRecorder | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let lastTs = 0 // 마지막으로 방송한 자막 조각 시작 시각(captionFresh)
    const said: string[] = [] // 받은 글(최근 2개) — 대면 노트 전사 문맥. 업로드가 겹치면 한 조각 늦을 수 있다
    const stream = new MediaStream([track])

    // 무음 조각 거르기(chunkHeard) — 조각마다 최대 음량을 잰다. 잴 수 없으면(미지원·suspended) 표본이 안 쌓여 그대로 보낸다(fail-open)
    let peak = 0
    let samples = 0
    let vad: (() => void) | null = null
    if (typeof AudioContext !== 'undefined') {
      try {
        const ac = acquireCtx()
        const src = ac.createMediaStreamSource(stream)
        const an = ac.createAnalyser()
        an.fftSize = 512
        src.connect(an) // destination 에 잇지 않는다(내 목소리 되울림 없음)
        ac.resume().catch(() => {})
        const buf = new Float32Array(an.fftSize)
        const id = setInterval(() => {
          if (ac.state !== 'running' || !track.enabled) return
          an.getFloatTimeDomainData(buf)
          let sum = 0
          for (const v of buf) sum += v * v
          peak = Math.max(peak, Math.sqrt(sum / buf.length))
          samples++
        }, VAD.pollMs)
        vad = () => {
          clearInterval(id)
          src.disconnect()
          releaseCtx()
        }
      } catch {
        // 측정 불가 — 모든 조각을 보낸다
      }
    }

    async function upload(blob: Blob, durMs: number) {
      const l = latest.current
      const fd = new FormData()
      fd.append('audio', blob, 'chunk')
      fd.append(field, seminarId)
      fd.append('durMs', String(durMs))
      fd.append('lang', l.lang)
      if (l.title !== undefined) {
        fd.append('ctxTitle', l.title.slice(0, NOTE_CTX.title))
        fd.append('ctxPrev', said.join(' ').slice(-NOTE_CTX.prev))
      }
      const r = await piFetch('/api/speech/chunk', {
        method: 'POST',
        body: fd,
        // 기능 탐지 — AbortSignal.timeout 이 없는 옛 WebView(iOS 15 이하)는 시간 제한 없이 보낸다
        signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(UPLOAD_TIMEOUT_MS) : undefined,
      }).catch(() => null)
      if (!r) return
      const j = (await r.json().catch(() => null)) as {
        text?: string
        lang?: string
        ts?: number
        sig?: string | null
        rec?: boolean
        tr?: Record<string, string>
        trSig?: Record<string, string>
        code?: string
      } | null
      if (!r.ok) {
        const why = speechHalt(j?.code)
        if (halted || !why) return
        halted = stopped = true
        if (why === 'quota') setLimited(true)
        if (why === 'agr') l.onNoAgr?.()
        l.onHalt?.(why)
        return
      }
      const text = j?.text?.trim()
      if (!text) return
      said.push(text)
      if (said.length > 2) said.shift()
      const ts = typeof j?.ts === 'number' ? j.ts : Date.now() - durMs // 조각 시작 시각 — 서버 추정값 우선
      // sig = 서버 발급 자막 서명 — 번역·더빙 요청에 그대로 실어 보낸다(없으면 그 자막은 원문만)
      // tr·trSig = 서버 선번역(청중이 보는 언어, 마스터 A안) — 서버가 만든 값이라 그대로 싣는다(받는 쪽 parseCaption 이 검사)
      const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, string>) : undefined)
      const meta: SpeechMeta = {
        lang: j?.lang || l.lang,
        sig: typeof j?.sig === 'string' ? j.sig : null,
        rec: typeof j?.rec === 'boolean' ? j.rec : undefined,
        tr: obj(j?.tr),
        trSig: obj(j?.trSig),
      }
      // 방송 모드 = 늦게 온 옛 조각은 버린다(내 화면·남의 화면·더빙 모두 최신 1문장만 다룬다). 글로만 받는 쪽(대면 노트)은 전부 받는다
      if (l.broadcast) {
        if (!captionFresh(lastTs, ts)) return
        lastTs = ts
      }
      l.onText?.(text, ts, meta)
      // rec 는 내 화면용 — 방송하지 않는다. 선번역은 엔진 d 4KB 안에 들게 뒤에서부터 덜어 낸다(fitCaption)
      if (l.broadcast) void l.sendApp('caption', fitCaption({ text, ts, lang: meta.lang, sig: meta.sig, tr: meta.tr, trSig: meta.trSig }))
    }

    let serial = false // 겹침 시작이 거부된 기기 — 이전 방식(멈춘 뒤 onstop 에서 다음 시작)으로 후퇴(R-P5, 팀장 지적 2026-10-31)
    const next = (): boolean => {
      if (stopped || track.readyState !== 'live') return false
      const ts = Date.now()
      const parts: Blob[] = []
      // 꺼진 마이크(enabled=false)·무음 조각(chunkHeard)은 건너뛴다
      let spoke = track.enabled
      peak = 0
      samples = 0
      let heard: { peak: number; samples: number } | null = null // 다음 녹음기가 peak 를 0 으로 되돌리기 전에 이 조각의 측정값을 떠 둔다
      let r: MediaRecorder
      try {
        r = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: SPEECH_BPS })
      } catch {
        return false // 생성 실패 — 호출한 타이머가 이전 녹음기를 그대로 멈춰 마지막 조각은 올라간다
      }
      rec = r
      r.ondataavailable = (e) => {
        if (e.data.size) parts.push(e.data)
      }
      r.onstop = () => {
        spoke ||= track.enabled
        const dur = Date.now() - ts
        const blob = new Blob(parts, { type: r.mimeType || mime })
        const h = heard ?? { peak, samples }
        // 서버 chunkError 와 같은 길이·크기 조건(chunkSendable) — 끄기 직전의 짧은 조각, 타이머가 밀린 긴 조각, 상한 넘는 큰 조각은 버린다
        if (!halted && spoke && chunkHeard(h.peak, h.samples, vadLevel) && chunkSendable(dur, blob.size)) {
          const p = upload(blob, dur).catch(() => {})
          pending.current.add(p)
          void p.finally(() => pending.current.delete(p))
        }
        if (serial) next() // 후퇴 모드 — 멈춘 뒤에 다음 조각 시작(공백은 생기지만 끊기진 않는다)
      }
      try {
        r.start()
      } catch {
        return false // 트랙이 막 끝남 등 — 이번 켜기는 포기(다음 on·track 변화 때 다시)
      }
      // 다음 녹음기를 먼저 시작한 뒤 이 녹음기를 멈춘다 — stop → onstop → start 순서로 돌리면 조각 사이에 100~300ms 가 비어 경계 낱말이
      //  잘렸다(3초 조각은 경계가 더 잦다). 같은 스트림에 녹음기 2개가 잠깐 겹치는 것은 허용된다(2026-10-31)
      //  겹침 시작이 거부되면(Safari·WebView 미검증) 직렬로 후퇴 — 이 조각의 onstop 이 다음을 시작한다. 거부가 없던 이전 방식에 없던 '첫 조각 뒤 영구 침묵' 차단
      timer = setTimeout(() => {
        heard = { peak, samples }
        if (!serial && !next() && !stopped) serial = true
        if (r.state === 'recording') r.stop()
      }, chunkMs)
      return true
    }
    next()
    // flush 용 — 녹음 중인 조각을 지금 끊는다. onstop(속성 핸들러, 먼저 등록)이 업로드를 pending 에 올린 뒤 이 리스너가 돈다
    halt.current = () =>
      new Promise<void>((res) => {
        stopped = true
        clearTimeout(timer)
        const r = rec
        if (r?.state !== 'recording') return res()
        r.addEventListener('stop', () => res(), { once: true })
        r.stop()
      })
    return () => {
      stopped = true
      clearTimeout(timer)
      halt.current = async () => {}
      vad?.()
      // 마지막 조각은 보낸다(끄기 직전 말한 것까지 자막·기록에 남게) — onstop 이 upload 후 next 는 stopped 로 멈춤
      if (rec?.state === 'recording') rec.stop()
    }
  }, [on, limited, track, seminarId, field, chunkMs, vadLevel])

  // 녹음을 멈추고 진행 중 조각 업로드가 끝날 때까지(상한 maxMs) 기다린다 — 대면 노트 [종료]가 마지막 말까지 넣고 요약하게.
  //  끝나면 true, 상한 초과면 false. 이후 이 켜기의 녹음은 재개되지 않는다(on·track 이 바뀌면 다시)
  const flush = useCallback(async (maxMs: number) => {
    await settleWithin([halt.current()], 1_000) // stop 이벤트가 안 오는 기기에도 매달리지 않게
    return settleWithin(pending.current, maxMs)
  }, [])

  return { limited, flush }
}
