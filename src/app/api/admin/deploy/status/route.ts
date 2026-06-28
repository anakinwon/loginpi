import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getLatestStagingDeployment } from '@/lib/ops-deploy'

// staging 최신 배포 상태 — MASTER 전용. UI 폴링용.
export async function GET() {
  const user = await getSessionUser()
  if (user?.role !== 'MASTER')
    return NextResponse.json({ error: '권한이 없습니다(MASTER 전용)' }, { status: 403 })
  return NextResponse.json(await getLatestStagingDeployment())
}
