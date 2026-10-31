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

// 슬롯 나누기 — 넘친 버튼이 1개뿐이면 더보기를 만들지 않고 바로 노출(Jitsi 규칙).
// extra(부가 기능 ⋯ 항목, 설계서 15.2)가 있으면 +1칸은 늘 ⋯ — 넘친 기본 버튼 뒤에 부가 항목. 칸 수 상한 '메인 + 1 + 나가기' 불변
export function splitSlots<T>(items: T[], slots: number, extra: T[] = []): { main: T[]; more: T[] } {
  if (extra.length) return { main: items.slice(0, slots), more: [...items.slice(slots), ...extra] }
  if (items.length <= slots + 1) return { main: items, more: [] }
  return { main: items.slice(0, slots), more: items.slice(slots) }
}

// ── 엔진 app 중계(SIGNAL_API 3.6, v1.3) ──
// d 의 JSON 바이트 상한(검사 ②, 엔진 AppMaxBytes) — 넘으면 화면이 보내지 않는다
export const APP_MAX = 4096
// 지원 확인 요청(부작용 없음) — 주제표에 있는 topic + 상한을 넘는 d. v1.3 = ① 통과·② SDP_INVALID(중계·속도 한도 사용 없음), 구 엔진 = NOT_FOUND(미구현 메서드).
// 빈·모르는 topic 은 v1.3 도 ① 에서 NOT_FOUND 라 구 엔진과 구분되지 않는다(엔진 배포본 REA 확인 — REA_04_UI_EXT R-A2·4절). 직렬화 ≈4.1KB < 엔진 메시지 상한 64KB
export const APP_PROBE = { topic: 'refresh', d: 'x'.repeat(APP_MAX + 1) } as const
// 확인 응답 코드 → 지원 여부. 성공(null)·그 밖 거절 = 지원, NOT_FOUND(구 엔진)·TIMEOUT(응답 없음) = 미지원
export const appSupportedBy = (code: string | null) => code !== 'NOT_FOUND' && code !== 'TIMEOUT'

// 마이크 동의 — 서버 조회 결과({agreed, stored} | 응답 없음 null)와 이 기기 기록으로 할 일을 정한다(consent.tsx).
// mark = 동의된 것으로 / repost = 서버에 없고 이 기기엔 있음(전에 POST 실패) → 1회 다시 기록 / ask = 마이크 켤 때 묻는다.
// 서버를 모르면(미적용 stored:false·네트워크·오류) 이 기기 기록이 대신한다
export function consentPlan(server: { agreed?: boolean; stored?: boolean } | null, local: boolean) {
  if (server?.stored && server.agreed) return 'mark'
  if (!server?.stored) return local ? 'mark' : 'ask'
  return local ? 'repost' : 'ask'
}
// 동의 기록 POST 가 실패했을 때 이 기기 기록·동의 상태를 남길지(consent.tsx answer/repost). 서버를 모르는 실패(네트워크 0·5xx·세션 미복원 401)는 남긴다
//  (DB 미적용·일시 장애 폴백, 다음 입장 때 다시 기록). 서버가 거절한 4xx(403 참가 등록 없음·404·409 종료)는 지운다 — 남기면 음성 조각 SPEECH_NO_AGR →
//  reset → 다시 묻기가 동의할 때마다 반복됐다(F-U A3). 호출부는 지운 뒤 '저장 실패' 1회 알림
export const consentKeepLocal = (status: number) => status === 0 || status === 401 || status >= 500

// 부가 ⋯ 항목 거르기(15.1) — 내 역할에 보이는 것만, app 중계가 필요한 항목은 엔진 지원이 확인됐을 때만(확인 중 null·구 엔진 false = 숨김)
export function visibleExtras<T extends { roles: readonly PeerRole[]; app?: boolean }>(
  items: readonly T[],
  role: PeerRole,
  app: boolean | null,
): T[] {
  return items.filter((it) => it.roles.includes(role) && (!it.app || app === true))
}

// ── M3 (SIGNAL_API v1.1) ──

export type PeerRole = 'presenter' | 'panel' | 'audience'
export type PeerLike = { peerId: string; name: string; role: PeerRole; raisedTs: number }

