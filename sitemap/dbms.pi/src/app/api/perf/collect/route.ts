// 성능 수집(PRD 12 §3-1, ANL-R02) — POST /api/perf/collect { linkId, connId } : 수동 수집 1회
//  소유·요금제 확인 + 무료 하루 수동 수집 한도 → 본체 src/lib/perf/collect.ts collectOnce(자동 수집 크론과 공용)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withGuard } from '@pi/guard'
import { dbFail, dbRoute, parseBody } from '@/lib/api'
import { planRequired } from '@/lib/link/client'
import { clctUsedToday } from '@/lib/plan'
import { collectOnce } from '@/lib/perf/collect'
import { linkFail, linkParams } from '@/lib/perf/server'

const bodySchema = z.object({ linkId: z.string(), connId: z.string() })

export const POST = withGuard(
  dbRoute(async (req) => {
    const body = await parseBody(req, bodySchema)
    if (body instanceof NextResponse) return body
    // R-P1 — 소유·요금제 확인과 오늘 수집 횟수는 서로 독립(무제한 요금제면 횟수는 버림)
    const [p, used] = await Promise.all([linkParams(req, body.linkId, body.connId), clctUsedToday(body.linkId)])
    if (p instanceof NextResponse) return p
    // 무료 = 하루 수동 수집 clct_day_cnt 회(sql/035). ponytail: 확인 → 저장 사이 동시 수집은 1~2회 넘칠 수 있음, 엄격히 막으려면 DB 함수로 잠금
    const cap = p.ctx.plan.clctDay
    if (cap != null && used >= cap) return planRequired('D1', 'PLAN_LIMIT')

    let r
    try {
      r = await collectOnce(p.linkId, p.connId, p.ctx.usrId)
    } catch (e) {
      return linkFail(e)
    }
    if (!r.ok) return dbFail(r.dbErr)
    return NextResponse.json({ clctId: r.clctId, clctDtm: r.clctDtm, pgss: r.pgss, qryCnt: r.qryCnt, tblCnt: r.tblCnt, idxCnt: r.idxCnt })
  }),
)
