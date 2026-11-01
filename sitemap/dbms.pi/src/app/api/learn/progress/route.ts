// DBA 학습 진도 — GET /api/learn/progress (내 답안 목록) / POST { qstId, choice } (채점 후 저장, 정답·해설 반환)
//  채점은 서버가 정적 문제 은행(src/lib/learn/questions.ts)으로 다시 한다 — 클라이언트 정답 판정은 믿지 않음
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, parseBody, requireUser } from '@/lib/api'
import { grade, questionById, QUESTIONS } from '@/lib/learn/questions'

const Body = z.object({
  qstId: z.string().regex(/^q\d{2}$/),
  choice: z.number().int().min(0).max(9),
})

export const GET = withGuard(
  dbRoute(async (req) => {
    const user = await requireUser(req)
    if (user instanceof NextResponse) return user
    // ponytail: 사용자당 행 수 ≤ 문제 은행 크기(22) — 페이지 대신 상한 limit. 은행이 수백 문제로 커지면 주제별 조회로
    const { data, error } = await db()
      .from('dbm_lrn_prgs')
      .select('qst_id, crct_yn, ans_dtm')
      .eq('usr_id', user.id)
      .eq('del_yn', 'N')
      .limit(QUESTIONS.length + 50)
    if (error) return dbFail(error)
    return NextResponse.json({
      items: data.map((r) => ({ qstId: r.qst_id, crctYn: r.crct_yn, ansDtm: r.ans_dtm })),
    })
  }),
)

export const POST = withGuard(
  dbRoute(async (req) => {
    // R-P1 — 본문 파싱과 세션 확인은 독립
    const [body, user] = await Promise.all([parseBody(req, Body), requireUser(req)])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body
    const correct = grade(body.qstId, body.choice)
    const q = questionById(body.qstId)
    if (correct === null || !q) return apiError('INVALID_INPUT', 400)
    const now = new Date().toISOString()
    const { error } = await db()
      .from('dbm_lrn_prgs')
      .upsert(
        {
          usr_id: user.id,
          qst_id: body.qstId,
          chc_no: body.choice,
          crct_yn: correct ? 'Y' : 'N',
          ans_dtm: now,
          del_yn: 'N',
          del_dtm: null,
          regr_id: user.id,
          modr_id: user.id,
        },
        { onConflict: 'usr_id,qst_id' },
      )
    if (error) return dbFail(error)
    return NextResponse.json({ correct, answer: q.answer, ansDtm: now })
  }),
)
