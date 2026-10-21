// AI 수정안 PR 승인 — POST {number} : master 병합 + 운영 브랜치(prod/schema) 반영(전역 관리자). GET ?sha= : 그 커밋의 Vercel 운영 배포 상태
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
  PROD_FF: ['MON_FIX_PROD_FF', 409],
} as const

async function admin() {
  const user = await currentUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  if (!(await isGlobalAdmin(user.usr_id))) return apiError('MON_ADMIN_ONLY', 403)
  return null
}

export async function POST(req: Request) {
  const b = await parseBody(req, z.object({ number: z.number().int().positive() }))
  if (b instanceof NextResponse) return b
  try {
    const deny = await admin()
    if (deny) return deny
    const r = await approvePr(b.number)
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
    const deny = await admin()
    if (deny) return deny
    if (!process.env.GITHUB_TOKEN) return apiError('MON_FIX_OFF', 503)
    return NextResponse.json({ ok: true, state: await deployState(sha) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('mon-fix state', (e as Error).message)
    return apiError('MON_FIX_GH', 502)
  }
}
