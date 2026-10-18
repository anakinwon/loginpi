// 로컬 에이전트 작업 가져가기(2026-10-18) — POST(Authorization: Bearer spa_…) : 접속 시험 요청(test) 또는 그 에이전트 접속의 승인된 DDL 요청 1건(job), 없으면 204
// 사용자 세션이 아니라 에이전트 토큰으로만 인증(쿠키 무시). 응답에 비밀번호 없음 — 비밀번호는 에이전트 PC 환경변수
import { NextResponse } from 'next/server'
import { apiError, audit, dbError } from '@/lib/api'
import { agtByToken, claimJob } from '@/lib/model-agent'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: Request) {
  try {
    const g = await agtByToken(req.headers.get('authorization'))
    if (!g) return apiError('AGT_UNAUTH', 401)
    const r = await claimJob(g)
    if (!r) return new NextResponse(null, { status: 204, headers: NO_STORE })
    if ('test' in r) return NextResponse.json({ ok: true, test: r.test }, { headers: NO_STORE })
    if ('skipped' in r) return new NextResponse(null, { status: 204, headers: NO_STORE }) // 대조 실패 = FAIL 처리됨(상세는 요청 화면)
    if (r.apv_usr_id) await audit({ area_id: g.area_id, tgt_tp_cd: 'DDL', tgt_id: r.job.req_id, act_cd: 'UPD', aftr_val: { act: 'agent_claim', try_no: r.job.try_no, agt_id: g.agt_id }, usr_id: r.apv_usr_id })
    return NextResponse.json({ ok: true, job: r.job }, { headers: NO_STORE })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
