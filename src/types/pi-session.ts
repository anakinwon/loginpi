export interface PiSessionUser {
  uid: string
  displayName: string
  username: string | null
  scopesGranted: string[]
  tokenValidUntil: string
}
