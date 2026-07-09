import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getBothStatuses } from '@/lib/ops-deploy'
import { apiError } from '@/lib/api-errors'

// Stage/운영 최신 배포 상태 — MASTER 전용. UI 폴링용.
export async function GET() {
  const user = await getSessionUser()
  if (user?.role !== 'MASTER') return apiError('ADM_MASTER_ONLY', 403)
  return NextResponse.json(await getBothStatuses())
}
