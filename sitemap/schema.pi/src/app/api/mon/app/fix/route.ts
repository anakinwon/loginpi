// 애플리케이션 모니터링 AI 수정안 PR — POST {route, cause, fix, mdl_id?} : 해결 방안 1개를 AI 가 코드로 바꿔 GitHub 브랜치·PR 생성(전역 관리자)
//  운영 반영은 사람이 PR 병합(마스터 선택 2026-10-22). 고칠 파일은 이 앱 src 아래 ts·tsx 최대 3개(src/lib/mon-fix.ts)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, currentUser, dbError, parseBody } from '@/lib/api'
import { normRoute } from '@/lib/mon'
import { fixPr } from '@/lib/mon-fix'
import { isGlobalAdmin } from '@/lib/mon-srv'

export const maxDuration = 180

const txt = (n: number) => z.string().trim().min(1).max(n)
const body = z.object({
  route: z.string().max(200),
  cause: z.object({ title: txt(200), evidence: z.string().max(2000) }),
  fix: z.object({ title: txt(200), detail: z.string().max(2000), files: z.array(z.string().max(300)).min(1).max(20) }),
  mdl_id: z.string().uuid().optional(),
})

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  if (normRoute(b.route) !== b.route) return apiError('INVALID_INPUT', 400)
  try {
    if (!(await isGlobalAdmin(user.usr_id))) return apiError('MON_ADMIN_ONLY', 403)
    const r = await fixPr({ route: b.route, cause: b.cause, fix: b.fix, mdlId: b.mdl_id })
    if (r === 'NO_GH') return apiError('MON_FIX_OFF', 503)
    if (r === 'FILE') return apiError('MON_FIX_FILE', 400)
    if (r === 'EDIT') return apiError('MON_FIX_EDIT', 422)
    if (r === 'OFF') return apiError('MON_AI_OFF', 503)
    if (r === 'GONE') return apiError('MON_AI_MDL_GONE', 409)
    if (!r) return apiError('MON_AI_FAIL', 502)
    return NextResponse.json({ ok: true, ...r }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('mon-fix', (e as Error).message)
    return apiError('MON_FIX_GH', 502)
  }
}
