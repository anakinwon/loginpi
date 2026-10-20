'use client'
// 애플리케이션 모니터링 계측(2026-10-21) — 이 브라우저가 부른 같은 출처 /api/* 응답의 경로·시간·상태를 Resource Timing 으로 모아 15초마다(또는 화면을 떠날 때) 묶어 전송
// 서버 쪽 코드 변경 없이 모든 API 를 잼. 표본마다 화면 경로를 붙여 느림·오류가 어느 화면에서 났는지 남김(sql/069). 로그인 안 된 화면은 첫 전송이 401 이면 그 화면에서는 더 보내지 않음. /api/mon/* 은 제외(자기 증폭 방지)
import { piFetch } from '@pi/auth/client'
import { useEffect } from 'react'
import { normRoute } from '@/lib/mon'

type S = { r: string; t: number; ms: number; st: number; p: string } // p = 요청이 나온 화면 경로(관측 시점, 서버가 normPage 로 정규화)

export default function Rum() {
  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return
    const buf: S[] = []
    let off = false
    const ob = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceResourceTiming[]) {
        if (e.initiatorType !== 'fetch' && e.initiatorType !== 'xmlhttprequest') continue
        if (!e.name.startsWith(location.origin) || !normRoute(e.name)) continue
        buf.push({ r: e.name, t: Math.round(performance.timeOrigin + e.responseEnd), ms: Math.round(e.duration), st: (e as PerformanceResourceTiming & { responseStatus?: number }).responseStatus ?? 0, p: location.pathname })
        if (buf.length > 500) buf.shift()
      }
    })
    ob.observe({ type: 'resource', buffered: true })
    const flush = () => {
      if (off || !buf.length) return
      const s = buf.splice(0, buf.length)
      void piFetch('/api/mon/app', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ s }) })
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
  }, [])
  return null
}
