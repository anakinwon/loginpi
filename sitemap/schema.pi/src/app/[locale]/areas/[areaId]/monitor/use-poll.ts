'use client'
// 모니터링 화면 갱신 — LIVE 면 ms 마다 다시 조회(이전 요청이 끝난 뒤 다음 예약 = 겹침 없음), 탭이 가려지면 멈춤
import { piFetch } from '@pi/auth/client'
import { useCallback, useEffect, useRef, useState } from 'react'

export function usePoll<T>(url: string | null, live: boolean, ms = 10_000) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const [at, setAt] = useState<Date | null>(null)
  const busy = useRef<string | null>(null) // 진행 중인 요청의 주소(같은 주소만 겹침 방지 — 주소가 바뀌면 바로 새로 조회)
  const cur = useRef(url) // 응답이 왔을 때 화면의 주소가 바뀌었으면 버림(접속·기간 전환 중 이전 응답 표시 방지)
  cur.current = url
  const load = useCallback(async () => {
    if (!url || busy.current === url) return
    busy.current = url
    try {
      const j = await (await piFetch(url)).json()
      if (cur.current !== url) return
      if (j.ok === false) setErr(j.message ?? '불러오지 못했습니다')
      else {
        setErr('')
        setData(j as T)
      }
      setAt(new Date())
    } catch {
      setErr('불러오지 못했습니다(네트워크)')
    } finally {
      if (busy.current === url) busy.current = null
    }
  }, [url])
  useEffect(() => {
    setData(null)
    void load()
  }, [load])
  useEffect(() => {
    if (!live || !url) return
    let tm: ReturnType<typeof setTimeout>
    const tick = async () => {
      if (document.visibilityState === 'visible') await load()
      tm = setTimeout(tick, ms)
    }
    tm = setTimeout(tick, ms)
    return () => clearTimeout(tm)
  }, [live, url, ms, load])
  return { data, err, at, reload: load }
}
