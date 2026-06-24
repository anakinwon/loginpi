import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getDistCfgHistory } from '@/lib/mps-dist-cfg'

export async function GET() {
  const user = await getSessionUser()
  if (!user || !isAdmin(user))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const history = await getDistCfgHistory()
  return NextResponse.json({ history })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || !isAdmin(user))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { max_dist_km, note_txt } = body as {
    max_dist_km?: number
    note_txt?: string
  }

  const km = Math.round(Number(max_dist_km))
  if (isNaN(km) || km < 0 || km > 200)
    return NextResponse.json(
      { error: 'max_dist_km는 0~200 사이 정수여야 합니다' },
      { status: 400 },
    )

  const { error } = await getSupabaseAdmin().from('mps_dist_cfg').insert({
    max_dist_km: km,
    note_txt: typeof note_txt === 'string' && note_txt.trim() ? note_txt.trim() : null,
    modr_id: user.id,
    regr_id: user.id,
  })

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag('mps-dist-cfg', {})
  return NextResponse.json({ ok: true, max_dist_km: km })
}