// 발표자가 방에 있다 — 자막·AI 회의록처럼 발표자 state 로 켜진 panel 음성 처리는 발표자가 있을 때만 돈다.
// 발표자가 끊김 신호 없이 나가면(창 닫힘·망 단절) 끌 사람이 없어 panel 음성이 세미나 한도를 계속 쓰기 때문(R-P5)
export const presenterHere = (peers: readonly Pick<PeerLike, 'role'>[]) => peers.some((p) => p.role === 'presenter')

// 음성 조각 녹음 켜기 — 방에 있음·말하기 요청 있음·동의함, 발표자 아닌 무대 역할은 발표자가 있을 때만(room-view 가 이 판정만 쓴다)
// 서버 /api/speech/chunk 도 같은 규칙을 엔진 세션 역할로 확인한다(speech-gate stageGate·speech-rules stageAllowed — MEDIA_ADMIN_SECRET 설정 시, D-1)
export function speechOn(s: {
  live: boolean
  wants: readonly unknown[]
  agreed: boolean
  role: PeerRole
  peers: readonly Pick<PeerLike, 'role'>[]
}): boolean {
  return s.live && s.wants.length > 0 && s.agreed && (s.role === 'presenter' || presenterHere(s.peers))
}

// 발표자 state 로 켜진 방 상태(자막·AI 회의록)를 내려야 하나 — 발표자가 아니고, 입장했고, 발표자가 방에 없다
export const presenterGone = (role: PeerRole, selfId: string | null | undefined, peers: readonly Pick<PeerLike, 'role'>[]) =>
  role !== 'presenter' && !!selfId && !presenterHere(peers)

// 발표자 입장·재입장 때 현재 state 를 1번 방송하나 — 꺼져 있어도 false 로 panel 을 맞춘다(자막·AI 회의록 공통)
export const presenterResync = (role: PeerRole, appSupported: boolean | null, selfId: string | null | undefined) =>
  role === 'presenter' && appSupported === true && !!selfId

