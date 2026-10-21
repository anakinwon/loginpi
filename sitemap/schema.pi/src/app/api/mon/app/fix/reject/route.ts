// AI 수정안 PR 반려 — POST {number, reason} : PR 닫기·브랜치 삭제(병합 안 함 = 운영 코드는 수정 전 그대로), 반려자·사유 기록(그 분류체계 MON_FIX_APV = DA 역할 ∩ 요금제4, 2026-10-22, sql/074)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, parseBody, requireAreaRole } from '@/lib/api'
import { rejectPr } from '@/lib/mon-fix'

const FAIL = {
  NO_GH: ['MON_FIX_OFF', 503],
  NOT_AI: ['MON_FIX_NOT_AI', 400],
  CLOSED: ['MON_FIX_CLOSED', 409],
  BUSY: ['MON_FIX_BUSY', 409],
} as const

export async function POST(req: Request) {
  const b = await parseBody(req, z.object({ area_id: z.string().uuid(), number: z.number().int().positive(), reason: z.string().trim().min(2).max(500) }))
  if (b instanceof NextResponse) return b
  try {
    const auth = await requireAreaRole(b.area_id, 'MON_FIX_APV')
    if (auth instanceof NextResponse) return auth
    const r = await rejectPr(b.number, auth.user.usr_id, b.reason)
    if (typeof r === 'string') return apiError(FAIL[r][0], FAIL[r][1])
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('mon-fix reject', (e as Error).message)
    return apiError('MON_FIX_GH', 502)
  }
}
