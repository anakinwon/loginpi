// 배경 효과 판정(순수 함수) — 성능 자동 끔·내 이미지 상한·cover 맞춤. 시험 rules.test.mjs(node --test)
export const BG = {
  fpsMin: 15, // 처리 능력이 이 fps 미만으로
  slowSec: 3, // 연속 이 초만큼 이어지면 자동 끔
  inW: 256, // 사람 분리 입력 축소(landscape 모델 입력 256×144, REA mediapipe-05 alt_landscape)
  inH: 144,
  blurDiv: 24, // 흐림 = 1/24 로 줄였다 늘리기(ctx.filter 미지원 브라우저도 같은 결과)
  myMax: 3, // 내 이미지 최대 장수
  myBytes: 2 * 1024 * 1024, // 장당 상한
}

export const PRESETS = ['dusk', 'ocean', 'forest', 'studio', 'grid', 'dots'] as const

// 처리 능력 감시 — 1초 창마다 (프레임 수 × 1000 ÷ 처리 시간 합) = 이 기기가 낼 수 있는 fps.
// 카메라 자체 fps(어두우면 낮아짐)가 아니라 처리 비용으로 본다 — 느린 카메라를 느린 기기로 오판하지 않게. 반환 true = 끌 때
export function slowWatch(min = BG.fpsMin, sec = BG.slowSec) {
  let start = -1
  let n = 0
  let cost = 0
  let slow = 0
  return (ms: number, now: number): boolean => {
    if (start < 0) start = now
    n++
    cost += ms
    if (now - start < 1000) return false
    // 탭이 숨어 프레임이 끊긴 창(2초 넘게 비었음)은 판정하지 않는다
    if (now - start < 2000) slow = (n * 1000) / Math.max(cost, 1) < min ? slow + 1 : 0
    start = now
    n = 0
    cost = 0
    return slow >= sec
  }
}

// 이미지(sw×sh)를 w×h 에 꽉 채우는 drawImage 대상 사각형(가운데 기준 잘림)
export function coverRect(sw: number, sh: number, w: number, h: number) {
  const k = Math.max(w / sw, h / sh)
  const dw = sw * k
  const dh = sh * k
  return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh }
}

// 내 이미지 파일 검사 — 반환 = 오류 문구 키(room.effects.*) 또는 null
export function checkMine(type: string, size: number): string | null {
  if (!type.startsWith('image/')) return 'bgFailed'
  return size > BG.myBytes ? 'myTooBig' : null
}

// 새 이미지를 더한 뒤 지울 것 — 오래된 것부터(ts 오름차순) 상한 초과분의 id
export function overflowIds(list: readonly { id: string; ts: number }[], max = BG.myMax): string[] {
  return [...list]
    .sort((a, b) => a.ts - b.ts)
    .slice(0, Math.max(0, list.length - max))
    .map((x) => x.id)
}
