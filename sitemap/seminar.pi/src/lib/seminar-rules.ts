// 세미나 순수 규칙 — 목록 탭·페이지 해석, 입장료 표기·입력 검사, DB 함수 결과 코드·결제 실패 코드 → apiError 코드 매핑.
// 서버·클라이언트 공용(server-only 없음). 시험 : node src/lib/seminar-rules.test.mjs (Node 24 타입 제거로 .ts 직접 읽음)

export const PAGE_SIZE = 12
export const TABS = ['all', 'hosted', 'joined'] as const
export type Tab = (typeof TABS)[number]
// 입장 가능 상태(PRD D-4) — ENDED·CANCELED 는 입장 불가
export const OPEN_STS = ['SCHEDULED', 'LIVE'] as const

export const parseTab = (v: string | null | undefined): Tab =>
  (TABS as readonly string[]).includes(v ?? '') ? (v as Tab) : 'all'

// 1 부터. 숫자 아님·0 이하·과대값은 1(과대 offset 조회 방지 상한 1000)
// 목록이 줄어 현재 쪽이 마지막 쪽을 넘으면 마지막 쪽으로 — Q&A 2쪽의 마지막 질문을 답변·숨기면 빈 2쪽에 쪽 버튼 없이 갇히던 결함(야간 시험 T04 r2). Pagination 이 쓴다
export const clampPage = (page: number, pages: number) => Math.min(page, Math.max(1, pages))

export const parsePage = (v: string | null | undefined): number => {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1
}

export const pageCount = (total: number) =>
  Math.max(1, Math.ceil(total / PAGE_SIZE))

// 엔진 방 요약(관리 API GET /admin/rooms) — end 는 Go time.Time 이라 omitempty 가 듣지 않아 미설정이면 0001-01-01 로 온다
export type EngineRoom = { id: string; cap: number; peers: number; producers: number; end?: string | null }
// 방 관리 화면 쪽 나눔(엔진은 전량을 준다, MaxRooms 200) — 접속자 많은 방 먼저, 같으면 ID 순(쪽 경계 고정). 미설정 종료 시각 = null
export function roomPage(rooms: EngineRoom[], page: number) {
  const sorted = [...rooms].sort((a, b) => b.peers - a.peers || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const p = clampPage(page, pageCount(sorted.length))
  const rows = sorted
    .slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE)
    .map((r) => ({ ...r, end: r.end && Date.parse(r.end) > 0 ? r.end : null }))
  return { rows, total: sorted.length, page: p }
}

// 한 줄 이름(세미나·회의록 제목) — 제어문자(줄바꿈·NUL 등) 금지. 화면 입력칸은 한 줄이라 API 직접 호출만 걸린다.
//  제목은 .ics·메일 제목·Markdown 머리로 흘러가므로 들어오는 곳에서 막는다(야간 시험 T01 r4). TAB 은 붙여넣기에 섞여 오므로 허용(.ics 도 TAB 보존)
//  C1 제어문자(U+0080~009F, NEL 포함)·줄/문단 구분자(U+2028·2029)도 줄바꿈으로 읽는 처리기가 있어 함께 막는다(T01 r6)
export const ONE_LINE_RE = /^[^\u0000-\u0008\u000A-\u001F\u007F-\u009F\u2028\u2029]*$/

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && UUID_RE.test(v)

// 대기실 머리말 — 세미나 방(uuid)은 페이지가 세미나 제목을 h1 로 이미 그리므로 h2 + 고정 문구(UUID 원문 노출 금지),
// 실험실 방 코드는 사람이 정한 이름이라 h1 에 그대로
export const prejoinHeading = (room: string) =>
  isUuid(room) ? ({ level: 2, key: 'titleSeminar' } as const) : ({ level: 1, key: 'title' } as const)

