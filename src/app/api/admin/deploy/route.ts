import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isMaster } from '@/lib/auth-check'
import {
  getDeployOverview,
  triggerStagingDeploy,
  promoteToProduction,
} from '@/lib/ops-deploy'
import { apiError } from '@/lib/api-errors'

// 배포 컨트롤 — 최상위(super user) 전용. 2026-07-16 ADMIN=최상위 확정(isMaster 중앙 게이트).
async function requireMaster() {
  const user = await getSessionUser()
  if (!isMaster(user)) return null
  return user
}

export async function GET() {
  if (!(await requireMaster())) return apiError('ADM_MASTER_ONLY', 403)
  return NextResponse.json(await getDeployOverview())
}

export async function POST(req: NextRequest) {
  if (!(await requireMaster())) return apiError('ADM_MASTER_ONLY', 403)

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
