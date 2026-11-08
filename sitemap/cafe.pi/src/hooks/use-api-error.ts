'use client'

// API 에러 응답({ error, code, params })을 뷰어 언어로 해석하는 훅.
// code가 있고 apiErrors 번역키가 존재하면 t(code, params), 아니면 서버 한국어 폴백(error),
// 그것도 없으면 호출부 fallback. 미전환 API·미번역 locale에서도 항상 문자열을 보장한다.
import { useTranslations } from 'next-intl'

export interface ApiErrorPayload {
  error?: string
  code?: string
  params?: Record<string, string | number>
}

export function useApiErrorMessage() {
  const t = useTranslations('apiErrors')
  return (
    data: ApiErrorPayload | null | undefined,
    fallback: string,
  ): string => {
    if (data?.code && t.has(data.code)) {
      return t(data.code, data.params)
    }
    return data?.error ?? fallback
  }
}

// 성공 응답({ message, msgCode, params })을 뷰어 언어로 해석하는 훅 (apiMessage의 클라이언트 짝).
// msgCode가 있고 apiMsgs 번역키가 존재하면 t(msgCode, params), 아니면 서버 한국어 폴백(message).
export interface ApiMessagePayload {
  message?: string
  msgCode?: string
  params?: Record<string, string | number>
}

export function useApiMessage() {
  const t = useTranslations('apiMsgs')
  return (data: ApiMessagePayload | null | undefined, fallback = ''): string => {
    if (data?.msgCode && t.has(data.msgCode)) {
      return t(data.msgCode, data.params)
    }
    return data?.message ?? fallback
  }
}
