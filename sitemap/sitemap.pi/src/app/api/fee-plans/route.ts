// 사용료 요금표 — GET /api/fee-plans : 사용 중 REGISTER 요금제(plan_cd·단가 Pi) + 요금제별 남은 슬롯(remaining). 공개(가격 표시용), 30초 캐시
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { dbFail, dbRoute, PUBLIC_CACHE } from '@/lib/api'
import { getPlanRemaining, getRegFees } from '@/lib/payments'
import { db } from '@/lib/api'

export const GET = withGuard(
  dbRoute(async () => {
    try {
      // 남은 슬롯은 보조 정보 — 조회 실패가 요금표(결제 금액·요금제 선택)를 막지 않게 null 로 격리
      const [fees, remaining, spk] = await Promise.all([
        getRegFees(),
        getPlanRemaining().catch((e: unknown) => {
          console.error('[fee-plans] remaining', e)
          return null
        }),
        // 반짝임 부가서비스 단가(요금제별, sql/014) — 판매 중 행만
        db()
          .from('fee_plan')
          .select('plan_cd, pi_amt')
          .eq('fee_tp_cd', 'SPARKLE')
          .eq('use_yn', 'Y')
          .eq('del_yn', 'N'),
      ])
      if (spk.error) throw spk.error
      const spkBy = new Map(
        (spk.data ?? []).map((r) => [r.plan_cd as string, Number(r.pi_amt)]),
      )
      const items = fees.map((f) => ({
        ...f,
        remaining: remaining?.[f.plan_cd as keyof typeof remaining] ?? null,
        // spk_pi_amt : 이 요금제의 반짝임 부가서비스 단가(판매 안 하면 null)
        spk_pi_amt:
          (spkBy.get(f.plan_cd) ?? 0) > 0 ? spkBy.get(f.plan_cd)! : null,
      }))
      return NextResponse.json({ items }, { headers: PUBLIC_CACHE })
    } catch (e) {
      return dbFail(e as { code?: string; message?: string })
    }
  }),
)
