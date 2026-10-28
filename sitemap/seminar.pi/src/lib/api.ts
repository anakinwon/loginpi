// seminar.pi API 공용 — 에러 카탈로그(code → messages apiErrors.<CODE>), DB 가용성 래퍼(미설정·미연결 = 503), 인증·관리자 게이트.
// sitemap.pi src/lib/api.ts 에서 로그인에 필요한 부분만 가져옴. 사용: export const GET = withGuard(dbRoute(async (req) => { ... }))
import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import {
  AUTH_ERRORS,
  COMMON_ERRORS,
  createApiError,
  type Handler,
} from '@pi/guard'
import { getSupabaseAdmin, resolveDbConfig, type UserRow } from '@pi/db'
import { getSessionUser, isAdmin } from './auth'

export const apiError = createApiError({
  ...COMMON_ERRORS,
  ...AUTH_ERRORS,
  DB_UNAVAILABLE: '데이터베이스에 연결할 수 없습니다. 잠시 후 다시 시도하세요',
  NOT_FOUND: '대상을 찾을 수 없습니다',
  // Google 로그인 ↔ Pi 계정 연동(sql/001)
  AUTH_GOOGLE_REQUIRED: 'Google 로그인이 필요합니다',
  LINK_CODE_INVALID:
    '연동 코드가 올바르지 않거나 만료되었습니다. Pi Browser 에서 다시 발급하세요',
  LINK_ALREADY_LINKED: '이미 연동된 계정입니다',
  LINK_CODE_GEN_FAILED:
    '연동 코드를 만들지 못했습니다. 잠시 후 다시 시도하세요',
  LINK_TRY_LIMIT:
    '연동 코드를 여러 번 틀렸습니다. 15분 뒤에 다시 시도하세요',
  // 세미나 입장(sql/004 fn_join_smn·fn_chk_smn_cap 결과, src/lib/seminar-rules.ts 매핑)
  SMN_FULL: '정원이 찼습니다',
  SMN_CLOSED: '종료되었거나 취소된 세미나입니다',
  SMN_ALREADY: '이미 참가 등록된 세미나입니다',
  SMN_FREE: '무료 세미나는 결제하지 않습니다',
  SMN_PAY_REQUIRED: '유료 세미나입니다. 결제 후 입장하세요',
  SMN_PAY_INVALID: '결제 정보를 확인할 수 없습니다',
  // 세미나 개설(sql/011 fn_crt_smn) — 진행·예정 세미나가 섬 이름 수만큼 열려 있음
  ISLAND_FULL: '지금 쓸 수 있는 섬 이름이 없습니다',
  // 내 Google 일정(api/calendar/events) — 주소가 틀렸거나 Google 이 응답하지 않음
  CAL_READ_FAILED: '일정을 불러오지 못했습니다',
  // 세미나 별명(sql/014) — 개최자 이름·다른 참가자 별명과 같음(사칭 방지)
  NAME_TAKEN: '이미 다른 사람이 쓰는 이름입니다',
  // 결제(@pi/payments PayFail 매핑)
  PAY_PI_FAILED: 'Pi 결제 서버와 통신하지 못했습니다. 잠시 후 다시 시도하세요',
  PAY_MISMATCH: '결제 정보가 일치하지 않습니다',
  PAY_AMOUNT_MISMATCH: '결제 금액이 입장료와 다릅니다',
  PAY_CANCELLED: '취소된 결제입니다',
  PAY_ALREADY_PAID: '처리 중인 결제가 있습니다. 지갑에서 서명 중이었다면 3분 뒤 다시 시도하세요',
  PAY_INVALID_STATE: '결제를 처리할 수 없는 상태입니다',
  PAY_PI_CANCEL_REFUSED:
    '결제가 이미 진행 중이라 취소할 수 없습니다. 잠시 후 다시 확인하세요',
  // 개최자 요금제(sql/015, src/lib/plan.ts)
  PRICE_UNAVAILABLE: 'Pi 시세를 확인하지 못했습니다. 잠시 후 다시 시도하세요',
  QUOTE_EXPIRED: '결제 견적 시간이 지났습니다. 다시 결제하세요',
  PLAN_EXHAUSTED: '세미나 이용 시간을 모두 썼습니다. 요금제에서 시간을 충전하세요',
  PLAN_AI_PAID: 'AI 기능은 유료 요금제에서 쓸 수 있습니다',
  PLAN_EXPIRES_BEFORE_START: '시작 일시가 이 요금제 이용권 만료 뒤입니다',
  // 녹화(sql/023) — 로컬 저장, 월간·연간 세미나만, 녹화 시간 추가 차감
  REC_PAID_ONLY: '녹화는 월간·연간 요금제 세미나에서 유료 시간이 남아 있을 때만 쓸 수 있습니다',
  REC_NOT_IN_ROOM: '룸 입장 확인 중입니다. 잠시 뒤 다시 시도하세요',
  // 음성 처리(sql/008 fn_use_smn_vc 결과, src/lib/speech-rules.ts 매핑) — UI 문구에 외부 AI 상표 금지
  AI_UNAVAILABLE: 'AI 기능을 지금 쓸 수 없습니다',
  SPEECH_CHUNK_INVALID: '음성 조각 형식이 올바르지 않습니다',
  SPEECH_NOT_LIVE: '진행 중인 세미나가 아닙니다',
  SPEECH_NO_AGR: '음성 처리 동의가 필요합니다',
  SPEECH_RATE: '음성 요청이 너무 잦습니다. 잠시 후 다시 시도하세요',
  SPEECH_QUOTA: '이 세미나의 음성 처리 시간이 모두 소진되었습니다',
  SPEECH_FAILED: '음성을 글로 바꾸지 못했습니다',
  SPEECH_STAGE_ONLY: '무대에 오른 사람만 음성 자막을 쓸 수 있습니다',
  TRANSLATE_FAILED: '자막을 번역하지 못했습니다',
  SPEECH_TTS_FAILED: '번역 음성을 만들지 못했습니다',
  // 자막 서명 불일치 — 그 문장만의 문제(조작·변형된 자막). 권한 없음(FORBIDDEN)과 구분해 화면이 번역·더빙 전체를 멈추지 않게(야간 시험 r5 T08)
  CAPTION_SIG_INVALID: '확인되지 않은 자막이라 번역하지 않았습니다',
  // 설문(sql/009 fn_vote_smn_pll 결과)
  POLL_CLOSED: '마감된 설문입니다',
  // AI 회의록(api/notes/*, src/lib/note-rules.ts)
  NOTE_NOT_RECORDING: '기록 중인 회의록이 아닙니다',
  NOTE_SHOT_INVALID: '화면 캡처 형식이 올바르지 않습니다',
  NOTE_SHOT_RATE: '화면 캡처가 너무 잦습니다',
  NOTE_RETRY_SOON: '잠시 뒤에 다시 만들 수 있습니다(1분 간격)',
})

