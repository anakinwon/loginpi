import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const walletType = searchParams.get('type') ?? 'USER'  // USER | PLATFORM | ALL
  const search = searchParams.get('q') ?? ''
  const limitStr = searchParams.get('limit') ?? '100'
  const offsetStr = searchParams.get('offset') ?? '0'
  const limit = Math.min(parseInt(limitStr, 10) || 100, 500)
  const offset = parseInt(offsetStr, 10) || 0

  const db = getSupabaseAdmin()

  // 병렬 조회: 거버넌스 지갑 3종 + USER 지갑 목록
  const [govRes, userRes] = await Promise.all([
    // PLATFORM / FOUNDATION / REWARD_POOL 한번에 조회
    db
      .from('bean_token_wallet')
      .select('wallet_type, wlt_id, bean_amt, status, mod_dtm')
      .in('wallet_type', ['PLATFORM', 'FOUNDATION', 'REWARD_POOL'])
      .eq('del_yn', 'N'),
    walletType !== 'PLATFORM'
      ? (() => {
          let q = db
            .from('bean_token_wallet')
            .select(
              `wlt_id, usr_id, bean_amt, status, del_yn, mod_dtm,
               sys_user:usr_id ( pi_username, nick_nm, real_nm, display_name )`,
            )
            .eq('wallet_type', 'USER')
            .order('bean_amt', { ascending: false })
            .range(offset, offset + limit - 1)
          if (search) q = q.ilike('usr_id', `%${search}%`)
          return q
        })()
      : Promise.resolve({ data: [], error: null }),
  ])

  type GovWallet = { wallet_type: string; wlt_id: string; bean_amt: number; status: string; mod_dtm: string }
  const govMap = Object.fromEntries(
    ((govRes.data ?? []) as GovWallet[]).map((r) => [r.wallet_type, r]),
  )

  return NextResponse.json({
    platform:    govMap['PLATFORM']    ?? null,
    foundation:  govMap['FOUNDATION']  ?? null,
    reward_pool: govMap['REWARD_POOL'] ?? null,
    users: userRes.data ?? [],
    limit,
    offset,
  })
}