// 하단 바 버튼 우선순위(설계서 14.3 표) — 앞에서부터 메인 슬롯을 채운다. 가장 좁은 폭(≤370)의 청중은 반응보다 채팅이 앞
// (표의 "손들기·채팅"). 화질(M4)은 청중 맨 뒤 — 폭 > 565 에서 메인 5칸째, 그 아래는 더보기(넘친 것이 1개뿐이면 바로 노출)
export type BarId = 'audio' | 'video' | 'screen' | 'chat' | 'people' | 'hands' | 'hand' | 'react' | 'quality'
export function barOrder(role: PeerRole, width: number): BarId[] {
  if (role === 'audience')
    return width > BAR.slotWidths[2]
      ? ['hand', 'react', 'chat', 'people', 'quality']
      : ['hand', 'chat', 'react', 'people', 'quality']
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
// 무대로 올릴 수 있는 손든 청중(무시한 손 제외, 참가자 패널과 같은 순서) — 전체 화면 알림은 이 목록을 그대로 보여 준다(패널이 화면 밖이라)
export const handsWaiting = <T extends PeerLike>(peers: T[], dismissed: ReadonlySet<string>): T[] =>
  sortPeers(peers.filter((p) => p.role === 'audience' && p.raisedTs > 0 && !dismissed.has(handKey(p))))
export function handNotice<T extends PeerLike>(peers: T[], dismissed: ReadonlySet<string>): HandNotice<T> {
  const waiting = handsWaiting(peers, dismissed)
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

// 원격 트랙 주인(SIGNAL_API v1.1.2) — consumerCreated.peer(발행자 peerId)가 정본. 비어 있으면(구 엔진) producer 마다 따로 묶어
// 남의 카메라끼리 한 타일로 합쳐지지 않게 한다(추측 금지 — 주인 모르는 트랙은 각자 이름 없는 "발표자" 타일)
export const ownerKey = (peer: string | undefined, producerId: string) => peer || `?${producerId}`

// 무대 묶음 — 화면공유는 각자 타일, 카메라·마이크는 주인별 1타일(같은 주인의 같은 종류가 또 오면 마지막 것)
export type TrackLike = { peerId: string; kind: 'audio' | 'video'; source: string }
export function groupTracks<T extends TrackLike>(tracks: T[]): { screens: T[]; groups: Map<string, { cam?: T; mic?: T }> } {
  const screens: T[] = []
  const groups = new Map<string, { cam?: T; mic?: T }>()
  for (const tr of tracks) {
    if (tr.source === 'screen') {
      screens.push(tr)
      continue
    }
    const g = groups.get(tr.peerId) ?? {}
    if (tr.kind === 'audio') g.mic = tr
    else g.cam = tr
    groups.set(tr.peerId, g)
  }
  return { screens, groups }
}

// ── M4 수신 화질(설계서 14.2)·품질 알림(14.1·6.3) ──

// 렌더 높이 × 배율(DPR > 2 면 2, 그 외 1) : < 360 → 0(l), < 720 → 1(m), 그 외 2(h). 100ms 디바운스, 화면 밖 2초 이상·탭 숨김 → 0
export const LAYER = { steps: [360, 720], debounceMs: 100, offscreenMs: 2000, top: 2 }
export type Layer = 0 | 1 | 2
export function layerFor(height: number, dpr: number): Layer {
  const h = height * (dpr > 2 ? 2 : 1)
  return h < LAYER.steps[0] ? 0 : h < LAYER.steps[1] ? 1 : 2
}
// offMs = 화면 밖으로 나간 뒤 경과(보이면 null). 클라이언트용 consumer.pause 가 없어 "받지 않음" 대신 최저 레이어(SIGNAL_API 3.4)
export function wantLayer(i: { height: number; dpr: number; offMs: number | null; hidden: boolean }): Layer {
  if (i.hidden || (i.offMs != null && i.offMs >= LAYER.offscreenMs)) return 0
  return layerFor(i.height, i.dpr)
}

// 청중 수동 화질 상한(하단 바 '화질') — 자동 계산값을 넘지 못하게 자른다
export type QualityCap = 'auto' | 'high' | 'medium' | 'low'
export const QUALITY_CAPS: QualityCap[] = ['auto', 'high', 'medium', 'low']
const CAP: Record<QualityCap, Layer> = { auto: 2, high: 2, medium: 1, low: 0 }
export const capLayer = (want: Layer, cap: QualityCap): Layer => Math.min(want, CAP[cap]) as Layer

// setLayer 송신기 — consumer 마다 100ms 디바운스, 마지막으로 보낸 값과 같으면 보내지 않는다(처음 기준 = 서버 기본 최고 레이어).
// timers 는 시험이 바꿔 끼운다
type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (t: unknown) => void }
const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
}
export function layerSender(send: (consumerId: string, maxSpatial: Layer) => void, timers: Timers = realTimers) {
  const sent = new Map<string, Layer>()
  const due = new Map<string, unknown>()
  const cancel = (id: string) => {
    if (due.has(id)) timers.clear(due.get(id))
    due.delete(id)
  }
  return {
    update(id: string, v: Layer) {
      cancel(id)
      if ((sent.get(id) ?? LAYER.top) === v) return
      const fire = () => {
        due.delete(id)
        sent.set(id, v)
        send(id, v)
      }
      due.set(id, timers.set(fire, LAYER.debounceMs))
    },
    // consumer 가 사라짐
    forget(id: string) {
      cancel(id)
      sent.delete(id)
    },
    // 세션 정리
    reset() {
      for (const id of [...due.keys()]) cancel(id)
      sent.clear()
    },
  }
}

// ntf score 등급(SIGNAL_API 3.4) — 알림 전 기본은 excellent. 여러 Consumer 중 가장 나쁜 것을 보인다
export type Grade = 'excellent' | 'good' | 'poor' | 'lost'
const GRADE_RANK: Record<Grade, number> = { excellent: 0, good: 1, poor: 2, lost: 3 }
export function worstGrade(grades: Iterable<Grade>): Grade {
  let w: Grade = 'excellent'
  for (const g of grades) if (GRADE_RANK[g] > GRADE_RANK[w]) w = g
  return w
}
export const isBadGrade = (g: Grade) => g === 'poor' || g === 'lost'

