// 논리 데이터타입 목록 — 도메인 등록 화면 선택지(기준 데이터 std_lgc_tp)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiError, currentUser, dbError } from '@/lib/api'

export async function GET() {
  if (!(await currentUser())) return apiError('AUTH_REQUIRED', 401)
  const { data, error } = await db()
    .from('std_lgc_tp')
    .select('lgc_tp_cd, lgc_tp_nm, lgc_tp_abbr_nm')
    .eq('del_yn', 'N')
    .order('lgc_tp_cd')
  if (error) return dbError(error)
  return NextResponse.json({ ok: true, types: data })
}