// 세미나 요금제(sql/018 smn_mst.plan_cd) — 개설 때 개최자가 고른다. 시간 차감·AI 허용은 그 요금제 이용권 기준
export const PLAN_CDS = ['FREE', 'M', 'Y'] as const
export type PlanCd = (typeof PLAN_CDS)[number]
export type PlanPool = { sec: number; endAt: string | null }
export const isPlanCd = (v: unknown): v is PlanCd => typeof v === 'string' && (PLAN_CDS as readonly string[]).includes(v)

// 세미나 만들기 기본 요금제 — 남은 시간이 있는 유료 이용권이 있으면 그것(둘 다면 늦게 끝나는 쪽, 같으면 연간), 없으면 무료(마스터 2026-10-29)
export function pickPlan(by: Partial<Record<PlanCd, PlanPool>> | null | undefined): PlanCd {
  const paid = (['Y', 'M'] as const).filter((cd) => (by?.[cd]?.sec ?? 0) > 0)
  if (!paid.length) return 'FREE'
  const end = (cd: PlanCd) => Date.parse(by?.[cd]?.endAt ?? '') || 0
  return paid.reduce((a, b) => (end(b) > end(a) ? b : a))
}

// 입장료 입력 — Pi 소수 7자리까지(NUMERIC(18,7) = 정수부 11자리)
export const FEE_RE = /^\d{1,11}(\.\d{1,7})?$/

// 입장료 표기 — 0(무료)이면 null, 아니면 소수 끝 0 을 뺀 문자열(1.5000000 → '1.5')
export function formatFee(amt: number | string | null | undefined) {
  const n = Number(amt)
  if (!Number.isFinite(n) || n <= 0) return null
  return n.toFixed(7).replace(/\.?0+$/, '')
}

type Err = { code: string; status: number } | null

// fn_join_smn 결과 → 오류(OK·ALREADY = 성공)
export function joinError(rslt: string | null | undefined): Err {
  switch (rslt) {
    case 'OK':
    case 'ALREADY':
      return null
    case 'NOT_FOUND':
      return { code: 'NOT_FOUND', status: 404 }
    case 'CLOSED':
      return { code: 'SMN_CLOSED', status: 409 }
    case 'FULL':
      return { code: 'SMN_FULL', status: 409 }
    case 'PAY_REQUIRED':
      return { code: 'SMN_PAY_REQUIRED', status: 402 }
    case 'PAY_INVALID':
      return { code: 'SMN_PAY_INVALID', status: 400 }
    default:
      return { code: 'INTERNAL', status: 500 }
  }
}

// fn_chk_smn_cap 결과 → 오류(OK = 통과)
export function capError(rslt: string | null | undefined): Err {
  switch (rslt) {
    case 'OK':
      return null
    case 'ALREADY':
      return { code: 'SMN_ALREADY', status: 409 }
    default:
      return joinError(rslt)
  }
}

// @pi/payments PayFail.code → 앱 apiError 코드(README 매핑 표). 검증기 고유 코드(SMN_*·NOT_FOUND)는 그대로
const PAY_CODES: Record<string, string> = {
  SERVER_CONFIG: 'SERVER_CONFIG',
  PI_API_FAILED: 'PAY_PI_FAILED',
  NOT_PAYER: 'PAY_MISMATCH',
  META_INVALID: 'PAY_MISMATCH',
  TXID_MISMATCH: 'PAY_MISMATCH',
  NOT_FOUND: 'PAY_MISMATCH',
  AMOUNT_MISMATCH: 'PAY_AMOUNT_MISMATCH',
  PAYMENT_CANCELLED: 'PAY_CANCELLED',
  ALREADY_PAID: 'PAY_ALREADY_PAID',
  INVALID_STATE: 'PAY_INVALID_STATE',
  PI_CANCEL_REFUSED: 'PAY_PI_CANCEL_REFUSED',
  DB_FAILED: 'DB_UNAVAILABLE',
}
export const payErrorCode = (code: string) =>
  code.startsWith('SMN_') ? code : (PAY_CODES[code] ?? 'INTERNAL')

