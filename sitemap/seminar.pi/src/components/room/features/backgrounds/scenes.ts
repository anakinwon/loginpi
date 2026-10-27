'use client'
// 움직이는 배경 4종(마스터 2026-10-28, 데스크톱 전용) — 동영상 파일 없이 캔버스로 그린다(저작권·용량 0, 기기 밖으로 나가는 것 없음).
// 장면 = (ctx, t) => void : 640×360 기준 좌표에 t초 시점을 그린다. 엔진(engine.ts)이 30fps 이하로 다시 그려 출력 크기로 늘린다.
// 무작위 위치는 시드 고정(mulberry32) — 같은 장면은 늘 같은 배치(깜박임·재배치 없음)

export const SW = 640
export const SH = 360
export type Scene = (c: CanvasRenderingContext2D, t: number) => void

function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function vgrad(c: CanvasRenderingContext2D, y0: number, y1: number, stops: [number, string][]) {
  const g = c.createLinearGradient(0, y0, 0, y1)
  for (const [o, col] of stops) g.addColorStop(o, col)
  return g
}

// ── 1. 몰디브 해변 — 하늘·해·청록 바다 물결 여러 겹·밀려왔다 빠지는 흰 파도·흔들리는 야자수
const BEACH = (() => {
  const r = rng(7)
  return { glints: Array.from({ length: 40 }, () => ({ x: r() * SW, y: 175 + r() * 90, p: r() * 6 })) }
})()
const beach: Scene = (c, t) => {
  c.fillStyle = vgrad(c, 0, 180, [[0, '#4fb3e8'], [0.7, '#a8dcf2'], [1, '#e8f6fb']])
  c.fillRect(0, 0, SW, 180)
  const sun = c.createRadialGradient(470, 70, 5, 470, 70, 80)
  sun.addColorStop(0, 'rgba(255,255,240,1)')
  sun.addColorStop(0.25, 'rgba(255,250,210,0.8)')
  sun.addColorStop(1, 'rgba(255,250,210,0)')
  c.fillStyle = sun
  c.fillRect(380, 0, 180, 160)
  // 바다 — 먼 곳 진한 청록에서 가까운 곳 밝은 옥색
  c.fillStyle = vgrad(c, 170, 300, [[0, '#0e7fa6'], [0.5, '#1fb5c4'], [1, '#6fe3d6']])
  c.fillRect(0, 170, SW, 190)
  for (let i = 0; i < 6; i++) {
    const base = 185 + i * 22
    c.beginPath()
    c.moveTo(0, base)
    for (let x = 0; x <= SW; x += 16) c.lineTo(x, base + Math.sin(x / (40 + i * 8) + t * (0.8 + i * 0.15) + i) * (1.5 + i * 0.7))
    c.strokeStyle = `rgba(255,255,255,${0.12 + i * 0.03})`
    c.lineWidth = 1 + i * 0.3
    c.stroke()
  }
  for (const g of BEACH.glints) {
    const a = Math.max(0, Math.sin(t * 2 + g.p)) ** 6
    c.fillStyle = `rgba(255,255,255,${a * 0.9})`
    c.fillRect(g.x + Math.sin(t + g.p) * 4, g.y, 3, 1)
  }
  // 모래사장 + 밀려오는 파도(물가 선이 앞뒤로)
  const shore = 290 + Math.sin(t * 0.7) * 10
  c.fillStyle = vgrad(c, shore, SH, [[0, '#f4e3c1'], [1, '#e6cc9a']])
  c.beginPath()
  c.moveTo(0, SH)
  c.lineTo(0, shore + 20)
  for (let x = 0; x <= SW; x += 20) c.lineTo(x, shore + Math.sin(x / 70 + t * 0.7) * 6 + (x / SW) * 25)
  c.lineTo(SW, SH)
  c.fill()
  c.beginPath()
  for (let x = 0; x <= SW; x += 10) {
    const y = shore - 3 + Math.sin(x / 70 + t * 0.7) * 6 + (x / SW) * 25 + Math.sin(x / 13 + t * 3) * 1.5
    if (x === 0) c.moveTo(x, y)
    else c.lineTo(x, y)
  }
  c.strokeStyle = 'rgba(255,255,255,0.85)'
  c.lineWidth = 4
  c.stroke()
  // 야자수 — 줄기 + 바람에 흔들리는 잎 7장
  const sway = Math.sin(t * 0.9) * 0.06
  c.strokeStyle = '#5b4026'
  c.lineWidth = 9
  c.beginPath()
  c.moveTo(90, SH)
  c.quadraticCurveTo(70, 230, 120 + sway * 200, 130)
  c.stroke()
  const tx = 120 + sway * 200
  for (let i = 0; i < 7; i++) {
    const ang = -Math.PI + (i / 6) * Math.PI + sway * 3 + Math.sin(t * 1.3 + i) * 0.04
    const len = 85 + (i % 2) * 15
    const ex = tx + Math.cos(ang) * len
    const ey = 130 + Math.sin(ang) * len * 0.55 + 30
    c.beginPath()
    c.moveTo(tx, 130)
    c.quadraticCurveTo((tx + ex) / 2, Math.min(130, ey) - 35, ex, ey)
    c.strokeStyle = i % 2 ? '#1f6b34' : '#2b8a44'
    c.lineWidth = 7
    c.stroke()
  }
}

