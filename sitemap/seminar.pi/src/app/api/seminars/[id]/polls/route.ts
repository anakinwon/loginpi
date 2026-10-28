// 설문(SubAgent4, 설계서 15.3) — GET ?page= 목록(최신 순 5개 단위, 선택지별 표 수·내 선택), POST {q, opts} 만들기(개최자·ADMIN),
//  PATCH {pllId, optId} 투표(1인 1표, 다시 투표 = 바꾸기) · {pllId, close:true} 마감(개최자·ADMIN).
//  투표·집계는 sql/009 함수(fn_vote_smn_pll·fn_cnt_smn_pll). 변경 뒤 화면이 엔진 app.send('refresh',{what:'polls'}) 로 다른 사람에게 알린다.
//  개최자·ADMIN(staff) 응답에만 선택지별 투표자 이름(voters)을 싣는다 — 참가자에게는 수만(마스터 2026-10-28, 처리방침 고지 갱신).
//  응답은 사용자별(내 선택)이라 캐시하지 않는다(no-store). 비로그인 401 — redirect 없음
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, parseBody } from '@/lib/api'
import { closed, gate, noStore, who } from '@/lib/engage'
import { cleanPoll, POLL_PAGE, tally, VOTER_NAMES_FROM } from '@/lib/engage-rules'
import { isUuid, parsePage } from '@/lib/seminar-rules'

type PllRow = {
  pll_id: string
  qst_cont: string
  reg_dtm: string
  pll_sts_cd: string
  smn_pll_opt: { opt_id: string; opt_seq: number; opt_cont: string }[]
}
type CntRow = { pll_id: string; opt_id: string; vt_cnt: number; my_yn: string }
type VtRow = { pll_id: string; opt_id: string; sys_user: { dsp_nm: string | null; pi_usr_nm: string | null } | null }

export const GET = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const w = await who(req, ctx)
    if (w instanceof NextResponse) return w
    const page = parsePage(req.nextUrl.searchParams.get('page'))
    const from = (page - 1) * POLL_PAGE
    // 자격 확인과 목록은 서로 의존 없음 → 병렬(R-P1). 자격이 없으면 목록은 버린다
    const [g, list] = await Promise.all([
      gate(w.smnId, w.user),
      db()
        .from('smn_pll')
        .select('pll_id, qst_cont, reg_dtm, pll_sts_cd, smn_pll_opt(opt_id, opt_seq, opt_cont)', { count: 'exact' })
        .eq('smn_id', w.smnId)
        .eq('del_yn', 'N')
        .eq('smn_pll_opt.del_yn', 'N')
        .order('reg_dtm', { ascending: false })
        .order('pll_id') // 동률 경계 고정(T04 r3)
        .order('opt_seq', { referencedTable: 'smn_pll_opt' })
        .range(from, from + POLL_PAGE - 1)
        .returns<PllRow[]>(),
    ])
    if (g instanceof NextResponse) return g
    if (list.error) return dbFail(list.error)
    const rows = list.data ?? []
    let cnt: CntRow[] = []
    let vts: VtRow[] = []
    let named: string[] = []
    if (rows.length) {
      const ids = rows.map((p) => p.pll_id)
      // 이름 공개 = 고지 뒤에 만든 설문만 — 그 전 설문의 투표자는 '누가 했는지 안 보인다' 안내를 보고 투표했다(소급 공개 금지)
      named = rows.filter((p) => Date.parse(p.reg_dtm) >= VOTER_NAMES_FROM).map((p) => p.pll_id)
      // 집계·(staff 면) 투표자 — 서로 의존 없음 → 병렬(R-P1). 이 쪽 설문(최대 POLL_PAGE)만
      const [r, v] = await Promise.all([
        db().rpc('fn_cnt_smn_pll', { p_pll_ids: ids, p_usr_id: w.user.id }),
        g.staff && named.length
          ? db()
              .from('smn_pll_vt')
              .select('pll_id, opt_id, sys_user!smn_pll_vt_sys_user_id_fkey(dsp_nm, pi_usr_nm)')
              .in('pll_id', named)
              .eq('del_yn', 'N')
              .order('reg_dtm')
              .returns<VtRow[]>()
          : null,
      ])
      if (r.error) return dbFail(r.error)
      if (v?.error) return dbFail(v.error)
      cnt = (r.data as CntRow[] | null) ?? []
      vts = v?.data ?? []
    }
    const voters = (pllId: string, optId: string) =>
      vts.filter((x) => x.pll_id === pllId && x.opt_id === optId).map((x) => x.sys_user?.dsp_nm || x.sys_user?.pi_usr_nm || '')
    const items = rows.map((p) => {
      const mine = cnt.find((c) => c.pll_id === p.pll_id && c.my_yn === 'Y')?.opt_id ?? null
      const counts = Object.fromEntries(cnt.filter((c) => c.pll_id === p.pll_id).map((c) => [c.opt_id, c.vt_cnt]))
      const opts = tally(p.smn_pll_opt.map((o) => ({ id: o.opt_id, text: o.opt_cont })), counts).map((o) =>
        g.staff && named.includes(p.pll_id) ? { ...o, voters: voters(p.pll_id, o.id) } : o,
      )
      return { id: p.pll_id, q: p.qst_cont, open: p.pll_sts_cd === 'OPEN', mine, total: opts.reduce((a, o) => a + o.n, 0), opts }
    })
    const total = list.count ?? 0
    return NextResponse.json(
      { items, page, pages: Math.max(1, Math.ceil(total / POLL_PAGE)), staff: g.staff },
      { headers: noStore },
    )
  }),
)

