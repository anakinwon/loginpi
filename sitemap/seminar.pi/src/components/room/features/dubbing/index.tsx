'use client'
// 음성 번역 듣기(더빙, SA9 — 설계서 15.4, 계획 M-3·A-3) — 자막 시트의 스위치 1줄(DubRow, 언어가 '원문'이면 숨김) + 소리 재생기.
// 켜면 받은 자막(ntf app caption{text,ts,lang})마다 자막 화면과 같은 번역(translateCaption)을 거쳐 /api/speech/tts(piFetch)로 듣는 언어의 표준 합성 음성을 받아 차례로 재생한다.
//  재생 큐 : 앞 문장이 끝나야 다음(겹치면 대기), 대기 3개 넘으면 오래된 것 버림(pushDub). 속도 = 합성 길이 ÷ 원문 조각 길이 → 0.8~1.5배(dubRate,
//  playbackRate 는 음높이 유지). 켜진 동안 원음 20%(remoteVolume → stage useRemoteAudio). 자기 음성은 엔진이 되돌려 주지 않아 더빙하지 않는다.
// 자동재생 : 스위치를 켜는 탭(사용자 제스처) 안에서 재생 요소를 무음으로 1번 play() 해 잠금을 푼다(Pi Browser·iOS, 설계서 11절 P3).
// 기능 탐지 : Audio·Blob URL 이 없으면 스위치를 숨긴다(UA 판정 금지). 더빙 켜짐은 저장하지 않는다 — 다음 입장 때 제스처 없이 켜면 소리가 막힌다
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { featureStore, remoteVolume, useStore, type RoomCtx, type RoomFeature } from '../../extensions'
import { SwitchRow } from '../sheet'
import { parseCaption } from '../captions/caption-rules'
import { translateCaption } from '../captions/translate'
import { isUuid } from '@/lib/seminar-rules'
import { DUB_DUCK, dubRate, pushDub } from '@/lib/speech-rules'

export const dubOn = featureStore(false)
const dubLang = featureStore('') // 듣는 언어('' = 원문 → 더빙 없음). 자막 시트 언어 선택을 DubRow 가 옮겨 담는다

type Item = { ac: AbortController; audio: Promise<Blob | null> }
let el: HTMLAudioElement | null = null
let queue: Item[] = []
let playing = false
let gen = 0
let curUrl: string | null = null

const canDub = () => typeof Audio !== 'undefined' && typeof URL !== 'undefined' && !!URL.createObjectURL

// 무음 WAV(8kHz 8bit mono 0.05초) — 제스처 안 잠금 해제용
function silentWav() {
  const n = 400
  const b = new DataView(new ArrayBuffer(44 + n))
  const s = (o: number, t: string) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)))
  s(0, 'RIFF')
  b.setUint32(4, 36 + n, true)
  s(8, 'WAVEfmt ')
  b.setUint32(16, 16, true)
  b.setUint16(20, 1, true) // PCM
  b.setUint16(22, 1, true) // mono
  b.setUint32(24, 8000, true)
  b.setUint32(28, 8000, true)
  b.setUint16(32, 1, true)
  b.setUint16(34, 8, true)
  s(36, 'data')
  b.setUint32(40, n, true)
  for (let i = 0; i < n; i++) b.setUint8(44 + i, 128) // 8bit 무음 = 128
  return URL.createObjectURL(new Blob([b.buffer], { type: 'audio/wav' }))
}

// 제스처 안에서만 부른다 — 요소를 만들고 무음 재생으로 잠금 해제
function unlock(onBlocked: () => void) {
  if (!el) el = new Audio()
  el.preservesPitch = true // 속도를 바꿔도 음높이 유지(기본값이지만 명시)
  const url = silentWav()
  el.src = url
  el.play().then(
    () => URL.revokeObjectURL(url),
    (e: unknown) => {
      URL.revokeObjectURL(url)
      if (e instanceof DOMException && e.name === 'AbortError') return // 첫 번역 음성이 무음을 밀어냄 = 이미 풀림
      dubOn.set(false)
      onBlocked()
    },
  )
}

