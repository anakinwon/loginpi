// 출석(SubAgent4) — POST = 룸 입장 기록 + 60초 하트비트(같은 호출), GET ?page= = 개최자·ADMIN 출석부(50명 단위), ?all=1 = CSV 용 전체(상한 ATD_CSV_MAX).
//  POST 는 자격·상태 확인(gate, 병렬 2조회) 뒤에만 쓴다 — 종료·취소·삭제된 세미나·유료 참가 취소면 갱신하지 않고 409/404/402(야간 시험 T04 : 종료 뒤 마지막 시각이 늘던 결함).
//  출석 갱신(없으면 INSERT, 첫 입장 시각 보존)·LIVE 개최자 시간 계량은 fn_hb_smn_hst(sql/015) 한 번 — 응답 remainSec, 소진이면 세미나 종료(endByPlan). CSV 는 화면이 번역된 머리글로 만든다(engage-rules toCsv).
//  비로그인 401 — redirect 없음. 응답 no-store
// ponytail: 확인과 갱신 사이에 세미나가 닫히면 하트비트 1번(≤60초)이 더 남는다 — 엄격히 막으려면 상태 조건을 건 RPC 로
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute } from '@/lib/api'
import { closed, gate, noStore, who } from '@/lib/engage'
import { ATD_CSV_MAX, ATD_PAGE } from '@/lib/engage-rules'
import { endByPlan } from '@/lib/plan'
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
    // 출석 갱신·개최자 시간 계량을 DB 함수 1왕복으로(sql/015 fn_hb_smn_hst — 출석 행 잠금으로 여러 탭 중복 계량 없음, R-P5)
    //  remainSec = null 이면 계량 대상 아님(참가자·ADMIN 개최자·LIVE 아님). 0 이하 = 시간 소진 → 세미나 종료
    const { data, error } = await db().rpc('fn_hb_smn_hst', { p_smn_id: w.smnId, p_usr_id: w.user.id })
    if (error) return dbFail(error)
    const remainSec = data === null ? null : Number(data)
    if (remainSec !== null && remainSec <= 0) {
      await endByPlan(w.smnId, w.user.id)
      return NextResponse.json({ ok: true, remainSec: 0, ended: true, code: 'PLAN_EXHAUSTED' }, { headers: noStore })
    }
    return NextResponse.json({ ok: true, remainSec }, { headers: noStore })
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
        .order('atd_id') // 동률 경계 고정 — 같은 시각이면 쪽 사이 중복·누락(야간 시험 T04 r3)
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
