import { NextResponse } from 'next/server'
import { getActiveFeeMode } from '@/lib/fee-resolver'

// 현재 요금제 모드(BEAN|PI) — client 표시 단위 결정용(민감정보 아님, 공개).
//   결제 차감은 서버가 결제 시점 DB 직접 조회로 권위 판정(PRD_24 v0.3). 이 값은 표시 전용.
export async function GET() {
  const mode = await getActiveFeeMode()
  return NextResponse.json(
    { mode },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    },
  )
}
