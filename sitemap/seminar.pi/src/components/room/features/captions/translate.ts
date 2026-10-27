'use client'
// 번역 자막(SA8) — 최신 자막을 내가 고른 언어로 /api/speech/translate(piFetch — Pi Browser 는 쿠키가 없어 X-Pi-Token) 요청.
// 번역이 오기 전·실패(한도·오류) 땐 원문을 그대로 보인다. 자막 언어가 대상과 같으면 요청하지 않는다. 같은 문장은 화면 안 작은 캐시로 재요청 없음(토글 왕복)
import { useEffect, useState } from 'react'
import { piFetch } from '@pi/auth/client'
import { sameLang } from '@/lib/translate-rules'

const local = new Map<string, string>() // ponytail: 100개 넘으면 통째로 비움 — 세미나 1회 안에선 충분

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
    if (!key || local.has(key)) return
    const ac = new AbortController()
    const [l, text] = [key.slice(0, key.indexOf('\n')), key.slice(key.indexOf('\n') + 1)]
    piFetch('/api/speech/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ smnId, text, lang: l }),
      signal: ac.signal,
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ text?: unknown }>) : null))
      .then((j) => {
        if (typeof j?.text !== 'string') return
        if (local.size >= 100) local.clear()
        local.set(key, j.text)
        setOut({ key, text: j.text })
      })
      .catch(() => {}) // 취소·네트워크 오류 = 원문 유지
    return () => ac.abort()
  }, [key, smnId])

  if (skip) return cap?.text ?? null
  return local.get(key) ?? (out?.key === key ? out.text : cap.text)
}
