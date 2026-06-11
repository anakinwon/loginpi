import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const VALID_ROLES = ['ADMIN', 'MASTER', 'MANAGER', 'USER'] as const
type Role = (typeof VALID_ROLES)[number]

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { id } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const { role } = body as { role?: string }
  if (!role || !VALID_ROLES.includes(role as Role)) {
    return NextResponse.json(
      { error: '유효하지 않은 역할입니다' },
      { status: 400 },
    )
  }

  // ADMIN은 다른 ADMIN의 역할을 변경할 수 없음 (자기 자신도)
  if (id === requester?.id) {
    return NextResponse.json(
      { error: '자신의 역할은 변경할 수 없습니다' },
      { status: 403 },
    )
  }

  const { error } = await getSupabaseAdmin()
    .from('sys_user')
    .update({ role })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: '역할 변경 실패' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