// 품질 알림 표시(설계서 14.1) — 나빠지면 즉시, 회복 뒤 hideMs 지나야 숨김(그사이 다시 나빠지면 계속 표시). okAt = 회복 시각(0 = 없음)
export const TOAST = { hideMs: 5000 }
export type ToastState = { shown: boolean; okAt: number }
export function nextToast(st: ToastState, bad: boolean, now: number): ToastState {
  if (bad) return st.shown && !st.okAt ? st : { shown: true, okAt: 0 }
  if (!st.shown) return st
  if (!st.okAt) return { shown: true, okAt: now }
  return now - st.okAt >= TOAST.hideMs ? { shown: false, okAt: 0 } : st
}

// ── v1.2 사회·레이아웃·발언자(SIGNAL_API 3.5) ──

export type Locks = { audio: boolean; video: boolean }
export const NO_LOCKS: Locks = { audio: false, video: false }
// 내가 못 켜는 종류 — 잠금은 발표자 외 전원(서버도 LOCKED 로 막는다, 화면은 버튼을 미리 막고 이유를 보인다)
export const lockedFor = (role: PeerRole, locks: Locks): Locks => (role === 'presenter' ? NO_LOCKS : locks)

// 참가자별 마이크·카메라 상태(true = 켜짐, false = 꺼짐, 없음 = 발행 안 함) — 화면공유는 사회 대상 아님
export type PeerMedia = { audio?: boolean; video?: boolean }
export function peerMedia(tracks: (TrackLike & { paused: boolean })[]): Map<string, PeerMedia> {
  const out = new Map<string, PeerMedia>()
  for (const tr of tracks) {
    if (tr.source === 'screen') continue
    const m = out.get(tr.peerId) ?? {}
    m[tr.kind] = !tr.paused
    out.set(tr.peerId, m)
  }
  return out
}

// 참가자 줄 사회 동작(발표자만, 대상이 발표자면 없음) — 켜진 마이크 끄기 / 꺼진·없는 마이크 켜기 요청(panel, 잠금 아닐 때) / 켜진 카메라 끄기
export type ModAction = 'muteMic' | 'askMic' | 'muteCam'
export function modActions(viewer: PeerRole, peer: PeerLike, media: PeerMedia | undefined, locks: Locks): ModAction[] {
  if (viewer !== 'presenter' || peer.role === 'presenter') return []
  const out: ModAction[] = []
  if (media?.audio === true) out.push('muteMic')
  else if (peer.role === 'panel' && !locks.audio) out.push('askMic')
  if (media?.video === true) out.push('muteCam')
  return out
}

// 레이아웃(ntf layout) — 발표자가 아닌 사람이 따라 볼 타일 키. 따라 보기가 아니거나 auto 면 null(자기 무대 규칙)
export type RoomLayout = { mode: 'auto' | 'spotlight'; spotlight: string; follow: boolean }
export function followKey(layout: RoomLayout | null, viewer: PeerRole): string | null {
  if (!layout || viewer === 'presenter' || !layout.follow || layout.mode !== 'spotlight') return null
  return layout.spotlight || null
}

// 발표자 무대 고정 → room.setLayout. 내 화면공유 타일 키(screen:self)는 다른 사람에게 보이는 키(screen:<producerId>)로 바꾼다
// (모르면 null = 보내지 않음). 고정 해제(null)는 auto
export function layoutFor(pin: string | null, screenProducerId: string | undefined): RoomLayout | null {
  if (!pin) return { mode: 'auto', spotlight: '', follow: true }
  const key = pin === 'screen:self' ? (screenProducerId ? `screen:${screenProducerId}` : null) : pin
  return key ? { mode: 'spotlight', spotlight: key, follow: true } : null
}

// 말하기 링 — 엔진 발언자(ntf activeSpeaker)를 쓸 수 있으면 그 사람 타일만, 아니면 undefined(타일이 AudioContext 로 직접 판정)
export function ringFor(peerId: string | undefined, speaker: string | null, engine: boolean): boolean | undefined {
  if (!engine) return undefined
  return !!peerId && peerId === speaker
}

