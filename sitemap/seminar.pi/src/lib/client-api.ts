'use client'

// 클라이언트 API 호출 공용 — JSON 응답 파싱 + 오류 코드(apiErrors.<CODE>) 번역. 인증 필요 호출은 piFetch(X-Pi-Token) 사용
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

export interface ApiErrorBody {
  error?: string
  code?: string
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; body: ApiErrorBody }

export async function readApi<T>(
  res: Promise<Response>,
): Promise<ApiResult<T>> {
  try {
    const r = await res
    const body = (await r.json().catch(() => ({}))) as T & ApiErrorBody
    return r.ok
      ? { ok: true, data: body }
      : { ok: false, status: r.status, body }
  } catch {
    return { ok: false, status: 0, body: { code: 'NETWORK' } }
  }
}

// @pi/guard 가드 응답(code 없음)의 error 값 → 번역 키
const GUARD_CODES: Record<string, string> = {
  too_many_requests: 'RATE_LIMITED',
  forbidden: 'FORBIDDEN',
  payload_too_large: 'PAYLOAD_TOO_LARGE',
}

// 오류 본문 → 사용자 문구(apiErrors.<CODE> → seminar.err.<CODE> → 서버 한국어 폴백).
//  세미나 자격 코드(SMN_*·PAY_*)는 seminar.err 에만 있다 — 설문·Q&A 가 영어 화면에 한국어 서버 문구를 띄우던 결함(야간 시험 T04 r2)
export function useApiErrorText() {
  const t = useTranslations('apiErrors')
  const s = useTranslations('seminar.err')
  return useCallback(
    (body: ApiErrorBody) => {
      const code = body.code ?? GUARD_CODES[body.error ?? '']
      if (code && t.has(code)) return t(code)
      if (code && s.has(code)) return s(code)
      return body.error ?? t('INTERNAL')
    },
    [t, s],
  )
}

// 요금표 1행(서버 RegFee 의 표시 필드) — 단가·기간(개월, null = 영구)·1개월 대비 할인율(%, null = 미표시)
export type FeeInfo = {
  pi_amt: number
  use_mon_cnt: number | null
  dc_pct: number | null
  spk: number | null // 반짝임 부가서비스 단가(요금제별) — null 이면 판매 안 함
  efct: number | null // 버블 이펙트 단가(요금제별, 3종 공통)
}