// ── 2. 설악산 가을 계곡 — 겹겹 산·단풍 숲·반짝이는 계곡물·흩날리는 단풍잎
const AUTUMN = (() => {
  const r = rng(11)
  const ridge = (n: number, y: number, amp: number) => Array.from({ length: n + 1 }, (_, i) => y - r() * amp - Math.sin(i * 0.9) * amp * 0.3)
  const leafColors = ['#e8432a', '#f2721c', '#f7a823', '#c9271c', '#ffcc33']
  return {
    ridges: [ridge(12, 150, 70), ridge(12, 190, 55), ridge(12, 230, 40)],
    trees: Array.from({ length: 70 }, () => ({ x: r() * SW, y: 215 + r() * 60, s: 10 + r() * 16, col: leafColors[Math.floor(r() * leafColors.length)] })).sort((a, b) => a.y - b.y),
    leaves: Array.from({ length: 45 }, () => ({ x: r() * SW, y: r() * SH, v: 18 + r() * 25, w: 0.5 + r() * 1.5, p: r() * 6, s: 3 + r() * 4, col: leafColors[Math.floor(r() * leafColors.length)] })),
  }
})()
const autumn: Scene = (c, t) => {
  c.fillStyle = vgrad(c, 0, 200, [[0, '#9cc4e4'], [1, '#f6e2c4']])
  c.fillRect(0, 0, SW, SH)
  const ridgeCols = ['#8a7ca8', '#a2543a', '#c5602f']
  AUTUMN.ridges.forEach((rd, k) => {
    c.beginPath()
    c.moveTo(0, SH)
    rd.forEach((y, i) => c.lineTo((i / (rd.length - 1)) * SW, y))
    c.lineTo(SW, SH)
    c.fillStyle = ridgeCols[k]
    c.fill()
  })
  // 계곡물
  c.fillStyle = vgrad(c, 290, 330, [[0, '#4d8fb3'], [1, '#2f6f91']])
  c.beginPath()
  c.moveTo(180, SH)
  c.bezierCurveTo(260, 320, 300, 300, 360, 288)
  c.bezierCurveTo(420, 300, 470, 330, 520, SH)
  c.fill()
  for (let i = 0; i < 14; i++) {
    const x = 230 + ((i * 23 + t * 30) % 260)
    c.fillStyle = `rgba(255,255,255,${0.25 + 0.25 * Math.sin(t * 3 + i)})`
    c.fillRect(x, 300 + (i % 4) * 12, 10, 1.5)
  }
  for (const tr of AUTUMN.trees) {
    c.fillStyle = '#4a2f1d'
    c.fillRect(tr.x - 1.5, tr.y, 3, tr.s * 0.8)
    c.fillStyle = tr.col
    c.beginPath()
    c.arc(tr.x, tr.y, tr.s * 0.6, 0, Math.PI * 2)
    c.arc(tr.x - tr.s * 0.35, tr.y + tr.s * 0.15, tr.s * 0.45, 0, Math.PI * 2)
    c.arc(tr.x + tr.s * 0.35, tr.y + tr.s * 0.15, tr.s * 0.45, 0, Math.PI * 2)
    c.fill()
  }
  // 흩날리는 단풍잎 — 아래로 떨어지며 좌우로 흔들리고 돈다
  for (const l of AUTUMN.leaves) {
    const y = (l.y + t * l.v) % (SH + 20) - 10
    const x = (l.x + Math.sin(t * l.w + l.p) * 30 + t * 12) % (SW + 20) - 10
    c.save()
    c.translate(x, y)
    c.rotate(t * l.w * 2 + l.p)
    c.scale(1, 0.4 + 0.6 * Math.abs(Math.sin(t * l.w + l.p)))
    c.fillStyle = l.col
    c.beginPath()
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      c.lineTo(Math.cos(a) * l.s, Math.sin(a) * l.s)
      c.lineTo(Math.cos(a + 0.63) * l.s * 0.45, Math.sin(a + 0.63) * l.s * 0.45)
    }
    c.fill()
    c.restore()
  }
}

