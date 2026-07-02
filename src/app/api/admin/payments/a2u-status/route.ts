import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { isA2UEnabled } from '@/lib/pi-a2u'

// GET /api/admin/payments/a2u-status — A2U 진단 (관리자)
// tx_bad_auth 원인 규명용. 운영 env의 PI_WALLET_PRIVATE_SEED가 실제로 어떤 앱 지갑(공개키)을
// 도출하는지 + 그 계정이 어느 네트워크에 존재하는지 확인한다. ⚠️ 공개키만 노출(시드는 절대 미노출).
export async function GET() {
  const admin = await getSessionUser()
  if (!isAdmin(admin))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const apiKeySet = !!process.env.PI_API_KEY
  const seed = process.env.PI_WALLET_PRIVATE_SEED
  const seedSet = !!seed

  // 시드 → 공개키 도출 (pi-backend가 쓰는 것과 동일한 stellar 키페어)
  let appWallet: string | null = null
  let deriveError: string | null = null
  if (seed) {
    try {
      const { Keypair } = await import('stellar-sdk')
      appWallet = Keypair.fromSecret(seed).publicKey()
    } catch (e) {
      deriveError = e instanceof Error ? e.message : String(e)
    }
  }

  // 그 계정이 테스트넷/메인넷에 존재하는지 (A2U는 존재하는 네트워크에서만 서명 성공)
  async function accountExists(host: string): Promise<boolean | null> {
    if (!appWallet) return null
    try {
      const r = await fetch(`https://${host}/accounts/${appWallet}`, {
        cache: 'no-store',
      })
      return r.ok
    } catch {
      return null
    }
  }
  const [onTestnet, onMainnet] = await Promise.all([
    accountExists('api.testnet.minepi.com'),
    accountExists('api.mainnet.minepi.com'),
  ])

  return NextResponse.json({
    a2uEnabled: isA2UEnabled(),
    apiKeySet,
    seedSet,
    appWallet, // 이 값이 U2A 결제를 받은 앱 지갑과 같아야 A2U 서명이 유효
    deriveError,
    accountExists: { testnet: onTestnet, mainnet: onMainnet },
    expectedWallet: 'GDOCI7AZIH4ORRUFPE6J5HWJ2P2XP54TTBAJ6TDJ3TGEDXNJBR4J57RC',
    match:
      appWallet === 'GDOCI7AZIH4ORRUFPE6J5HWJ2P2XP54TTBAJ6TDJ3TGEDXNJBR4J57RC',
  })
}
