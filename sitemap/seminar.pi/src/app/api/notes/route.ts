// AI 회의록 시작·조회 — POST { smnId } → { ntId } : 개최자(발표자)·관리자만, 세미나 LIVE 일 때. 이미 기록 중인 회의록이 있으면 그것을 돌려준다(멱등 — 재접속 후 다시 켜기).
//  POST { title } → { ntId } : 대면 노트(세미나 없음, SA2) — ADMIN 만(외부 AI 비용). 시작할 때마다 새 회의록. 두 경우 모두 외부 AI 키가 없으면 503
//  GET ?smnId= → { ntId | null } : 이 세미나에서 내가 볼 수 있는 가장 최근 회의록(상세 화면 [회의록 보기]). 비로그인 401(redirect 없음, piFetch 로 호출)
//  GET ?page=N(smnId 없음) → { notes, total } : 내가 시작한 회의록 10건씩(최근순, 대면 노트 목록 /notes)
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
import { geminiEnabled } from '@/lib/gemini'
import { NOTE_LIST_PAGE } from '@/lib/note-rules'
import { isUuid, ONE_LINE_RE, parsePage, smnTitle } from '@/lib/seminar-rules'

const Body = z.union([
  z.object({ smnId: z.string().refine(isUuid) }),
  z.object({ title: z.string().trim().min(1).max(100).regex(ONE_LINE_RE) }),
])
const noStore = { 'Cache-Control': 'no-store' }

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const [user, body] = await Promise.all([
      requireUser(req),
      parseBody(req, Body),
    ])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body
    // 외부 AI 키가 없으면 세미나 AI 회의록도 503 — 전에는 세미나 쪽만 그대로 만들어 전원에게 'AI 기록 중' 배지를 띄우고
    //  조각은 전부 503·요약은 FAILED 로 끝났다(대면 노트만 막던 형제 경로, T02 r6)
    if (!geminiEnabled()) return apiError('AI_UNAVAILABLE', 503)
    if ('title' in body) {
      if (!isAdmin(user)) return apiError('FORBIDDEN', 403)
      // ponytail: 기록 중 창을 닫으면 pagehide keepalive 로 끝내지만, 그마저 못 가면 RECORDING 으로 남는다 — 잦으면 오래된 RECORDING 정리 작업
      const { data, error } = await db()
        .from('smn_nt')
        .insert({
          usr_id: user.id,
          nt_nm: body.title,
          regr_id: user.id,
          modr_id: user.id,
        })
        .select('nt_id')
        .single<{ nt_id: string }>()
      if (error) return dbFail(error)
      return NextResponse.json({ ntId: data.nt_id }, { headers: noStore })
    }
    const smnId = body.smnId.toLowerCase()
    // 세미나 확인과 기록 중 회의록 찾기는 서로 독립 — 병렬(R-P1)
    const [smn, cur] = await Promise.all([
      db()
        .from('smn_mst')
        .select('hst_usr_id, smn_sts_cd, smn_nm, sub_ttl')
        .eq('smn_id', smnId)
        .eq('del_yn', 'N')
        .maybeSingle<{
          hst_usr_id: string
          smn_sts_cd: string
          smn_nm: string
          sub_ttl: string | null
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
        nt_nm: smnTitle(smn.data.smn_nm, smn.data.sub_ttl).slice(0, 100),
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
    const q = req.nextUrl.searchParams
    const smnId = q.get('smnId')
    if (smnId === null) {
      // 내 회의록 목록 — x_smn_nt_02 (usr_id, start_dtm DESC). 건수는 페이지 수 표시에 쓴다
      const page = parsePage(q.get('page'))
      const { data, error, count } = await db()
        .from('smn_nt')
        .select('nt_id, smn_id, nt_nm, start_dtm, nt_sts_cd', {
          count: 'exact',
        })
        .eq('usr_id', user.id)
        .eq('del_yn', 'N')
        .order('start_dtm', { ascending: false })
        .order('nt_id') // 동률 경계 고정(T04 r3)
        .range((page - 1) * NOTE_LIST_PAGE, page * NOTE_LIST_PAGE - 1)
      if (error) return dbFail(error)
      return NextResponse.json(
        {
          notes: (data ?? []).map((n) => ({
            id: n.nt_id,
            smnId: n.smn_id,
            title: n.nt_nm,
            start: n.start_dtm,
            status: n.nt_sts_cd,
          })),
          total: count ?? 0,
        },
        { headers: noStore },
      )
    }
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