// ── 3. 별장 응접실 벽난로 — 따뜻한 벽·나무 바닥·돌 벽난로·흔들리는 불꽃·튀는 불티·방 전체 불빛 깜박임
const FIRE = (() => {
  const r = rng(23)
  return {
    tongues: Array.from({ length: 9 }, (_, i) => ({ x: 270 + i * 12.5, h: 45 + r() * 35, p: r() * 6, w: 14 + r() * 8 })),
    sparks: Array.from({ length: 24 }, () => ({ x: 280 + r() * 90, v: 25 + r() * 35, p: r(), d: r() * 6 })),
  }
})()
const fireplace: Scene = (c, t) => {
  const flick = 0.85 + 0.1 * Math.sin(t * 7) + 0.05 * Math.sin(t * 13.3)
  c.fillStyle = vgrad(c, 0, 280, [[0, '#3b2418'], [1, '#6b3f26']])
  c.fillRect(0, 0, SW, 280)
  // 바닥 판자
  c.fillStyle = '#4a2c1a'
  c.fillRect(0, 280, SW, 80)
  c.strokeStyle = 'rgba(0,0,0,0.25)'
  c.lineWidth = 1
  for (let y = 290; y < SH; y += 14) {
    c.beginPath()
    c.moveTo(0, y)
    c.lineTo(SW, y)
    c.stroke()
  }
  // 벽난로 돌 틀·선반
  c.fillStyle = '#8c7f73'
  c.fillRect(200, 110, 240, 180)
  c.fillStyle = '#5e4a3a'
  c.fillRect(185, 100, 270, 16)
  c.fillStyle = '#140b07'
  c.beginPath()
  c.moveTo(235, 290)
  c.lineTo(235, 175)
  c.quadraticCurveTo(320, 135, 405, 175)
  c.lineTo(405, 290)
  c.fill()
  // 장작
  c.fillStyle = '#5a3418'
  c.save()
  c.translate(320, 278)
  c.rotate(-0.12)
  c.fillRect(-60, -9, 120, 16)
  c.rotate(0.24)
  c.fillRect(-55, -16, 110, 14)
  c.restore()
  // 불꽃 — 더해 그리기(lighter)로 겹친 곳이 밝아진다
  c.save()
  c.globalCompositeOperation = 'lighter'
  for (const f of FIRE.tongues) {
    const h = f.h * (0.75 + 0.25 * Math.sin(t * 6 + f.p) + 0.1 * Math.sin(t * 11 + f.p * 2))
    const sway = Math.sin(t * 4 + f.p) * 5
    const g = c.createLinearGradient(0, 270, 0, 270 - h)
    g.addColorStop(0, 'rgba(255,240,170,0.9)')
    g.addColorStop(0.35, 'rgba(255,170,40,0.75)')
    g.addColorStop(0.8, 'rgba(220,60,10,0.45)')
    g.addColorStop(1, 'rgba(180,30,0,0)')
    c.fillStyle = g
    c.beginPath()
    c.moveTo(f.x - f.w / 2, 272)
    c.quadraticCurveTo(f.x - f.w / 2, 270 - h * 0.5, f.x + sway, 270 - h)
    c.quadraticCurveTo(f.x + f.w / 2, 270 - h * 0.5, f.x + f.w / 2, 272)
    c.fill()
  }
  for (const s of FIRE.sparks) {
    const k = (t * 0.6 + s.p) % 1
    c.fillStyle = `rgba(255,190,90,${(1 - k) * 0.9})`
    c.fillRect(s.x + Math.sin(t * 3 + s.d) * 8, 260 - k * s.v * 4, 2, 2)
  }
  c.restore()
  // 방 전체 불빛 — 벽난로 중심 따뜻한 빛이 깜박인다
  const glow = c.createRadialGradient(320, 240, 20, 320, 240, 420)
  glow.addColorStop(0, `rgba(255,150,60,${0.35 * flick})`)
  glow.addColorStop(1, 'rgba(255,120,40,0)')
  c.fillStyle = glow
  c.fillRect(0, 0, SW, SH)
}

