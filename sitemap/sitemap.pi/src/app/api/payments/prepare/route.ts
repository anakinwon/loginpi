// 결제 준비 — POST /api/payments/prepare { siteId } → Pi SDK createPayment 에 넘길 { amount, memo, metadata }.
//  서버가 정가(fee_plan)를 정하고 metadata 에 site_id·plan_cd 를 박는다. 소유자 본인·미결제·외부 등록(own_site_yn='N')만
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import {
  apiError,
  db,
  dbFail,
  dbRoute,
  parseBody,
  requireUser,
} from '@/lib/api'
import { getRegFee, SITE_REG, type SiteRegMeta } from '@/lib/payments'
import { PAYABLE_STS, type PlanCd, type SiteSts } from '@/lib/site'

const PAYABLE: readonly SiteSts[] = PAYABLE_STS
const bodySchema = z.object({ siteId: z.uuid() })

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const user = await requireUser(req)
    if (user instanceof NextResponse) return user
    const body = await parseBody(req, bodySchema)
    if (body instanceof NextResponse) return body

    const { data: site, error } = await db()
      .from('site_mst')
      .select(
        'site_id, site_dom_nm, site_sts_cd, plan_cd, pymnt_id, own_site_yn',
      )
      .eq('site_id', body.siteId)
      .eq('ownr_usr_id', user.id)
      .eq('del_yn', 'N')
      .maybeSingle<{
        site_id: string
        site_dom_nm: string
        site_sts_cd: SiteSts
        plan_cd: PlanCd
        pymnt_id: string | null
        own_site_yn: 'Y' | 'N'
      }>()
    if (error) return dbFail(error)
    if (!site) return apiError('NOT_FOUND', 404)
    if (site.pymnt_id) return apiError('PAY_ALREADY_PAID', 409)
    if (!PAYABLE.includes(site.site_sts_cd))
      return apiError('INVALID_STATE', 409)

    const fee = await getRegFee(site.plan_cd)
    if (!fee || fee.pi_amt <= 0 || site.own_site_yn === 'Y')
      return apiError('PAY_NOT_REQUIRED', 409)

    const metadata: SiteRegMeta = {
      type: SITE_REG,
      site_id: site.site_id,
      plan_cd: site.plan_cd,
      usr_id: user.id,
    }
    return NextResponse.json({
      amount: fee.pi_amt,
      // memo 는 ™·특수문자 없이(결제 호환), 브랜드 원형 표기 금지 규칙과 별개로 ASCII 유지
      memo: `sitemap.pi site registration fee (${site.plan_cd}) - ${site.site_dom_nm}`,
      metadata,
    })
  }),
)
