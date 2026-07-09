import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getDistCfgHistory } from '@/lib/mps-dist-cfg'
import { sanitizeError } from '@/lib/sanitize-error'
import { apiError } from '@/lib/api-errors'

export async function GET() {
  const user = await getSessionUser()
  if (!user || !isAdmin(user)) return apiError('FORBIDDEN', 401)

  const history = await getDistCfgHistory()
  return NextResponse.json({ history })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || !isAdmin(user)) return apiError('FORBIDDEN', 401)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const { max_dist_km, note_txt } = body as {
    max_dist_km?: number
    note_txt?: string
  }

  const km = Math.round(Number(max_dist_km))
  if (isNaN(km) || km < 0 || km > 200) return apiError('ADM_DIST_KM_RANGE', 400)

  const { error } = await getSupabaseAdmin()
    .from('mps_dist_cfg')
    .insert({
      max_dist_km: km,
      note_txt:
        typeof note_txt === 'string' && note_txt.trim()
          ? note_txt.trim()
          : null,
      modr_id: user.id,
      regr_id: user.id,
    })

  if (error)
    return NextResponse.json(
      {
        error: sanitizeError(
          'api/admin/store/distance-cfg/post',
          error,
          '거리 설정 저장 실패',
        ),
      },
      { status: 500 },
    )

  revalidateTag('mps-dist-cfg', {})
  return NextResponse.json({ ok: true, max_dist_km: km })
}
