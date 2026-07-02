import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { isA2UEnabled } from '@/lib/pi-a2u'
import { publicKeyFromSeed } from '@/lib/stellar-strkey'

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

  // 시드 → 공개키 도출 (순수 Node strkey — 알려진 쌍으로 검증됨)
  let appWallet: string | null = null
  let deriveError: string | null = null
  if (seed) {
    try {
      appWallet = publicKeyFromSeed(seed)
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

  // 새 운영 앱 지갑 = GD3W3DGC (유통자, weight 1 — 2026-07-02 GDOCI7 잠금 사고로 교체)
  // GDOCI7·GA2WF2MW는 토큰 발행 후 잠긴(master weight 0) 발행자 계정 — A2U 절대 불가.
  const EXPECTED = 'GD3W3DGCYSNGXJJSE4L4224MY5DXCZJ2PQTKOLENJA7N5UGXPHMFCDLG'
  const LOCKED_ISSUERS = new Set([
    'GDOCI7AZIH4ORRUFPE6J5HWJ2P2XP54TTBAJ6TDJ3TGEDXNJBR4J57RC',
    'GA2WF2MWQ3ODDYIH3PFKF723Z6AXCDZTH6E77CSDBFX5W5H2CYZFCENA',
  ])

  return NextResponse.json({
    a2uEnabled: isA2UEnabled(),
    apiKeySet,
    seedSet,
    appWallet, // 이 값이 포털에 등록된 앱 지갑과 같아야 A2U 서명이 유효
    deriveError,
    accountExists: { testnet: onTestnet, mainnet: onMainnet },
    expectedWallet: EXPECTED,
    match: appWallet === EXPECTED,
    // 잠긴 발행자 시드가 설정돼 있으면 즉시 경고 — A2U 전부 tx_bad_auth로 실패한다
    lockedIssuerWarning: appWallet !== null && LOCKED_ISSUERS.has(appWallet),
    // ── 배포·시드 식별 (환경설정 논쟁 종결용) ──
    // seedFingerprint: SHA256(시드) 앞 8자 — 시드 미노출, 어떤 시드가 실렸는지 지문 대조
    //   732b3c40=SARNFV(GDOCI7·잠김) / 57a45fb5=SBVXUJVU(GD3W3DGC·정답) / 502e582b=SCTZN(GDTH5·스테이징)
    seedFingerprint: seed
      ? createHash('sha256').update(seed).digest('hex').slice(0, 8)
      : null,
    deployment: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      vercelEnv: process.env.VERCEL_ENV ?? null,
    },
  })
}
