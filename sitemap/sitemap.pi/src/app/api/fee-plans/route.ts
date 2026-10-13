// 사용료 요금표 — GET /api/fee-plans : 사용 중 REGISTER 요금제(plan_cd·단가 Pi) + 요금제별 남은 슬롯(remaining). 공개(가격 표시용), 30초 캐시
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { dbFail, dbRoute, PUBLIC_CACHE } from '@/lib/api'
import { getPlanRemaining, getRegFees } from '@/lib/payments'

export const GET = withGuard(
  dbRoute(async () => {
    try {
      // 남은 슬롯은 보조 정보 — 조회 실패가 요금표(결제 금액·요금제 선택)를 막지 않게 null 로 격리
      const [fees, remaining] = await Promise.all([
        getRegFees(),
        getPlanRemaining().catch((e: unknown) => {
          console.error('[fee-plans] remaining', e)
          return null
        }),
      ])
      const items = fees.map((f) => ({
        ...f,
        remaining: remaining?.[f.plan_cd as keyof typeof remaining] ?? null,
      }))
      return NextResponse.json({ items }, { headers: PUBLIC_CACHE })
    } catch (e) {
      return dbFail(e as { code?: string; message?: string })
    }
  }),
)
