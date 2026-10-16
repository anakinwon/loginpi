// 대상 DBMS 프로파일 목록 — 프로젝트 등록 화면 콤보·툴팁(src/lib/modelpi/dbms.ts, sql/024). 로그인 필요, 저장 없음
import { NextResponse } from 'next/server'
import { apiError, currentUser } from '@/lib/api'
import { dbmsList } from '@/lib/modelpi/dbms'

export async function GET() {
  if (!(await currentUser())) return apiError('AUTH_REQUIRED', 401)
  return NextResponse.json({ ok: true, dbms: dbmsList() })
}
