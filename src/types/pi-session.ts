export interface PiSessionUser {
  userId: string          // Supabase users.id (Pi + Google 통합 식별자)
  uid: string             // Pi Network UID (앱별 고유값)
  displayName: string
  username: string | null
  walletAddress: string | null
  scopesGranted: string[]
  tokenValidUntil: string
  role: string            // DB의 sys_user.role (ADMIN·MASTER·USER 등)
}
