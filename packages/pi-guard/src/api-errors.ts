// @pi/guard — i18n API 에러 응답 표준. 응답 형태: { error: <한국어 폴백>, code, params? }
// 출처: cafe.pi src/lib/api-errors(공통·Pi 인증 코드만). 사이트 고유 코드는 createApiError({...COMMON_ERRORS, ...자체})로 확장.
// 클라이언트는 code로 messages의 apiErrors.<CODE>를 t() 해석한다.
import { NextResponse } from 'next/server'

export const COMMON_ERRORS = {
  AUTH_REQUIRED: '로그인이 필요합니다',
  FORBIDDEN: '권한이 없습니다',
  BAD_REQUEST: '잘못된 요청',
  BAD_REQUEST_BODY: '잘못된 요청 본문',
  INVALID_INPUT: '입력값이 올바르지 않습니다',
  QUERY_FAILED: '조회 실패',
  SAVE_FAILED: '저장 실패',
  INTERNAL: '데이터 처리 중 오류가 발생했습니다',
  SERVER_CONFIG: '서버 설정 오류입니다. 관리자에게 문의하세요',
  PI_API_CONNECT_FAILED: 'Pi Network API 연결 실패',
} as const

export const AUTH_ERRORS = {
  AUTH_PI_REQUIRED: 'Pi 로그인이 필요합니다',
  AUTH_PI_SESSION_INVALID: '유효하지 않은 Pi 세션입니다',
  AUTH_PI_TOKEN_INVALID: 'Pi 토큰 검증 실패',
  AUTH_ACCESS_TOKEN_REQUIRED: 'accessToken이 필요합니다',
  AUTH_PI_ACCOUNT_CONFLICT:
    '이미 등록된 Pi 계정과 인증 정보가 다릅니다. 관리자에게 문의하세요',
  AUTH_PI_ACCOUNT_INACTIVE: '비활성 계정입니다. 관리자에게 문의하세요',
} as const

export type ApiErrorParams = Record<string, string | number>

// {key} 단순 보간 — next-intl {key} 문법과 동일 형태
function interpolate(template: string, params: ApiErrorParams): string {
  let out = template
  for (const [k, v] of Object.entries(params)) {
    out = out.replaceAll(`{${k}}`, String(v))
  }
  return out
}

export function createApiError<C extends Record<string, string>>(catalog: C) {
  return function apiError(
    code: keyof C & string,
    status: number,
    params?: ApiErrorParams,
  ) {
    const template = catalog[code]
    const error = params ? interpolate(template, params) : template
    return NextResponse.json(
      params ? { error, code, params } : { error, code },
      { status },
    )
  }
}

export const apiError = createApiError({ ...COMMON_ERRORS, ...AUTH_ERRORS })
