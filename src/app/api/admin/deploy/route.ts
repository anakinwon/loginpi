import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import {
  getDeployOverview,
  triggerStagingDeploy,
  promoteToProduction,
} from '@/lib/ops-deploy'

// 배포 컨트롤 — MASTER 전용(운영 승격은 핵심가치 직결, ADMIN보다 상위 권한 요구).
async function requireMaster() {
  const user = await getSessionUser()
  if (user?.role !== 'MASTER') return null
  return user
}

export async function GET() {
  if (!(await requireMaster()))
    return NextResponse.json(
      { error: '권한이 없습니다(MASTER 전용)' },
      { status: 403 },
    )
  return NextResponse.json(await getDeployOverview())
}

export async function POST(req: NextRequest) {
  if (!(await requireMaster()))
    return NextResponse.json(
      { error: '권한이 없습니다(MASTER 전용)' },
      { status: 403 },
    )

  let body: { target?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  if (body.target === 'staging') {
    const r = await triggerStagingDeploy()
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  }
  if (body.target === 'production') {
    const r = await promoteToProduction()
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  }
  return NextResponse.json(
    { error: "target은 'staging' 또는 'production'" },
    { status: 400 },
  )
}