const NewBody = z.object({ q: z.string(), opts: z.array(z.string()).max(10) })

export const POST = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const [w, body] = await Promise.all([who(req, ctx), parseBody(req, NewBody)])
    if (w instanceof NextResponse) return w
    if (body instanceof NextResponse) return body
    const poll = cleanPoll(body.q, body.opts)
    if (!poll) return apiError('INVALID_INPUT', 400)
    const g = await gate(w.smnId, w.user)
    if (g instanceof NextResponse) return g
    if (!g.staff) return apiError('FORBIDDEN', 403)
    if (!g.open) return closed()
    const uid = w.user.id
    const ins = await db()
      .from('smn_pll')
      .insert({ smn_id: w.smnId, qst_cont: poll.q, regr_id: uid, modr_id: uid })
      .select('pll_id')
      .single<{ pll_id: string }>()
    if (ins.error) return dbFail(ins.error)
    const pllId = ins.data.pll_id
    const opts = await db()
      .from('smn_pll_opt')
      .insert(poll.opts.map((t, i) => ({ pll_id: pllId, opt_seq: i + 1, opt_cont: t, regr_id: uid, modr_id: uid })))
    if (opts.error) {
      // 선택지 없는 설문이 남지 않게 논리삭제(물리 DELETE 금지)
      await db().from('smn_pll').update({ del_yn: 'Y', del_dtm: new Date().toISOString(), modr_id: uid }).eq('pll_id', pllId)
      return dbFail(opts.error)
    }
    return NextResponse.json({ ok: true, id: pllId }, { headers: noStore })
  }),
)

const PatchBody = z.union([
  z.object({ pllId: z.string(), optId: z.string() }),
  z.object({ pllId: z.string(), close: z.literal(true) }),
])

export const PATCH = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const [w, body] = await Promise.all([who(req, ctx), parseBody(req, PatchBody)])
    if (w instanceof NextResponse) return w
    if (body instanceof NextResponse) return body
    if (!isUuid(body.pllId) || ('optId' in body && !isUuid(body.optId))) return apiError('NOT_FOUND', 404)
    const g = await gate(w.smnId, w.user)
    if (g instanceof NextResponse) return g
    if (!g.open) return closed()

    if ('optId' in body) {
      const { data, error } = await db().rpc('fn_vote_smn_pll', {
        p_smn_id: w.smnId,
        p_pll_id: body.pllId,
        p_opt_id: body.optId,
        p_usr_id: w.user.id,
      })
      if (error) return dbFail(error)
      if (data === 'NOT_FOUND') return apiError('NOT_FOUND', 404)
      if (data === 'CLOSED') return apiError('POLL_CLOSED', 409)
      return NextResponse.json({ ok: true }, { headers: noStore })
    }

    if (!g.staff) return apiError('FORBIDDEN', 403)
    // 조건부 갱신 — 이미 마감이어도 성공(멱등)
    const { error } = await db()
      .from('smn_pll')
      .update({ pll_sts_cd: 'CLOSED', end_dtm: new Date().toISOString(), modr_id: w.user.id })
      .eq('pll_id', body.pllId)
      .eq('smn_id', w.smnId)
      .eq('pll_sts_cd', 'OPEN')
      .eq('del_yn', 'N')
    if (error) return dbFail(error)
    return NextResponse.json({ ok: true }, { headers: noStore })
  }),
)
