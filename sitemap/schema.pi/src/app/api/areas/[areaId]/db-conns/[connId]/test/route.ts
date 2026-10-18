// DB 접속 시험(2026-10-18) — POST : 서버 직접 = 저장된 접속 정보·비밀번호로 SELECT 1 / 에이전트 = 시험 요청(queued, 에이전트가 다음 확인 때 실행·기록), 접속 관리 권한(DA)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, dbError, requireAreaRole } from '@/lib/api'
import { failRes, isFail, testConnById } from '@/lib/model-ddl-req'

export const runtime = 'nodejs'
export const maxDuration = 30

type Ctx = { params: Promise<{ areaId: string; connId: string }> }

export async function POST(_req: Request, { params }: Ctx) {
  const { areaId, connId } = await params
  const auth = await requireAreaRole(areaId, 'DB_CONN_ADMIN')
  if (auth instanceof NextResponse) return auth
  if (!z.string().uuid().safeParse(connId).success) return apiError('INVALID_INPUT', 400)
  try {
    const r = await testConnById(areaId, connId)
    return isFail(r) ? failRes(r) : NextResponse.json(r)
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
