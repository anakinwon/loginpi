import { NextRequest, NextResponse } from 'next/server'

// ⚠️ 임시 진단 — 결제 approve 타임아웃 원인 규명(PI_API_KEY 유효성·네트워크·미완료결제).
//    쿼리 토큰(?k=) 게이트, 불일치 시 404 → 정보 노출 0. 민감값은 존재여부/접두 1글자만.
//    ⛔ 원인 확정 후 이 파일 즉시 삭제.
export const dynamic = 'force-dynamic'

const DIAG_KEY = 'dbg_pay_7a3f91c8e2b64d05'

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('k') !== DIAG_KEY) {
    return new NextResponse(null, { status: 404 })
  }

  const apiKey = process.env.PI_API_KEY
  const seed = process.env.PI_WALLET_PRIVATE_SEED ?? ''

  // PI_API_KEY로 Pi Platform API 직접 호출 → 키 유효성·네트워크 확인
  //   200 = 키 유효 / 401 = 무효·네트워크 불일치 / 그 외 = 별도
  let piApiStatus: number | null = null
  let piApiBody: string | null = null
  if (apiKey) {
    try {
      const res = await fetch(
        'https://api.minepi.com/v2/payments/incomplete_server_payments',
        { headers: { Authorization: `Key ${apiKey}` } },
      )
      piApiStatus = res.status
      piApiBody = (await res.text()).slice(0, 300)
    } catch (e) {
      piApiBody = 'fetch_failed: ' + (e instanceof Error ? e.message : String(e))
    }
  }

  return new NextResponse(
    JSON.stringify({
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      hasApiKey: !!apiKey,
      apiKeyLen: apiKey ? apiKey.length : 0,
      sandbox: process.env.NEXT_PUBLIC_PI_SANDBOX ?? '(unset)',
      seedPrefix: seed ? seed[0] : null, // 'S'(정상 시드) / 'G'(주소=잘못)
      piApiStatus, // ← 핵심: 200=키 유효, 401=키 무효/네트워크 불일치
      piApiBody, // 미완료 결제 목록 또는 에러 본문
    }),
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  )
}
