'use client'
// 대면 노트 원본 음성 녹음기(STT PoC 1단계, 마스터 2026-10-29) — 실시간 조각 전사(useSpeech)와 따로, 같은 마이크로 1분 독립 파일(opus 64kbps)을 만들어
//  /api/notes/[id]/audio 로 올린다. 종료 때 서버가 이 파일들로 정밀 전사(화자 구분)해 초안을 바꾼다(lib/note-audio).
//  off = 이 노트 녹음 시작 뒤 ms — 마이크를 다시 연결해도 이어서 센다(서버가 노트 시작 시각에 더해 초안 시간대와 맞춘다)
import { useCallback, useEffect, useRef } from 'react'
import { piFetch } from '@pi/auth/client'
import { pickAudioMime } from '@/components/room/use-speech'
import { AUD } from '@/lib/note-rules'

const UPLOAD_MS = 30_000 // 1분 파일(≈480KB) 업로드 시간 상한 — 실패하면 1번 더

export function useRawAudio(track: MediaStreamTrack | null, ntId: string | null) {
  const t0 = useRef(0)
  const seq = useRef(0)
  const pending = useRef(new Set<Promise<unknown>>())
  const stopNow = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    t0.current = 0
    seq.current = 0
  }, [ntId])

  useEffect(() => {
    const mime = pickAudioMime()
    if (!track || !ntId || !mime) return
    if (!t0.current) t0.current = Date.now()
    const stream = new MediaStream([track])
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let done: Promise<void> = Promise.resolve() // 지금 파일의 onstop(업로드 등록)까지

    const send = (blob: Blob, n: number, off: number) => {
      const once = () => {
        const fd = new FormData()
        fd.append('audio', blob)
        fd.append('seq', String(n))
        fd.append('off', String(off))
        // AbortSignal.timeout 없는 구형 WebView 는 시간 제한 없이(기능 탐지 — 없는데 부르면 동기 오류로 녹음이 멈췄다)
        const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(UPLOAD_MS) : undefined
        return piFetch(`/api/notes/${ntId}/audio`, { method: 'POST', body: fd, signal }).then((r) => {
          // 4xx(끝남·형식) 는 다시 보내도 같다 — 5xx·네트워크만 1번 더
          if (r.status >= 500) throw new Error(String(r.status))
        })
      }
      const p = Promise.resolve()
        .then(once)
        .catch(() => once())
        .catch(() => {}) // 원본 1개를 잃어도 그 시간대는 실시간 초안이 남는다
      pending.current.add(p)
      void p.finally(() => pending.current.delete(p))
    }

    const next = () => {
      if (stopped || track.readyState === 'ended') return
      const parts: Blob[] = []
      const off = Date.now() - t0.current
      const n = seq.current++
      let r: MediaRecorder
      try {
        r = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: AUD.bps })
      } catch {
        return // 녹음기 실패 — 실시간 초안만으로 회의록(정밀 전사 없음)
      }
      let ok = () => {}
      done = new Promise<void>((res) => (ok = res))
      r.ondataavailable = (e) => {
        if (e.data.size) parts.push(e.data)
      }
      r.onstop = () => {
        // 올리기에 무슨 일이 있어도 끝 신호·다음 파일은 간다 — 아니면 [종료]가 끝없이 기다리고 녹음도 멈춘다
        try {
          if (parts.length) send(new Blob(parts, { type: r.mimeType || mime }), n, off)
        } finally {
          ok()
          next()
        }
      }
      try {
        r.start()
      } catch {
        ok() // 시작 실패 — 실시간 초안만으로 회의록
        return
      }
      timer = setTimeout(() => {
        if (r.state === 'recording') r.stop()
      }, AUD.sliceMs)
      stopNow.current = () => {
        stopped = true
        clearTimeout(timer)
        if (r.state === 'recording') r.stop()
        return done
      }
    }
    next()
    return () => {
      void stopNow.current?.()
      stopNow.current = null
    }
  }, [track, ntId])

  // 종료 — 녹음 중 파일을 끊어 올리고, 진행 중 업로드가 끝날 때까지(상한 maxMs) 기다린다. 서버는 노트가 끝나면 받지 않으므로 끝내기 전에
  //  녹음기 정지 신호가 오지 않는 경우(브라우저 결함)도 상한 안에서 끝낸다
  const flush = useCallback(async (maxMs: number) => {
    const cap = new Promise((ok) => setTimeout(ok, maxMs))
    await Promise.race([stopNow.current?.(), cap])
    await Promise.race([Promise.allSettled([...pending.current]), cap])
  }, [])

  return { flush }
}
