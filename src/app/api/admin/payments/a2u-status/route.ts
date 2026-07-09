import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { isA2UEnabled } from '@/lib/pi-a2u'
import { publicKeyFromSeed } from '@/lib/stellar-strkey'
import { apiError } from '@/lib/api-errors'

// GET /api/admin/payments/a2u-status — A2U 진단 (관리자)
// 운영 env의 PI_WALLET_PRIVATE_SEED가 실제로 어떤 앱 지갑(공개키)을 도출하는지 +
// 그 계정의 네트워크 존재·서명 가능(master weight) 여부를 on-chain 실측으로 확인한다.
// ⚠️ 공개키·지문만 노출(시드는 절대 미노출).
// ⛔ 지갑 주소 하드코딩 금지(2026-07-02 마스터 지시) — 기대 지갑은 env(PI_WALLET_AGGRESS)로
//    선언하고, 잠긴 지갑 판정은 고정 목록이 아니라 체인의 signers weight 실측으로 한다.

interface HorizonAccount {
  signers?: Array<{ key: string; weight: number }>
}

export async function GET() {
  const admin = await getSessionUser()
  if (!isAdmin(admin)) return apiError('FORBIDDEN', 401)

  const apiKeySet = !!process.env.PI_API_KEY
  const seed = process.env.PI_WALLET_PRIVATE_SEED
  const seedSet = !!seed
  // 마스터가 선언한 기대 지갑 주소(선택) — 미설정이면 match 판정 생략
  const expectedWallet = process.env.PI_WALLET_AGGRESS?.trim() || null

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

  // 계정 존재 + 마스터 키 weight 실측 (A2U는 weight ≥ 1이어야 서명 가능)
  async function accountInfo(
    host: string,
  ): Promise<{ exists: boolean; masterWeight: number | null } | null> {
    if (!appWallet) return null
    try {
      const r = await fetch(`https://${host}/accounts/${appWallet}`, {
        cache: 'no-store',
      })
      if (!r.ok) return { exists: false, masterWeight: null }
      const acc = (await r.json()) as HorizonAccount
      const master = acc.signers?.find((s) => s.key === appWallet)
      return { exists: true, masterWeight: master?.weight ?? null }
    } catch {
      return null
    }
  }
  const [testnet, mainnet] = await Promise.all([
    accountInfo('api.testnet.minepi.com'),
    accountInfo('api.mainnet.minepi.com'),
  ])

  // 서명 가능 판정 — 테스트넷 기준 (현재 운영 결제망). weight 0 = 잠긴 지갑(발행자 등)
  const signingCapable =
    testnet?.masterWeight == null ? null : testnet.masterWeight > 0

  return NextResponse.json({
    a2uEnabled: isA2UEnabled(),
    apiKeySet,
    seedSet,
    appWallet, // 이 값이 포털에 등록된 앱 지갑과 같아야 A2U 서명이 유효
    deriveError,
    account: { testnet, mainnet },
    // 체인 실측 기반 서명 가능 여부 — false면 어떤 A2U도 tx_bad_auth로 실패한다
    signingCapable,
    lockedWalletWarning: signingCapable === false,
    // env(PI_WALLET_AGGRESS) 선언값과 대조 — 미선언 시 null
    expectedWallet,
    match: expectedWallet ? appWallet === expectedWallet : null,
    // 시드 지문: SHA256(시드) 앞 8자 — 어떤 시드가 실렸는지 비노출 대조용
    seedFingerprint: seed
      ? createHash('sha256').update(seed).digest('hex').slice(0, 8)
      : null,
    deployment: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      vercelEnv: process.env.VERCEL_ENV ?? null,
    },
  })
}
