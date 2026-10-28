// 녹화 계량(sql/023) — POST {act:'start'|'beat'|'stop'}. 녹화 파일은 서버에 오지 않는다(브라우저 내려받기만) — 여기서는 시간만 센다.
//  발표자(개최자·관리자)만, 월간·연간 세미나 + 유료 남은 시간이 있을 때만(무료 = 402 REC_PAID_ONLY, 소진 = 402 PLAN_EXHAUSTED).
//  녹화 중 30초마다 beat → 룸 시간과 따로 유료 이용권에서 한 번 더 차감(마스터 2026-10-29). beat 응답 stop:true = 유료 시간 소진 → 화면이 녹화를 멈추고 저장.
//  비로그인 401(redirect 없음). 응답 no-store
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, parseBody } from '@/lib/api'
import { gate, noStore, who } from '@/lib/engage'

const Body = z.object({ act: z.enum(['start', 'beat', 'stop']) })

export const POST = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const [w, body] = await Promise.all([who(req, ctx), parseBody(req, Body)])
    if (w instanceof NextResponse) return w
    if (body instanceof NextResponse) return body
    const g = await gate(w.smnId, w.user)
    if (g instanceof NextResponse) return g
    if (!g.staff) return apiError('FORBIDDEN', 403) // 녹화는 발표자(개최자·관리자)만 — 룸 ⋯ 메뉴도 발표자에게만
    const { data, error } = await db().rpc('fn_rec_smn', { p_smn_id: w.smnId, p_usr_id: w.user.id, p_act: body.act.toUpperCase() })
    if (error) return dbFail(error)
    const r = (data as { rslt_cd: string; paid_sec: number | string }[] | null)?.[0]
    const paidSec = Number(r?.paid_sec ?? 0)
    switch (r?.rslt_cd) {
      case 'OK':
        return NextResponse.json({ ok: true, paidSec }, { headers: noStore })
      case 'EXHAUSTED': // 시작이면 거절, 녹화 중이면 멈추라고(파일은 화면이 저장)
        return body.act === 'start'
          ? apiError('PLAN_EXHAUSTED', 402)
          : NextResponse.json({ ok: true, paidSec: 0, stop: true }, { headers: noStore })
      case 'PAID_ONLY':
        return apiError('REC_PAID_ONLY', 402)
      case 'CLOSED':
        return apiError('SMN_CLOSED', 409)
      default: // NOT_IN_ROOM — 출석 하트비트가 아직 없음(룸 입장 직후). 잠시 뒤 다시
        return apiError('REC_NOT_IN_ROOM', 409)
    }
  }),
)
