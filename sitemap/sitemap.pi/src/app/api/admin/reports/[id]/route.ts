// 관리자 신고 처리 API — PATCH /api/admin/reports/<id> { action:'accept'|'dismiss', prcsCont }
//  RECEIVED 만 처리(prcs_dtm 기록). accept 는 대상 사이트가 APPROVED 면 SUSPENDED 로 순차 전환,
//  사이트 전환 실패 시 신고를 RECEIVED 로 되돌리는 보상 처리(PostgREST 는 다중 테이블 트랜잭션 불가)
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
import { adminReportActionSchema } from '@/lib/site'

export const PATCH = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const id = await uuidParam(ctx)
    if (!id) return apiError('INVALID_INPUT', 400)
    const admin = await requireAdmin(req)
    if (admin instanceof NextResponse) return admin
    const body = await parseBody(req, adminReportActionSchema)
    if (body instanceof NextResponse) return body

    // 1) 신고 상태 전환 — RECEIVED 일 때만(중복 처리 방지)
    const { data: rpt, error } = await db()
      .from('site_rpt')
      .update({
        rpt_sts_cd: body.action === 'accept' ? 'ACCEPTED' : 'DISMISSED',
        prcs_dtm: new Date().toISOString(),
        prcs_cont: body.prcsCont ?? null,
        modr_id: admin.id,
      })
      .eq('rpt_id', id)
      .eq('del_yn', 'N')
      .eq('rpt_sts_cd', 'RECEIVED')
      .select('rpt_id, site_id, rpt_sts_cd')
      .maybeSingle<{ rpt_id: string; site_id: string; rpt_sts_cd: string }>()
    if (error) return dbFail(error)
    if (!rpt) return apiError('INVALID_STATE', 409)
    if (body.action === 'dismiss') return NextResponse.json({ report: rpt })

    // 2) 인용 → 노출 중 사이트 정지. 이미 정지·비노출 상태면 변경 없음(0행 정상)
    const { error: siteErr } = await db()
      .from('site_mst')
      .update({ site_sts_cd: 'SUSPENDED', modr_id: admin.id })
      .eq('site_id', rpt.site_id)
      .eq('del_yn', 'N')
      .eq('site_sts_cd', 'APPROVED')
    if (siteErr) {
      // 보상 — 신고를 미처리로 되돌려 재처리 가능하게 한다
      const { error: undoErr } = await db()
        .from('site_rpt')
        .update({
          rpt_sts_cd: 'RECEIVED',
          prcs_dtm: null,
          prcs_cont: null,
          modr_id: admin.id,
        })
        .eq('rpt_id', rpt.rpt_id)
      if (undoErr)
        console.error(
          '[admin/reports] 보상 실패 — 수동 확인 필요',
          rpt.rpt_id,
          undoErr.message,
        )
      return dbFail(siteErr)
    }
    return NextResponse.json({ report: rpt })
  }),
)
