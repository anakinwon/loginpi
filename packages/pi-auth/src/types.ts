// @pi/auth — 세션 토큰 페이로드 타입(서버·클라이언트 공용). 출처: cafe.pi src/types/pi-session.ts
export interface PiSessionUser {
  userId: string // sys_user.id
  uid: string // Pi uid — 앱·네트워크별 scoped 값(영구 식별자 금지)
  displayName: string
  username: string | null // 사람의 불변 키
  walletAddress: string | null
  scopesGranted: string[]
  tokenValidUntil: string
  // 서명 토큰 만료(epoch 초) = min(Pi valid_until, 발급+7일). 서명 토큰에는 필수 — 없거나 지났으면 검증 거부.
  // GET 세션 복원 응답(서명 안 된 표시용 객체)에는 없을 수 있다
  exp?: number
  role: string // sys_user.role (ADMIN·USER 등)
  nick_nm?: string | null
}
