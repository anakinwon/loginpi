// 조명 보정 판정(순수 함수, 설계서 15.5) — 저해상도 표본의 평균 밝기 → 목표 밝기로 끌어올리는 brightness 배율.
// 급변 방지 = 표본마다 목표 배율 쪽으로 일부만 이동(지수 평활). 시험 : node --test src/components/room/features/media-fx/light.test.mjs
// Jitsi 배포본엔 조명 보정이 없다(REA jitsi-03 lighting 0건) — 자체 설계, 근거 없는 숫자는 아래 상수에 모았다(실기기 조정용)

export const LIGHT = {
  target: 0.5, // 목표 평균 밝기(0~1)
  dead: 0.08, // 목표 ±이 범위면 보정하지 않는다(보통 조명은 손대지 않음)
  min: 0.85, // 너무 밝을 때 최대 낮춤
  max: 1.8, // 어두울 때 최대 올림 — 더 올리면 잡음만 커진다
  ease: 0.15, // 표본 1회당 이동 비율(약 5회/초 표본 → 2초 안팎에 수렴)
  contrast: 0.25, // 밝힐 때 대비를 배율 증가분 × 이 값만큼 올려 뿌옇게 뜨는 것을 막는다
  every: 6, // 프레임 N장마다 1번 표본(30fps → 5회/초)
  sampleW: 32,
  sampleH: 18,
}

// 평균 밝기 → 목표 배율
export function lightGain(mean: number): number {
  if (!Number.isFinite(mean) || Math.abs(mean - LIGHT.target) < LIGHT.dead) return 1
  return Math.min(LIGHT.max, Math.max(LIGHT.min, LIGHT.target / Math.max(mean, 0.01)))
}

// 직전 배율 → 다음 배율(완화)
export function lightStep(mean: number, prev: number): number {
  return prev + (lightGain(mean) - prev) * LIGHT.ease
}

// ctx.filter 문자열 — 밝힐 때만 대비 보강
export function lightFilter(b: number): string {
  const c = b > 1 ? 1 + (b - 1) * LIGHT.contrast : 1
  return `brightness(${b.toFixed(3)}) contrast(${c.toFixed(3)})`
}

// RGBA 바이트 배열의 평균 밝기(Rec.709 가중) 0~1
export function meanLuma(px: ArrayLike<number>): number {
  let s = 0
  const n = px.length / 4
  for (let i = 0; i < px.length; i += 4) s += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
  return n ? s / n / 255 : LIGHT.target
}
