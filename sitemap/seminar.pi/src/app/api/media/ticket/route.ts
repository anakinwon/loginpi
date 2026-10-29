// 미디어 입장권 발급 — POST {room, cap:'present'|'watch'} → {ticket, wsUrl}. 로그인 필수(쿠키 OR X-Pi-Token, null 이면 401 — redirect 금지).
// cap=present 는 관리자 또는 그 세미나 개최자(PRD D-1 개정). 개최자(관리자 포함)는 그 세미나 요금제(smn_mst.plan_cd, sql/018) 남은 시간 > 0 — 아니면 402 PLAN_EXHAUSTED. room = smn_id(D-8) : 세미나가 있고 종료·취소가 아니어야 발급(404·409),
//  cap=watch 는 무료이거나 활성 참가 등록이 있어야 발급(D-9, 없으면 402). 정원 cap = max_cnt + 발표자 1.
// uuid 가 아닌 방 코드(M0~M3 실험실 방)는 실험실이 열린 환경에서만 DB 확인 없이 발급(R-P6, 아소카 결정(마스터 위임 2026-10-26)) — 운영은 LAB_ENABLED=1 일 때만
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { env } from '@/env'
import { db, dbFail, dbRoute } from '@/lib/api'
import { getSessionUser, isAdmin } from '@/lib/auth'
import { signMediaTicket } from '@/lib/media-ticket'
import { HOST_GRACE_MS, hostState } from '@/lib/engage-rules'
import { hostPlan, planLeft } from '@/lib/plan'
import { isUuid, OPEN_STS } from '@/lib/seminar-rules'

const labOpen = () =>
  process.env.NODE_ENV !== 'production' || env.LAB_ENABLED === '1'

const Body = z.object({
  room: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  cap: z.enum(['present', 'watch']),
})

const noStore = { 'Cache-Control': 'no-store' }

