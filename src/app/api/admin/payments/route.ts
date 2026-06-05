import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('payments')
    .select(`
      id,
      payment_id,
      txid,
      amount,
      memo,
      status,
      metadata,
      created_at,
      updated_at,
      users ( display_name, pi_username, google_email )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: '결제 내역 조회 실패' }, { status: 500 })
  }

  return NextResponse.json({ payments: data })
}
