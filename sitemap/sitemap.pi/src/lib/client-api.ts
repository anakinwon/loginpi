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

// 오류 본문 → 사용자 문구(번역 키 우선, 없으면 서버 한국어 폴백)
export function useApiErrorText() {
  const t = useTranslations('apiErrors')
  return useCallback(
    (body: ApiErrorBody) => {
      const code = body.code ?? GUARD_CODES[body.error ?? '']
      return code && t.has(code) ? t(code) : (body.error ?? t('INTERNAL'))
    },
    [t],
  )
}

export type FeeMap = Record<string, number>
// 등록 요금표(/api/fee-plans, 공개) — 폼 요금제 선택·결제 페이지 금액·관리자 승인 게이트 공용.
//  null = 조회 중(호출처는 "결제 필요"로 간주), {} = 조회 실패(목록·관리자는 결제 불필요로 표시, 결제 페이지는 금액 미상으로 버튼 유지). 서버가 최종 판정
export function useRegFees(): FeeMap | null {
  const [fees, setFees] = useState<FeeMap | null>(null)
  useEffect(() => {
    void readApi<{ items: { plan_cd: string; pi_amt: number }[] }>(
      fetch('/api/fee-plans'),
    ).then((r) => {
      if (r.ok)
        setFees(
          Object.fromEntries(r.data.items.map((f) => [f.plan_cd, f.pi_amt])),
        )
      else setFees({})
    })
  }, [])
  return fees
}