export const db = () => getSupabaseAdmin()

// DB 자격증명 미설정 → 503(빈 화면·크래시 대신 명확한 오류). 처리 중 예외 → 500
export function dbRoute(handler: Handler): Handler {
  return async (req, ctx) => {
    const { url, key } = resolveDbConfig()
    if (!url || !key) return apiError('DB_UNAVAILABLE', 503)
    try {
      return await handler(req, ctx)
    } catch (e) {
      console.error('[api]', req.nextUrl.pathname, e)
      return apiError('INTERNAL', 500)
    }
  }
}

// PostgREST 오류 분류 — 연결 실패(code 없음)·스키마/테이블 미노출(PGRST1xx/2xx·42P01·42883)은 503, 그 외 500
export function dbFail(error: { code?: string; message?: string }) {
  const code = error.code ?? ''
  console.error('[db]', code, error.message)
  const unavailable =
    !code || /^PGRST[12]/.test(code) || code === '42P01' || code === '42883'
  return unavailable
    ? apiError('DB_UNAVAILABLE', 503)
    : apiError('QUERY_FAILED', 500)
}

// 로그인 필수 — null 이면 401 응답(redirect 아님, 클라이언트 게이트가 처리)
export async function requireUser(
  req: NextRequest,
): Promise<UserRow | NextResponse> {
  const user = await getSessionUser(req)
  return user ?? apiError('AUTH_PI_REQUIRED', 401)
}

export async function requireAdmin(
  req: NextRequest,
): Promise<UserRow | NextResponse> {
  const user = await getSessionUser(req)
  if (!user) return apiError('AUTH_PI_REQUIRED', 401)
  return isAdmin(user) ? user : apiError('FORBIDDEN', 403)
}

// 본문 JSON 파싱 + zod 검증 — 실패 시 400 응답
export async function parseBody<T>(
  req: NextRequest,
  schema: {
    safeParse: (v: unknown) => { success: true; data: T } | { success: false }
  },
): Promise<T | NextResponse> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }
  const parsed = schema.safeParse(raw)
  return parsed.success ? parsed.data : apiError('INVALID_INPUT', 400)
}
