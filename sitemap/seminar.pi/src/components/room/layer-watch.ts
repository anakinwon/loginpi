'use client'
// 타일 <video> 의 렌더 높이·가시성 → 수신 화질 레이어(설계서 14.2). IntersectionObserver·ResizeObserver 를 화면 전체에서 1개씩만 쓰고
// (LiveKit 공용 관찰자 방식), 탭 숨김(visibilitychange)·화면 밖 2초 타이머 때 다시 판정한다. 판정식은 room-rules wantLayer
import { useEffect, useRef } from 'react'
import { LAYER, wantLayer, type Layer } from './room-rules'

type Entry = {
  height: number
  offAt: number | null
  timer?: ReturnType<typeof setTimeout>
  report: () => void
}
const entries = new Map<Element, Entry>()
let io: IntersectionObserver | null = null
let ro: ResizeObserver | null = null

const reportAll = () => entries.forEach((e) => e.report())

function observers() {
  if (io && ro) return { io, ro }
  io = new IntersectionObserver((list) => {
    for (const it of list) {
      const e = entries.get(it.target)
      if (!e) continue
      clearTimeout(e.timer)
      e.offAt = it.isIntersecting ? null : performance.now()
      // 화면 밖 2초 뒤 최저 레이어로 — 그 전에 돌아오면 타이머 취소
      if (!it.isIntersecting) e.timer = setTimeout(e.report, LAYER.offscreenMs)
      e.report()
    }
  })
  ro = new ResizeObserver((list) => {
    for (const it of list) {
      const e = entries.get(it.target)
      if (!e) continue
      e.height = it.contentRect.height
      e.report()
    }
  })
  document.addEventListener('visibilitychange', reportAll)
  return { io, ro }
}

function release(el: Element) {
  const e = entries.get(el)
  if (e) clearTimeout(e.timer)
  entries.delete(el)
  io?.unobserve(el)
  ro?.unobserve(el)
  if (entries.size) return
  // 마지막 타일이 빠지면 관찰자도 정리(다음 타일 때 새로 만든다)
  io?.disconnect()
  ro?.disconnect()
  io = ro = null
  document.removeEventListener('visibilitychange', reportAll)
}

// consumerId 가 없으면(내 미리보기·발행자 없음) 관찰하지 않는다. onLayer 는 바뀔 때마다 부르고, 디바운스·중복 제거는 useRoom 송신기가 한다
export function useLayerWatch(
  el: HTMLVideoElement | null,
  consumerId: string | undefined,
  onLayer: ((consumerId: string, maxSpatial: Layer) => void) | undefined,
) {
  const cb = useRef(onLayer)
  useEffect(() => {
    cb.current = onLayer
  })
  useEffect(() => {
    if (!el || !consumerId || typeof IntersectionObserver === 'undefined' || typeof ResizeObserver === 'undefined')
      return
    const e: Entry = {
      height: el.getBoundingClientRect().height,
      offAt: null,
      report: () =>
        cb.current?.(
          consumerId,
          wantLayer({
            height: e.height,
            dpr: window.devicePixelRatio || 1,
            offMs: e.offAt == null ? null : performance.now() - e.offAt,
            hidden: document.visibilityState === 'hidden',
          }),
        ),
    }
    entries.set(el, e)
    const o = observers()
    o.io.observe(el)
    o.ro.observe(el)
    e.report()
    return () => release(el)
  }, [el, consumerId])
}
