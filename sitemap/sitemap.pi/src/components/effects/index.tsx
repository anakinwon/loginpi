// 이펙트 레지스트리 — efct_cd → 렌더러. 각 효과는 effects/<name>.tsx, 스타일 .efct-<name>-* 은 globals.css 에 직접(dev Turbopack 이 별도 파일 @import 를 누락)
import { CometEffect } from './comet'
import { OrbitEffect } from './orbit'
import { PulseEffect } from './pulse'
import type { EfctCd, EffectRenderer } from './types'

export const EFFECTS: Record<EfctCd, EffectRenderer> = {
  ORBIT: OrbitEffect,
  PULSE: PulseEffect,
  COMET: CometEffect,
}

export type { EfctCd, EffectProps, EffectRenderer } from './types'
export { EFCT_CD } from './types'
