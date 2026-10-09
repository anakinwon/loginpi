'use client'

// @pi/auth/client — X-Pi-Token 헤더 자동 첨부 fetch. 출처: cafe.pi src/lib/pi-fetch.ts
// Pi Browser WebView는 Set-Cookie를 저장하지 않으므로 서버 발급 토큰을 localStorage에 두고 헤더로 보낸다.
// 일반 브라우저는 쿠키(credentials: 'include')로 인증 — 서버 getSessionUser가 두 경로를 동일 처리.
// 인증이 필요한 모든 클라이언트→API 요청은 fetch 대신 piFetch를 쓴다.

const TOKEN_KEY = 'pi_token'

export function setPiToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // 시크릿 모드 등 localStorage 차단 — 쿠키 경로로 폴백
  }
}

export function getPiToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function clearPiToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // noop
  }
}

export function piFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = getPiToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('X-Pi-Token', token)
  return fetch(input, { ...init, headers, credentials: 'include' })
}
