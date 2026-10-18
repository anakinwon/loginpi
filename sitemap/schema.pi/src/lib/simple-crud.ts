// 분류체계 설정 항목 공용 CRUD(도메인그룹·약어) — 조회 = 조회자 이상, 등록·수정·삭제 = 분류체계 관리자(승인 절차 없음, 설정 데이터)
//  수정 : ver_no 낙관적 잠금, 삭제 : 논리 삭제(삭제 전 검사 훅), 모든 변경은 감사 이력(변경 전후 값)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from './db'
import { apiError, audit, dbError, parseBody, requireAreaRole, type ErrorCode } from './api'

type Ctx = { params: Promise<Record<string, string>> }
interface Cfg {
  table: string
  pk: string
  idParam: string
  tgt: string
  cols: string
  order: string
  schema: z.ZodObject<z.ZodRawShape>
  dupCode: ErrorCode
  // 쓰기 권한(기본 SETTINGS : 설정 데이터, 모델 데이터는 MODEL_EDIT), 목록 권한(기본 VIEW, 모델 데이터는 MODEL_VIEW)
  perm?: 'SETTINGS' | 'MODEL_EDIT'
  viewPerm?: 'VIEW' | 'MODEL_VIEW'
  // 저장 전 검사(등록 = 전체 본문, 수정 = 바뀐 항목만 + 현재 행) — 위반 코드 또는 null
  beforeSave?: (areaId: string, row: Record<string, unknown>, cur?: Record<string, unknown>) => Promise<ErrorCode | null>
  // 삭제 불가 사유(없으면 null)
  beforeDelete?: (id: string) => Promise<ErrorCode | null>
}

export function simpleCrud(c: Cfg) {
  const list = async (_req: Request, { params }: Ctx) => {
    const { areaId } = await params
    const auth = await requireAreaRole(areaId, c.viewPerm ?? 'VIEW')
    if (auth instanceof NextResponse) return auth
    const { data, error } = await db().from(c.table).select(c.cols).eq('area_id', areaId).eq('del_yn', 'N').order(c.order)
    if (error) return dbError(error)
    return NextResponse.json({ ok: true, items: data })
  }

  const create = async (req: Request, { params }: Ctx) => {
    const { areaId } = await params
    const auth = await requireAreaRole(areaId, c.perm ?? 'SETTINGS')
    if (auth instanceof NextResponse) return auth
    const body = await parseBody(req, c.schema.strict())
    if (body instanceof NextResponse) return body
    const bad = c.beforeSave ? await c.beforeSave(areaId, body as Record<string, unknown>) : null
    if (bad) return apiError(bad, 400)
    const uid = auth.user.usr_id
    const { data, error } = await db().from(c.table).insert({ ...body, area_id: areaId, regr_id: uid, modr_id: uid }).select(c.cols).single()
    if (error) return dbError(error, c.dupCode)
    const row = data as unknown as Record<string, string>
    await audit({ area_id: areaId, tgt_tp_cd: c.tgt, tgt_id: row[c.pk], act_cd: 'INS', aftr_val: row, usr_id: uid })
    return NextResponse.json({ ok: true, item: row }, { status: 201 })
  }

  // 대상 조회 + 버전 확인
  const current = async (areaId: string, id: string, ver: unknown) => {
    const v = z.coerce.number().int().positive().safeParse(ver)
    if (!v.success || !z.string().uuid().safeParse(id).success) return 'INVALID_INPUT' as const
    const { data, error } = await db().from(c.table).select(c.cols).eq(c.pk, id).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
    if (error) throw error
    if (!data) return 'NOT_FOUND' as const
    const cur = data as unknown as Record<string, unknown>
    return cur.ver_no === v.data ? { cur, ver: v.data } : ('VERSION_CONFLICT' as const)
  }
  const status = (code: ErrorCode) => (code === 'NOT_FOUND' ? 404 : code === 'INVALID_INPUT' ? 400 : 409)

  // 버전 조건부 갱신 — 0행이면 그사이 다른 변경
  const write = async (areaId: string, id: string, ver: number, set: Record<string, unknown>) => {
    const { data, error } = await db().from(c.table).update({ ...set, ver_no: ver + 1 }).eq(c.pk, id).eq('area_id', areaId).eq('ver_no', ver).eq('del_yn', 'N').select(c.cols)
    return { rows: (data ?? []) as unknown as Record<string, unknown>[], error }
  }

  const update = async (req: Request, { params }: Ctx) => {
    const p = await params
    const auth = await requireAreaRole(p.areaId, c.perm ?? 'SETTINGS')
    if (auth instanceof NextResponse) return auth
    let raw: Record<string, unknown>
    try {
      raw = await req.json()
    } catch {
      return apiError('INVALID_INPUT', 400)
    }
    const { ver_no, ...input } = raw ?? {}
    const parsed = c.schema.partial().strict().safeParse(input)
    if (!parsed.success) return apiError('INVALID_INPUT', 400)
    try {
      const cur = await current(p.areaId, p[c.idParam], ver_no)
      if (typeof cur === 'string') return apiError(cur, status(cur))
      const set = Object.fromEntries(Object.entries(parsed.data).filter(([k, v]) => (v ?? null) !== (cur.cur[k] ?? null)))
      if (!Object.keys(set).length) return apiError('NO_CHANGE', 400)
      const bad = c.beforeSave ? await c.beforeSave(p.areaId, set, cur.cur) : null
      if (bad) return apiError(bad, 400)
      const uid = auth.user.usr_id
      const { rows, error } = await write(p.areaId, p[c.idParam], cur.ver, { ...set, modr_id: uid })
      if (error) return dbError(error, c.dupCode)
      if (!rows.length) return apiError('VERSION_CONFLICT', 409)
      await audit({ area_id: p.areaId, tgt_tp_cd: c.tgt, tgt_id: p[c.idParam], act_cd: 'UPD', bfr_val: cur.cur, aftr_val: rows[0], usr_id: uid })
      return NextResponse.json({ ok: true, item: rows[0] })
    } catch (e) {
      return dbError(e as { code?: string; message?: string })
    }
  }

  const remove = async (req: Request, { params }: Ctx) => {
    const p = await params
    const auth = await requireAreaRole(p.areaId, c.perm ?? 'SETTINGS')
    if (auth instanceof NextResponse) return auth
    try {
      const cur = await current(p.areaId, p[c.idParam], new URL(req.url).searchParams.get('ver_no'))
      if (typeof cur === 'string') return apiError(cur, status(cur))
      const block = c.beforeDelete ? await c.beforeDelete(p[c.idParam]) : null
      if (block) return apiError(block, 409)
      const uid = auth.user.usr_id
      const { rows, error } = await write(p.areaId, p[c.idParam], cur.ver, { del_yn: 'Y', del_dtm: new Date().toISOString(), modr_id: uid })
      if (error) return dbError(error)
      if (!rows.length) return apiError('VERSION_CONFLICT', 409)
      await audit({ area_id: p.areaId, tgt_tp_cd: c.tgt, tgt_id: p[c.idParam], act_cd: 'DEL', bfr_val: cur.cur, aftr_val: rows[0], usr_id: uid })
      return NextResponse.json({ ok: true })
    } catch (e) {
      return dbError(e as { code?: string; message?: string })
    }
  }

  return { list, create, update, remove }
}
