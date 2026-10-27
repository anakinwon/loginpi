// 세미나 상세 API(S2) — GET : 세미나·개최자 이름·남은 좌석(max_cnt - 활성 참가)·내 등록 상태·내가 개최자인지.
//  비로그인도 조회 가능(내 상태 = null). 사용자별 값이 섞이므로 no-store. 조회는 서로 의존 없음 → 병렬(R-P1)
//  복구(보안 검토 S1) : 내 COMPLETED SMN_ENT 결제가 있는데 참가가 없으면(완료·등록 사이 끊김) fn_join_smn 으로 등록해 다시 결제하지 않게 한다
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, parseBody, requireUser } from '@/lib/api'
import { getSessionUser, isAdmin } from '@/lib/auth'
import { SMN_COLS, SMN_ENT, toCard, type SmnRow } from '@/lib/seminar'
import { isUuid, ONE_LINE_RE, SUB_TTL_MAX } from '@/lib/seminar-rules'

export const GET = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const { id } = await (ctx as { params: Promise<{ id: string }> }).params
    if (!isUuid(id)) return apiError('NOT_FOUND', 404)

    const userP = getSessionUser(req)
    const [user, smn, cnt, mine] = await Promise.all([
      userP,
      db()
        .from('smn_mst')
        .select(SMN_COLS)
        .eq('smn_id', id)
        .eq('del_yn', 'N')
        .maybeSingle<SmnRow>(),
      // 남은 좌석 계산용 건수만(행 없음)
      db()
        .from('smn_ptc')
        .select('ptc_id', { count: 'exact', head: true })
        .eq('smn_id', id)
        .eq('del_yn', 'N'),
      userP.then((u) =>
        u
          ? Promise.all([
              db()
                .from('smn_ptc')
                .select('ptc_id')
                .eq('smn_id', id)
                .eq('usr_id', u.id)
                .eq('del_yn', 'N')
                .maybeSingle(),
              // 완료됐지만 등록이 없을 수 있는 내 결제(idx_pi_pymnt_usr_id) — 1행만(R-P3)
              db()
                .from('pi_pymnt')
                .select('pymnt_id')
                .eq('usr_id', u.id)
                .eq('pymnt_tp_cd', SMN_ENT)
                .eq('pymnt_sts_cd', 'COMPLETED')
                .eq('del_yn', 'N')
                .eq('meta_val->>smn_id', id)
                .limit(1),
            ])
          : null,
      ),
    ])
    if (smn.error) return dbFail(smn.error)
    if (cnt.error) return dbFail(cnt.error)
    const [ptc, paid] = mine ?? [null, null]
    if (ptc?.error) return dbFail(ptc.error)
    if (paid?.error) return dbFail(paid.error)
    if (!smn.data) return apiError('NOT_FOUND', 404)

    let registered = !!ptc?.data
    const paidId = paid?.data?.[0]?.pymnt_id as string | undefined
    if (user && !registered && paidId) {
      const { data, error } = await db().rpc('fn_join_smn', {
        p_smn_id: id,
        p_usr_id: user.id,
        p_pymnt_id: paidId,
      })
      if (error) return dbFail(error)
      const rslt = (data as { rslt_cd: string }[] | null)?.[0]?.rslt_cd
      registered = rslt === 'OK' || rslt === 'ALREADY'
      if (rslt === 'OK') console.warn('[seminars/detail] 결제 완료·미등록 복구', paidId)
      else if (!registered) console.error('[seminars/detail] 결제 완료·등록 거부 — 수동 환불 확인', paidId, rslt)
    }

    const row = smn.data
    return NextResponse.json(
      {
        ...toCard(row),
        seatsLeft: Math.max(0, row.max_cnt - (cnt.count ?? 0)),
        // null = 비로그인(판정 불가)
        registered: user ? registered : null,
        isHost: !!user && user.id === row.hst_usr_id,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  }),
)

// PATCH : 부제 저장·수정(sql/012) — 개최자·ADMIN 만, 언제든(상태 무관). 빈 문자열 = 부제 지우기. 표시 = 섬 이름 - 부제
const patchSchema = z.object({ subTitle: z.string().trim().max(SUB_TTL_MAX).regex(ONE_LINE_RE) })

export const PATCH = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const { id } = await (ctx as { params: Promise<{ id: string }> }).params
    if (!isUuid(id)) return apiError('NOT_FOUND', 404)
    const [user, body] = await Promise.all([requireUser(req), parseBody(req, patchSchema)])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body
    // 개최자 조건을 UPDATE 조건에 넣어 한 왕복으로(R-P1) — ADMIN 은 개최자 조건 없이
    let q = db()
      .from('smn_mst')
      .update({ subttl: body.subTitle || null, modr_id: user.id })
      .eq('smn_id', id)
      .eq('del_yn', 'N')
    if (!isAdmin(user)) q = q.eq('hst_usr_id', user.id)
    const { data, error } = await q.select('smn_id')
    if (error) return dbFail(error)
    if (!data?.length) return apiError('FORBIDDEN', 403) // 없는 세미나이거나 개최자가 아님
    return NextResponse.json({ ok: true, subTitle: body.subTitle }, { headers: { 'Cache-Control': 'no-store' } })
  }),
)
