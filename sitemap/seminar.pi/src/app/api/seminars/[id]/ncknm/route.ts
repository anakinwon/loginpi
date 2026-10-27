// 세미나 별명 API(sql/014) — PUT {name} : 이 세미나 안에서 내 표시명을 저장·수정(참가 자격 = engage gate : 개최자·ADMIN·참가자, 무료는 누구나).
//  입장권 발급(api/media/ticket)이 별명을 표시명으로 실어 늦게 들어온 사람·재접속에도 같은 이름이 보인다
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, parseBody, requireUser } from '@/lib/api'
import { gate } from '@/lib/engage'
import { isUuid, nameKey, nameOk } from '@/lib/seminar-rules'

const schema = z.object({ name: z.string().trim().refine(nameOk) })

export const PUT = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const { id } = await (ctx as { params: Promise<{ id: string }> }).params
    if (!isUuid(id)) return apiError('NOT_FOUND', 404)
    const [user, body] = await Promise.all([requireUser(req), parseBody(req, schema)])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body
    // 자격 확인과 사칭 확인 재료(개최자 이름·다른 사람 별명)를 병렬로(R-P1)
    const [g, host, others, ptcs] = await Promise.all([
      gate(id, user),
      db()
        .from('smn_mst')
        .select('hst_usr_id, sys_user(dsp_nm, pi_usr_nm)')
        .eq('smn_id', id)
        .maybeSingle<{ hst_usr_id: string; sys_user: { dsp_nm: string | null; pi_usr_nm: string | null } | null }>(),
      db().from('smn_ncknm').select('ncknm').eq('smn_id', id).neq('usr_id', user.id).eq('del_yn', 'N').limit(500),
      // 별명을 쓰지 않는 참가자의 원래 이름도 사칭 대상(보안 검토) — 정원 상한 100이라 500행이면 충분
      db()
        .from('smn_ptc')
        .select('sys_user(dsp_nm, pi_usr_nm)')
        .eq('smn_id', id)
        .neq('usr_id', user.id)
        .eq('del_yn', 'N')
        .limit(500)
        .returns<{ sys_user: { dsp_nm: string | null; pi_usr_nm: string | null } | null }[]>(),
    ])
    if (g instanceof NextResponse) return g
    if (host.error) return dbFail(host.error)
    if (others.error) return dbFail(others.error)
    if (ptcs.error) return dbFail(ptcs.error)
    // 사칭 막기 — 개최자가 아니면 개최자 이름, 누구든 같은 세미나의 다른 별명과 같은 이름은 거절
    const k = nameKey(body.name)
    const taken = [
      ...(host.data && host.data.hst_usr_id !== user.id ? [host.data.sys_user?.dsp_nm, host.data.sys_user?.pi_usr_nm] : []),
      ...(others.data ?? []).map((r) => r.ncknm as string),
      ...(ptcs.data ?? []).flatMap((r) => [r.sys_user?.dsp_nm, r.sys_user?.pi_usr_nm]),
    ].some((n) => n && nameKey(n) === k)
    if (taken) return apiError('NAME_TAKEN', 409)
    const { error } = await db()
      .from('smn_ncknm')
      .upsert(
        { smn_id: id, usr_id: user.id, ncknm: body.name, del_yn: 'N', del_dtm: null, regr_id: user.id, modr_id: user.id, mod_dtm: new Date().toISOString() },
        { onConflict: 'smn_id,usr_id' },
      )
    if (error) return dbFail(error)
    return NextResponse.json({ name: body.name }, { headers: { 'Cache-Control': 'no-store' } })
  }),
)
