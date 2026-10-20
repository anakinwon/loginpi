// AI 분석 모델 등록(2026-10-21, sql/070) — 전역 관리자만. GET : 등록 모델 + 제공사별 키 설정 여부(값은 내보내지 않음),
//  POST : 등록, PUT {mdl_id, ver_no, …} : 수정(기본 지정 포함), DELETE ?mdl=&ver_no= : 논리 삭제. 키는 환경변수(저장 안 함)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, currentUser, dbError, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { KEY_ENV, keyOn, type Prvd } from '@/lib/mon-ai'
import { isGlobalAdmin } from '@/lib/mon-srv'

const PRVD = ['CLAUDE', 'GEMINI', 'OPENAI'] as const
const fields = {
  prvd_cd: z.enum(PRVD),
  mdl_nm: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/), // URL 경로에 들어가므로 이름 문자만(sql/070 CHECK 와 같음)
  dsp_nm: z.string().trim().min(1).max(100),
  plan_nm: z.string().trim().max(100).default(''),
  acct_nm: z.string().trim().max(100).default(''),
  dflt_yn: z.enum(['Y', 'N']).default('N'),
}
const insBody = z.object(fields)
const updBody = z.object({ ...fields, mdl_id: z.string().uuid(), ver_no: z.number().int() })
const COLS = 'mdl_id, prvd_cd, mdl_nm, dsp_nm, plan_nm, acct_nm, dflt_yn, ver_no, mod_dtm'

async function admin() {
  const user = await currentUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  if (!(await isGlobalAdmin(user.usr_id))) return apiError('MON_ADMIN_ONLY', 403)
  return user
}
// 기본 지정 = 다른 기본 해제 후 저장(x_mon_ai_mdl_01 이 기본 1개를 강제 — 동시 지정은 한쪽이 유일 위반으로 실패)
//  저장이 실패(중복·버전 충돌·DB 오류)하면 해제한 기본을 되돌림 — 기본이 사라져 분석이 '미등록' 모델로 조용히 바뀌는 것 방지
async function withDflt<T>(on: boolean, exceptId: string | undefined, save: () => Promise<T>, failed: (r: T) => boolean): Promise<T> {
  if (!on) return save()
  const q = db().from('mon_ai_mdl').update({ dflt_yn: 'N' }).eq('dflt_yn', 'Y').eq('del_yn', 'N')
  const c = await (exceptId ? q.neq('mdl_id', exceptId) : q).select('mdl_id')
  if (c.error) throw c.error
  const back = () => (c.data.length ? db().from('mon_ai_mdl').update({ dflt_yn: 'Y' }).eq('mdl_id', c.data[0].mdl_id).eq('del_yn', 'N') : null)
  try {
    const r = await save()
    if (failed(r)) await back()
    return r
  } catch (e) {
    await back()
    throw e
  }
}

export async function GET() {
  try {
    const u = await admin()
    if (u instanceof NextResponse) return u
    const r = await db().from('mon_ai_mdl').select(COLS).eq('del_yn', 'N').order('dflt_yn', { ascending: false }).order('reg_dtm')
    if (r.error) throw r.error
    const keys = Object.fromEntries(PRVD.map((p) => [p, { env: KEY_ENV[p as Prvd], on: keyOn(p) }]))
    return NextResponse.json({ ok: true, items: r.data, keys }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function POST(req: Request) {
  const b = await parseBody(req, insBody)
  if (b instanceof NextResponse) return b
  try {
    const u = await admin()
    if (u instanceof NextResponse) return u
    const r = await withDflt(b.dflt_yn === 'Y', undefined, async () => await db().from('mon_ai_mdl').insert({ ...b, regr_id: u.usr_id, modr_id: u.usr_id }).select('mdl_id').single(), (x) => !!x.error)
    if (r.error) throw r.error
    return NextResponse.json({ ok: true, item: r.data }, { status: 201 })
  } catch (e) {
    return dbError(e as { code?: string; message?: string }, 'MON_AI_MDL_DUP')
  }
}

export async function PUT(req: Request) {
  const b = await parseBody(req, updBody)
  if (b instanceof NextResponse) return b
  try {
    const u = await admin()
    if (u instanceof NextResponse) return u
    const { mdl_id, ver_no, ...v } = b
    const r = await withDflt(b.dflt_yn === 'Y', mdl_id, async () => await db().from('mon_ai_mdl').update({ ...v, ver_no: ver_no + 1, modr_id: u.usr_id }).eq('mdl_id', mdl_id).eq('ver_no', ver_no).eq('del_yn', 'N').select('mdl_id'), (x) => !!x.error || !x.data?.length)
    if (r.error) throw r.error
    if (!r.data.length) return apiError('VERSION_CONFLICT', 409)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbError(e as { code?: string; message?: string }, 'MON_AI_MDL_DUP')
  }
}

export async function DELETE(req: Request) {
  const sp = new URL(req.url).searchParams
  const id = sp.get('mdl')
  const ver = Number(sp.get('ver_no'))
  if (!z.string().uuid().safeParse(id).success || !Number.isInteger(ver)) return apiError('INVALID_INPUT', 400)
  try {
    const u = await admin()
    if (u instanceof NextResponse) return u
    // 기본 모델을 지우면 기본 없음 → 분석은 FALLBACK(요금제 '미등록' 표시)
    const r = await db().from('mon_ai_mdl').update({ del_yn: 'Y', del_dtm: new Date().toISOString(), dflt_yn: 'N', ver_no: ver + 1, modr_id: u.usr_id }).eq('mdl_id', id!).eq('ver_no', ver).eq('del_yn', 'N').select('mdl_id')
    if (r.error) throw r.error
    if (!r.data.length) return apiError('VERSION_CONFLICT', 409)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
