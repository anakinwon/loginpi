import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const prodCtgr = searchParams.get('prod_ctgr_cd')
  const subscrDiv = searchParams.get('subscr_div_cd')

  const db = getSupabaseAdmin()

  let query = db
    .from('bean_fee_plan')
    .select(
      'fee_plan_id, fee_plan_cd, subscr_div_cd, prod_ctgr_cd, fee_knd_cd, grade_cd, bill_cycle_cd, amt_bean, qty_limit, fee_plan_desc, use_yn, sort_ord, mod_dtm',
    )
    .eq('del_yn', 'N')
    .order('sort_ord', { ascending: true })
    .order('fee_plan_cd', { ascending: true })

  if (prodCtgr) query = query.eq('prod_ctgr_cd', prodCtgr)
  if (subscrDiv) query = query.eq('subscr_div_cd', subscrDiv)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as {
    fee_plan_id: string
    use_yn?: 'Y' | 'N'
    amt_bean?: number
  }

  if (!body.fee_plan_id) {
    return NextResponse.json({ error: 'fee_plan_id 필수' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {
    modr_id: user?.id ?? 'ADMIN',
    mod_dtm: new Date().toISOString(),
  }

  if (body.use_yn !== undefined) {
    if (body.use_yn !== 'Y' && body.use_yn !== 'N') {
      return NextResponse.json(
        { error: 'use_yn은 Y 또는 N' },
        { status: 400 },
      )
    }
    updates.use_yn = body.use_yn
  }

  if (body.amt_bean !== undefined) {
    if (!Number.isInteger(body.amt_bean) || body.amt_bean < 0) {
      return NextResponse.json(
        { error: 'amt_bean은 0 이상 정수' },
        { status: 400 },
      )
    }
    updates.amt_bean = body.amt_bean
  }

  if (Object.keys(updates).length <= 2) {
    return NextResponse.json({ error: '변경할 필드 없음' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  const { error } = await db
    .from('bean_fee_plan')
    .update(updates)
    .eq('fee_plan_id', body.fee_plan_id)
    .eq('del_yn', 'N')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 구독요금제 캐시 즉시 무효화 → 다음 요청부터 DB 최신값 반영
  revalidateTag('subscr-plans', {})

  return NextResponse.json({ ok: true })
}
