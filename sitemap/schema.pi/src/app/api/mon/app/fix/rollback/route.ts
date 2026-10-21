// AI 수정 되돌리기 — POST {fix_id, reason} : 운영 배포된 AI 수정을 수정 전 내용으로 되돌리는 커밋을 master 에 만들고 운영(prod/schema) 반영(전역 관리자, sql/074)
//  배포 결과는 'AI 수정 이력' 목록·실시간 확인이 Vercel 상태로 확정(RBK → RBK_DONE·RBK_FAIL)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, currentUser, parseBody } from '@/lib/api'
import { rollbackFix } from '@/lib/mon-fix'
import { isGlobalAdmin } from '@/lib/mon-srv'

export const maxDuration = 60

const FAIL = {
  NO_GH: ['MON_FIX_OFF', 503],
  NOT_FOUND: ['MON_FIX_RBK_NONE', 409],
  BUSY: ['MON_FIX_BUSY', 409],
  CONFLICT: ['MON_FIX_RBK_CONFLICT', 409],
  MOVED: ['MON_FIX_RBK_MOVED', 409],
  PROD_FF: ['MON_FIX_PROD_FF', 409],
} as const

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  const b = await parseBody(req, z.object({ fix_id: z.string().uuid(), reason: z.string().trim().min(2).max(500) }))
  if (b instanceof NextResponse) return b
  try {
    if (!(await isGlobalAdmin(user.usr_id))) return apiError('MON_ADMIN_ONLY', 403)
    const r = await rollbackFix(b.fix_id, user.usr_id, b.reason)
    if (typeof r === 'string') return apiError(FAIL[r][0], FAIL[r][1])
    return NextResponse.json({ ok: true, ...r }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('mon-fix rollback', (e as Error).message)
    return apiError('MON_FIX_GH', 502)
  }
}
