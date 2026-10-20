// URL 모니터링(2026-10-21) — GET ?min=&live=1 : 등록 URL + 점검 이력(live = 이번 분 미점검분을 먼저 점검, 화면 열린 동안 수집),
//  POST {url_nm, chk_url} : 등록(모니터링 편집), DELETE ?url=&ver_no= : 논리 삭제. 점검은 공인 주소만(SSRF 차단, mon-srv checkUrl)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, audit, dbError, requireAreaRole } from '@/lib/api'

// 감사 이력에는 질의 문자열을 남기지 않음(토큰·키가 주소에 들어 있을 수 있음)
const noQs = (v: string) => v.split(/[?#]/)[0]
import { db } from '@/lib/db'
import { checkArea, urlView } from '@/lib/mon-srv'

type Ctx = { params: Promise<{ areaId: string }> }
const uuid = z.string().uuid()
const body = z.object({
  url_nm: z.string().trim().min(1).max(100),
  chk_url: z
    .string()
    .trim()
    .max(2000)
    .refine((s) => {
      try {
        const u = new URL(s)
        return (u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password
      } catch {
        return false
      }
    }),
})

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'MON_VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const min = Math.min(1440, Math.max(5, Number(sp.get('min')) || 60))
  try {
    if (sp.get('live') === '1') await checkArea(areaId)
    return NextResponse.json({ ok: true, ...(await urlView(areaId, min)) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'MON_EDIT')
  if (auth instanceof NextResponse) return auth
  const p = body.safeParse(await req.json().catch(() => null))
  if (!p.success) return apiError(p.error.issues.some((i) => i.path[0] === 'chk_url') ? 'MON_URL_INVALID' : 'INVALID_INPUT', 400)
  const b = p.data
  try {
    const cnt = await db().from('mon_url').select('url_id', { count: 'exact', head: true }).eq('area_id', areaId).eq('del_yn', 'N')
    if (cnt.error) throw cnt.error
    if ((cnt.count ?? 0) >= 100) return apiError('MON_URL_MAX', 409)
    const row = { area_id: areaId, url_nm: b.url_nm, chk_url: b.chk_url }
    const r = await db().from('mon_url').insert({ ...row, regr_id: auth.user.usr_id, modr_id: auth.user.usr_id }).select('url_id').single()
    if (r.error) throw r.error
    const id = (r.data as { url_id: string }).url_id
    await audit({ area_id: areaId, tgt_tp_cd: 'MONURL', tgt_id: id, act_cd: 'INS', aftr_val: { ...row, chk_url: noQs(row.chk_url) }, usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true, item: { url_id: id } }, { status: 201 })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'MON_EDIT')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const id = sp.get('url')
  const ver = Number(sp.get('ver_no'))
  if (!uuid.safeParse(id).success || !Number.isInteger(ver)) return apiError('INVALID_INPUT', 400)
  try {
    const r = await db().from('mon_url').update({ del_yn: 'Y', del_dtm: new Date().toISOString(), ver_no: ver + 1, modr_id: auth.user.usr_id }).eq('url_id', id!).eq('area_id', areaId).eq('ver_no', ver).eq('del_yn', 'N').select('url_nm, chk_url')
    if (r.error) throw r.error
    if (!r.data.length) return apiError('VERSION_CONFLICT', 409)
    await audit({ area_id: areaId, tgt_tp_cd: 'MONURL', tgt_id: id!, act_cd: 'DEL', bfr_val: { ...r.data[0], chk_url: noQs(r.data[0].chk_url) }, usr_id: auth.user.usr_id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
