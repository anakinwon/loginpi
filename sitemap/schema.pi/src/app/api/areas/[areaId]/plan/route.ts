// 분류체계 요금제 — GET ?page= : 현재 요금제·만료·요금표·결제 가능 여부·유효 기간·결제 이력(페이지 단위). 멤버면 조회(무료여도)
import { NextResponse } from 'next/server'
import { dbError, requireAreaRole } from '@/lib/api'
import { db } from '@/lib/db'
import { AREA_PLAN, PAYER_ROLES } from '@/lib/payments'
import { feePlans } from '@/lib/plan'

type Ctx = { params: Promise<{ areaId: string }> }
const SIZE = 10

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  const page = Math.max(1, Number(new URL(req.url).searchParams.get('page')) || 1)
  try {
    const [fees, hist, terms] = await Promise.all([
      feePlans(),
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
    return NextResponse.json({
      ok: true,
      plan: auth.plan,
      admin: auth.admin,
      role: auth.role,
      can_pay: (PAYER_ROLES as readonly string[]).includes(auth.role),
      fees,
      terms: terms.data, // 지금·앞으로 유효한 기간(연장분 포함)
      hist: { items: hist.data, total: hist.count ?? 0, page, size: SIZE },
    })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
