// 등록 심사비 요금표 — GET /api/fee-plans : 사용 중 REGISTER 요금제(plan_cd·단가 Pi). 공개(가격 표시용), 30초 캐시
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { dbFail, dbRoute, PUBLIC_CACHE } from '@/lib/api'
import { getRegFees } from '@/lib/payments'

export const GET = withGuard(
  dbRoute(async () => {
    try {
      const fees = await getRegFees()
      return NextResponse.json({ items: fees }, { headers: PUBLIC_CACHE })
    } catch (e) {
      return dbFail(e as { code?: string; message?: string })
    }
  }),
)