// 영상 효과 파이프라인(effects.ts) 프레임 그리기 판정 — 새 프레임이고 카메라가 켜졌을 때만.
// 카메라 끔(track.enabled=false)은 검은 프레임이라 그리면 조명 보정이 어둠을 재 배율이 최대(1.8)로 치솟고(다시 켜면 약 2초 과노출),
// 배경 분리도 헛돈다(CPU·배터리). 끈 동안 송출은 서버가 일시정지(producer.pause), 내 타일은 꺼짐 표시라 마지막 프레임이 남아도 보이지 않는다
export function fxFrameDue(v: { enabled: boolean; w: number; h: number; ready: number; time: number; last: number }): boolean {
  return v.enabled && v.w > 0 && v.h > 0 && v.ready >= 2 && v.time !== v.last
}

// 영상 효과 연속 실패 1회 기록 — true = 상한 도달(끌 때). 끌 때 횟수를 지운다 : 남겨 두면 파이프라인이 다른 효과(조명 등)로 살아 있는 동안
// 다시 켠 효과가 실패 1번(상한+1)에 바로 다시 꺼진다. 시험 room-rules.test.mjs
export function failHit<K>(fails: Map<K, number>, k: K, max: number): boolean {
  const n = (fails.get(k) ?? 0) + 1
  if (n < max) {
    fails.set(k, n)
    return false
  }
  fails.delete(k)
  return true
}

// 열린 <dialog> 중 맨 위(문서상 마지막) — 화면 알림을 그 안에 그린다. showModal 은 바깥을 inert 로 만들어
// 바깥 알림은 시트 뒤에 가려지고 낭독도 되지 않는다(효과 시트의 소음 줄 실패 등, 야간 r6 T05). 시험 room-rules.test.mjs
export function topDialog<T extends { open: boolean }>(list: ArrayLike<T>): T | null {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].open) return list[i]
  return null
}

// 내 마이크·카메라 켜기/끄기 계획 — 켜려는데 트랙이 장치 쪽에서 끝났으면(앱 전환·장치 분리) 새 트랙을 받아 같은 송신기에 끼운다.
// 끄기는 끝난 트랙이어도 서버 일시정지만(권한 팝업 없음). 시험 swap-sender.test.mjs
export const localPlan = (on: boolean, ready: string): 'reacquire' | 'toggle' =>
  on && ready !== 'live' ? 'reacquire' : 'toggle'

// 트랙 끝남 구독 — 이미 끝난 트랙이면 바로 부른다. 'ended' 는 한 번만 쏘므로 발행 신호 왕복(수백 ms~수 초) 사이에 끝난 트랙에
// 나중에 리스너를 달면 영영 못 듣는다(청중 멈춘 화면·효과 조용히 무시). 반환 = 구독 해제. 시험 swap-sender.test.mjs
export type EndableTrack = {
  readonly readyState: string
  addEventListener(type: 'ended', fn: () => void): void
  removeEventListener(type: 'ended', fn: () => void): void
}
export function onTrackEnd(t: EndableTrack, fn: () => void): () => void {
  if (t.readyState === 'ended') {
    fn()
    return () => {}
  }
  t.addEventListener('ended', fn)
  return () => t.removeEventListener('ended', fn)
}

// 송신기 트랙을 처리 트랙으로 바꾸고 되돌리기 함수를 준다. replaceTrack 은 비동기라 sender.track 이 늦게 바뀐다 — 교체가 끝나기 전에
// 되돌리면(효과 빠른 켬·끔, 개발 StrictMode 이중 실행, 강등) 'sender.track === out' 검사가 거짓이라 되돌리지 않고, 늦게 끝난 교체가 이미 멈춘
// 처리 트랙을 송신기에 남겨 청중 영상이 멈췄다(ended). 교체 요청은 PC 작업 큐에서 순서대로 처리되므로 대기 중이면 되돌리기를 뒤에 건다.
// 시험 room-rules.test.mjs
export type SenderLike<T> = { readonly track: T | null; replaceTrack(t: T | null): Promise<void> }
export function swapSender<T>(sender: SenderLike<T> | null, out: T, back: () => T | null): () => void {
  if (!sender) return () => {}
  let pending = true
  sender
    .replaceTrack(out)
    .catch(() => {})
    .finally(() => {
      pending = false
    })
  return () => {
    if (pending || sender.track === out) sender.replaceTrack(back()).catch(() => {})
  }
}
