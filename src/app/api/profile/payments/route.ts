import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { data } = await getSupabaseAdmin()
    .from('pi_pymnt')
    .select('payment_id, amount, memo, status, reg_dtm, metadata')
    .eq('user_id', user.id)
    .order('reg_dtm', { ascending: false })
    .limit(20)

  return NextResponse.json({ payments: data ?? [] })
}
