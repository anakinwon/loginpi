'use client'
// 번역 자막(SA8) — 최신 자막을 내가 고른 언어로 /api/speech/translate(piFetch — Pi Browser 는 쿠키가 없어 X-Pi-Token) 요청.
// 번역이 오기 전·실패(한도·오류) 땐 원문을 그대로 보인다. 자막 언어가 대상과 같으면 요청하지 않는다. 같은 문장은 화면 안 작은 캐시로 재요청 없음(토글 왕복)
// translateCaption 은 더빙(SA9)도 같이 쓴다 — 같은 문장·언어는 진행 중 Promise 를 나눠 받아 번역 요청 1회(계획 A-3, R-P2)
import { useEffect, useState } from 'react'
import { piFetch } from '@pi/auth/client'
import { sameLang, sigFresh } from '@/lib/translate-rules'

type Tr = { text: string; sig?: string } // sig = 서버가 번역문에 붙인 서명(D-2, 더빙 /api/speech/tts 에 그대로 보냄)
// v = 끝난 결과(대기 중이면 없음). 결과의 서명이 만료(10분)에 가까우면 다시 요청 — 상투 문장이 10분 뒤 다시 나와도 더빙이 빠지지 않게
const local = new Map<string, { p: Promise<Tr | null>; v?: Tr }>() // ponytail: 100개 넘으면 통째로 비움 — 세미나 1회 안에선 충분

// 자막 1문장 번역 — 같은 원문 언어면 원문 그대로, 실패 = null(캐시에 남기지 않아 다음에 다시 시도).
// sig = 원문 자막 서명 — 서버는 서명된 자막만 번역(D-2)하므로 서명 없는 자막(옛 엔진 화면)은 요청하지 않고 null(원문 표시)
export function translateCaption(text: string, src: string, lang: string, smnId: string, sig?: string): Promise<Tr | null> {
  if (sameLang(src, lang)) return Promise.resolve({ text })
  if (!sig) return Promise.resolve(null)
  const key = `${lang}
${text}`
  const hit = local.get(key)
  if (hit && (!hit.v || sigFresh(hit.v.sig, Date.now()))) return hit.p
  const p: Promise<Tr | null> = piFetch('/api/speech/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ smnId, text, lang, sig }),
  })
    .then((r) => (r.ok ? (r.json() as Promise<{ text?: unknown; sig?: unknown }>) : null))
    .then((j) =>
      typeof j?.text === 'string' ? { text: j.text, ...(typeof j.sig === 'string' ? { sig: j.sig } : {}) } : null,
    )
    .catch(() => null)
  if (local.size >= 100) local.clear()
  const e: { p: Promise<Tr | null>; v?: Tr } = { p }
  local.set(key, e)
  void p.then((v) => {
    if (local.get(key) !== e) return
    if (v === null) local.delete(key)
    else e.v = v
  })
  return p
}

export function useTranslated(
  cap: { text: string; lang: string; sig?: string } | null,
  on: boolean,
  lang: string,
  smnId: string,
) {
  const [out, setOut] = useState<{ key: string; text: string } | null>(null)
  const skip = !cap || !on || sameLang(cap.lang, lang)
  const key = skip ? '' : `${lang}\n${cap.text}`

  useEffect(() => {
    if (!key || !cap) return
    let live = true
    void translateCaption(cap.text, cap.lang, lang, smnId, cap.sig).then((t) => {
      if (live && t !== null) setOut({ key, text: t.text })
    })
    return () => {
      live = false
    }
  }, [key, smnId, cap?.sig]) // eslint-disable-line react-hooks/exhaustive-deps

  if (skip) return cap?.text ?? null
  return out?.key === key ? out.text : cap.text
}
