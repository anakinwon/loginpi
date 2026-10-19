// SQL 편집기 실행(2026-10-18) — POST : 서버 직접 접속에 SQL 실행(조회 = SQL_QUERY, 쓰기 = CRUD(역할 ∩ 요금제)), 문장별 결과·이력 기록
// 판정·실행 규칙은 src/lib/sql-run.ts 머리 주석
import { NextResponse } from 'next/server'
import { dbError, parseBody, requireAreaRole } from '@/lib/api'
import { runBody, runEditor } from '@/lib/sql-run'

export const runtime = 'nodejs'
export const maxDuration = 60

type Ctx = { params: Promise<{ areaId: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const startedAt = Date.now() // 시간 예산 기준(인증·접속 확인 시간 포함)
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'SQL_QUERY')
  if (auth instanceof NextResponse) return auth
  const b = await parseBody(req, runBody)
  if (b instanceof NextResponse) return b
  try {
    return await runEditor(areaId, auth.user.usr_id, auth.perms, b, startedAt)
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
