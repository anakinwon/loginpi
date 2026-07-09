// i18n API 에러 응답 표준 헬퍼 (정본: docs/I18N_HARDCODED_AUDIT.md 전략)
// 응답 형태: { error: <한국어 폴백>, code: <카탈로그 코드>, params?: <보간 값> }
// - error: 미전환(레거시) 소비처 호환용 한국어 원문 — 기존 동작 불변
// - code: 클라이언트가 t(`apiErrors.${code}`, params)로 뷰어 언어 해석 (useApiErrorMessage)
// 새 API 에러는 반드시 apiError()로 반환한다. 원시 DB 에러는 sanitizeError 유지(KISA IL).
import { NextResponse } from 'next/server'
import { COMMON_ERRORS } from './common'
import { AUTH_ERRORS } from './auth'
import { BEAN_ERRORS } from './bean'
import { BOARD_ERRORS } from './board'
import { CHAT_ERRORS } from './chat'
import { EVENT_ERRORS } from './event'
import { LOCATION_ERRORS } from './location'
import { MISC_ERRORS } from './misc'
import { STORE_ERRORS } from './store'
import { VOICE_ERRORS } from './voice'

export const API_ERRORS = {
  ...COMMON_ERRORS,
  ...AUTH_ERRORS,
  ...BEAN_ERRORS,
  ...BOARD_ERRORS,
  ...CHAT_ERRORS,
  ...EVENT_ERRORS,
  ...LOCATION_ERRORS,
  ...MISC_ERRORS,
  ...STORE_ERRORS,
  ...VOICE_ERRORS,
} as const

export type ApiErrorCode = keyof typeof API_ERRORS
export type ApiErrorParams = Record<string, string | number>

// {key} 단순 보간 — messages의 next-intl {key} 문법과 동일 형태 유지
function interpolate(template: string, params: ApiErrorParams): string {
  let out = template
  for (const [k, v] of Object.entries(params)) {
    out = out.replaceAll(`{${k}}`, String(v))
  }
  return out
}

export function apiError(
  code: ApiErrorCode,
  status: number,
  params?: ApiErrorParams,
) {
  const template: string = API_ERRORS[code]
  const error = params ? interpolate(template, params) : template
  return NextResponse.json(
    params ? { error, code, params } : { error, code },
    { status },
  )
}