// 이전 APPROVED 결제의 Pi 조회 결과 → 정리할지(보안 검토 S2). 'gone' = Pi 에서 취소·만료(또는 404 없음) → 원장 CANCELED,
//  'abandoned' = 승인됐지만 지갑 서명 없이(거래 없음) SIGN_WAIT_MS 가 지남 — 사용자가 지갑을 그냥 닫은 것(예 잔액 부족 안내 뒤). 막지 않는다.
//   Pi 는 앱 서버의 사용자→앱 결제 취소를 거부하므로(403 'only cancel app-to-user payments') 정리할 수 없다 — 원장은 APPROVED 그대로 두어,
//   나중에라도 서명되면 complete 가 정상 반영된다(돈 손실 없음). 2026-10-29 실기기 : 잔액 부족 → 지갑 닫음 → 다음 결제가 계속 409 로 막혀 빠져나갈 길이 없던 결함
//  'pending' = 서명돼 거래 진행 중, 서명 대기 중(SIGN_WAIT_MS 안), 판정 불가(타임아웃·5xx) → 새 결제를 막는다(안전 쪽)
export const SIGN_WAIT_MS = 3 * 60 * 1000
export type PiLookup =
  | { ok: true; payment: { status: { cancelled: boolean; user_cancelled: boolean }; transaction?: { txid?: string } | null; created_at?: string } }
  | { ok: false; status: number }
export const stalePayState = (r: PiLookup, now = Date.now()): 'gone' | 'abandoned' | 'pending' =>
  r.ok
    ? r.payment.status.cancelled || r.payment.status.user_cancelled
      ? 'gone'
      : !r.payment.transaction?.txid && now - (Date.parse(r.payment.created_at ?? '') || now) > SIGN_WAIT_MS
        ? 'abandoned'
        : 'pending'
    : r.status === 404
      ? 'gone'
      : 'pending'

// 이전 결제 정리 상한(R-P4 — Pi 조회는 병렬, 이 수를 넘으면 정리하지 않고 막는다)
export const STALE_LOOKUP_MAX = 3

// 개설 시작일시 — 지금 이후 ~ 1년 안(보안 검토 S5)
export const START_AHEAD_MAX_MS = 366 * 24 * 60 * 60 * 1000
export const startAtOk = (ms: number, now = Date.now()) =>
  Number.isFinite(ms) && ms > now && ms <= now + START_AHEAD_MAX_MS

// 세미나 룸 이름 = 섬 이름 + ' - ' + 부제(sql/012, 마스터 2026-10-28). 부제가 없거나 공백이면 섬 이름만
export const SUB_TTL_MAX = 60
export const smnTitle = (nm: string, sub?: string | null) => (sub?.trim() ? `${nm} - ${sub.trim()}` : nm)

// 룸 안 이름 신호(sql/014) — app.send('refresh', {what:'name', name}) 또는 {what:'title'}. 보낸 사람(from)은 엔진이 채워 위조 불가.
// 맞지 않으면 null(버린다). 별명은 한 줄 1~NCKNM_MAX 자
export const NCKNM_MAX = 30
export function parseNameSignal(d: unknown): { what: 'name'; name: string } | { what: 'title' } | null {
  if (!d || typeof d !== 'object') return null
  const { what, name } = d as { what?: unknown; name?: unknown }
  if (what === 'title') return { what }
  if (what !== 'name' || typeof name !== 'string') return null
  const n = name.trim()
  return nameOk(n) ? { what, name: n } : null
}

// 별명 형식 — 한 줄 1~30자 + 서식 문자(\p{Cf} : 방향 바꿈·폭 0 문자) 금지(보안 검토 : 'RLO' 등으로 다른 이름처럼 보이게 하는 사칭)
export const nameOk = (n: string) =>
  !!n && [...n].length <= NCKNM_MAX && ONE_LINE_RE.test(n) && !/\p{Cf}/u.test(n) && scriptsOk(n)

