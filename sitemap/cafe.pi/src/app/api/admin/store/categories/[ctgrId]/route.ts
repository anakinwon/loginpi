import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { updateCategory, softDeleteCategory } from '@/lib/mps-ctgr'
import { apiError } from '@/lib/api-errors'

// PATCH /api/admin/store/categories/[ctgrId] — 카테고리 수정
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ ctgrId: string }> },
) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
  }

  const { ctgrId } = await params
  const body = (await req.json()) as {
    parent_ctgr_id?: string | null
    ctgr_nm?: string
    ctgr_desc?: string
    sort_ord?: number
    use_yn?: string
  }

  try {
    const category = await updateCategory(
      ctgrId,
      requester?.id ?? 'ADMIN',
      body,
    )
    if (!category) {
      return apiError('ADM_CTGR_NOT_FOUND', 404)
    }
    return NextResponse.json({ category })
  } catch {
    return apiError('UPDATE_FAILED', 500)
  }
}

// DELETE /api/admin/store/categories/[ctgrId] — 논리삭제 (하위 카테고리 있으면 거부)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ ctgrId: string }> },
) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
  }

  const { ctgrId } = await params

  try {
    const result = await softDeleteCategory(ctgrId, requester?.id ?? 'ADMIN')
    if (!result.ok) {
      if (result.reason === 'HAS_CHILDREN') {
        return apiError('ADM_CTGR_HAS_CHILDREN', 409)
      }
      return apiError('ADM_CTGR_NOT_FOUND', 404)
    }
    return NextResponse.json({ success: true })
  } catch {
    return apiError('DELETE_FAILED', 500)
  }
}
