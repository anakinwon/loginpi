'use client'

// 연결 화면 공용 — /api/link 응답 타입 + 오류 문구(link2.errors.<code> 우선, 없으면 apiErrors)
import { useTranslations } from 'next-intl'
import { useCallback } from 'react'
import { useApiErrorText, type ApiErrorBody } from '@/lib/client-api'

export type LinkItem = { linkId: string; areaId: string; areaNm: string; regDtm: string; modDtm: string }
export type LinkList = { items: LinkItem[]; page: number; hasMore: boolean }
export type LinkConn = {
  connId: string
  connNm: string
  dbmsCd: string
  execMthdCd: string
  dbNm: string | null
  hostMasked: string | null
  lstTestDtm: string | null
  agtLstSeenDtm: string | null
}

export function useLinkErrText() {
  const t = useTranslations('link2.errors')
  const apiErr = useApiErrorText()
  return useCallback(
    (body: ApiErrorBody) => (body.code && t.has(body.code) ? t(body.code) : apiErr(body)),
    [t, apiErr],
  )
}
