'use client'
// @pi/mon 브라우저 계측 — 이 브라우저가 부른 같은 출처 /api/* 응답의 경로·시간·상태를 Resource Timing 으로 모아 15초마다(또는 화면을 떠날 때) 묶어 send 로 전송
// send = 그 앱의 인증 fetch(piFetch 등)로 /api/mon/app 에 POST — 401 이면 그 화면에서는 더 보내지 않음. /api/mon/* 은 제외(자기 증폭 방지)
import { useEffect } from 'react'
import { normRoute, type RawSample } from './index'

// page = 화면 경로 변환(예 : locale 접두 /ko 제거 — 화면 집계가 locale 별로 쪼개지지 않게), 모듈 범위 함수로 넘길 것
export function Rum({ send, page }: { send: (body: string) => Promise<Response>; page?: (path: string) => string }) {
  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return
    const buf: RawSample[] = []
    let off = false
    const ob = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceResourceTiming[]) {
        if (e.initiatorType !== 'fetch' && e.initiatorType !== 'xmlhttprequest') continue
        if (!e.name.startsWith(location.origin) || !normRoute(e.name)) continue
        // responseStatus 미지원 브라우저(일부 WebView)는 1 = 알 수 없음 — 0(실패)으로 채우면 모든 요청이 오류로 집계됨
        const st = 'responseStatus' in e ? ((e as PerformanceResourceTiming & { responseStatus: number }).responseStatus ?? 1) : 1
        buf.push({ r: e.name, t: Math.round(performance.timeOrigin + e.responseEnd), ms: Math.round(e.duration), st, p: page ? page(location.pathname) : location.pathname })
        if (buf.length > 500) buf.shift()
      }
    })
    ob.observe({ type: 'resource', buffered: true })
    const flush = () => {
      if (off || !buf.length) return
      const s = buf.splice(0, buf.length)
      void send(JSON.stringify({ s }))
        .then((r) => {
          if (r.status === 401) off = true
        })
        .catch(() => {})
    }
    const tm = setInterval(flush, 15_000)
    const hide = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', hide)
    return () => {
      clearInterval(tm)
      document.removeEventListener('visibilitychange', hide)
      ob.disconnect()
      flush()
    }
  }, [send, page])
  return null
}
