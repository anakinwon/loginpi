// 출석(SubAgent4) — POST = 룸 입장 기록 + 60초 하트비트(같은 호출), GET ?page= = 개최자·ADMIN 출석부(50명 단위), ?all=1 = CSV 용 전체(상한 ATD_CSV_MAX).
//  POST 는 자격·상태 확인(gate, 병렬 2조회) 뒤에만 쓴다 — 종료·취소·삭제된 세미나·유료 참가 취소면 갱신하지 않고 409/404/402(야간 시험 T04 : 종료 뒤 마지막 시각이 늘던 결함).
//  출석 갱신(없으면 INSERT, 첫 입장 시각 보존)·LIVE 개최자 시간 계량은 fn_hb_smn_hst(sql/015) 한 번 — 응답 remainSec, 소진이면 세미나 종료(endSeminar). CSV 는 화면이 번역된 머리글로 만든다(engage-rules toCsv).
//  방 남은 시간(sql/018) — 응답 plan·left·paid·free 는 개최자 본인에게만 : 룸 카운트다운. 남이 연 방에 들어온 참가자(ADMIN 포함)는
//  무조건 무료 입장·카운트다운 없음(마스터 2026-10-29 — 전에는 개최자 남은 시간을 참가자에게도 보내 카운트다운이 돌았다) → { ok } 만.
//  계량·소진 종료는 개최자 본인 하트비트만(개최자가 없으면 시간도 줄지 않는다).
//  비로그인 401 — redirect 없음. 응답 no-store
// ponytail: 확인과 갱신 사이에 세미나가 닫히면 하트비트 1번(≤60초)이 더 남는다 — 엄격히 막으려면 상태 조건을 건 RPC 로
import { after, NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute } from '@/lib/api'
import { closed, gate, noStore, who } from '@/lib/engage'
import { ATD_CSV_MAX, ATD_PAGE, hostState } from '@/lib/engage-rules'
import { closeEngineRoom, endSeminar, hostPlan, planLeft, planPools } from '@/lib/plan'
import { parsePage } from '@/lib/seminar-rules'

type AtdRow = {
  ent_dtm: string
  lst_hb_dtm: string
  atnd_sec_cnt: number
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
    //  참가자면 개최자 마지막 하트비트도 같이(독립 — 병렬 R-P1) : 개최자 부재 판정
    const isHost = g.hostId === w.user.id
    const [hb, hostAtd] = await Promise.all([
      db().rpc('fn_hb_smn_hst', { p_smn_id: w.smnId, p_usr_id: w.user.id }),
      isHost
        ? null
        : db().from('smn_atd').select('lst_hb_dtm').eq('smn_id', w.smnId).eq('usr_id', g.hostId).eq('del_yn', 'N').maybeSingle<{ lst_hb_dtm: string }>(),
    ])
    if (hb.error) return dbFail(hb.error)
    if (hostAtd?.error) return dbFail(hostAtd.error)
    const remainSec = hb.data === null ? null : Number(hb.data)
    // 참가자(개최자 아님) = 출석만 — 요금제·남은 시간을 보내지 않는다(카운트다운·소진 퇴장 없음).
    //  개최자가 5분 넘게 없으면(gone) 409 HOST_AWAY → 화면이 룸에서 나가고, 응답 뒤 엔진 방도 닫아 남은 접속(화면 조작 포함)을 끊는다(마스터 2026-10-29).
    //  90초 넘게 없으면(away) 알림용 away — 개최자가 다시 들어오면(하트비트) 풀린다
    if (!isHost) {
      const st = hostState(hostAtd?.data?.lst_hb_dtm, Date.now())
      if (st === 'gone') {
        // 닫기 직전 개최자 기록을 다시 본다 — 그사이 개최자가 돌아왔으면(입장권이 '있음'을 먼저 기록) 닫지 않는다(재입장 경합, 검토 지적)
        after(async () => {
          const again = await db().from('smn_atd').select('lst_hb_dtm').eq('smn_id', w.smnId).eq('usr_id', g.hostId).eq('del_yn', 'N').maybeSingle<{ lst_hb_dtm: string }>()
          if (!again.error && hostState(again.data?.lst_hb_dtm, Date.now()) === 'gone') await closeEngineRoom(w.smnId)
        })
        return apiError('HOST_AWAY', 409)
      }
      return NextResponse.json({ ok: true, away: st === 'away' }, { headers: noStore })
    }
    // LIVE 면 카운트다운용 요금제별 남은 시간(유료·무료 이원화, sql/021) — 개최자 차감 뒤 값이 필요해 하트비트 다음에 읽는다(의존 있는 직렬)
    const hp = g.live ? await hostPlan(g.hostId) : null
    const ticking = remainSec !== null
    const pools = hp ? planPools(hp, g.planCd) : null
    const left = remainSec ?? (hp ? planLeft(hp, g.planCd) : null)
    if (left !== null && left <= 0) {
      await endSeminar(w.smnId, w.user.id)
      return NextResponse.json({ ok: true, remainSec: 0, left: 0, plan: g.planCd, ended: true, code: 'PLAN_EXHAUSTED' }, { headers: noStore })
    }
    return NextResponse.json({ ok: true, remainSec, left, plan: g.planCd, paid: pools?.paid ?? null, free: pools?.free ?? null, ticking }, { headers: noStore })
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
        .select('ent_dtm, lst_hb_dtm, atnd_sec_cnt, sys_user!smn_atd_sys_user_id_fkey(dsp_nm, pi_usr_nm)', { count: 'exact' })
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
          sec: r.atnd_sec_cnt, // 참석 시간(나가 있던 시간 제외, sql/020)
        })),
        total,
        page,
        pages: Math.max(1, Math.ceil(total / size)),
      },
      { headers: noStore },
    )
  }),
)
