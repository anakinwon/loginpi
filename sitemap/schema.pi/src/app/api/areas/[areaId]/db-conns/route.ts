// DB 접속 프로파일(2026-10-18, sql/038) — GET : 목록(조회 권한은 이름·DBMS·방법만, 접속 관리 권한은 주소·계정·has_pwd 까지) / POST : 등록(접속 관리 = DA)
// 비밀번호는 쓰기 전용(서버 키로 봉인 저장), 응답·감사 이력에 남기지 않음. 키 없으면 서버 직접 접속 등록 503
import { NextResponse } from 'next/server'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { connBody, connOut, failRes, isFail, listConns, saveConn } from '@/lib/model-ddl-req'
import { can } from '@/lib/roles'
import { profileKey } from '@/lib/secret'

type Ctx = { params: Promise<{ areaId: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  try {
    const full = can(auth.role, 'DB_CONN_ADMIN')
    return NextResponse.json({ ok: true, items: (await listConns(areaId)).map((c) => connOut(c, full)), key_set: !!profileKey(), admin: full })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'DB_CONN_ADMIN')
  if (auth instanceof NextResponse) return auth
  const b = await parseBody(req, connBody)
  if (b instanceof NextResponse) return b
  try {
    const r = await saveConn(areaId, b, auth.user.usr_id)
    if (isFail(r)) return failRes(r)
    await audit({ area_id: areaId, tgt_tp_cd: 'DBCN', tgt_id: r.conn_id, act_cd: 'INS', aftr_val: connOut(r, true), usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true, item: connOut(r, true) })
  } catch (e) {
    const x = e as { code?: string; message?: string }
    return x.code === '23505' ? apiError('INVALID_INPUT', 409) : dbError(x)
  }
}
