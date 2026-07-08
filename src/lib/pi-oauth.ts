// Pi Sign-In (OAuth 2.0 implicit flow) — 일반 브라우저용 Pi 계정 로그인 (2026-07-08)
// 공식 문서: pi-apps/pi-platform-docs/pi-sign-in.md
//  - 인가: https://accounts.pinet.com/oauth/authorize (response_type=token)
//  - 토큰: redirect_uri 프래그먼트(#access_token=…)로 반환 → /api/auth/pi POST 재사용
//  - redirect_uri는 Developer Portal에 사전 등록된 값과 정확히 일치해야 함
export const PI_OAUTH_AUTHORIZE_URL =
  'https://accounts.pinet.com/oauth/authorize'
export const PI_OAUTH_CALLBACK_PATH = '/auth/pi/callback'
// CSRF 방지 state·복귀 경로 — sessionStorage (탭 단위, 콜백 후 즉시 소거)
export const PI_OAUTH_STATE_KEY = 'pi_oauth_state'
export const PI_OAUTH_NEXT_KEY = 'pi_oauth_next'

// 인가 URL 생성 + state 저장 (클라이언트 전용)
export function startPiOAuth(clientId: string, nextPath: string): void {
  const state = crypto.randomUUID()
  try {
    sessionStorage.setItem(PI_OAUTH_STATE_KEY, state)
    sessionStorage.setItem(PI_OAUTH_NEXT_KEY, nextPath)
  } catch {
    // 저장 불가 환경 — state 검증은 콜백에서 실패 처리
  }
  const params = new URLSearchParams({
    response_type: 'token',
    client_id: clientId,
    redirect_uri: `${window.location.origin}${PI_OAUTH_CALLBACK_PATH}`,
    scope: 'username',
    state,
  })
  window.location.href = `${PI_OAUTH_AUTHORIZE_URL}?${params.toString()}`
}
