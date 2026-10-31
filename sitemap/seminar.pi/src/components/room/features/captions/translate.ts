'use client'
// 번역 자막(SA8) — 최신 자막을 내가 고른 언어로 /api/speech/translate(piFetch — Pi Browser 는 쿠키가 없어 X-Pi-Token) 요청.
// 번역이 오기 전·실패(한도·오류)·서명 없는 자막(sig null — 옛 화면이 보낸 자막 등) 땐 원문을 그대로 보인다(서버는 서명된 자막만 번역, 보안 검토 D-2). 자막 언어가 대상과 같으면 요청하지 않는다. 같은 문장은 화면 안 작은 캐시로 재요청 없음(토글 왕복)
// translateCaption 은 더빙(SA9)도 같이 쓴다 — 같은 문장·언어는 진행 중 Promise 를 나눠 받아 번역 요청 1회(계획 A-3, R-P2)
// 되풀이되는 실패(권한 없음·AI 미설정·세미나 한도, trStopOf)는 trStop 에 남기고 이번 입장 동안 요청을 멈춘다 — 자막 시트가 사유를 알린다
// 언어를 바꾸면 TR_LANG_SETTLE_MS 동안 더 안 바뀔 때만 요청(select 화살표 훑기 = 언어마다 외부 AI 호출 방지)
import { useEffect, useState } from 'react'
import { piFetch } from '@pi/auth/client'
import { hasWords, sameLang, shownOf, TR_LANG_SETTLE_MS, trStopOf, type TrOut, type TrStop } from '@/lib/translate-rules'
import { featureStore, useStore } from '../../extensions'
import { preOf } from './caption-rules'

type Said = { text: string; sig: string | null }
const local = new Map<string, Promise<Said | null>>() // ponytail: 100개 넘으면 통째로 비움 — 세미나 1회 안에선 충분
export const trStop = featureStore<TrStop | null>(null) // 번역 요청 중단 사유(입장 단위 — 자막 기능 onReset 이 지운다)

// 자막 1문장 번역 — 같은 원문 언어면 원문(과 그 서명) 그대로, 서명 없음·중단·실패 = null(실패는 캐시에서 지워 다음에 다시 시도)
// 돌려주는 sig = 결과 글의 서버 서명 — 더빙이 /api/speech/tts 에 그대로 보낸다
export function translateCaption(
  text: string,
  src: string,
  lang: string,
  smnId: string,
  sig: string | null,
  pre: Said | null = null, // 서버 선번역(자막 d 의 tr·trSig, 마스터 A안 2026-10-31) — 있으면 요청 없이 그대로(캐시에도 둔다)
): Promise<Said | null> {
  // 같은 언어·글자 없는 자막(숫자·기호뿐, 보강 r6 T08) = 원문 그대로 — 번역 요청·계량 없음
  if (sameLang(src, lang) || !hasWords(text)) return Promise.resolve({ text, sig })
  // 선번역은 캐시에 넣지 않는다 — 자막 d 는 무대 역할이 보낸 값이라, 캐시하면 조작된 번역이 같은 원문의 다음 자막까지 덮는다(보안 검토 2026-10-31). 그 자막 1개에만 쓴다
  if (pre?.text) return Promise.resolve(pre)
  if (!sig || trStop.get()) return Promise.resolve(null)
  const key = [smnId, lang, text].join('\n') // 결과 sig 가 세미나별이라 세미나도 키에
  let p = local.get(key)
  if (!p) {
    p = piFetch('/api/speech/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ smnId, text, lang, sig }),
    })
      .then(async (r) => {
        if (r.ok) return r.json() as Promise<{ text?: unknown; sig?: unknown }>
        const why = trStopOf(r.status, ((await r.json().catch(() => null)) as { code?: unknown } | null)?.code)
        if (why) trStop.set(why)
        return null
      })
      .then((j) =>
        typeof j?.text === 'string' ? { text: j.text, sig: typeof j.sig === 'string' ? j.sig : null } : null,
      )
      .catch(() => null)
    if (local.size >= 100) local.clear()
    local.set(key, p)
    void p.then((v) => {
      if (v === null && local.get(key) === p) local.delete(key)
    })
  }
  return p
}

// 보일 자막 글과 그 언어(lang 속성 — 한자 글꼴 선택·화면 낭독기 발음) — 번역 대기 중엔 직전 번역(shownOf), 실패·중단이면 원문과 원문 언어
export function useTranslated(
  cap: { text: string; lang: string; sig: string | null; at: number; tr?: Record<string, string>; trSig?: Record<string, string> } | null,
  on: boolean,
  lang: string,
  smnId: string,
): { text: string; lang: string } | null {
  const [out, setOut] = useState<TrOut | null>(null)
  const [failKey, setFailKey] = useState('')
  const [reqLang, setReqLang] = useState(lang)
  const stop = useStore(trStop)
  useEffect(() => {
    if (lang === reqLang) return
    const id = setTimeout(() => setReqLang(lang), TR_LANG_SETTLE_MS)
    return () => clearTimeout(id)
  }, [lang, reqLang])
  const skip = !cap || !on || !cap.sig || !!stop || sameLang(cap.lang, reqLang) || !hasWords(cap.text)
  const key = skip ? '' : `${reqLang}\n${cap.text}`

  useEffect(() => {
    if (!key || !cap) return
    let live = true
    void translateCaption(cap.text, cap.lang, reqLang, smnId, cap.sig, preOf(cap, reqLang)).then((t) => {
      if (!live) return
      if (t === null) setFailKey(key)
      else setOut({ key, text: t.text, lang: reqLang, at: Date.now() })
    })
    return () => {
      live = false
    }
  }, [key, smnId]) // eslint-disable-line react-hooks/exhaustive-deps

  return shownOf(cap, key, reqLang, out, failKey, cap?.at ?? 0)
}
