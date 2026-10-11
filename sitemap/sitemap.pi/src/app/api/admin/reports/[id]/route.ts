// 관리자 신고 처리 API — PATCH /api/admin/reports/<id> { action:'accept'|'dismiss', prcsCont }
//  RECEIVED 만 처리(prcs_dtm 기록). accept 는 대상 사이트가 APPROVED 면 SUSPENDED 로 전환하고 상태 이력을 남긴다.
//  신고 전환·사이트 정지·이력은 DB 함수 fn_prcs_site_rpt(sql/002) 한 트랜잭션 — 앱 보상 처리 없음(데이터 모델 §10 ②)
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

type ProcessedReport = { rpt_id: string; site_id: string; rpt_sts_cd: string }

export const PATCH = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const id = await uuidParam(ctx)
    if (!id) return apiError('INVALID_INPUT', 400)
    const admin = await requireAdmin(req)
    if (admin instanceof NextResponse) return admin
    const body = await parseBody(req, adminReportActionSchema)
    if (body instanceof NextResponse) return body

    // RECEIVED 가 아니면 함수가 NULL 을 돌려준다(중복 처리 방지) → 409
    // PostgREST 는 복합형 NULL 을 전 컬럼 null 객체로 직렬화하므로 rpt_id 로 판정(실측 2026-10-11)
    const { data, error } = await db().rpc('fn_prcs_site_rpt', {
      p_rpt_id: id,
      p_rpt_sts_cd: body.action === 'accept' ? 'ACCEPTED' : 'DISMISSED',
      p_prcs_cont: body.prcsCont ?? null,
      p_prcs_usr_id: admin.id,
    })
    if (error) return dbFail(error)
    const rpt = data as Partial<ProcessedReport> | null
    if (!rpt?.rpt_id || !rpt.site_id || !rpt.rpt_sts_cd)
      return apiError('INVALID_STATE', 409)
    return NextResponse.json({
      report: { rpt_id: rpt.rpt_id, site_id: rpt.site_id, rpt_sts_cd: rpt.rpt_sts_cd },
    })
  }),
)
