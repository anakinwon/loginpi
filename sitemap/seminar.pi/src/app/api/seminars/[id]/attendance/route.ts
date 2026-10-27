// 출석(SubAgent4) — POST = 룸 입장 기록 + 60초 하트비트(같은 호출), GET ?page= = 개최자·ADMIN 출석부(50명 단위), ?all=1 = CSV 용 전체(상한 ATD_CSV_MAX).
//  POST 는 자격·상태 확인(gate, 병렬 2조회) 뒤에만 쓴다 — 종료·취소·삭제된 세미나·유료 참가 취소면 갱신하지 않고 409/404/402(야간 시험 T04 : 종료 뒤 마지막 시각이 늘던 결함).
//  활성 행이 있으면 lst_hb_dtm 만 바꾸고, 없으면 INSERT(첫 입장 시각 보존), 동시에 두 번 오면 23505 → 성공(R-P5). CSV 는 화면이 번역된 머리글로 만든다(engage-rules toCsv).
//  비로그인 401 — redirect 없음. 응답 no-store
// ponytail: 확인과 갱신 사이에 세미나가 닫히면 하트비트 1번(≤60초)이 더 남는다 — 엄격히 막으려면 상태 조건을 건 RPC 로
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute } from '@/lib/api'
import { closed, gate, noStore, who } from '@/lib/engage'
import { ATD_CSV_MAX, ATD_PAGE } from '@/lib/engage-rules'
import { parsePage } from '@/lib/seminar-rules'

type AtdRow = {
  ent_dtm: string
  lst_hb_dtm: string
  sys_user: { dsp_nm: string | null; pi_usr_nm: string | null } | null
}

export const POST = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const w = await who(req, ctx)
    if (w instanceof NextResponse) return w
    const g = await gate(w.smnId, w.user)
    if (g instanceof NextResponse) return g
    if (!g.open) return closed()
    const uid = w.user.id
    const now = new Date().toISOString()
    const hb = await db()
      .from('smn_atd')
      .update({ lst_hb_dtm: now, modr_id: uid })
      .eq('smn_id', w.smnId)
      .eq('usr_id', uid)
      .eq('del_yn', 'N')
      .select('atd_id')
    if (hb.error) return dbFail(hb.error)
    if (hb.data?.length) return NextResponse.json({ ok: true }, { headers: noStore })

    const { error } = await db()
      .from('smn_atd')
      .insert({ smn_id: w.smnId, usr_id: uid, ent_dtm: now, lst_hb_dtm: now, regr_id: uid, modr_id: uid })
    if (error && error.code !== '23505') return dbFail(error)
    return NextResponse.json({ ok: true, first: !error }, { headers: noStore })
  }),
)

export const GET = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const w = await who(req, ctx)
    if (w instanceof NextResponse) return w
    const sp = req.nextUrl.searchParams
    const all = sp.get('all') === '1'
    const page = all ? 1 : parsePage(sp.get('page'))
    const size = all ? ATD_CSV_MAX : ATD_PAGE
    const from = (page - 1) * size
    // 자격·목록 병렬(R-P1) — 개최자·ADMIN 이 아니면 목록은 버린다
    const [g, list] = await Promise.all([
      gate(w.smnId, w.user),
      db()
        .from('smn_atd')
        .select('ent_dtm, lst_hb_dtm, sys_user!smn_atd_sys_user_id_fkey(dsp_nm, pi_usr_nm)', { count: 'exact' })
        .eq('smn_id', w.smnId)
        .eq('del_yn', 'N')
        .order('ent_dtm')
        .order('atd_id') // 같은 입장 시각 — 쪽 경계에서 중복·누락 없게
        .range(from, from + size - 1)
        .returns<AtdRow[]>(),
    ])
    if (g instanceof NextResponse) return g
    if (!g.staff) return apiError('FORBIDDEN', 403)
    if (list.error) return dbFail(list.error)
    const total = list.count ?? 0
    return NextResponse.json(
      {
        title: g.title,
        items: (list.data ?? []).map((r) => ({
          name: r.sys_user?.dsp_nm || '',
          piName: r.sys_user?.pi_usr_nm || '',
          ent: r.ent_dtm,
          hb: r.lst_hb_dtm,
        })),
        total,
        page,
        pages: Math.max(1, Math.ceil(total / size)),
      },
      { headers: noStore },
    )
  }),
)
