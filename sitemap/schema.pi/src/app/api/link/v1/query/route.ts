// 연결 API — POST /api/link/v1/query { connId, q, params? } : 이름 붙인 조회(src/lib/link/queries.ts 정본) → { cols, rows, ms }
// 토큰 분류체계의 PostgreSQL 서버 직접 접속만, READ ONLY·5초·500행. 결과는 응답으로만(저장 없음)
import { z } from 'zod'
import { linkFail, linkOk, linkRoute } from '@/lib/link/auth'
import { isQueryName, paramsSchema, runNamed } from '@/lib/link/queries'

const body = z.object({ connId: z.string().uuid(), q: z.string().max(40), params: paramsSchema })

export const POST = linkRoute(async (req, a) => {
  const b = body.safeParse(await req.json().catch(() => null))
  if (!b.success) return linkFail('INVALID_INPUT', 400)
  if (!isQueryName(b.data.q)) return linkFail('Q_UNKNOWN', 400)
  const r = await runNamed(a.areaId, b.data.connId, b.data.q, b.data.params)
  return 'fail' in r ? linkFail(r.fail, r.status, r.message) : linkOk(r)
})
