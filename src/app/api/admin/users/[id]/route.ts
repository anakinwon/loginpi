import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

const VALID_ROLES = ['ADMIN', 'MASTER', 'MANAGER', 'USER'] as const
type Role = (typeof VALID_ROLES)[number]

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
  }

  const { id } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('BAD_REQUEST', 400)
  }

  const { role } = body as { role?: string }
  if (!role || !VALID_ROLES.includes(role as Role)) {
    return apiError('ADM_INVALID_ROLE', 400)
  }

  // ADMIN은 다른 ADMIN의 역할을 변경할 수 없음 (자기 자신도)
  if (id === requester?.id) {
    return apiError('ADM_CANNOT_CHANGE_OWN_ROLE', 403)
  }

  const { error } = await getSupabaseAdmin()
    .from('sys_user')
    .update({ role })
    .eq('id', id)

  if (error) {
    return apiError('ADM_ROLE_UPDATE_FAILED', 500)
  }

  return NextResponse.json({ success: true })
}
