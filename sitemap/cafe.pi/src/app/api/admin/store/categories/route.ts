import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { listAllCategories, createCategory } from '@/lib/mps-ctgr'
import { apiError } from '@/lib/api-errors'

// GET /api/admin/store/categories — 어드민 평면 목록 (미사용 포함, 부모명 부착)
export async function GET() {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
  }

  try {
    const categories = await listAllCategories()
    return NextResponse.json({ categories })
  } catch {
    return apiError('QUERY_FAILED', 500)
  }
}

// POST /api/admin/store/categories — 카테고리 등록
export async function POST(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
  }

  const body = (await req.json()) as {
    parent_ctgr_id?: string | null
    ctgr_nm?: string
    ctgr_desc?: string
    sort_ord?: number
    use_yn?: string
  }

  if (!body.ctgr_nm?.trim()) {
    return apiError('ADM_CTGR_NAME_REQUIRED', 400)
  }

  try {
    const category = await createCategory(requester?.id ?? 'ADMIN', {
      parent_ctgr_id: body.parent_ctgr_id ?? null,
      ctgr_nm: body.ctgr_nm,
      ctgr_desc: body.ctgr_desc,
      sort_ord: body.sort_ord,
      use_yn: body.use_yn,
    })
    return NextResponse.json({ category }, { status: 201 })
  } catch {
    return apiError('ADM_CTGR_CREATE_FAILED', 500)
  }
}
