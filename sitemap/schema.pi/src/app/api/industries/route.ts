// 업종(Industry) 목록 — 프로젝트 등록 화면 콤보·특성 표시(템플릿 src/data/industry, 코드 sql/022). 로그인 필요, 저장 없음
import { NextResponse } from 'next/server'
import { apiError, currentUser } from '@/lib/api'
import { industryList } from '@/lib/modelpi/template'

export async function GET() {
  if (!(await currentUser())) return apiError('AUTH_REQUIRED', 401)
  return NextResponse.json({ ok: true, industries: industryList() })
}
