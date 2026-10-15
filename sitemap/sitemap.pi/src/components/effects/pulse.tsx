// 이펙트 "펄스" — 버블이 숨쉬듯 뛰는 느낌. 버블 크기는 그대로 두고 바깥 링(ripple)이 r → r*1.35 로 퍼지며 사라진다.
//  리듬 = 심박(두 번 빠르게 lub-dub, 한 번 쉼) : 링 A(0s)·링 B(0.28s 시차) + 테두리 후광(halo, CSS opacity 박동 — globals.css(.efct-pulse-*))
//  모바일 WebView 철칙(types.ts) : CSS transform 금지 → r·opacity 는 SMIL <animate>, 후광은 CSS opacity 만.
//  움직임 줄이기 설정에도 감속하지 않는다(구 3배 감속 폐기, 마스터 2026-10-16 "모바일도 동일" — types.ts 철칙)
import type { EffectProps } from './types'

const T = 2 // 심박 1주기(s) — 60bpm 대의 안정된 박동
const DUB = 0.28 // 두 번째 박동 시차(s)
const SPREAD = 1.35 // 링 최대 반지름 배수(요금제 링 바깥만 침범)
const EXPAND = 0.45 // 주기 중 퍼지는 구간 비율(나머지는 투명 휴지)

export function PulseEffect(p: EffectProps) {
  const k = 1 // 주기 배율 — reduce 감속 폐기 후 1 고정(SMIL dur·begin 식 유지)
  const r1 = p.r * SPREAD
  const sw = Math.max(2, p.r * 0.06)
  // 링 하나 = 퍼지며 사라지는 파동. begin 전엔 기본 속성(r1·opacity 0)이라 보이지 않는다
  const ring = (begin: number, peak: number, w: number) => (
    <circle
      r={r1}
      opacity={0}
      fill="none"
      stroke="currentColor"
      strokeWidth={w}
    >
      <animate
        attributeName="r"
        values={`${p.r};${r1};${r1}`}
        keyTimes={`0;${EXPAND};1`}
        calcMode="spline"
        keySplines="0.2 0.7 0.3 1;0 0 1 1"
        dur={`${T * k}s`}
        begin={`${begin * k}s`}
        repeatCount="indefinite"
      />
      <animate
        attributeName="opacity"
        values={`${peak};0;0`}
        keyTimes={`0;${EXPAND};1`}
        calcMode="spline"
        keySplines="0.4 0 0.8 0.6;0 0 1 1"
        dur={`${T * k}s`}
        begin={`${begin * k}s`}
        repeatCount="indefinite"
      />
    </circle>
  )
  return (
    <g className="efct-pulse" style={{ color: p.color }}>
      {ring(0, 0.7, sw)}
      {/* 단계(stage) 차등 없음 — 모바일의 작은 버블도 PC 와 같은 구성(마스터 2026-10-13), 크기만 r 비례 */}
      {ring(DUB, 0.45, sw * 0.7)}
      {
        <circle
          className="efct-pulse-halo"
          r={p.r * 1.02}
          fill="none"
          stroke="currentColor"
          strokeWidth={Math.max(1.5, p.r * 0.04)}
        />
      }
    </g>
  )
}