// 끄기·퇴장 — 세대(gen)를 올려 기다리던 pump 가 아무것도 건드리지 않고 끝나게 한다
function stopAll() {
  gen++
  for (const it of queue) it.ac.abort()
  queue = []
  playing = false
  if (curUrl) URL.revokeObjectURL(curUrl)
  curUrl = null
  if (el) {
    el.onended = el.onerror = el.onloadedmetadata = null
    el.pause()
    el.removeAttribute('src')
    el.load()
  }
}

async function pump() {
  if (playing || !el) return
  const it = queue[0]
  if (!it) return
  playing = true
  const g = gen
  const blob = await it.audio
  if (g !== gen) return // 그사이 꺼짐(stopAll 이 정리함)
  const done = () => {
    if (queue[0] === it) queue.shift()
    playing = false
    void pump()
  }
  // 기다리는 동안 큐 넘침으로 버려졌거나 실패한 문장 → 다음으로
  if (queue[0] !== it || !blob || !el) return done()
  const a = el
  const url = URL.createObjectURL(blob)
  curUrl = url
  const end = () => {
    if (g !== gen) return
    a.onended = a.onerror = a.onloadedmetadata = null
    URL.revokeObjectURL(url)
    curUrl = null
    done()
  }
  a.onloadedmetadata = () => {
    a.playbackRate = dubRate(a.duration)
  }
  a.onended = end
  a.onerror = end
  a.src = url
  a.play().catch(end)
}

function enqueue(ctx: RoomCtx, text: string, src: string) {
  const lang = dubLang.get()
  if (!dubOn.get() || !lang || !isUuid(ctx.seminarId)) return
  const ac = new AbortController()
  // 번역은 자막 화면(SA8)과 같은 translateCaption — 같은 문장·언어는 번역 요청 1회(A-3). 서버는 받은 글을 그대로 읽기만 한다
  const audio = translateCaption(text, src, lang, ctx.seminarId)
    .then((said) =>
      said === null || ac.signal.aborted
        ? null
        : piFetch('/api/speech/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ smnId: ctx.seminarId, text: said, lang }),
            signal: ac.signal,
          }).then((r) => (r.ok ? r.blob() : null)), // 429·502 등은 그 문장만 건너뜀(자막은 그대로)
    )
    .catch(() => null)
  const r = pushDub(queue, { ac, audio })
  for (const d of r.dropped) d.ac.abort()
  queue = r.q
  void pump()
}

// 자막 시트 안 스위치 — lang = 시트의 듣는 언어('' = 원문이면 숨김)
export function DubRow({ lang }: { lang: string }) {
  const t = useTranslations('room.dubbing')
  const on = useStore(dubOn)
  const [ok, setOk] = useState(false) // 기능 탐지는 마운트 뒤(서버 렌더와 어긋나지 않게)
  useEffect(() => setOk(canDub()), [])
  useEffect(() => {
    // 언어를 바꾸면 이미 받은 이전 언어 음성은 버린다
    if (dubLang.get() !== lang) stopAll()
    dubLang.set(lang)
    if (!lang) dubOn.set(false)
  }, [lang])
  if (!lang || !ok) return null
  return (
    <SwitchRow
      label={t('listen')}
      on={on}
      onChange={(v) => {
        if (v) unlock(() => alertBlocked?.())
        dubOn.set(v)
      }}
    />
  )
}

// 재생 거부 알림 — Overlay 가 ctx.notice 를 걸어 둔다(DubRow 는 ctx 가 없다)
let alertBlocked: (() => void) | null = null

// 켜짐·꺼짐 반영 — 원음 덕킹, 끄면 큐 정리
function DubbingOverlay({ ctx }: { ctx: RoomCtx }) {
  const on = useStore(dubOn)
  useEffect(() => {
    alertBlocked = () => ctx.notice('dubbing.blocked')
  })
  useEffect(() => {
    remoteVolume.set(on ? DUB_DUCK : 1)
    if (!on) stopAll()
  }, [on])
  useEffect(
    () => () => {
      alertBlocked = null
    },
    [],
  )
  return null
}

export const dubbing: RoomFeature = {
  id: 'dubbing',
  Overlay: DubbingOverlay,
  onApp: (m, ctx) => {
    if (m.topic !== 'caption' || !dubOn.get()) return
    const c = parseCaption(m.d)
    if (c) enqueue(ctx, c.text, c.lang)
  },
  onReset: () => {
    dubOn.reset()
    dubLang.reset()
    remoteVolume.reset()
    stopAll()
  },
}
