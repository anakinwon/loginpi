'use client'

// 하단 구획(그래프·표) 조회 훅 — 보관 단위(캐시 키) = 조회 URL 전체(pc·type·q·sort·page 포함, c4 D-011).
//  URL 이 바뀌면 이전 URL 의 데이터·오류는 즉시 숨기고(null) 로딩 표시 — 새 조건 조회가 실패해도 이전 조건(다른 PC·다른 탭·다른 페이지)의 행은 보이지 않는다(c4 D-008·D-011)
//  URL 에 측정 고정값(pc·at·hash)이 들어 있어 새 측정이면 키가 바뀐다. 응답의 at 이 요청 at 과 다르면 버린다(c4 D-012)
//  tick(요약 polling·새로고침 버튼마다 증가)만 바뀌면 직전 조회가 실패했을 때만 다시 조회 — 실패 구획은 측정 시각과 무관하게 재시도(c4 D-007)
//  응답 전에 정리(cleanup)되면 그 키를 '안 받음'으로 되돌리고 진행 중 요청은 취소 — 늦은 응답이 새 조건을 덮어쓰지 않는다
import { useEffect, useRef, useState } from 'react'
import { piFetch } from '@pi/auth/client'
import { readApi, type ApiErrorBody } from '@/lib/client-api'

interface Held<T> {
  url: string
  data: T | null
  err: ApiErrorBody | null
}

export function useSection<T extends { at?: string }>(url: string, at: string, tick: number) {
  const [held, setHeld] = useState<Held<T>>({ url, data: null, err: null })
  const [busy, setBusy] = useState(false)
  const last = useRef<string | null>(null)
  const failed = useRef(false)

  useEffect(() => {
    const key = `${url}|${at}`
    if (key === last.current && !failed.current) return
    last.current = key
    const ctrl = new AbortController()
    let done = false
    setBusy(true)
    void readApi<T>(piFetch(url, { cache: 'no-store', signal: ctrl.signal })).then((r) => {
      done = true
      if (ctrl.signal.aborted) return
      // 다른 측정(at)의 응답은 버림 — 화면의 현재 요약 측정과 같은 것만 반영(c4 D-012).
      //  실패로 취급해 오류를 표시하고 다음 tick 에 재조회한다(로딩 표시 고착·재조회 누락 방지, c4 D-013)
      if (r.ok && r.data.at !== at) {
        failed.current = true
        setHeld((h) => ({ url, data: h.url === url ? h.data : null, err: { code: 'STALE_SNAPSHOT' } }))
        setBusy(false)
        return
      }
      failed.current = !r.ok
      // 성공 = 새 데이터, 실패 = 같은 URL 의 이전 데이터만 유지(다른 조건 데이터는 버림)
      setHeld((h) => (r.ok ? { url, data: r.data, err: null } : { url, data: h.url === url ? h.data : null, err: r.body }))
      setBusy(false)
    })
    return () => {
      ctrl.abort()
      if (!done) last.current = null
    }
  }, [url, at, tick])

  // 보관분이 다른 URL 것이면 렌더 시점에 즉시 숨김(새 응답 전에도 이전 조건 자료가 한 프레임도 안 보이게)
  const mine = held.url === url
  return { data: mine ? held.data : null, err: mine ? held.err : null, busy: busy || !mine }
}
