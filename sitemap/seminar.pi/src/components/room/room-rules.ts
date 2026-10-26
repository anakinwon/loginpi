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

// ── M3 (SIGNAL_API v1.1) ──

export type PeerRole = 'presenter' | 'panel' | 'audience'
export type PeerLike = { peerId: string; name: string; role: PeerRole; raisedTs: number }

// 하단 바 버튼 우선순위(설계서 14.3 표) — 앞에서부터 메인 슬롯을 채운다. 가장 좁은 폭(≤370)의 청중은 반응보다 채팅이 앞
// (표의 "손들기·채팅"). 화질(audience 565 칸)은 M4 consumer.setLayer 와 함께라 아직 없다
export type BarId = 'audio' | 'video' | 'screen' | 'chat' | 'people' | 'hands' | 'hand' | 'react'
export function barOrder(role: PeerRole, width: number): BarId[] {
  if (role === 'audience')
    return width > BAR.slotWidths[2] ? ['hand', 'react', 'chat', 'people'] : ['hand', 'chat', 'react', 'people']
  return ['audio', 'video', 'chat', 'people', 'screen', role === 'presenter' ? 'hands' : 'react']
}

// 참가자 패널 정렬(설계서 14.4) — presenter → panel → 손든 audience(먼저 든 순, 서버 시각) → 나머지 이름순
export function sortPeers<T extends PeerLike>(peers: T[]): T[] {
  const rank = (p: T) => (p.role === 'presenter' ? 0 : p.role === 'panel' ? 1 : p.raisedTs > 0 ? 2 : 3)
  return [...peers].sort(
    (a, b) => rank(a) - rank(b) || (rank(a) === 2 ? a.raisedTs - b.raisedTs : 0) || a.name.localeCompare(b.name),
  )
}

// 반응(설계서 14.4, SIGNAL_API 3.3 C) — 허용 7종, 보낼 때 500ms 묶음(묶음당 최대 3개), 받으면 화면 큐 50개·5초 소멸, 한 알림에서 최대 3종
export const REACT = {
  emojis: ['👍', '👏', '😀', '😮', '🙁', '😶', '💖'],
  batchMs: 500,
  maxPerBatch: 3,
  maxKinds: 3,
  queueCap: 50,
  lifeMs: 5000,
  lanes: 4, // 떠오르는 궤적 수(globals.css .float-up 레인)
}

// 묶음에 1개 추가 — 허용 밖이거나 이미 3개면 그대로(넘친 탭은 버린다)
export function batchReaction(batch: string[], emoji: string): string[] {
  if (!REACT.emojis.includes(emoji) || batch.length >= REACT.maxPerBatch) return batch
  return [...batch, emoji]
}

export type Floater = { id: number; emoji: string; lane: number; born: number }

// ntf reaction{counts} → 화면 큐. 지난 것(5초) 정리 후 많은 순 최대 3종을 개수만큼 넣되 큐는 50개 상한
// (넘치면 새 것을 버린다 — 이미 떠 있는 것이 사라지며 튀지 않게)
export function enqueueReactions(
  queue: Floater[],
  counts: Record<string, number>,
  now: number,
  nextId: number,
): { queue: Floater[]; nextId: number } {
  const q = queue.filter((f) => now - f.born < REACT.lifeMs)
  const kinds = Object.entries(counts)
    .filter(([e, n]) => REACT.emojis.includes(e) && n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, REACT.maxKinds)
  for (const [emoji, n] of kinds) {
    for (let i = 0; i < n && q.length < REACT.queueCap; i++) {
      q.push({ id: nextId, emoji, lane: nextId % REACT.lanes, born: now })
      nextId++
    }
  }
  return { queue: q, nextId }
}

// 손든 사람 알림 쌓임 방지(설계서 14.4) — 0명 없음 / 1명 알림 안 [무대로]·[무시] / 2명 이상 "N명 대기" 하나(→ 참가자 패널)
export type HandNotice<T> = { kind: 'none' } | { kind: 'one'; peer: T } | { kind: 'many'; count: number }
export function handNotice<T extends PeerLike>(peers: T[], dismissed: ReadonlySet<string>): HandNotice<T> {
  const waiting = sortPeers(peers.filter((p) => p.role === 'audience' && p.raisedTs > 0 && !dismissed.has(handKey(p))))
  if (!waiting.length) return { kind: 'none' }
  return waiting.length === 1 ? { kind: 'one', peer: waiting[0] } : { kind: 'many', count: waiting.length }
}
// [무시] 는 그 손(올린 시각)만 — 내렸다 다시 들면 새 알림
export const handKey = (p: PeerLike) => `${p.peerId}:${p.raisedTs}`

// 무대 고정(설계서 14.1) — 새 화면공유가 생기면 1번만 자동 고정하고 그 전 고정을 기억, 고정된 것이 사라지면 기억한 고정으로 복원.
// 사용자가 직접 고정을 바꾸면(prev 비움) 복원하지 않는다. seen = 이미 자동 고정한 화면공유 키(수동 해제 뒤 재고정 안 함)
export type PinState = { pin: string | null; prev: string | null; seen: string[] }
export function nextPin(st: PinState, keys: string[], screenKeys: string[]): PinState {
  const seen = st.seen.filter((k) => keys.includes(k))
  const fresh = screenKeys.find((k) => !st.seen.includes(k))
  if (fresh) {
    // 자동 고정 중에 또 공유가 생기면 처음 기억한 고정을 그대로 둔다
    const prev = st.pin && st.seen.includes(st.pin) ? st.prev : st.pin
    return { pin: fresh, prev, seen: [...seen, fresh] }
  }
  if (st.pin && !keys.includes(st.pin)) {
    return { pin: st.prev && keys.includes(st.prev) ? st.prev : null, prev: null, seen }
  }
  return seen.length === st.seen.length ? st : { ...st, seen }
}
