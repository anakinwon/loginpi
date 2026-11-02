// @pi/payments PayFail → apiError 응답(detail 은 서버 로그에만) — 결제 라우트 3종 공용
import 'server-only'
import type { PayFail } from '@pi/payments'
import { apiError } from './api'
import { payErrorCode } from './plan-rules'

type ApiCode = Parameters<typeof apiError>[0]
export function payFail(where: string, f: PayFail) {
  if (f.detail) console.error(`[payments/${where}]`, f.code, f.detail)
  return apiError(payErrorCode(f.code) as ApiCode, f.status)
}
