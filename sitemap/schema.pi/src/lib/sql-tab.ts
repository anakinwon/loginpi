// SQL 편집기 편집 탭(마스터 지시 2026-10-20, sql/062) — 분류체계 × 본인 탭만(남의 탭 = 404), 권한 SQL_QUERY, 상한 = 요금제별(sql-tab-rule.ts, 서버 강제)
//  요금제가 내려가 상한보다 많은 기존 탭은 열람·수정·닫기 가능, 새 탭만 불가. 저장 충돌 = 마지막 저장 우선(자동 저장이 막히지 않게 버전 비교 없음), 감사 이력 없음(개인 편집 내용)
import 'server-only'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from './db'
import { apiError, dbError, parseBody, requireAreaRole } from './api'
import { PLAN_NM } from './roles'
import { SQL_TAB_MAX, SQL_TAB_NM, SQL_TXT_MAX, canCreateTab, mustRollbackTab, nextTabNm } from './sql-tab-rule'

type Ctx = { params: Promise<Record<string, string>> }
const COLS = 'sql_tab_id, tab_nm, sort_seq, sql_txt, mod_dtm'
const tabNm = z.string().trim().regex(SQL_TAB_NM)
const sqlTxt = z.string().max(SQL_TXT_MAX)
const createSchema = z.object({ sql_txt: sqlTxt.optional(), tab_nm: tabNm.optional() }).strict()
const editSchema = z.object({ sql_txt: sqlTxt.optional(), tab_nm: tabNm.optional() }).strict().refine((b) => b.sql_txt !== undefined || b.tab_nm !== undefined)
const uuid = z.string().uuid()
const notFound = () => apiError('NOT_FOUND', 404)

// 라우트 공용 : params 풀기 + 예외 = DB 오류 응답(이름 유일 위반 = SQL_TAB_NM_DUP)
const wrap = (fn: (p: Record<string, string>, req: Request) => Promise<NextResponse>) => async (req: Request, { params }: Ctx) => {
  try {
    return await fn(await params, req)
  } catch (e) {
    return dbError(e as { code?: string; message?: string }, 'SQL_TAB_NM_DUP')
  }
}
const mine = (areaId: string, usrId: string) => db().from('mdl_sql_tab').select('sql_tab_id, tab_nm, sort_seq').eq('area_id', areaId).eq('usr_id', usrId).eq('del_yn', 'N')

export const listTabs = wrap(async ({ areaId }) => {
  const auth = await requireAreaRole(areaId, 'SQL_QUERY')
  if (auth instanceof NextResponse) return auth
  const { data, error } = await db().from('mdl_sql_tab').select(COLS).eq('area_id', areaId).eq('usr_id', auth.user.usr_id).eq('del_yn', 'N').order('sort_seq').order('reg_dtm')
  if (error) throw error
  return NextResponse.json({ ok: true, limit: SQL_TAB_MAX[auth.plan.plan], plan: auth.plan.plan, items: data })
})

export const createTab = wrap(async ({ areaId }, req) => {
  const auth = await requireAreaRole(areaId, 'SQL_QUERY')
  if (auth instanceof NextResponse) return auth
  const b = await parseBody(req, createSchema)
  if (b instanceof NextResponse) return b
  const uid = auth.user.usr_id
  const limit = SQL_TAB_MAX[auth.plan.plan]
  const over = () => NextResponse.json({ ok: false, code: 'SQL_TAB_LIMIT', message: `현재 요금제(${PLAN_NM[auth.plan.plan]})의 SQL 탭은 ${limit}개까지입니다` }, { status: 409 })
  const cur = await mine(areaId, uid)
  if (cur.error) throw cur.error
  if (!canCreateTab(cur.data.length, limit)) return over()
  const names = cur.data.map((r) => r.tab_nm as string)
  if (b.tab_nm && names.includes(b.tab_nm)) return apiError('SQL_TAB_NM_DUP', 409)
  const sort = Math.max(0, ...cur.data.map((r) => r.sort_seq as number)) + 1
  const { data, error } = await db().from('mdl_sql_tab').insert({ area_id: areaId, usr_id: uid, tab_nm: b.tab_nm ?? nextTabNm(names), sort_seq: sort, sql_txt: b.sql_txt ?? '', regr_id: uid, modr_id: uid }).select(COLS).single()
  if (error) throw error // 동시 등록으로 같은 이름 = 23505 → SQL_TAB_NM_DUP
  // 동시 등록 경합 : 조회~등록 사이 다른 요청이 끼면 상한을 넘을 수 있다 → 등록 후 다시 세어 먼저 등록된 limit 개 밖이면 방금 행을 논리 삭제(늦은 쪽만 물러남)
  const after = await db().from('mdl_sql_tab').select('sql_tab_id').eq('area_id', areaId).eq('usr_id', uid).eq('del_yn', 'N').order('reg_dtm').order('sql_tab_id')
  if (after.error) throw after.error
  if (mustRollbackTab(after.data.map((r) => r.sql_tab_id as string), data.sql_tab_id, limit)) {
    const del = await db().from('mdl_sql_tab').update({ del_yn: 'Y', del_dtm: new Date().toISOString(), modr_id: uid, sql_txt: '' }).eq('sql_tab_id', data.sql_tab_id)
    if (del.error) throw del.error
    return over()
  }
  return NextResponse.json({ ok: true, item: data }, { status: 201 })
})

export const updateTab = wrap(async ({ areaId, tabId }, req) => {
  if (!uuid.safeParse(tabId).success) return notFound()
  const auth = await requireAreaRole(areaId, 'SQL_QUERY')
  if (auth instanceof NextResponse) return auth
  const b = await parseBody(req, editSchema)
  if (b instanceof NextResponse) return b
  const uid = auth.user.usr_id
  if (b.tab_nm) {
    const dup = await mine(areaId, uid).eq('tab_nm', b.tab_nm).neq('sql_tab_id', tabId).limit(1)
    if (dup.error) throw dup.error
    if (dup.data.length) return apiError('SQL_TAB_NM_DUP', 409)
  }
  const { data, error } = await db().from('mdl_sql_tab').update({ ...b, modr_id: uid }).eq('sql_tab_id', tabId).eq('area_id', areaId).eq('usr_id', uid).eq('del_yn', 'N').select('sql_tab_id, tab_nm, mod_dtm')
  if (error) throw error
  return data.length ? NextResponse.json({ ok: true, item: data[0] }) : notFound()
})

export const deleteTab = wrap(async ({ areaId, tabId }) => {
  if (!uuid.safeParse(tabId).success) return notFound()
  const auth = await requireAreaRole(areaId, 'SQL_QUERY')
  if (auth instanceof NextResponse) return auth
  const uid = auth.user.usr_id
  // 닫기 = 논리 삭제 + 내용 비움(닫은 탭 내용이 남지 않게 — 화면 안내 '탭 내용은 지워집니다'와 일치, 등록·닫기 반복으로 DB 가 커지지 않게)
  const { data, error } = await db().from('mdl_sql_tab').update({ del_yn: 'Y', del_dtm: new Date().toISOString(), modr_id: uid, sql_txt: '' }).eq('sql_tab_id', tabId).eq('area_id', areaId).eq('usr_id', uid).eq('del_yn', 'N').select('sql_tab_id')
  if (error) throw error
  return data.length ? NextResponse.json({ ok: true }) : notFound()
})