// 세션 확인도 DB 를 쓰므로 dbRoute(미설정 503·예외 500)
export const POST = withAuthGuard(dbRoute(async (req) => {
  // 서로 의존 없는 세션 확인·본문 파싱은 병렬(R-P1)
  const [user, raw] = await Promise.all([
    getSessionUser(req),
    req.json().catch(() => null),
  ])
  if (!user)
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: noStore },
    )
  const parsed = Body.safeParse(raw)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'bad_request' },
      { status: 400, headers: noStore },
    )
  // uuid 방은 소문자로 통일(S3) — 대소문자만 다른 같은 세미나가 엔진에서 다른 방이 되지 않게(실험실 방 코드는 그대로)
  const { cap } = parsed.data
  const room = isUuid(parsed.data.room) ? parsed.data.room.toLowerCase() : parsed.data.room
  // 발표자 = ADMIN 또는 그 세미나 개최자(요금제 2026-10-28). 실험실 방(uuid 아님)은 ADMIN 만
  const admin = isAdmin(user)
  if (cap === 'present' && !admin && !isUuid(room))
    return NextResponse.json(
      { error: 'forbidden' },
      { status: 403, headers: noStore },
    )

  let roomCap: number | undefined
  let startLive = false
  let nickname: string | null = null // 세미나 별명(sql/014)
  let hostEntry = false // 개최자 본인 입장(부재 판정 경합 방지 표시용)
  if (isUuid(room)) {
    // 세미나·내 참가 — 서로 의존 없음 → 병렬(R-P1)
    const [smn, ptc, nck, plan] = await Promise.all([
      db()
        .from('smn_mst')
        .select('max_cnt, ent_pi_amt, smn_sts_cd, hst_usr_id, plan_cd')
        .eq('smn_id', room)
        .eq('del_yn', 'N')
        .maybeSingle<{ max_cnt: number; ent_pi_amt: number | string; smn_sts_cd: string; hst_usr_id: string; plan_cd: string }>(),
      db()
        .from('smn_ptc')
        .select('ptc_id')
        .eq('smn_id', room)
        .eq('usr_id', user.id)
        .eq('del_yn', 'N')
        .maybeSingle(),
      // 세미나 별명(sql/014) — 있으면 표시명으로
      db()
        .from('smn_ncknm')
        .select('ncknm')
        .eq('smn_id', room)
        .eq('usr_id', user.id)
        .eq('del_yn', 'N')
        .maybeSingle<{ ncknm: string }>(),
      // 발표자 = 내 요금제별 남은 시간 — 개최자인지 확인과 병렬로 미리(R-P1). 개최자가 아니면 버린다
      cap === 'present' ? hostPlan(user.id) : null,
    ])
    if (smn.error) return dbFail(smn.error)
    if (ptc.error) return dbFail(ptc.error)
    if (nck.error) return dbFail(nck.error)
    nickname = nck.data?.ncknm ?? null
    if (!smn.data)
      return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore })
    if (!(OPEN_STS as readonly string[]).includes(smn.data.smn_sts_cd))
      return NextResponse.json({ error: 'closed' }, { status: 409, headers: noStore })
    if (cap === 'watch' && Number(smn.data.ent_pi_amt) > 0 && !ptc.data)
      return NextResponse.json({ error: 'payment_required' }, { status: 402, headers: noStore })
    if (cap === 'present') {
      const host = smn.data.hst_usr_id === user.id
      if (!host && !admin)
        return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore })
      // 개최자(관리자 포함, 마스터 2026-10-29) = 그 세미나 요금제 남은 시간 — 0 이하면 시작·재입장 불가.
      //  관리자가 남의 세미나를 대신 진행하면 계량 없음(하트비트는 개최자 본인만 계량)
      if (host && planLeft(plan, smn.data.plan_cd) <= 0) // 유료 세미나 = 유료 + 무료 합(sql/021)
        return NextResponse.json({ error: 'plan_exhausted', code: 'PLAN_EXHAUSTED' }, { status: 402, headers: noStore })
    }
    // 개최자 부재(마스터 2026-10-29) — 개최자가 아닌 사람은 개최자가 룸에 있거나 나간 지 5분 안일 때만 입장(관리자 포함 — 남이 연 방).
    //  쫓겨난 참가자가 바로 다시 들어와 개최자 없이 쓰지 못하게. 개최자 확인 뒤에야 개최자 id 를 알아 직렬(의존)
    hostEntry = smn.data.hst_usr_id === user.id
    if (!hostEntry) {
      const h = await db()
        .from('smn_atd')
        .select('lst_hb_dtm')
        .eq('smn_id', room)
        .eq('usr_id', smn.data.hst_usr_id)
        .eq('del_yn', 'N')
        .maybeSingle<{ lst_hb_dtm: string }>()
      if (h.error) return dbFail(h.error)
      if (hostState(h.data?.lst_hb_dtm, Date.now()) === 'gone')
        return NextResponse.json({ error: 'host_away', code: 'HOST_AWAY' }, { status: 409, headers: noStore })
    }
    roomCap = smn.data.max_cnt + 1
    startLive = cap === 'present' && smn.data.smn_sts_cd === 'SCHEDULED'
  } else if (!labOpen()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore })
  }

  const wsUrl = process.env.NEXT_PUBLIC_MEDIA_WS_URL
  const ticket = signMediaTicket({
    room,
    sub: user.id,
    name: nickname || user.display_name || user.pi_username || '',
    role: cap === 'present' ? 'presenter' : 'audience',
    cap: roomCap,
  })
  // wsUrl 은 참고값 — 시험 단계는 화면에서 엔진 주소(임시 터널)를 직접 넣으므로 없어도 발급
  if (!ticket)
    return NextResponse.json(
      { error: 'media_unavailable' },
      { status: 503, headers: noStore },
    )
  // 발표자 입장 = 세미나 시작(PRD D-4 SCHEDULED → LIVE). 서명 성공 뒤에만(서명 실패 503 인데 LIVE 로 남지 않게 — 2차 검토 지적).
  //  조건부 갱신이라 여러 번 불려도 한 번만 바뀐다
  // 개최자 재입장 — 엔진에 붙기 전에 DB 를 '있음'으로(부재 판정이 돌아온 개최자의 방을 닫지 않게, 검토 지적).
  //  기록이 부재 기준보다 낡았을 때만 — 이 간격은 어차피 차감 0(sql/022 90초 초과)이라 계량에 영향 없음. 첫 입장(행 없음)은 참가자가 막혀 있어 경합 없음
  if (isUuid(room) && hostEntry) {
    const now = new Date()
    const { error: hbErr } = await db()
      .from('smn_atd')
      .update({ lst_hb_dtm: now.toISOString(), modr_id: user.id, mod_dtm: now.toISOString() })
      .eq('smn_id', room)
      .eq('usr_id', user.id)
      .eq('del_yn', 'N')
      .lt('lst_hb_dtm', new Date(now.getTime() - HOST_GRACE_MS).toISOString())
    if (hbErr) console.error('[media/ticket] 개최자 입장 표시 실패', hbErr.code)
  }
  if (startLive) {
    const { error: liveErr } = await db()
      .from('smn_mst')
      .update({ smn_sts_cd: 'LIVE', modr_id: user.id })
      .eq('smn_id', room)
      .eq('smn_sts_cd', 'SCHEDULED')
    if (liveErr) return dbFail(liveErr)
  }
  return NextResponse.json({ ticket, wsUrl: wsUrl ?? null }, { headers: noStore })
}))
