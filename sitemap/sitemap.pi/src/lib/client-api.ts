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

// 요금표 1행(서버 RegFee 의 표시 필드) — 단가·기간(개월, null = 영구)·1개월 대비 할인율(%, null = 미표시)
export type FeeInfo = {
  pi_amt: number
  use_mon_cnt: number | null
  dc_pct: number | null
  spk: number | null // 반짝임 부가서비스 단가(요금제별) — null 이면 판매 안 함
}
export type FeeMap = Record<string, FeeInfo>
// 등록 요금표(/api/fee-plans, 공개) — 폼 요금제 선택·결제 페이지 금액·관리자 승인 게이트 공용.
//  null = 조회 중(호출처는 "결제 필요"로 간주), {} = 조회 실패(목록·관리자는 결제 불필요로 표시, 결제 페이지는 금액 미상으로 버튼 유지). 서버가 최종 판정
// 운영 타이머(sys_cfg, 시간) — 안내 문구 "신청 후 N시간" 등. null = 조회 중·실패
export type SiteCfg = {
  SITE_PAY_TIMEOUT_HOUR: number
  SITE_USE_BGN_DELAY_HOUR: number
  SITE_REAPLY_WINDOW_HOUR: number
}
export function useFeeData(): { fees: FeeMap | null; cfg: SiteCfg | null } {
  const [fees, setFees] = useState<FeeMap | null>(null)
  const [cfg, setCfg] = useState<SiteCfg | null>(null)
  useEffect(() => {
    void readApi<{
      items: (Omit<FeeInfo, 'spk'> & {
        plan_cd: string
        spk_pi_amt: number | null
      })[]
      cfg?: SiteCfg
    }>(fetch('/api/fee-plans')).then((r) => {
      if (r.ok) {
        setFees(
          Object.fromEntries(
            r.data.items.map((f) => [
              f.plan_cd,
              {
                pi_amt: f.pi_amt,
                use_mon_cnt: f.use_mon_cnt,
                dc_pct: f.dc_pct,
                spk: f.spk_pi_amt,
              },
            ]),
          ),
        )
        setCfg(r.data.cfg ?? null)
      } else setFees({})
    })
  }, [])
  return { fees, cfg }
}
export function useRegFees(): FeeMap | null {
  return useFeeData().fees
}

// 시간(소수) → 표시 문자열 : 1 → "1", 0.05 → "0.05", 12 → "12"
export const hourText = (h: number | null | undefined) =>
  h == null ? '…' : String(Math.round(h * 100) / 100)

// 요금제 기간·할인 표시 문구(번역 fee.*) — term: "6개월"·"5년"·"영구", discount: "1개월 요금 대비 17% 할인"(영구는 "10년 환산 25% 할인")
export function useFeeLabel() {
  const t = useTranslations('fee')
  return useCallback(
    (f: FeeInfo | undefined) => {
      if (!f) return { term: '', discount: '' }
      const m = f.use_mon_cnt
      const term =
        m == null
          ? t('lifetime')
          : m % 12 === 0
            ? t('years', { n: m / 12 })
            : t('months', { n: m })
      const discount =
        f.dc_pct == null
          ? ''
          : m == null
            ? t('discountLifetime', { pct: f.dc_pct })
            : t('discount', { pct: f.dc_pct })
      return { term, discount }
    },
    [t],
  )
}
