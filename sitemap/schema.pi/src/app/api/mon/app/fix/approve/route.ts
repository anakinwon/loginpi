// AI 수정안 PR 승인 — POST {number, head(PR 만들 때 받은 커밋)} : master 병합 + 운영 브랜치(prod/schema) 반영(전역 관리자, 승인자 = 누른 사람 sql/072 기록)
//  GET ?sha= : 그 커밋의 Vercel 운영 배포 상태(끝났으면 기록을 배포 완료·실패로 확정)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, currentUser, parseBody } from '@/lib/api'
import { approvePr, deployState } from '@/lib/mon-fix'
import { isGlobalAdmin } from '@/lib/mon-srv'

const FAIL = {
  NO_GH: ['MON_FIX_OFF', 503],
  NOT_AI: ['MON_FIX_NOT_AI', 400],
  CLOSED: ['MON_FIX_CLOSED', 409],
  CONFLICT: ['MON_FIX_CONFLICT', 409],
  CHANGED: ['MON_FIX_CHANGED', 409],
  BUSY: ['MON_FIX_BUSY', 409],
  PROD_FF: ['MON_FIX_PROD_FF', 409],
} as const

// 전역 관리자면 사용자, 아니면 오류 응답
async function admin() {
  const user = await currentUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  if (!(await isGlobalAdmin(user.usr_id))) return apiError('MON_ADMIN_ONLY', 403)
  return user
}

export async function POST(req: Request) {
  const b = await parseBody(req, z.object({ number: z.number().int().positive(), head: z.string().regex(/^[0-9a-f]{40}$/) }))
  if (b instanceof NextResponse) return b
  try {
    const u = await admin()
    if (u instanceof NextResponse) return u
    const r = await approvePr(b.number, b.head, u.usr_id)
    if (typeof r === 'string') return apiError(FAIL[r][0], FAIL[r][1])
    return NextResponse.json({ ok: true, ...r }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('mon-fix approve', (e as Error).message)
    return apiError('MON_FIX_GH', 502)
  }
}

export async function GET(req: Request) {
  const sha = new URL(req.url).searchParams.get('sha') ?? ''
  if (!/^[0-9a-f]{40}$/.test(sha)) return apiError('INVALID_INPUT', 400)
  try {
    const u = await admin()
    if (u instanceof NextResponse) return u
    if (!process.env.GITHUB_TOKEN) return apiError('MON_FIX_OFF', 503)
    return NextResponse.json({ ok: true, state: await deployState(sha) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('mon-fix state', (e as Error).message)
    return apiError('MON_FIX_GH', 502)
  }
}
