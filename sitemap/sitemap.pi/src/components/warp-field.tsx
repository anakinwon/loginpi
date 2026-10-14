'use client'

// 워프 스타필드 — 외부 이동 안내(leave-dialog) 뒤에 깔리는 <canvas> 2D 별 가속 효과(마스터 지시 2026-10-14 "우주선 타고 이동하는 느낌").
//  별 160개가 화면 중심에서 z 축으로 다가오며 이전 위치 → 현재 위치를 선으로 그려 속도감을 낸다. mode 'idle' 은 천천히, 'warp'(점프) 는 최고속으로 easing.
//  HTML canvas 라 모바일 WebView 의 SVG transform 금지 철칙과 무관. 움직임 줄이기 설정은 정지 대신 1/3 속도(프로젝트 공통 규칙).
//  canvas 는 치환 요소라 inset-0 만으로는 늘어나지 않는다(고유 300×150 유지) → size-full 필수. 저사양 보호 : DPR 캡 1.5, 탭 비가시·언마운트 시 rAF 정지. 배경은 투명(은하수 배경이 비친다), 중심 어둠은 CSS radial 로.
import { useEffect, useRef } from 'react'

const C = {
  count: 160,
  idle: 0.006, // 프레임당 z 감소량
  warp: 0.08,
  ease: 0.08, // 속도 보간 계수(≈0.4s 에 수렴)
  dprCap: 1.5,
  color: '200, 225, 255', // 별 색(rgb) — 알파는 깊이로
} as const

type Star = { x: number; y: number; z: number; pz: number }

export function WarpField({
  mode,
  fixed = false,
}: {
  mode: 'idle' | 'warp'
  fixed?: boolean // true = 뷰포트 전체(메인 버블 위 떠 있는 카드), false = 부모 안(상세 인라인)
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const modeRef = useRef(mode)
  useEffect(() => {
    modeRef.current = mode // 렌더 중 ref 쓰기 금지(react-hooks/refs) — rAF 루프가 최신 mode 를 읽는다
  }, [mode])

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const slow = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 3
      : 1
    const rnd = () => Math.random() * 2 - 1
    const stars: Star[] = Array.from({ length: C.count }, () => ({
      x: rnd(),
      y: rnd(),
      z: Math.random(),
      pz: 0,
    }))
    let w = 0
    let h = 0
    let dpr = 1
    let v = C.idle / slow
    let raf = 0
    let running = true

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, C.dprCap)
      w = cv.clientWidth
      h = cv.clientHeight
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const frame = () => {
      if (!running) return
      const target = (modeRef.current === 'warp' ? C.warp : C.idle) / slow
      v += (target - v) * C.ease
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2
      const f = Math.min(w, h) * 0.9 // 투영 초점 거리
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
        const x = cx + s.x * k
        const y = cy + s.y * k
        const px = cx + s.x * pk
        const py = cy + s.y * pk
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) {
          s.z = 0.02 // 다음 프레임에 재배치
          continue
        }
        const a = (1 - s.z) * 0.9
        ctx.strokeStyle = `rgba(${C.color}, ${a})`
        ctx.lineWidth = (1 - s.z) * 2 + 0.3
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(x, y)
        ctx.stroke()
      }
      raf = requestAnimationFrame(frame)
    }
    const onVis = () => {
      running = !document.hidden
      if (running) raf = requestAnimationFrame(frame)
      else cancelAnimationFrame(raf)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(cv)
    document.addEventListener('visibilitychange', onVis)
    raf = requestAnimationFrame(frame)
    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={`warp-field pointer-events-none size-full ${
        fixed ? 'fixed inset-0 z-10' : 'absolute inset-0'
      }`}
    />
  )
}
