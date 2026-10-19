// SQL 편집기 실행 이력(2026-10-18, sql/045) — GET ?page=&size= : 본인 이력, DB 접속 관리자(SYS·DA, 요금제4)는 분류체계 전체. 결과 값은 저장하지 않음
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dbError, requireAreaRole } from '@/lib/api'
import { pageRows } from '@/lib/paging'

type Ctx = { params: Promise<{ areaId: string }> }
type Row = { sql_exec_id: string; conn_id: string; usr_id: string; sql_txt: string; stmt_cnt: number; exec_mode_cd: string; rslt_cd: string; row_cnt: number | null; elapsed_ms: number | null; err_cd: string | null; err_msg: string | null; reg_dtm: string; mdl_db_conn: { conn_nm: string } | null }

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'SQL_QUERY')
  if (auth instanceof NextResponse) return auth
  const all = auth.perms.includes('DB_CONN_ADMIN') // 전체 이력 = SQL·접속 관리자(SYS·DA, 요금제4), 그 외 본인 이력만
  const r = await pageRows<Row>(() => {
    let q = db().from('mdl_sql_exec_hist').select('sql_exec_id, conn_id, usr_id, sql_txt, stmt_cnt, exec_mode_cd, rslt_cd, row_cnt, elapsed_ms, err_cd, err_msg, reg_dtm, mdl_db_conn(conn_nm)', { count: 'exact' }).eq('area_id', areaId).eq('del_yn', 'N')
    if (!all) q = q.eq('usr_id', auth.user.usr_id)
    return q.order('reg_dtm', { ascending: false })
  }, new URL(req.url).searchParams, 20)
  if ('error' in r && r.error) return dbError(r.error)
  const rows = 'rows' in r ? (r.rows ?? []) : []
  const ids = [...new Set(rows.map((x) => x.usr_id))]
  const u = ids.length ? await db().from('sys_user').select('usr_id, dsp_nm').in('usr_id', ids) : { data: [] }
  const nm = new Map(((u.data ?? []) as { usr_id: string; dsp_nm: string }[]).map((x) => [x.usr_id, x.dsp_nm]))
  return NextResponse.json({ ok: true, all, write: auth.perms.includes('CRUD'), total: 'total' in r ? r.total : rows.length, items: rows.map(({ mdl_db_conn, ...x }) => ({ ...x, conn_nm: mdl_db_conn?.conn_nm ?? null, usr_nm: nm.get(x.usr_id) ?? x.usr_id })) })
}
