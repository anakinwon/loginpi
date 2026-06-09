import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const ProfileUpdateSchema = z.object({
  display_name: z.string().min(1).max(50).optional(),
  real_nm:      z.string().max(50).optional(),
  nick_nm:      z.string().max(30).optional(),
  phone_no:     z.string().max(20).optional(),
  addr:         z.string().max(200).optional(),
  addr_dtl:     z.string().max(100).optional(),
})

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { data } = await getSupabaseAdmin()
    .from('sys_user')
    .select('id, display_name, real_nm, nick_nm, phone_no, addr, addr_dtl, pi_username, google_email, role, reg_dtm')
    .eq('id', user.id)
    .maybeSingle()

  return NextResponse.json({ user: data })
}

export async function PATCH(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const parsed = ProfileUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('sys_user')
    .update({
      ...parsed.data,
      modr_id: user.id,
      mod_dtm: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select('id, display_name, real_nm, nick_nm, phone_no, addr, addr_dtl, pi_username, google_email, role, reg_dtm')
    .maybeSingle()

  if (error) return NextResponse.json({ error: '프로필 저장 실패' }, { status: 500 })
  return NextResponse.json({ user: data })
}