// 문자 체계 섞기 제한(UTS #39 'Highly Restrictive' 축약) — 한 체계만, 또는 라틴+한자+한글 / 라틴+한자+가나 조합만.
// 라틴·키릴·그리스를 섞은 닮은꼴(예 'аnakin' 의 키릴 а)로 남의 이름처럼 보이게 하는 사칭을 막는다.
// ponytail: 한 체계 안의 닮은꼴(전부 키릴로 쓴 이름)은 못 막는다 — 필요하면 TR39 skeleton(confusables 표) 도입
const SCRIPTS = ['Latin', 'Hangul', 'Han', 'Hiragana', 'Katakana', 'Cyrillic', 'Greek', 'Arabic', 'Hebrew', 'Thai'] as const
const MIXES: readonly (readonly string[])[] = [['Latin', 'Han', 'Hangul'], ['Latin', 'Han', 'Hiragana', 'Katakana']]
function scriptsOk(n: string) {
  const used = SCRIPTS.filter((s) => new RegExp(String.raw`\p{Script=${s}}`, 'u').test(n))
  return used.length <= 1 || MIXES.some((m) => used.every((s) => m.includes(s)))
}
// 이름 비교 키 — 호환 정규화(NFKC)·대소문자·공백 무시. 같은 세미나의 개최자 이름·다른 별명과 같으면 사칭으로 본다
export const nameKey = (n: string) => n.normalize('NFKC').toLowerCase().replace(/\s+/g, '')

