// AI 회의록 시작·조회 — POST { smnId } → { ntId } : 개최자(발표자)·관리자만, 세미나 LIVE 일 때. 이미 기록 중인 회의록이 있으면 그것을 돌려준다(멱등 — 재접속 후 다시 켜기).
//  GET ?smnId= → { ntId | null } : 이 세미나에서 내가 볼 수 있는 가장 최근 회의록(상세 화면 [회의록 보기]). 비로그인 401(redirect 없음, piFetch 로 호출)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import {
  apiError,
  db,
  dbFail,
  dbRoute,
  parseBody,
  requireUser,
} from '@/lib/api'
import { isAdmin } from '@/lib/auth'
import { isUuid } from '@/lib/seminar-rules'

const Body = z.object({ smnId: z.string().refine(isUuid) })
const noStore = { 'Cache-Control': 'no-store' }

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const [user, body] = await Promise.all([
      requireUser(req),
      parseBody(req, Body),
    ])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body
    const smnId = body.smnId.toLowerCase()
    // 세미나 확인과 기록 중 회의록 찾기는 서로 독립 — 병렬(R-P1)
    const [smn, cur] = await Promise.all([
      db()
        .from('smn_mst')
        .select('hst_usr_id, smn_sts_cd, smn_nm')
        .eq('smn_id', smnId)
        .eq('del_yn', 'N')
        .maybeSingle<{
          hst_usr_id: string
          smn_sts_cd: string
          smn_nm: string
        }>(),
      db()
        .from('smn_nt')
        .select('nt_id')
        .eq('smn_id', smnId)
        .eq('nt_sts_cd', 'RECORDING')
        .eq('del_yn', 'N')
        .limit(1)
        .maybeSingle<{ nt_id: string }>(),
    ])
    if (smn.error) return dbFail(smn.error)
    if (cur.error) return dbFail(cur.error)
    if (!smn.data) return apiError('NOT_FOUND', 404)
    if (smn.data.hst_usr_id !== user.id && !isAdmin(user))
      return apiError('FORBIDDEN', 403)
    if (smn.data.smn_sts_cd !== 'LIVE') return apiError('SPEECH_NOT_LIVE', 409)
    if (cur.data)
      return NextResponse.json({ ntId: cur.data.nt_id }, { headers: noStore })
    // ponytail: 동시에 두 번 켜면 회의록 2개가 생길 수 있다(부분 유일 인덱스 없음) — 화면이 진행 중 클릭을 막는다. 문제가 되면 x_smn_nt_03 (smn_id) WHERE nt_sts_cd='RECORDING' 유일 인덱스
    const { data, error } = await db()
      .from('smn_nt')
      .insert({
        smn_id: smnId,
        usr_id: user.id,
        nt_nm: smn.data.smn_nm.slice(0, 100),
        regr_id: user.id,
        modr_id: user.id,
      })
      .select('nt_id')
      .single<{ nt_id: string }>()
    if (error) return dbFail(error)
    return NextResponse.json({ ntId: data.nt_id }, { headers: noStore })
  }),
)

export const GET = withAuthGuard(
  dbRoute(async (req) => {
    const user = await requireUser(req)
    if (user instanceof NextResponse) return user
    const smnId = req.nextUrl.searchParams.get('smnId')
    if (!isUuid(smnId)) return apiError('INVALID_INPUT', 400)
    const id = smnId!.toLowerCase()
    // 최근 회의록 1건 + 개최자 + 내 참가 등록(임베디드 필터) — 1왕복
    const { data, error } = await db()
      .from('smn_mst')
      .select('hst_usr_id, smn_nt(nt_id, usr_id), smn_ptc(usr_id)')
      .eq('smn_id', id)
      .eq('del_yn', 'N')
      .eq('smn_nt.del_yn', 'N')
      .order('start_dtm', { referencedTable: 'smn_nt', ascending: false })
      .limit(1, { referencedTable: 'smn_nt' })
      .eq('smn_ptc.usr_id', user.id)
      .eq('smn_ptc.del_yn', 'N')
      .maybeSingle<{
        hst_usr_id: string
        smn_nt: { nt_id: string; usr_id: string }[]
        smn_ptc: { usr_id: string }[]
      }>()
    if (error) return dbFail(error)
    const nt = data?.smn_nt[0]
    const ok =
      !!nt &&
      (data!.hst_usr_id === user.id ||
        nt.usr_id === user.id ||
        isAdmin(user) ||
        data!.smn_ptc.length > 0)
    return NextResponse.json(
      { ntId: ok ? nt!.nt_id : null },
      { headers: noStore },
    )
  }),
)
