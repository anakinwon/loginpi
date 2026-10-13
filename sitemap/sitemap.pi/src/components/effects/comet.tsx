// 이펙트 "혜성"(COMET) — 밝은 머리 + 길게 사라지는 꼬리 잔상이 버블 테두리 바깥을 돈다. 계약: effects/types.ts, 스타일: globals.css(.efct-comet-*)
//  같은 원(반지름 r×1.08) 위에 pathLength=100 원을 겹치고 dasharray 길이·opacity·굵기를 단계별로 두어(머리 1.5%·굵기 2배 → 꼬리 14·32·60%)
//  동일한 stroke-dashoffset 애니메이션을 돌리면 그라데이션 꼬리가 된다. CSS transform 비사용(모바일 WebView 철칙)
import type { EffectProps } from './types'

// [dash 길이(%), opacity, 굵기 배율] — 앞이 머리. 꼬리는 길수록 투명·가늘게(테이퍼)
// 꼬리는 길게(최대 60%), 머리는 대시 1.5%·굵기 2배(마스터 2026-10-13 3차 "머리 2배 두껍게")
const LAYERS: readonly [number, number, number][] = [
  [1.5, 1, 2],
  [14, 0.55, 1],
  [32, 0.25, 0.7],
  [60, 0.1, 0.45],
]

export function CometEffect(p: EffectProps) {
  const cr = p.r * 1.08 // 요금제 링 바로 바깥 — 링·배지·글자 침범 없음
  const w = Math.max(2.5, p.r * 0.055)
  // 단계(stage) 차등 없음 — 모바일의 작은 버블도 4겹 그대로(마스터 2026-10-13), 굵기만 r 비례
  const layers = LAYERS
  return (
    <g className="efct-comet" style={{ color: p.color }}>
      {layers.map(([len, opacity, k], i) => (
        <circle
          key={len}
          className={i === 0 ? 'efct-comet-head' : 'efct-comet-tail'}
          r={cr}
          fill="none"
          stroke="currentColor"
          strokeWidth={w * k}
          strokeLinecap="round"
          strokeOpacity={opacity}
          pathLength={100}
          strokeDasharray={`${len} ${100 - len}`}
        />
      ))}
    </g>
  )
}
