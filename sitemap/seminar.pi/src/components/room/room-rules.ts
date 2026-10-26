// 룸 화면 판정 규칙(순수 함수·수치) — 말하기 링 전이·하단 바 슬롯 수·연결 점검 등급. 화면 코드와 분리해 node 로 바로 시험한다
// 시험 : node src/components/room/room-rules.test.mjs (Node 22.18+/24 타입 제거 실행). 이 파일은 다른 모듈을 import 하지 않는다

// 말하기 판정 수치 — level 은 시간 영역 RMS(0~1) [확인중 : 마스터 실기기 — 마이크마다 다를 수 있어 보정 손잡이로 둔다]
export const SPEAK = { level: 0.04, pollMs: 100, onMs: 200, offMs: 500 }

// 상태 전이 — 반대 상태가 onMs/offMs 이상 이어질 때만 바꾼다. 시험 room-rules.test.mjs
export function nextSpeaking(
  cur: { on: boolean; since: number },
  loud: boolean,
  now: number,
): { on: boolean; since: number } {
  if (loud === cur.on) return { on: cur.on, since: 0 }
  const since = cur.since || now
  return now - since >= (loud ? SPEAK.onMs : SPEAK.offMs) ? { on: loud, since: 0 } : { on: cur.on, since }
}

// 하단 바(설계서 14.3) — 메인 슬롯 폭 임계(폭 > 565·420·370), 텍스트 라벨은 폭 > 760, 마우스 무조작 숨김 4000ms
export const BAR = { slotWidths: [565, 420, 370], labelMinWidth: 760, hideMs: 4000 }

// 역할별 메인 슬롯 수 — 표의 버튼 수(presenter·panel 6·4·3·2, audience 5·4·3·2). 나가기·소리 켜기는 슬롯 밖
export function mainSlots(width: number, role: 'presenter' | 'panel' | 'audience'): number {
  const table = role === 'audience' ? [5, 4, 3, 2] : [6, 4, 3, 2]
  const i = BAR.slotWidths.findIndex((w) => width > w)
  return table[i === -1 ? table.length - 1 : i]
}

// 슬롯 나누기 — 넘친 버튼이 1개뿐이면 더보기를 만들지 않고 바로 노출(Jitsi 규칙)
export function splitSlots<T>(items: T[], slots: number): { main: T[]; more: T[] } {
  if (items.length <= slots + 1) return { main: items, more: [] }
  return { main: items.slice(0, slots), more: items.slice(slots) }
}
