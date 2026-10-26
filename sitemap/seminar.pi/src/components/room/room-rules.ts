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
