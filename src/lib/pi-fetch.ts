'use client'

// Pi Browser WebView는 Set-Cookie를 저장하지 않으므로, 서버가 발급한 세션 토큰을
// localStorage에 보관했다가 모든 인증 요청에 X-Pi-Token 헤더로 실어 보낸다.
// 일반 브라우저는 쿠키(credentials: 'include')로, Pi Browser는 헤더로 인증된다.
// 두 경로 모두 서버의 getSessionUser()가 동일하게 처리한다(쿠키 OR 헤더).

const TOKEN_KEY = 'pi_token'

export function setPiToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // 시크릿 모드 등 localStorage 차단 환경 — 쿠키 경로로 폴백
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

// X-Pi-Token 헤더를 자동 첨부하는 fetch 래퍼.
// 인증이 필요한 모든 클라이언트→API 요청은 fetch 대신 piFetch를 사용한다.
export function piFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = getPiToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('X-Pi-Token', token)
  return fetch(input, { ...init, headers, credentials: 'include' })
}
