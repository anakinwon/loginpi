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
//  'pending' = 아직 진행 중이거나 판정 불가(타임아웃·5xx) → 새 결제를 막는다(안전 쪽)
export type PiLookup =
  | { ok: true; payment: { status: { cancelled: boolean; user_cancelled: boolean } } }
  | { ok: false; status: number }
export const stalePayState = (r: PiLookup): 'gone' | 'pending' =>
  r.ok
    ? r.payment.status.cancelled || r.payment.status.user_cancelled
      ? 'gone'
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
