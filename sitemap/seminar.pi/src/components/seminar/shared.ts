'use client'

// 세미나 화면 공용 — 카드 타입(API toCard 와 같은 모양), 버튼 클래스, 오류 문구(seminar.err.<CODE> 우선 → apiErrors → 서버 문구)
import { useFormatter, useTranslations } from 'next-intl'
import { useCallback } from 'react'
import { useApiErrorText, type ApiErrorBody } from '@/lib/client-api'

export interface SeminarCard {
  id: string
  title: string
  startAt: string
  maxCnt: number
  fee: number
  status: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELED'
  host: string
}

export const BTN_PRIMARY =
  'bg-accent inline-grid h-11 place-items-center rounded-full px-5 font-semibold text-white disabled:opacity-50'
export const BTN =
  'bg-surface-raised inline-grid h-10 place-items-center rounded-lg px-4 text-sm disabled:opacity-50'

export function useSeminarErrText() {
  const t = useTranslations('seminar.err')
  const fallback = useApiErrorText()
  return useCallback(
    (body: ApiErrorBody) =>
      body.code && t.has(body.code) ? t(body.code) : fallback(body),
    [t, fallback],
  )
}

// 시작일시 — 보는 사람의 지역 시간대로 표시(클라이언트 조회 후 렌더라 SSR 시간대 불일치 없음)
export function useStartText() {
  const f = useFormatter()
  return useCallback(
    (iso: string) =>
      f.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' }),
    [f],
  )
}
