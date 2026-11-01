// 이펙트 "궤도"(ORBIT) — 토성처럼 기울어진 타원 궤도를 쇠사슬(파랑·은색 고리가 번갈아 겹친 체인)이 감싸고, 빛 한 점이 사슬을 따라 천천히 돈다. 계약: effects/types.ts, 스타일: globals.css(.efct-orbit-*)
//  사슬 = 타원(rx r*1.32 · ry r*0.42, -20° 기울기) 둘레를 호 길이로 N 등분한 자리에 둥근 사각 고리(접선 방향)를 정적 transform 속성으로 배치(마스터 2026-11-01 그림 "위성 모양을 체인으로 감싸").
//  빛 = 같은 타원에 pathLength=100 + 짧은 대시 + stroke-dashoffset 회전(구 위성 1). CSS transform 애니메이션 비사용(모바일 WebView 철칙)
//  입체감 = 마스크로 버블 뒤를 지나는 위쪽 반원 구간을 가린다(사슬이 버블 뒤로 들어갔다 나온다). 단계(stage) 차등 없음 — 모바일 작은 버블도 같은 사슬
import type { EffectProps } from './types'

// 궤도·사슬 비율(반지름 r 기준) — 고리 장축은 요금제 링 바깥(허용 r*0.85~1.35 안), 단축은 버블 안을 가로지르며 마스크로 뒤쪽만 가린다
const K = {
  rx: 1.32,
  ry: 0.42,
  tilt: -20, // 궤도 기울기(도) — 정적 transform 속성(애니메이션 아님)
  links: 20, // 사슬 고리 수(짝수 — 색 번갈아). 둘레 / 20 ≈ 고리 길이의 0.8 → 끝만 겹쳐 맞물려 보이고 은색 고리도 드러남
  len: 0.36, // 고리 길이 비율
  wid: 0.2, // 고리 폭 비율
  thick: 0.055, // 고리 굵기 비율(하한 1.5px)
  glint: 0.09, // 빛 지름 비율(하한 4px)
  samples: 360, // 호 길이 등분용 타원 표본 수
} as const
// 그림의 파랑·은색 사슬
const COLOR = { blue: '#2f6fe4', silver: '#c3cad6' } as const

type Link = { x: number; y: number; deg: number }

// 타원 둘레를 호 길이로 n 등분한 자리와 접선 각도 — 장축 쪽이 몰리지 않게 매개변수 대신 호 길이로 나눈다
function chainLinks(rx: number, ry: number, n: number): Link[] {
  const pts = Array.from({ length: K.samples + 1 }, (_, i) => {
    const t = (i / K.samples) * Math.PI * 2
    return { t, x: rx * Math.cos(t), y: ry * Math.sin(t) }
  })
  const acc = [0]
  for (let i = 1; i < pts.length; i++)
    acc.push(
      acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y),
    )
  const total = acc[acc.length - 1]
  const out: Link[] = []
  let j = 0
  for (let k = 0; k < n; k++) {
    const want = (k / n) * total
    while (acc[j + 1] < want) j++
    const t = pts[j].t
    out.push({
      x: rx * Math.cos(t),
      y: ry * Math.sin(t),
      deg: (Math.atan2(ry * Math.cos(t), -rx * Math.sin(t)) * 180) / Math.PI,
    })
  }
  return out
}

export function OrbitEffect(p: EffectProps) {
  const { r, id } = p
  const rx = r * K.rx
  const ry = r * K.ry
  const len = r * K.len
  const wid = r * K.wid
  const thick = Math.max(1.5, r * K.thick)
  const mask = `${id}-om`
  const links = chainLinks(rx, ry, K.links)
  return (
    <g style={{ color: p.color }} fill="none">
      <defs>
        {/* 위쪽 반원(버블 뒤) 구간을 가린다 — 흰색 = 보임, 검정 = 숨김 */}
        <mask id={mask} maskUnits="userSpaceOnUse">
          <rect
            x={-rx * 1.2}
            y={-rx * 1.2}
            width={rx * 2.4}
            height={rx * 2.4}
            fill="white"
          />
          <path d={`M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0 Z`} fill="black" />
        </mask>
      </defs>
      <g mask={`url(#${mask})`}>
        <g transform={`rotate(${K.tilt})`}>
          {/* 사슬 — 은색 고리 먼저, 파랑 고리를 위에(번갈아 맞물린 느낌) */}
          {[
            ...links.filter((_, i) => i % 2),
            ...links.filter((_, i) => i % 2 === 0),
          ].map((l, k) => (
            <rect
              key={k}
              x={-len / 2}
              y={-wid / 2}
              width={len}
              height={wid}
              rx={wid / 2}
              stroke={k < links.length / 2 ? COLOR.silver : COLOR.blue}
              strokeWidth={thick}
              transform={`translate(${l.x} ${l.y}) rotate(${l.deg})`}
            />
          ))}
          {/* 빛 — 사슬을 따라 40초에 한 바퀴 */}
          <ellipse
            className="efct-orbit-sat efct-orbit-glow"
            rx={rx}
            ry={ry}
            stroke="#fff"
            strokeWidth={Math.max(4, r * K.glint)}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="0.1 99.9"
          />
        </g>
      </g>
    </g>
  )
}
