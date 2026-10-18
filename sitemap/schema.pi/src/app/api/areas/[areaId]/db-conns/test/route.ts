// 저장 전 DB 접속 시험(마스터 지시 2026-10-18) — POST {접속 입력값, conn_id?} : 입력 중인 값으로 SELECT 1(저장 안 함), 접속 관리 권한(DA)
// 수정 중 비밀번호 칸이 비면 conn_id 의 저장된 비밀번호 사용. 실패 사유는 주소·계정을 가린 메시지
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbError, parseBody, requireAreaRole } from '@/lib/api'
import { connBody, failRes, isFail, testConnDraft } from '@/lib/model-ddl-req'

export const runtime = 'nodejs'
export const maxDuration = 30

type Ctx = { params: Promise<{ areaId: string }> }
const body = connBody.extend({ conn_id: z.string().uuid().optional() })

export async function POST(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'DB_CONN_ADMIN')
  if (auth instanceof NextResponse) return auth
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  try {
    const r = await testConnDraft(areaId, b, b.conn_id)
    return isFail(r) ? failRes(r) : NextResponse.json({ ok: true })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
