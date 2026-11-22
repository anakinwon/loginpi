// DBMS 적재 진행 스냅숏 공개 조회(2026-11-22) — GET ?run=<실행ID> : mon_load_hist 최근 측정 최대 288행(5분 주기 24시간)을 측정일시 오름차순으로
// 인증 없음(공개 현황판 public/restore/dbms_load_live.html 과 같은 수치), 읽기 전용 — 쓰기는 로컬 갱신기 pitel/bench/progress-push.mjs 만(service_role)
import { NextResponse } from 'next/server'
import { apiError, dbError } from '@/lib/api'
import { db } from '@/lib/db'

export async function GET(req: Request) {
  const run = new URL(req.url).searchParams.get('run') ?? ''
  if (!/^[A-Za-z0-9_]{1,100}$/.test(run)) return apiError('INVALID_INPUT', 400)
  try {
    const { data, error } = await db()
      .from('mon_load_hist')
      .select('msrmt_dtm, dbms_nm, elps_val, goal_row_cnt, cmptn_row_cnt, tot_unit_cnt, cmptn_unit_cnt, fail_cnt, load_sz, redo_sz, crtr_cmptn_row_cnt, end_yn, dtl_val, stng_txt')
      .eq('exec_id', run)
      .eq('del_yn', 'N')
      .order('msrmt_dtm', { ascending: false })
      .limit(288)
      .abortSignal(AbortSignal.timeout(2000)) // R-P4 외부 호출 2초 상한, 초과는 dbError(DB_FAILED 500)
    if (error) throw error
    return NextResponse.json({ ok: true, run, rows: (data ?? []).reverse() }, { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=60' } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
