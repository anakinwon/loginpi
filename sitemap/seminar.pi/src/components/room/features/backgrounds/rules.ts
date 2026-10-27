// 배경 효과 판정(순수 함수) — 성능 자동 끔·내 이미지 상한·cover 맞춤. 시험 rules.test.mjs(node --test)
export const BG = {
  order: 20, // 효과 순서 — 조명(10) 뒤. 조명이 합성된 배경까지 재면 어두운 배경(격자·노을)에서 사람이 1.8배로 과노출된다(rules.test)
  fpsMin: 15, // 처리 능력이 이 fps 미만으로
  slowSec: 3, // 연속 이 초만큼 이어지면 한 단계 낮추고(분리 간격 ×2), 가장 낮은 단계에서도 그러면 자동 끔
  maxEvery: 2, // 분리 간격 상한 — 프레임 N장마다 1번 분리, 사이 프레임은 직전 마스크 재사용(30fps 카메라면 15회/초)
  inW: 256, // 사람 분리 입력 축소(landscape 모델 입력 256×144, REA mediapipe-05 alt_landscape)
  inH: 144,
  outW: 1280, // 배경 이미지는 고를 때 이 크기를 덮는 만큼만 남긴다(매 프레임 축소 비용·메모리)
  outH: 720,
  blurDiv: 24, // 흐림 = 1/24 로 줄였다 늘리기(ctx.filter 미지원 브라우저도 같은 결과)
  myMax: 3, // 내 이미지 최대 장수
  myBytes: 2 * 1024 * 1024, // 장당 상한
  myPx: 8192, // 디코드 뒤 가로·세로 상한 — 고압축 PNG 는 2MB 안에도 수만 px 가 될 수 있다
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

// 느림 판정이 났을 때 다음 분리 간격 — 0 = 더 낮출 단계가 없음(자동 끔). 바로 끄면 가리던 방이 드러나므로 분리 횟수부터 줄인다
export const slowerEvery = (every: number) => (every < BG.maxEvery ? every * 2 : 0)

// bgOn 이 켬→끔으로 바뀌었는데 선택이 남아 있으면 = 파이프라인이 연속 실패로 끈 것(사용자 끔·실패는 choose 가 선택부터 '없음'으로 바꾼다).
// 다른 배경을 고르는 중(loading)이어도 같다 — 저장소는 같은 값으로는 알리지 않아, 켬→끔 전환은 끔 경로 3곳(사용자·실패·파이프라인)뿐이다
export const pipelineKilled = (on: boolean, choice: string) => !on && choice !== 'none'

// 시트를 다시 열 때 목록 — 저장소 목록 + 이번 회의에만 둔 저장 실패분(unsaved). 다시 읽는다고 사라지면 쓰고 있는 이미지의 선택 표시·삭제가 없어진다
export const withUnsaved = <T extends { id: string; unsaved?: boolean }>(db: readonly T[], prev: readonly T[]): T[] => [
  ...prev.filter((x) => x.unsaved && !db.some((d) => d.id === x.id)),
  ...db,
]

// 새 선택이 실패했을 때 돌아갈 선택 — 앞 배경이 켜져 있었으면 그대로 둔다('없음'으로 떨어지면 가리던 방이 상대에게 드러난다)
export const failBack = (prev: string, prevOn: boolean) => (prevOn ? prev : 'none')

// 분리기 시각(ms) — 같은 분리기에는 엄격히 커지는 값만 넣어야 한다. 정밀도를 낮춘 타이머(사생활 보호 설정)는 같은 값을 줄 수 있다
export const nextTs = (prev: number, now: number) => Math.max(now, prev + 1)

// 이미지(sw×sh)를 w×h 에 꽉 채우는 drawImage 대상 사각형(가운데 기준 잘림)
export function coverRect(sw: number, sh: number, w: number, h: number) {
  const k = Math.max(w / sw, h / sh)
  const dw = sw * k
  const dh = sh * k
  return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh }
}

// 내 이미지 파일 검사 — 반환 = 오류 문구 키(room.effects.*) 또는 null
export function checkMine(type: string, size: number): string | null {
  if (!type.startsWith('image/') || type === 'image/svg+xml') return 'bgFailed' // SVG 는 크기 없는 파일이 많아 디코드가 들쭉날쭉
  return size > BG.myBytes ? 'myTooBig' : null
}

// 새 이미지를 더한 뒤 지울 것 — 오래된 것부터(ts 오름차순) 상한 초과분의 id
export function overflowIds(list: readonly { id: string; ts: number }[], max = BG.myMax): string[] {
  return [...list]
    .sort((a, b) => a.ts - b.ts)
    .slice(0, Math.max(0, list.length - max))
    .map((x) => x.id)
}
