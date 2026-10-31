'use client'

// 도착 워프 — sitemap.pi 에서 음속 돌파로 떠난 사용자가 도착 사이트에서 '음속으로 접근해 멈추는' 반대 연출(마스터 지시 2026-11-01).
//  1.6초 : 0~ 소닉붐 링이 크게 퍼진 채 중심으로 모이며 사라짐 + 플래시(감속 충격파) → 별이 최고속(줄무늬)에서 0 으로 감속(canvas) → 1.1초부터 어둠이 걷히며 화면이 드러남 → 해제.
//  판정·표시 규칙은 index.ts(utm_source=sitemap.pi 또는 referrer). 재생 뒤 주소의 표시를 지우고 sessionStorage 로 새로고침 재생을 막는다.
//  입력을 막지 않는다(pointer-events none) — Pi 로그인·결제 진행과 무관. sitemap.pi 워프처럼 움직임 줄이기 설정에도 재생(마스터 2026-10-16 "모바일도 동일").
//  HTML canvas·요소 CSS 만 사용(모바일 WebView SVG transform 금지 철칙 무관), 저사양 보호 : DPR 캡 1.5, 끝나면 rAF 정지·언마운트
import { useEffect, useRef, useState } from 'react'
import { isWarpArrival, stripWarp } from './index'

const C = {
  ms: 1600, // 전체 길이
  revealAt: 1100, // 어둠이 걷히기 시작
  count: 160,
  vStart: 0.09, // 프레임당 z 감소량(sitemap.pi warp 0.08 보다 약간 빠르게 진입)
  dprCap: 1.5,
  color: '200, 225, 255',
  bg: '#070a12',
  doneKey: 'pi_warp_in', // sessionStorage — 이 탭에서 이미 재생(새로고침 재생 방지)
} as const

type Star = { x: number; y: number; z: number; pz: number }

const CSS = `
@keyframes pi-warp-boom { 0% { transform: translate(-50%,-50%) scale(1.6); opacity: .9 } 100% { transform: translate(-50%,-50%) scale(.1); opacity: 0 } }
@keyframes pi-warp-flash { 0% { opacity: .85 } 100% { opacity: 0 } }
@keyframes pi-warp-reveal { 0% { opacity: 1 } 100% { opacity: 0 } }
`

export function WarpArrival() {
  const [on, setOn] = useState(false)
  const ref = useRef<HTMLCanvasElement>(null)

  // 도착 판정은 마운트 뒤 1번(SSR 과 첫 렌더는 아무것도 안 그림 → 하이드레이션 불일치 없음)
  useEffect(() => {
    let play = false
    try {
      play = isWarpArrival(location.href, document.referrer) && !sessionStorage.getItem(C.doneKey)
      if (play) sessionStorage.setItem(C.doneKey, '1')
    } catch {
      play = isWarpArrival(location.href, document.referrer)
    }
    const clean = stripWarp(location.href)
    if (clean) history.replaceState(history.state, '', clean)
    if (!play) return
    setOn(true) // eslint-disable-line react-hooks/set-state-in-effect -- 브라우저 전용 값(referrer·주소)으로 1번 판정
    const t = window.setTimeout(() => setOn(false), C.ms)
    return () => window.clearTimeout(t)
  }, [])

  // 별 감속 — 최고속에서 시작해 남은 시간 비율의 제곱으로 0 에 수렴(멈추는 느낌)
  useEffect(() => {
    if (!on) return
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const rnd = () => Math.random() * 2 - 1
    const stars: Star[] = Array.from({ length: C.count }, () => ({ x: rnd(), y: rnd(), z: Math.random(), pz: 0 }))
    const dpr = Math.min(window.devicePixelRatio || 1, C.dprCap)
    const w = cv.clientWidth
    const h = cv.clientHeight
    cv.width = Math.round(w * dpr)
    cv.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const t0 = performance.now()
    let raf = 0
    const frame = (now: number) => {
      const p = Math.min(1, (now - t0) / C.ms)
      const v = C.vStart * (1 - p) * (1 - p)
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2
      const f = Math.min(w, h) * 0.9
      ctx.lineCap = 'round'
      for (const s of stars) {
        s.pz = s.z
        s.z -= v
        if (s.z <= 0.02) {
          s.x = rnd()
          s.y = rnd()
          s.z = 1
          s.pz = 1
        }
        const k = f / s.z
        const pk = f / s.pz
        ctx.strokeStyle = `rgba(${C.color}, ${(1 - s.z) * 0.9})`
        ctx.lineWidth = (1 - s.z) * 2 + 0.3
        ctx.beginPath()
        ctx.moveTo(cx + s.x * pk, cy + s.y * pk)
        ctx.lineTo(cx + s.x * k + 0.01, cy + s.y * k) // 멈춘 별도 점으로 보이게 0.01 보정
        ctx.stroke()
      }
      if (p < 1) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [on])

  if (!on) return null
  const fill = { position: 'fixed', inset: 0, pointerEvents: 'none' } as const
  return (
    <div aria-hidden style={{ ...fill, zIndex: 2147483000 }}>
      <style>{CSS}</style>
      <div
        style={{
          ...fill,
          background: `radial-gradient(ellipse at center, rgba(7,10,18,.55), ${C.bg} 70%)`,
          animation: `pi-warp-reveal ${C.ms - C.revealAt}ms ease-in ${C.revealAt}ms forwards`,
        }}
      >
        <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
      {/* 감속 충격파 — 떠날 때 소닉붐(퍼지는 링)의 역재생 : 크게 퍼진 링이 중심으로 모이며 사라짐 */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          width: '60vmin',
          height: '60vmin',
          borderRadius: '50%',
          border: '3px solid rgba(200,225,255,.8)',
          boxShadow: '0 0 40px rgba(120,170,255,.6), inset 0 0 40px rgba(120,170,255,.4)',
          animation: 'pi-warp-boom 700ms ease-out forwards',
        }}
      />
      <div style={{ ...fill, background: 'rgba(220,235,255,.9)', animation: 'pi-warp-flash 350ms ease-out forwards' }} />
    </div>
  )
}
