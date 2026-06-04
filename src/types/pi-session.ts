export interface PiSessionUser {
  uid: string
  displayName: string
  username: string | null
  walletAddress: string | null
  scopesGranted: string[]
  tokenValidUntil: string
}
