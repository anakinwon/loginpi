// API 성공 응답 메시지 표준 카탈로그 (정본: docs/I18N_HARDCODED_AUDIT.md — 성공 message 필드)
// 응답 형태: { message: <한국어 폴백>, msgCode: <카탈로그 코드>, params?: <보간 값> }
// - message: 미전환(레거시) 소비처 호환용 한국어 원문 — 기존 동작 불변
// - msgCode: 클라이언트가 t(`apiMsgs.${msgCode}`, params)로 뷰어 언어 해석 (useApiMessage)
// apiError(index.ts)와 동일 철학의 성공 버전. ⛔ index.ts는 수정하지 않는다.
import type { ApiErrorParams } from './index'

export const API_MESSAGES = {
  // feedback POST 성공 (보상 유형별 3분기)
  FBCK_SAVED: '후기가 저장되었습니다.',
  FBCK_SAVED_BEAN_REWARD: '후기가 저장되었고, {qty} Bean 보상을 받으셨습니다!',
  FBCK_SAVED_PI_PENDING:
    '후기가 저장되었습니다. Pi 보상(약 {pi} Pi)은 곧 지급됩니다.',
  // admin i18n 자동번역 진단
  I18N_NO_KEYS: '번역할 키가 없습니다',
  I18N_PARTIAL_STOP: '일부 번역 후 중단되었습니다. 관리자에게 문의하세요',
} as const

export type ApiMessageCode = keyof typeof API_MESSAGES

// {key} 단순 보간 — messages의 next-intl {key} 문법과 동일 형태 유지
function interpolate(template: string, params: ApiErrorParams): string {
  let out = template
  for (const [k, v] of Object.entries(params)) {
    out = out.replaceAll(`{${k}}`, String(v))
  }
  return out
}

// 성공 응답에 spread할 필드 객체를 반환한다(다른 필드와 함께 쓰이므로 NextResponse 아님).
// 예: NextResponse.json({ fbck_id, ...apiMessage('FBCK_SAVED') })
export function apiMessage(code: ApiMessageCode, params?: ApiErrorParams) {
  const template: string = API_MESSAGES[code]
  const message = params ? interpolate(template, params) : template
  return params
    ? { message, msgCode: code, params }
    : { message, msgCode: code }
}
