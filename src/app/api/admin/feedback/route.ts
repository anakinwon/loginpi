import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { maskUsername } from '@/lib/mask-username'
import { apiError } from '@/lib/api-errors'

// GET /api/admin/feedback?page=1&limit=20&shop_id=&hide_yn=&score=
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) return apiError('FORBIDDEN', 403)

  const { searchParams } = req.nextUrl
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(
    100,
    Math.max(1, Number(searchParams.get('limit') ?? '20')),
  )
  const offset = (page - 1) * limit
  const shopId = searchParams.get('shop_id')
  const hideYn = searchParams.get('hide_yn')
  const score = searchParams.get('score')

  const db = getSupabaseAdmin()
  let q = db
    .from('fbck_mst')
    .select(
      'fbck_id, usr_id, shop_id, order_id, fbck_scr, fbck_cn, bean_rwrd_qty, rwrd_yn, hide_yn, hide_reason_txt, hide_dtm, del_yn, reg_dtm',
      { count: 'exact' },
    )
    .order('reg_dtm', { ascending: false })
    .range(offset, offset + limit - 1)

  if (shopId) q = q.eq('shop_id', shopId)
  if (hideYn === 'Y' || hideYn === 'N') q = q.eq('hide_yn', hideYn)
  if (score) q = q.eq('fbck_scr', Number(score))

  const { data: rows, count, error } = await q
  if (error) return apiError('QUERY_FAILED', 500)

  const usrIds = [
    ...new Set((rows ?? []).map((r: { usr_id: string }) => r.usr_id)),
  ]
  const { data: userRows } = usrIds.length
    ? await db
        .from('sys_user')
        .select('id, pi_username, nick_nm')
        .in('id', usrIds)
    : { data: [] }

  const userMap = new Map(
    (userRows ?? []).map(
      (u: {
        id: string
        pi_username: string | null
        nick_nm: string | null
      }) => [
        u.id,
        {
          masked: maskUsername(u.pi_username ?? u.nick_nm),
          raw: u.pi_username ?? u.nick_nm,
        },
      ],
    ),
  )

  const data = (rows ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    display_name: userMap.get(r.usr_id as string)?.masked ?? '****',
    raw_username: userMap.get(r.usr_id as string)?.raw,
  }))

  return NextResponse.json({
    data,
    pagination: { page, limit, total: count ?? 0 },
  })
}
