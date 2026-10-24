// 분류체계 요금제 — GET ?page= : 현재 요금제·만료·요금표·결제 가능 여부·유효 기간·업그레이드 견적(일할계산)·결제 이력(페이지 단위). 멤버면 조회(무료여도)
import { NextResponse } from 'next/server'
import { dbError, requireAreaRole } from '@/lib/api'
import { db } from '@/lib/db'
import { AREA_PLAN, PAYER_ROLES } from '@/lib/payments'
import { feePlans, upgradeQuotes } from '@/lib/plan'

type Ctx = { params: Promise<{ areaId: string }> }
const SIZE = 10

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  const page = Math.max(1, Number(new URL(req.url).searchParams.get('page')) || 1)
  try {
    // 요금표 1회 조회 + 권한 확인 때 받은 요금제 재사용(R-P2, 2026-10-24 전수 점검)
    const feesP = feePlans()
    const [fees, upgrade, hist, terms] = await Promise.all([
      feesP,
      upgradeQuotes(areaId, Date.now(), { cur: auth.plan, fees: feesP }),
      db()
        .from('pi_pymnt')
        .select('pymnt_id, pi_amt, pymnt_sts_cd, meta_val, apv_dtm, cmpl_dtm', { count: 'exact' })
        .eq('pymnt_tp_cd', AREA_PLAN)
        .eq('meta_val->>area_id', areaId)
        .eq('del_yn', 'N')
        .order('apv_dtm', { ascending: false })
        .range((page - 1) * SIZE, page * SIZE - 1),
      db().from('std_area_plan').select('plan_cd, prd_cd, strt_dtm, end_dtm, grnt_rsn_cd').eq('area_id', areaId).eq('del_yn', 'N').gt('end_dtm', new Date().toISOString()).order('strt_dtm'),
    ])
    if (hist.error) throw hist.error
    if (terms.error) throw terms.error
    const canPay = (PAYER_ROLES as readonly string[]).includes(auth.role)
    return NextResponse.json({
      ok: true,
      plan: auth.plan,
      role: auth.role,
      can_pay: canPay,
      fees,
      upgrades: upgrade.quotes, // 상위 요금제별 { plan_cd, amount, days, end }
      terms: terms.data, // 지금·앞으로 유효한 기간(연장분 포함)
      // 결제ID 는 결제자(SYS·DA)에게만(검증 지적 m2 — 노출 최소화)
      hist: { items: canPay ? hist.data : (hist.data ?? []).map(({ pymnt_id: _id, ...x }) => x), total: hist.count ?? 0, page, size: SIZE },
    })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
