// 관리자 사이트 심사 API — PATCH /api/admin/sites/<id>
//  approve : PENDING → APPROVED (apv_dtm 은 최초 승인 시만 기록 — 일반 순위 기준 보존). 자사 사이트가 아니면 ownershipVerified:true 필수(400)
//  reject  : PENDING → REJECTED (rjct_rsn_cd 필수)
//  suspend : APPROVED → SUSPENDED (관리자 직권) / restore : SUSPENDED → APPROVED
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import {
  apiError,
  db,
  dbFail,
  dbRoute,
  parseBody,
  requireAdmin,
  uuidParam,
} from '@/lib/api'
import {
  adminSiteActionSchema,
  OWNER_SITE_COLS,
  type SiteSts,
} from '@/lib/site'

const FROM: Record<string, SiteSts> = {
  approve: 'PENDING',
  reject: 'PENDING',
  suspend: 'APPROVED',
  restore: 'SUSPENDED',
}

export const PATCH = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const id = await uuidParam(ctx)
    if (!id) return apiError('INVALID_INPUT', 400)
    const admin = await requireAdmin(req)
    if (admin instanceof NextResponse) return admin
    const body = await parseBody(req, adminSiteActionSchema)
    if (body instanceof NextResponse) return body

    const { data: cur, error: curErr } = await db()
      .from('site_mst')
      .select('site_id, site_sts_cd, apv_dtm, own_site_yn')
      .eq('site_id', id)
      .eq('del_yn', 'N')
      .maybeSingle<{
        site_id: string
        site_sts_cd: SiteSts
        apv_dtm: string | null
        own_site_yn: 'Y' | 'N'
      }>()
    if (curErr) return dbFail(curErr)
    if (!cur) return apiError('NOT_FOUND', 404)
    if (cur.site_sts_cd !== FROM[body.action])
      return apiError('INVALID_STATE', 409)
    if (
      body.action === 'approve' &&
      cur.own_site_yn !== 'Y' &&
      body.ownershipVerified !== true
    )
      return apiError('OWNERSHIP_NOT_VERIFIED', 400)

    const now = new Date().toISOString()
    const patch: Record<string, unknown> =
      body.action === 'approve'
        ? {
            site_sts_cd: 'APPROVED',
            apv_dtm: cur.apv_dtm ?? now,
            rjct_rsn_cd: null,
            rjct_rsn_cont: null,
          }
        : body.action === 'reject'
          ? {
              site_sts_cd: 'REJECTED',
              rjct_rsn_cd: body.rsnCd,
              rjct_rsn_cont: body.rsnCont ?? null,
            }
          : body.action === 'suspend'
            ? { site_sts_cd: 'SUSPENDED', rjct_rsn_cont: body.rsnCont ?? null }
            : { site_sts_cd: 'APPROVED', rjct_rsn_cont: null }

    const { data, error } = await db()
      .from('site_mst')
      .update({ ...patch, modr_id: admin.id })
      .eq('site_id', cur.site_id)
      .eq('site_sts_cd', cur.site_sts_cd)
      .select(OWNER_SITE_COLS)
      .maybeSingle()
    if (error) {
      // 반려·철회 후 같은 도메인이 재등록된 상태에서 복구·승인 시 활성 도메인 UNIQUE 충돌
      if (error.code === '23505') return apiError('DUPLICATE_DOMAIN', 409)
      return dbFail(error)
    }
    if (!data) return apiError('INVALID_STATE', 409)
    return NextResponse.json({ site: data })
  }),
)
