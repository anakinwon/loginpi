// 이펙트 "궤도"(ORBIT) — 토성처럼 기울어진 타원 고리(점선) 위를 작은 위성이 천천히 돈다. 계약: effects/types.ts, 스타일: globals.css(.efct-orbit-*)
//  고리 = 타원(rx r*1.32 · ry r*0.42)을 -20° 기울인 점선. 위성 = 같은 타원에 pathLength=100 + 아주 짧은 대시(둥근 linecap → 점) + stroke-dashoffset 회전
//  입체감 = 마스크로 버블 뒤를 지나는 위쪽 반원 구간을 가린다(고리·위성이 버블 뒤로 들어갔다 나온다). CSS transform 애니메이션 비사용(모바일 WebView 철칙 — 기울기는 정적 transform 속성)
//  단계(stage) 차등 없음 — 고리 점선 + 위성 2개(반대 방향·느리게) + 위성 1 glow 를 모바일의 작은 버블에도 그대로(마스터 2026-10-13: 점선 2배 굵게·사선 고리·천천히 도는 실제 위성·모바일 동일)
import type { EffectProps } from './types'

// 고리·위성 비율(반지름 r 기준) — 고리 장축은 요금제 링 바깥(허용 r*0.85~1.35 안), 단축은 버블 안을 가로지르며 마스크로 뒤쪽만 가린다
const K = {
  rx: 1.32,
  ry: 0.42,
  tilt: -20, // 고리 기울기(도) — 정적 transform 속성(애니메이션 아님)
  ring: 4, // 점선 굵기(px) — 1 → 2 → 4(마스터 2026-10-13 2차 "지금보다 2배")
  sat1: 0.09, // 위성 1 지름 비율(하한 4px)
  sat2: 0.06, // 위성 2 지름 비율(하한 3px)
} as const

export function OrbitEffect(p: EffectProps) {
  const { r, id } = p
  const rx = r * K.rx
  const ry = r * K.ry
  const mask = `${id}-om`
  return (
    <g style={{ color: p.color }} fill="none" stroke="currentColor">
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
          {/* 고리 — 점선 */}
          {
            <ellipse
              className="efct-orbit-path"
              rx={rx}
              ry={ry}
              strokeWidth={K.ring}
              strokeLinecap="round"
              strokeDasharray="3 8"
            />
          }
          {/* 위성 1 — glow */}
          <ellipse
            className="efct-orbit-sat efct-orbit-glow"
            rx={rx}
            ry={ry}
            strokeWidth={Math.max(4, r * K.sat1)}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="0.1 99.9"
          />
          {/* 위성 2 — 반대 방향·더 느리게 */}
          {
            <ellipse
              className="efct-orbit-sat efct-orbit-sat2"
              rx={rx}
              ry={ry}
              strokeWidth={Math.max(3, r * K.sat2)}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="0.1 99.9"
            />
          }
        </g>
      </g>
    </g>
  )
}
