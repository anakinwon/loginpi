// 결제 준비 — POST /api/payments/prepare { siteId, kind? } → Pi SDK createPayment 에 넘길 { amount, memo, metadata }.
//  kind=REG(기본) : 사용료 정가(fee_plan) + 반짝임 부가서비스 신청(spk_yn=Y, 미결제)이면 단가 합산, metadata.spk='Y'. 소유자 본인·미결제·APPLYING·외부 등록만
//  kind=SPK      : 반짝임 부가서비스 단독 결제 — 사용료 결제 뒤(SPK_PAYABLE_STS, APPLYING 은 pymnt_id 있을 때)·spk_yn=Y·spk_pymnt_id 없음. metadata type SITE_SPK
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
import {
  getEfctFee,
  getRegFee,
  getSpkFee,
  SITE_EFCT,
  SITE_REG,
  SITE_SPK,
  type SiteEfctMeta,
  type SiteRegMeta,
  type SiteSpkMeta,
} from '@/lib/payments'
import {
  PAYABLE_STS,
  SPK_PAYABLE_STS,
  type EfctCd,
  type PlanCd,
  type SiteSts,
} from '@/lib/site'

const PAYABLE: readonly SiteSts[] = PAYABLE_STS
const SPK_PAYABLE: readonly SiteSts[] = SPK_PAYABLE_STS
const bodySchema = z.object({
  siteId: z.uuid(),
  kind: z.enum(['REG', 'SPK', 'EFCT']).default('REG'),
})

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const user = await requireUser(req)
    if (user instanceof NextResponse) return user
    const body = await parseBody(req, bodySchema)
    if (body instanceof NextResponse) return body

    const { data: site, error } = await db()
      .from('site_mst')
      .select(
        'site_id, site_dom_nm, site_sts_cd, plan_cd, pymnt_id, own_site_yn, spk_yn, spk_pymnt_id, efct_cd, efct_pymnt_id',
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
        spk_yn: 'Y' | 'N'
        spk_pymnt_id: string | null
        efct_cd: EfctCd | null
        efct_pymnt_id: string | null
      }>()
    if (error) return dbFail(error)
    if (!site) return apiError('NOT_FOUND', 404)
    if (site.own_site_yn === 'Y') return apiError('PAY_NOT_REQUIRED', 409)

    if (body.kind === 'EFCT') {
      // 이펙트 단독 : 반짝임 단독과 같은 조건(사용료 결제 뒤·선택됨·미결제)
      if (site.efct_pymnt_id) return apiError('PAY_ALREADY_PAID', 409)
      if (
        !site.efct_cd ||
        !SPK_PAYABLE.includes(site.site_sts_cd) ||
        (site.site_sts_cd === 'APPLYING' && !site.pymnt_id)
      )
        return apiError('INVALID_STATE', 409)
      const efct = await getEfctFee(site.plan_cd)
      if (efct == null) return apiError('PAY_NOT_REQUIRED', 409)
      const metadata: SiteEfctMeta = {
        type: SITE_EFCT,
        site_id: site.site_id,
        usr_id: user.id,
        efct: site.efct_cd,
      }
      return NextResponse.json({
        amount: efct,
        memo: `sitemap.pi bubble effect (${site.efct_cd.toLowerCase()}) - ${site.site_dom_nm}`,
        metadata,
      })
    }

    if (body.kind === 'SPK') {
      if (site.spk_pymnt_id) return apiError('PAY_ALREADY_PAID', 409)
      if (
        site.spk_yn !== 'Y' ||
        !SPK_PAYABLE.includes(site.site_sts_cd) ||
        (site.site_sts_cd === 'APPLYING' && !site.pymnt_id)
      )
        return apiError('INVALID_STATE', 409)
      const spk = await getSpkFee(site.plan_cd)
      if (spk == null) return apiError('PAY_NOT_REQUIRED', 409)
      const metadata: SiteSpkMeta = {
        type: SITE_SPK,
        site_id: site.site_id,
        usr_id: user.id,
      }
      return NextResponse.json({
        amount: spk,
        memo: `sitemap.pi sparkle add-on - ${site.site_dom_nm}`,
        metadata,
      })
    }

    if (site.pymnt_id) return apiError('PAY_ALREADY_PAID', 409)
    if (!PAYABLE.includes(site.site_sts_cd))
      return apiError('INVALID_STATE', 409)

    // 요금 3조회는 서로 결과를 안 씀 → 병렬(R-P1)
    // 합산 — 신청에 반짝임이 포함돼 있고 아직 결제되지 않았으면 단가를 더한다(판매 안 함이면 제외)
    // 합산 — 이펙트도 같은 규칙(선택됨·미결제·판매 중)
    const [fee, spk, efct] = await Promise.all([
      getRegFee(site.plan_cd),
      site.spk_yn === 'Y' && !site.spk_pymnt_id
        ? getSpkFee(site.plan_cd)
        : null,
      site.efct_cd && !site.efct_pymnt_id ? getEfctFee(site.plan_cd) : null,
    ])
    if (!fee || fee.pi_amt <= 0) return apiError('PAY_NOT_REQUIRED', 409)
    const metadata: SiteRegMeta = {
      type: SITE_REG,
      site_id: site.site_id,
      plan_cd: site.plan_cd,
      usr_id: user.id,
      spk: spk != null ? 'Y' : 'N',
      ...(efct != null && site.efct_cd && { efct: site.efct_cd }),
    }
    return NextResponse.json({
      amount: fee.pi_amt + (spk ?? 0) + (efct ?? 0),
      // memo 는 ™·특수문자 없이(결제 호환), 브랜드 원형 표기 금지 규칙과 별개로 ASCII 유지
      memo: `sitemap.pi site usage fee (${site.plan_cd}${spk != null ? ' + sparkle' : ''}${efct != null ? ' + effect' : ''}) - ${site.site_dom_nm}`,
      metadata,
    })
  }),
)
