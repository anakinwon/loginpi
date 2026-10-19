// 수정·삭제 라우트 공용 — PATCH { ver_no, self_apv?, req_rsn?, ...바꿀 항목 } / DELETE ?ver_no=&self_apv=1 : 신청 권한(신청 권한 — roles.ts 권한표)
// 상태별 처리(sql/012) : 승인완료 = 수정·삭제 신청(승인권자 자기 승인 시 즉시 반영) / 반려 = 수정은 재신청, 삭제는 즉시 논리 삭제 / 승인대기 = 변경 불가(취소 후 재등록)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from './db'
import { apiError, dbError, requireAreaRole, type ErrorCode } from './api'
import { ERR_STATUS, prepareChange, type ChgAct, type ChgTp } from './change'
import { requestChg, resubmitIns } from './approval'

type Ctx = { params: Promise<Record<string, string>> }
const verSchema = z.coerce.number().int().positive()
const DUP: Record<ChgTp, ErrorCode> = { DIC: 'WORD_DUP_LOGICAL', DOM: 'DOM_DUP_NM', TERM: 'TERM_DUP_NM' }

async function change(tp: ChgTp, act: ChgAct, areaId: string, id: string, ver: unknown, input: unknown, opt: { self_apv?: boolean; reason?: string }) {
  const auth = await requireAreaRole(areaId, 'STD_REQ')
  if (auth instanceof NextResponse) return auth
  const v = verSchema.safeParse(ver)
  if (!v.success || !z.string().uuid().safeParse(id).success) return apiError('INVALID_INPUT', 400)
  const uid = auth.user.usr_id
  try {
    const prep = await prepareChange(areaId, tp, id, act, input)
    if (typeof prep === 'string') return apiError(prep, ERR_STATUS(prep))
    if (prep.cur.ver_no !== v.data) return apiError('VERSION_CONFLICT', 409)
    const sts = prep.cur.std_sts_cd

    if (sts === 'REQ') return apiError('STS_NOT_EDITABLE', 409)
    if (sts === 'RJCT') {
      if (act === 'UPD') {
        const r = await resubmitIns(tp, id, v.data, prep.row, uid, opt.reason)
        if (typeof r === 'string') return apiError(r, ERR_STATUS(r))
        return NextResponse.json({ ok: true, requested: true, resubmitted: true, apv_req_id: r.apv_req_id }, { status: 202 })
      }
      // 반려된 신청 행은 사용처가 없으므로 바로 논리 삭제
      const { error } = await db().rpc('fn_chg_std_row', { p_tp: tp, p_id: id, p_act: 'DEL', p_ver: v.data, p_row: {}, p_usr_id: uid, p_req_id: null })
      if (error) return error.code === '40001' ? apiError('VERSION_CONFLICT', 409) : dbError(error, DUP[tp])
      return NextResponse.json({ ok: true })
    }

    const r = await requestChg(tp, areaId, id, act as 'UPD' | 'DEL', prep.row, v.data, auth.user, auth.perms, opt)
    if (typeof r === 'string') return apiError(r, ERR_STATUS(r))
    return r.status === 'REQ' ? NextResponse.json({ ok: true, requested: true, apv_req_id: r.apv_req_id }, { status: 202 }) : NextResponse.json({ ok: true, apv_req_id: r.apv_req_id })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export function changeRoutes(tp: ChgTp, idParam: string) {
  return {
    PATCH: async (req: Request, { params }: Ctx) => {
      const p = await params
      let body: Record<string, unknown>
      try {
        body = await req.json()
      } catch {
        return apiError('INVALID_INPUT', 400)
      }
      const { ver_no, self_apv, req_rsn, ...input } = body ?? {}
      return change(tp, 'UPD', p.areaId, p[idParam], ver_no, input, { self_apv: self_apv === true, reason: typeof req_rsn === 'string' ? req_rsn.slice(0, 2000) : undefined })
    },
    DELETE: async (req: Request, { params }: Ctx) => {
      const p = await params
      const sp = new URL(req.url).searchParams
      return change(tp, 'DEL', p.areaId, p[idParam], sp.get('ver_no'), null, { self_apv: sp.get('self_apv') === '1' })
    },
  }
}
