// DDL 서버 직접 실행(2026-10-18) — POST : 승인된(또는 실패·일부 실행) 요청을 실행, 요청자 본인 또는 데이터아키텍트. 저장 DDL 만 실행·문장별 결과 기록
// 실행 전 대조 : 접속 지문·저장본 해시·현재 모델 재생성 해시·문장 화이트리스트. 끄기 = env DDL_DIRECT_ENABLED≠1(에이전트 실행만)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, audit, dbError, requireAreaRole } from '@/lib/api'
import { failRes, isFail, runReq } from '@/lib/model-ddl-req'
import { can } from '@/lib/roles'

export const runtime = 'nodejs'
export const maxDuration = 60

type Ctx = { params: Promise<{ areaId: string; prjId: string; reqId: string }> }
const uuid = z.string().uuid()

export async function POST(_req: Request, { params }: Ctx) {
  const { areaId, prjId, reqId } = await params
  const auth = await requireAreaRole(areaId, 'REQUEST')
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(prjId).success || !uuid.safeParse(reqId).success) return apiError('INVALID_INPUT', 400)
  try {
    const r = await runReq(areaId, prjId, reqId, auth.user.usr_id, can(auth.role, 'DDL_APPROVE'))
    if (isFail(r)) return failRes(r)
    const cnt = (k: string) => r.results.filter((x) => x.rslt === k).length
    await audit({ area_id: areaId, tgt_tp_cd: 'DDL', tgt_id: reqId, act_cd: 'UPD', aftr_val: { act: 'run', req_sts_cd: r.req_sts_cd, try_no: r.exec_try_no, ok: cnt('OK'), err: cnt('ERR'), rbk: cnt('RBK'), skip: cnt('SKIP') }, usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true, item: r })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
