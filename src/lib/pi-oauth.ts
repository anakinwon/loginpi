// Pi Sign-In (OAuth 2.0 implicit flow) — 일반 브라우저용 Pi 계정 로그인 (2026-07-08)
// 공식 문서: pi-apps/pi-platform-docs/pi-sign-in.md
//  - 인가: https://accounts.pinet.com/oauth/authorize (response_type=token)
//  - 토큰: redirect_uri 프래그먼트(#access_token=…)로 반환 → /api/auth/pi POST 재사용
//  - redirect_uri는 Developer Portal에 사전 등록된 값과 정확히 일치해야 함
export const PI_OAUTH_AUTHORIZE_URL =
  'https://accounts.pinet.com/oauth/authorize'
export const PI_OAUTH_CALLBACK_PATH = '/auth/pi/callback'

// CSRF 방지 state·복귀 경로 — localStorage + 10분 만료.
// ⚠️ sessionStorage는 탭 단위라 인가 복귀가 새 탭/컨텍스트로 떨어지면 state를 잃어
//    "보안 검증 실패"가 오탐된다(2026-07-08 실기기 확인) → 오리진 단위 localStorage로 전환.
//    CSRF 방어력은 동일(오리진 경계 유지), 만료로 재사용 창을 제한한다.
const PI_OAUTH_STORE_KEY = 'pi_oauth_pending'
const PI_OAUTH_TTL_MS = 10 * 60 * 1000

interface PendingOAuth {
  state: string
  next: string
  ts: number
}

// 인가 URL 생성 + state 저장 (클라이언트 전용)
export function startPiOAuth(clientId: string, nextPath: string): void {
  const state = crypto.randomUUID()
  try {
    const pending: PendingOAuth = { state, next: nextPath, ts: Date.now() }
    localStorage.setItem(PI_OAUTH_STORE_KEY, JSON.stringify(pending))
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

// 저장된 state 조회(소거 없음·만료 검증). 없거나 만료면 null.
// ⚠️ 읽기 시점에 소거하면 콜백 페이지 재마운트(locale 자동 전환 등) 시 두 번째 실행이
//    state를 못 찾아 "보안 검증 실패" 오탐(2026-07-08 실기기) → 성공 시에만 clear.
export function peekPiOAuthState(): PendingOAuth | null {
  try {
    const raw = localStorage.getItem(PI_OAUTH_STORE_KEY)
    if (!raw) return null
    const pending = JSON.parse(raw) as PendingOAuth
    if (!pending.state || Date.now() - pending.ts > PI_OAUTH_TTL_MS) return null
    return pending
  } catch {
    return null
  }
}

export function clearPiOAuthState(): void {
  try {
    localStorage.removeItem(PI_OAUTH_STORE_KEY)
  } catch {
    // 무시 — TTL이 재사용 창을 제한
  }
}
