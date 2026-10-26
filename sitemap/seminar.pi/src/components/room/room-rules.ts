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

// 연결 점검(발표자, 설계서 14.5) — 입장 delayMs 뒤 windowMs 구간의 발행 PC getStats 두 번으로 판정.
// 손실률(remote-inbound-rtp fractionLost) 은 "이상이면", 송신 처리량(outbound-rtp bytesSent 증분, kbps) 은 "미만이면" 그 단계.
// 영상 손실 임계가 3개라 0.05~0.1 은 등급은 good 이되 원인 문장을 보인다(해석 — 설계서는 수치만 정함)
export const NET = {
  delayMs: 5000, // 대역 추정이 오르는 첫 몇 초는 처리량이 낮게 나와 제외
  windowMs: 5000,
  loss: { audio: [0.33, 0.05], video: [0.33, 0.1, 0.05] },
  rate: { audio: [8, 20], video: [60, 750] },
}
export type NetKind = 'audio' | 'video'
export type NetGrade = 'good' | 'fair' | 'poor'
export type NetReason = { kind: NetKind; metric: 'loss' | 'rate'; value: number }
export type NetResult = { grade: NetGrade; reason: NetReason | null }
type Totals = Partial<Record<NetKind, { bytes: number; ts: number; lost: number | null }>>

// getStats 결과(RTCStatsReport.values() 또는 같은 모양의 배열)를 종류별 합계로 — 레이어가 여럿이면 bytes 를 더한다
export function readStats(stats: Iterable<Record<string, unknown>> | null): Totals {
  const out: Totals = {}
  for (const s of stats ?? []) {
    const kind = s.kind as NetKind
    if (kind !== 'audio' && kind !== 'video') continue
    const cur = (out[kind] ??= { bytes: 0, ts: 0, lost: null })
    if (s.type === 'outbound-rtp') {
      cur.bytes += Number(s.bytesSent ?? 0)
      cur.ts = Math.max(cur.ts, Number(s.timestamp ?? 0))
    } else if (s.type === 'remote-inbound-rtp' && typeof s.fractionLost === 'number') {
      cur.lost = Math.max(cur.lost ?? 0, s.fractionLost)
    }
  }
  return out
}

const RANK: Record<NetGrade, number> = { good: 0, fair: 1, poor: 2 }

// 두 표본 → 등급 + 가장 나쁜 원인 1개. on = 지금 켜진 종류만 본다(꺼진 트랙은 무음·검은 화면이라 처리량이 낮은 게 정상)
// 측정값이 하나도 없으면 null(아직 발행 전 등)
export function gradeNet(a: Totals, b: Totals, on: Record<NetKind, boolean>): NetResult | null {
  let best: { grade: NetGrade; reason: NetReason | null } | null = null
  const consider = (grade: NetGrade, reason: NetReason | null) => {
    if (!best || RANK[grade] > RANK[best.grade] || (!best.reason && reason && grade === best.grade))
      best = { grade, reason }
  }
  for (const kind of ['audio', 'video'] as const) {
    const x = a[kind]
    const y = b[kind]
    if (!on[kind] || !y) continue
    if (y.lost != null) {
      const [poor, fair, minor] = NET.loss[kind]
      const v = y.lost
      if (v >= poor) consider('poor', { kind, metric: 'loss', value: v })
      else if (v >= fair) consider('fair', { kind, metric: 'loss', value: v })
      else if (minor != null && v >= minor) consider('good', { kind, metric: 'loss', value: v })
      else consider('good', null)
    }
    if (x && y.ts > x.ts) {
      const kbps = ((y.bytes - x.bytes) * 8) / (y.ts - x.ts) // bytes·8 / ms = kbit/s
      const [poor, fair] = NET.rate[kind]
      if (kbps < poor) consider('poor', { kind, metric: 'rate', value: kbps })
      else if (kbps < fair) consider('fair', { kind, metric: 'rate', value: kbps })
      else consider('good', null)
    }
  }
  return best
}

// 슬롯 나누기 — 넘친 버튼이 1개뿐이면 더보기를 만들지 않고 바로 노출(Jitsi 규칙)
export function splitSlots<T>(items: T[], slots: number): { main: T[]; more: T[] } {
  if (items.length <= slots + 1) return { main: items, more: [] }
  return { main: items.slice(0, slots), more: items.slice(slots) }
}
