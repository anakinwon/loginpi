// AI 수정안 PR 승인 — POST {area_id, number, head(PR 만들 때 받은 커밋)} : master 병합 + 운영 브랜치(prod/schema) 반영(그 분류체계 MON_FIX_APV = DA 역할 ∩ 요금제4, 2026-10-22, 승인자 기록)
//  GET ?area=&sha= : 그 커밋의 Vercel 운영 배포 상태(MON_AI, 끝났으면 기록을 배포 완료·실패로 확정)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, parseBody, requireAreaRole } from '@/lib/api'
import { approvePr, deployState } from '@/lib/mon-fix'

const FAIL = {
  NO_GH: ['MON_FIX_OFF', 503],
  NOT_AI: ['MON_FIX_NOT_AI', 400],
  CLOSED: ['MON_FIX_CLOSED', 409],
  CONFLICT: ['MON_FIX_CONFLICT', 409],
  CHANGED: ['MON_FIX_CHANGED', 409],
  BUSY: ['MON_FIX_BUSY', 409],
  PROD_FF: ['MON_FIX_PROD_FF', 409],
} as const


export async function POST(req: Request) {
  const b = await parseBody(req, z.object({ area_id: z.string().uuid(), number: z.number().int().positive(), head: z.string().regex(/^[0-9a-f]{40}$/) }))
  if (b instanceof NextResponse) return b
  try {
    const auth = await requireAreaRole(b.area_id, 'MON_FIX_APV')
    if (auth instanceof NextResponse) return auth
    const r = await approvePr(b.number, b.head, auth.user.usr_id)
    if (typeof r === 'string') return apiError(FAIL[r][0], FAIL[r][1])
    return NextResponse.json({ ok: true, ...r }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('mon-fix approve', (e as Error).message)
    return apiError('MON_FIX_GH', 502)
  }
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const sha = sp.get('sha') ?? ''
  const area = sp.get('area') ?? ''
  if (!/^[0-9a-f]{40}$/.test(sha) || !z.string().uuid().safeParse(area).success) return apiError('INVALID_INPUT', 400)
  try {
    const auth = await requireAreaRole(area, 'MON_AI')
    if (auth instanceof NextResponse) return auth
    if (!process.env.GITHUB_TOKEN) return apiError('MON_FIX_OFF', 503)
    return NextResponse.json({ ok: true, state: await deployState(sha) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('mon-fix state', (e as Error).message)
    return apiError('MON_FIX_GH', 502)
  }
}
