// 애플리케이션 모니터링 AI 수정안 PR — GET ?area=&page=&sts=PR,DPLY : 진행 보고서 목록(sql/072) / POST {area_id, route, cause, fix, mdl_id?} : 해결 방안 1개를 AI 가 코드로 바꿔 GitHub 브랜치·PR 생성(둘 다 그 분류체계 MON_AI, 2026-10-22)
//  운영 반영은 사람이 PR 병합(마스터 선택 2026-10-22). 고칠 파일은 이 앱 src 아래 ts·tsx 최대 3개(src/lib/mon-fix.ts)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { normRoute } from '@/lib/mon'
import { FIX_PAGE, fixPr, listFixes, type FixSts } from '@/lib/mon-fix'

export const maxDuration = 300 // AI 호출 최대 2회(재시도) + GitHub

const txt = (n: number) => z.string().trim().min(1).max(n)
const body = z.object({
  area_id: z.string().uuid(),
  route: z.string().max(200),
  cause: z.object({ title: txt(200), evidence: z.string().max(2000) }),
  fix: z.object({ title: txt(200), detail: z.string().max(2000), files: z.array(z.string().max(300)).min(1).max(20) }),
  mdl_id: z.string().uuid().optional(),
})

export async function POST(req: Request) {
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  if (normRoute(b.route) !== b.route) return apiError('INVALID_INPUT', 400)
  try {
    const auth = await requireAreaRole(b.area_id, 'MON_AI')
    if (auth instanceof NextResponse) return auth
    const r = await fixPr({ route: b.route, cause: b.cause, fix: b.fix, mdlId: b.mdl_id }, auth.user.usr_id)
    if (r === 'NO_GH') return apiError('MON_FIX_OFF', 503)
    if (r === 'FILE') return apiError('MON_FIX_FILE', 400)
    // 적용 실패 = 이유(AI 답의 요약·불일치 목록)를 화면에 그대로 — 다시 시도·다른 모델 판단용
    if (r && typeof r === 'object' && 'edit' in r) return NextResponse.json({ ok: false, code: 'MON_FIX_EDIT', message: `AI 수정안을 적용하지 못했습니다 — ${r.edit}` }, { status: 422 })
    if (r === 'OFF') return apiError('MON_AI_OFF', 503)
    if (r === 'GONE') return apiError('MON_AI_MDL_GONE', 409)
    if (!r) return apiError('MON_AI_FAIL', 502)
    return NextResponse.json({ ok: true, ...r }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('mon-fix', (e as Error).message)
    return apiError('MON_FIX_GH', 502)
  }
}

const STS: FixSts[] = ['REQ', 'REQ_FAIL', 'PR', 'APV', 'APV_FAIL', 'REJ', 'DPLY', 'DONE', 'DPLY_FAIL', 'RBK', 'RBK_DONE', 'RBK_FAIL'] // sql/072·074
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const area = sp.get('area') ?? ''
  if (!z.string().uuid().safeParse(area).success) return apiError('INVALID_INPUT', 400)
  const page = Math.max(1, Math.min(1000, Number(sp.get('page')) || 1))
  const sts = (sp.get('sts') ?? '').split(',').filter((x): x is FixSts => (STS as string[]).includes(x))
  try {
    const auth = await requireAreaRole(area, 'MON_AI')
    if (auth instanceof NextResponse) return auth
    const r = await listFixes(page, sts)
    return NextResponse.json({ ok: true, ...r, page, size: FIX_PAGE }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