// 구 엔진(app.send 없음, v1.3 미만) 예비 통로 — 이름 변경을 채팅 글에 표식을 붙여 보낸다. 받는 화면은 채팅 목록에 넣지 않고 이름만 바꾼다.
// 표식 = 보이지 않는 구분 문자(U+2063) + 'smn-name:' — 사람이 채팅으로 칠 일이 없는 값
export const NAME_MARK = '⁣smn-name:'
export const nameFromChat = (text: string) => (text.startsWith(NAME_MARK) ? parseNameSignal({ what: 'name', name: text.slice(NAME_MARK.length) }) : null)
// 제목(부제) 변경 표식 — 내용 없이 '다시 읽어라'만(받는 화면이 서버에서 제목을 다시 읽으니 위조해도 바뀌는 것 없음)
export const TITLE_MARK = '⁣smn-title'
// 상태(녹화·AI 기록 고지, 'state' 주제) 표식 — 구 엔진에서 전원 고지(M-4)를 채팅으로 이어 보낼 때(마스터 2026-10-29 : 엔진 교체 없이 녹화).
//  내용 = JSON(작은 객체만). 받는 쪽 기능이 보낸 사람 역할을 다시 확인한다(녹화 배지는 발표자가 알린 것만 — recording rules othersRecording)
export const STATE_MARK = '⁣smn-state:'
const STATE_MAX = 512
export function stateFromChat(text: string): Record<string, unknown> | undefined {
  if (!text.startsWith(STATE_MARK) || text.length > STATE_MARK.length + STATE_MAX) return undefined
  try {
    const d: unknown = JSON.parse(text.slice(STATE_MARK.length))
    return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

// 홈 세미나 달력(마스터 2026-10-30) — 지난 이력 포함(종료까지, 취소 제외), 한 번에 한 달 남짓·최대 CAL_MAX 건.
//  화면은 지난 CAL_BACK_MONTHS ~ 앞 CAL_AHEAD_MONTHS 달만 넘긴다 — 서버도 같은 범위(+여유)만 받는다(종료 이력 전체 나열 방지)
export const CAL_STS = ['SCHEDULED', 'LIVE', 'ENDED'] as const
export const CAL_BACK_MONTHS = 12
export const CAL_AHEAD_MONTHS = 12
const DAY_MS = 24 * 60 * 60 * 1000
export const CAL_SPAN_MAX_MS = 45 * DAY_MS
export const CAL_MAX = 200
export const calRangeOk = (from: number, to: number, now = Date.now()) =>
  Number.isFinite(from) &&
  Number.isFinite(to) &&
  to > from &&
  to - from <= CAL_SPAN_MAX_MS &&
  from >= now - (CAL_BACK_MONTHS + 1) * 31 * DAY_MS &&
  to <= now + (CAL_AHEAD_MONTHS + 2) * 31 * DAY_MS
// 지난 세미나 — 종료, 또는 열리지 않고 시작이 지난 예정·하루 넘게 닫히지 않은 진행 중(상태 전이가 개최자 종료·요금제 소진뿐이라 남는다)
export const smnPast = (status: string, startAt: string, now = Date.now()) =>
  status === 'ENDED' || Date.parse(startAt) < now - (status === 'LIVE' ? DAY_MS : 0)

// 관리자 시간 관리(사용자관리, sql/024) — 요금제별 남은 시간을 이용권 행에서 계산(목록 화면 — 행마다 fn_rem_smn_plan_cd 를 부르면 무료 이용권을 만들어 버려 읽기만).
//  이번 달 무료 이용권이 아직 없으면(로그인만 하고 개최 안 함) 무료 1시간이 있는 것으로 보인다(첫 개최·조정 때 DB 가 만든다). 유효 = 시작 ≤ 지금 < 만료
export const ADJ_PLANS = ['FREE', 'M', 'Y'] as const
export type AdjPlan = (typeof ADJ_PLANS)[number]
export const ADJ_FREE_SEC = 3600 // 이번 달 무료 = plan-rules PLAN.freeSec·sql/015 와 같은 값(plan-rules 는 node:crypto 라 화면에서 못 읽음)
export const ADJ_MAX_MIN = 60_000 // 축소 1회 최대 1000시간(fn_adj_smn_plan 3,600,000초와 같다)
// 관리자 서비스권(마스터 2026-10-31) = 무료 시간 — H1 1시간권 · D1 1일권 · M1 1개월권(지금부터 그 기간, sql/024 fn_svc_smn_plan).
//  소진은 시간권 → 일권 → 월권 순 자동(이용권 기간 짧은 것부터 차감, sql/025 fn_hb_smn_hst)
export const SVC_CDS = ['H1', 'D1', 'M1'] as const
export type SvcCd = (typeof SVC_CDS)[number]
export type PassRow = { plan_cd: string; grnt_sec_cnt: number; use_sec_cnt: number; strt_dtm: string; end_dtm: string; grnt_rsn_cd: string }
export type PlanTime = { sec: number; endAt: string | null }
export const monthStartUtc = (nowMs: number) => {
  const d = new Date(nowMs)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
}
export function planTimes(rows: PassRow[], nowMs: number): Record<AdjPlan, PlanTime> {
  const out: Record<AdjPlan, PlanTime> = { FREE: { sec: 0, endAt: null }, M: { sec: 0, endAt: null }, Y: { sec: 0, endAt: null } }
  const mon = monthStartUtc(nowMs)
  let freeIssued = false
  for (const r of rows) {
    const cd = r.plan_cd as AdjPlan
    if (!(ADJ_PLANS as readonly string[]).includes(cd)) continue
    const strt = Date.parse(r.strt_dtm)
    const end = Date.parse(r.end_dtm)
    if (r.grnt_rsn_cd === 'FREE' && strt === mon) freeIssued = true
    const left = r.grnt_sec_cnt - r.use_sec_cnt
    if (!(strt <= nowMs && end > nowMs) || left <= 0) continue // 소진된 이용권은 만료 계산에서도 뺀다(fn_rem_smn_plan_cd 와 같다)
    out[cd].sec += left
    if (!out[cd].endAt || end > Date.parse(out[cd].endAt!)) out[cd].endAt = new Date(end).toISOString()
  }
  if (!freeIssued) {
    out.FREE.sec += ADJ_FREE_SEC
    const next = new Date(mon)
    next.setUTCMonth(next.getUTCMonth() + 1)
    if (!out.FREE.endAt || next.getTime() > Date.parse(out.FREE.endAt)) out.FREE.endAt = next.toISOString()
  }
  return out
}