// ── 4. 회의실 크리스마스 트리 — 밝은 회의실 벽·창밖 눈·회의 탁자·반짝이는 전구와 별
const XMAS = (() => {
  const r = rng(31)
  const colors = ['#ff4d4d', '#ffd23f', '#4dd2ff', '#9dff6b', '#ff8ce6']
  const bulbs: { x: number; y: number; c: string; p: number }[] = []
  for (let i = 0; i < 42; i++) {
    const k = r()
    const y = 95 + k * 190
    const half = 12 + k * 62
    bulbs.push({ x: 500 + (r() * 2 - 1) * half * 0.85, y, c: colors[i % colors.length], p: r() * 6 })
  }
  return { bulbs, snow: Array.from({ length: 50 }, () => ({ x: r(), y: r(), v: 0.04 + r() * 0.06, s: 1 + r() * 1.8 })) }
})()
const xmas: Scene = (c, t) => {
  c.fillStyle = vgrad(c, 0, SH, [[0, '#eef1f5'], [1, '#d9dee6']])
  c.fillRect(0, 0, SW, SH)
  // 창 — 겨울 하늘과 내리는 눈
  const wx = 40
  const wy = 40
  const ww = 300
  const wh = 170
  c.fillStyle = vgrad(c, wy, wy + wh, [[0, '#7d93b3'], [1, '#c9d6e6']])
  c.fillRect(wx, wy, ww, wh)
  c.fillStyle = '#9fb0c6'
  for (let i = 0; i < 6; i++) c.fillRect(wx + 10 + i * 48, wy + wh - 40 - (i % 3) * 18, 36, 40 + (i % 3) * 18)
  c.fillStyle = 'rgba(255,255,255,0.9)'
  for (const s of XMAS.snow) {
    const y = wy + ((s.y + t * s.v) % 1) * wh
    const x = wx + ((s.x + Math.sin(t * 0.8 + s.y * 10) * 0.01) % 1) * ww
    c.beginPath()
    c.arc(x, y, s.s, 0, Math.PI * 2)
    c.fill()
  }
  c.strokeStyle = '#ffffff'
  c.lineWidth = 6
  c.strokeRect(wx, wy, ww, wh)
  c.beginPath()
  c.moveTo(wx + ww / 2, wy)
  c.lineTo(wx + ww / 2, wy + wh)
  c.stroke()
  // 회의 탁자·의자 등받이
  c.fillStyle = '#b08d6a'
  c.beginPath()
  c.moveTo(20, 300)
  c.lineTo(400, 300)
  c.lineTo(370, 260)
  c.lineTo(60, 260)
  c.fill()
  c.fillStyle = '#3c4350'
  for (let i = 0; i < 4; i++) c.fillRect(80 + i * 75, 228, 40, 34)
  // 트리 — 세 겹 삼각형 + 줄기
  c.fillStyle = '#6b4226'
  c.fillRect(490, 285, 20, 30)
  const tiers: [number, number, number][] = [[95, 170, 40], [140, 230, 58], [190, 290, 78]]
  for (const [top, bottom, half] of tiers) {
    c.fillStyle = '#1f7a3a'
    c.beginPath()
    c.moveTo(500, top)
    c.lineTo(500 - half, bottom)
    c.lineTo(500 + half, bottom)
    c.fill()
  }
  // 반짝이는 전구 — 전구마다 다른 박자로 켜졌다 흐려진다
  for (const b of XMAS.bulbs) {
    const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 + b.p))
    const g = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, 7)
    g.addColorStop(0, b.c)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    c.globalAlpha = a
    c.fillStyle = g
    c.fillRect(b.x - 7, b.y - 7, 14, 14)
  }
  c.globalAlpha = 1
  // 꼭대기 별
  const sp = 1 + 0.15 * Math.sin(t * 3)
  c.fillStyle = '#ffd84a'
  c.beginPath()
  for (let i = 0; i < 10; i++) {
    const rad = (i % 2 ? 5 : 12) * sp
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2
    c.lineTo(500 + Math.cos(a) * rad, 90 + Math.sin(a) * rad)
  }
  c.fill()
}

export const SCENES = { beach, autumn, fireplace, xmas } as const
export type SceneId = keyof typeof SCENES
export const SCENE_IDS = Object.keys(SCENES) as SceneId[]
