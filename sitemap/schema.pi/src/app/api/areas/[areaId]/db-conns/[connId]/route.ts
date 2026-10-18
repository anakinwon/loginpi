// DB 접속 프로파일 1건(2026-10-18) — PATCH : 수정(ver_no 잠금, pwd 없으면 기존 비밀번호 유지) / DELETE ?ver_no= : 논리 삭제. 접속 관리 권한(DA)
// 처리 중(대기·승인·실행중) 요청이 걸린 접속은 DB 트리거가 거부(MDB01 → 409 DB_CONN_BUSY)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { connBody, connOut, delConn, failRes, getConn, isFail, saveConn } from '@/lib/model-ddl-req'

type Ctx = { params: Promise<{ areaId: string; connId: string }> }
const uuid = z.string().uuid()
const body = connBody.extend({ ver_no: z.number().int().min(1) })

export async function PATCH(req: Request, { params }: Ctx) {
  const { areaId, connId } = await params
  const auth = await requireAreaRole(areaId, 'DB_CONN_ADMIN')
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(connId).success) return apiError('INVALID_INPUT', 400)
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  try {
    const cur = await getConn(areaId, connId)
    if (!cur) return apiError('NOT_FOUND', 404)
    const r = await saveConn(areaId, b, auth.user.usr_id, { ...cur, want_ver: b.ver_no })
    if (isFail(r)) return failRes(r)
    await audit({ area_id: areaId, tgt_tp_cd: 'DBCN', tgt_id: connId, act_cd: 'UPD', bfr_val: connOut(cur, true), aftr_val: { ...connOut(r, true), pwd_changed: !!b.pwd }, usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true, item: connOut(r, true) })
  } catch (e) {
    const x = e as { code?: string; message?: string }
    return x.code === '23505' ? apiError('INVALID_INPUT', 409) : dbError(x)
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { areaId, connId } = await params
  const auth = await requireAreaRole(areaId, 'DB_CONN_ADMIN')
  if (auth instanceof NextResponse) return auth
  const ver = Number(new URL(req.url).searchParams.get('ver_no'))
  if (!uuid.safeParse(connId).success || !Number.isInteger(ver) || ver < 1) return apiError('INVALID_INPUT', 400)
  try {
    const cur = await getConn(areaId, connId)
    if (!cur) return apiError('NOT_FOUND', 404)
    if (!(await delConn(areaId, cur, ver, auth.user.usr_id))) return apiError('VERSION_CONFLICT', 409)
    await audit({ area_id: areaId, tgt_tp_cd: 'DBCN', tgt_id: connId, act_cd: 'DEL', bfr_val: connOut(cur, true), usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
