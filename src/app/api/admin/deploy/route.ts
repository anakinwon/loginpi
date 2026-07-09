import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import {
  getDeployOverview,
  triggerStagingDeploy,
  promoteToProduction,
} from '@/lib/ops-deploy'
import { apiError } from '@/lib/api-errors'

// 배포 컨트롤 — MASTER 전용(운영 승격은 핵심가치 직결, ADMIN보다 상위 권한 요구).
async function requireMaster() {
  const user = await getSessionUser()
  if (user?.role !== 'MASTER') return null
  return user
}

export async function GET() {
  if (!(await requireMaster()))
    return apiError('ADM_MASTER_ONLY', 403)
  return NextResponse.json(await getDeployOverview())
}

export async function POST(req: NextRequest) {
  if (!(await requireMaster()))
    return apiError('ADM_MASTER_ONLY', 403)

  let body: { target?: string }
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  if (body.target === 'staging') {
    const r = await triggerStagingDeploy()
    if (!r.ok) return apiError(r.code!, 400, r.params)
    return NextResponse.json({ ok: true })
  }
  if (body.target === 'production') {
    const r = await promoteToProduction()
    if (!r.ok) return apiError(r.code!, 400, r.params)
    return NextResponse.json({ ok: true, sha: r.sha })
  }
  return apiError('ADM_DEPLOY_TARGET_INVALID', 400)
}
