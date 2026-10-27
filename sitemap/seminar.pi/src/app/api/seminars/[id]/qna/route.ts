// Q&A(SubAgent4, 설계서 15.3) — GET ?page=&sort=top|new&ans=0|1 목록(20개 단위, 미답변/답변함 따로, 내 추천 여부),
//  POST {text} 질문 등록, PATCH {qnaId, act} : rcm·unrcm(1인 1추천 — 추천건수는 sql/008 트리거) · answer·unanswer(개최자·ADMIN) · hide(개최자·ADMIN 또는 내 질문, 논리삭제).
//  변경 뒤 화면이 app.send('refresh',{what:'qna'}). 응답은 사용자별이라 no-store. 비로그인 401 — redirect 없음
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, parseBody } from '@/lib/api'
import { closed, gate, noStore, who } from '@/lib/engage'
import { cleanQuestion, QNA_PAGE } from '@/lib/engage-rules'
import { isUuid, parsePage } from '@/lib/seminar-rules'

type QnaRow = {
  qna_id: string
  qst_cont: string
  rcm_cnt: number
  ans_dtm: string | null
  usr_id: string
  sys_user: { dsp_nm: string | null; pi_usr_nm: string | null } | null
  smn_qna_rcm: { rcm_id: string }[]
}

export const GET = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const w = await who(req, ctx)
    if (w instanceof NextResponse) return w
    const sp = req.nextUrl.searchParams
    const page = parsePage(sp.get('page'))
    const ans = sp.get('ans') === '1'
    const top = sp.get('sort') !== 'new'
    const from = (page - 1) * QNA_PAGE
    // 질문자 이름은 FK 힌트로(smn_qna_rcm 이 sys_user 와도 이어져 있어 모호해질 수 있다), 내 추천만 임베디드로(행 필터)
    let q = db()
      .from('smn_qna')
      .select(
        'qna_id, qst_cont, rcm_cnt, ans_dtm, usr_id, sys_user!smn_qna_sys_user_id_fkey(dsp_nm, pi_usr_nm), smn_qna_rcm(rcm_id)',
        { count: 'exact' },
      )
      .eq('smn_id', w.smnId)
      .eq('del_yn', 'N')
      .eq('smn_qna_rcm.usr_id', w.user.id)
      .eq('smn_qna_rcm.del_yn', 'N')
    q = ans ? q.not('ans_dtm', 'is', null) : q.is('ans_dtm', null)
    q = top ? q.order('rcm_cnt', { ascending: false }).order('reg_dtm') : q.order('reg_dtm', { ascending: false })
    q = q.order('qna_id') // 추천 수 동률(0표가 흔함)·같은 시각 — 쪽 경계에서 중복·누락 없게
    // 자격·목록·(미답변 화면이면) 답변함 수 — 서로 의존 없음 → 병렬(R-P1)
    const [g, list, done] = await Promise.all([
      gate(w.smnId, w.user),
      q.range(from, from + QNA_PAGE - 1).returns<QnaRow[]>(),
      ans
        ? null
        : db()
            .from('smn_qna')
            .select('qna_id', { count: 'exact', head: true })
            .eq('smn_id', w.smnId)
            .eq('del_yn', 'N')
            .not('ans_dtm', 'is', null),
    ])
    if (g instanceof NextResponse) return g
    if (list.error) return dbFail(list.error)
    if (done?.error) return dbFail(done.error)
    const items = (list.data ?? []).map((r) => ({
      id: r.qna_id,
      text: r.qst_cont,
      n: r.rcm_cnt,
      answered: !!r.ans_dtm,
      mine: r.smn_qna_rcm.length > 0,
      own: r.usr_id === w.user.id,
      name: r.sys_user?.dsp_nm || r.sys_user?.pi_usr_nm || '',
    }))
    const total = list.count ?? 0
    return NextResponse.json(
      {
        items,
        page,
        pages: Math.max(1, Math.ceil(total / QNA_PAGE)),
        answered: ans ? total : (done?.count ?? 0),
        staff: g.staff,
      },
      { headers: noStore },
    )
  }),
)

const NewBody = z.object({ text: z.string() })

export const POST = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const [w, body] = await Promise.all([who(req, ctx), parseBody(req, NewBody)])
    if (w instanceof NextResponse) return w
    if (body instanceof NextResponse) return body
    const text = cleanQuestion(body.text)
    if (!text) return apiError('INVALID_INPUT', 400)
    const g = await gate(w.smnId, w.user)
    if (g instanceof NextResponse) return g
    if (!g.open) return closed()
    const uid = w.user.id
    const { error } = await db()
      .from('smn_qna')
      .insert({ smn_id: w.smnId, usr_id: uid, qst_cont: text, regr_id: uid, modr_id: uid })
    if (error) return dbFail(error)
    return NextResponse.json({ ok: true }, { headers: noStore })
  }),
)

const PatchBody = z.object({ qnaId: z.string(), act: z.enum(['rcm', 'unrcm', 'answer', 'unanswer', 'hide']) })

export const PATCH = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const [w, body] = await Promise.all([who(req, ctx), parseBody(req, PatchBody)])
    if (w instanceof NextResponse) return w
    if (body instanceof NextResponse) return body
    if (!isUuid(body.qnaId)) return apiError('NOT_FOUND', 404)
    const uid = w.user.id
    // 자격과 질문 소속(이 세미나·활성) 확인 — 병렬(R-P1)
    const [g, qna] = await Promise.all([
      gate(w.smnId, w.user),
      db()
        .from('smn_qna')
        .select('usr_id')
        .eq('qna_id', body.qnaId)
        .eq('smn_id', w.smnId)
        .eq('del_yn', 'N')
        .maybeSingle<{ usr_id: string }>(),
    ])
    if (g instanceof NextResponse) return g
    if (qna.error) return dbFail(qna.error)
    if (!qna.data) return apiError('NOT_FOUND', 404)
    if (!g.open) return closed()
    const now = new Date().toISOString()
    let error: { code?: string; message?: string } | null = null

    if (body.act === 'rcm') {
      // 23505 = 이미 추천(x_smn_qna_rcm_01) → 성공(두 번 눌러도 1건, R-P5)
      ;({ error } = await db().from('smn_qna_rcm').insert({ qna_id: body.qnaId, usr_id: uid, regr_id: uid, modr_id: uid }))
      if (error?.code === '23505') error = null
    } else if (body.act === 'unrcm') {
      ;({ error } = await db()
        .from('smn_qna_rcm')
        .update({ del_yn: 'Y', del_dtm: now, modr_id: uid })
        .eq('qna_id', body.qnaId)
        .eq('usr_id', uid)
        .eq('del_yn', 'N'))
    } else if (body.act === 'hide') {
      if (!g.staff && qna.data.usr_id !== uid) return apiError('FORBIDDEN', 403)
      ;({ error } = await db()
        .from('smn_qna')
        .update({ del_yn: 'Y', del_dtm: now, modr_id: uid })
        .eq('qna_id', body.qnaId))
    } else {
      if (!g.staff) return apiError('FORBIDDEN', 403)
      ;({ error } = await db()
        .from('smn_qna')
        .update({ ans_dtm: body.act === 'answer' ? now : null, modr_id: uid })
        .eq('qna_id', body.qnaId))
    }
    if (error) return dbFail(error)
    return NextResponse.json({ ok: true }, { headers: noStore })
  }),
)
