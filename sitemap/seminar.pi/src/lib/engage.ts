// 설문·Q&A·출석 라우트 공용(SubAgent4) — 로그인·세미나 ID 확인(who), 세미나 참가 자격 확인(gate).
// 자격 = 입장권 발급(/api/media/ticket)과 같은 규칙 : 세미나가 있고, 유료면 참가 등록·개최자·ADMIN. staff = 개최자 또는 ADMIN(설문 만들기·답변 표시·출석부)
//  gate 는 목록 조회와 서로 의존이 없어 호출하는 쪽이 Promise.all 로 함께 돌린다(R-P1). 비로그인 401(redirect 없음 — 클라이언트 게이트)
import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import type { UserRow } from '@pi/db'
import { apiError, db, dbFail, requireUser } from './api'
import { isAdmin } from './auth'
import { isUuid, OPEN_STS } from './seminar-rules'

export const noStore = { 'Cache-Control': 'no-store' }

export async function who(req: NextRequest, ctx: unknown): Promise<{ user: UserRow; smnId: string } | NextResponse> {
  const [user, { id }] = await Promise.all([requireUser(req), (ctx as { params: Promise<{ id: string }> }).params])
  if (user instanceof NextResponse) return user
  if (!isUuid(id)) return apiError('NOT_FOUND', 404)
  return { user, smnId: id.toLowerCase() }
}

// 쓰기 공통 — 종료·취소된 세미나는 쓰기 금지(조회만)
export const closed = () => apiError('SMN_CLOSED', 409)

export type Gate = { staff: boolean; open: boolean; title: string }

export async function gate(smnId: string, user: UserRow): Promise<Gate | NextResponse> {
  const [smn, ptc] = await Promise.all([
    db()
      .from('smn_mst')
      .select('smn_nm, hst_usr_id, ent_pi_amt, smn_sts_cd')
      .eq('smn_id', smnId)
      .eq('del_yn', 'N')
      .maybeSingle<{ smn_nm: string; hst_usr_id: string; ent_pi_amt: number | string; smn_sts_cd: string }>(),
    db().from('smn_ptc').select('ptc_id').eq('smn_id', smnId).eq('usr_id', user.id).eq('del_yn', 'N').maybeSingle(),
  ])
  if (smn.error) return dbFail(smn.error)
  if (ptc.error) return dbFail(ptc.error)
  if (!smn.data) return apiError('NOT_FOUND', 404)
  const staff = smn.data.hst_usr_id === user.id || isAdmin(user)
  if (!staff && Number(smn.data.ent_pi_amt) > 0 && !ptc.data) return apiError('SMN_PAY_REQUIRED', 402)
  return { staff, open: (OPEN_STS as readonly string[]).includes(smn.data.smn_sts_cd), title: smn.data.smn_nm }
}

// 음성 처리 동의(SPEECH_XFER) 자격 — fn_use_smn_vc 와 같은 규칙 : 개최자·ADMIN·활성 참가 등록자 + 종료·취소 세미나 409(closed, 야간 시험 T04). 통과면 null.
//  /api/seminars/[id]/consent 와 /api/speech/agree 가 함께 쓴다(형제 경로 한 곳 — 남의 세미나에 동의 행이 쌓이지 않게, D-3)
//  liveOnly = 번역·합성 캐시 적중 경로(aiGate) — fn_use_smn_ai 와 같은 규칙(LIVE 만, 아니면 SPEECH_NOT_LIVE 409)
export async function agreeGate(smnId: string, user: UserRow, liveOnly = false): Promise<NextResponse | null> {
  const [m, p] = await Promise.all([
    db().from('smn_mst').select('hst_usr_id, smn_sts_cd').eq('smn_id', smnId).eq('del_yn', 'N').maybeSingle<{ hst_usr_id: string; smn_sts_cd: string }>(),
    db().from('smn_ptc').select('ptc_id').eq('smn_id', smnId).eq('usr_id', user.id).eq('del_yn', 'N').maybeSingle(),
  ])
  if (m.error) return dbFail(m.error)
  if (p.error) return dbFail(p.error)
  if (!m.data) return apiError('NOT_FOUND', 404)
  if (!(OPEN_STS as readonly string[]).includes(m.data.smn_sts_cd)) return closed()
  if (liveOnly && m.data.smn_sts_cd !== 'LIVE') return apiError('SPEECH_NOT_LIVE', 409)
  if (m.data.hst_usr_id !== user.id && !p.data && !isAdmin(user)) return apiError('FORBIDDEN', 403)
  return null
}

// 번역·합성 캐시 적중 자격(보안 검토 D-2 회귀) — 적중이라도 비참가자·LIVE 아님은 거부. 미스는 fn_use_smn_ai 가 같은 판정 + 계량(왕복 1회)
export const aiGate = (smnId: string, user: UserRow) => agreeGate(smnId, user, true)

