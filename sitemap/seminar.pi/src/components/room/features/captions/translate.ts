'use client'
// 번역 자막(SA8) — 최신 자막을 내가 고른 언어로 /api/speech/translate(piFetch — Pi Browser 는 쿠키가 없어 X-Pi-Token) 요청.
// 번역이 오기 전·실패(한도·오류) 땐 원문을 그대로 보인다. 자막 언어가 대상과 같으면 요청하지 않는다. 같은 문장은 화면 안 작은 캐시로 재요청 없음(토글 왕복)
// translateCaption 은 더빙(SA9)도 같이 쓴다 — 같은 문장·언어는 진행 중 Promise 를 나눠 받아 번역 요청 1회(계획 A-3, R-P2)
import { useEffect, useState } from 'react'
import { piFetch } from '@pi/auth/client'
import { sameLang } from '@/lib/translate-rules'

const local = new Map<string, Promise<string | null>>() // ponytail: 100개 넘으면 통째로 비움 — 세미나 1회 안에선 충분

// 자막 1문장 번역 — 같은 원문 언어면 원문 그대로, 실패 = null(캐시에서 지워 다음에 다시 시도)
export function translateCaption(text: string, src: string, lang: string, smnId: string) {
  if (sameLang(src, lang)) return Promise.resolve(text)
  const key = `${lang}\n${text}`
  let p = local.get(key)
  if (!p) {
    p = piFetch('/api/speech/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ smnId, text, lang }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ text?: unknown }>) : null))
      .then((j) => (typeof j?.text === 'string' ? j.text : null))
      .catch(() => null)
    if (local.size >= 100) local.clear()
    local.set(key, p)
    void p.then((v) => {
      if (v === null && local.get(key) === p) local.delete(key)
    })
  }
  return p
}

export function useTranslated(
  cap: { text: string; lang: string } | null,
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
    void translateCaption(cap.text, cap.lang, lang, smnId).then((t) => {
      if (live && t !== null) setOut({ key, text: t })
    })
    return () => {
      live = false
    }
  }, [key, smnId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (skip) return cap?.text ?? null
  return out?.key === key ? out.text : cap.text
}
