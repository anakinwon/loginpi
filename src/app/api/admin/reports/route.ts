import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// 신고 처리 (관리자 전용) — rpt_report 목록·상태/메모 갱신.
// FK 미설계 → 신고자명은 reporter_id로 sys_user 별도 .in() 병합.
const STATUS = ['PENDING', 'REVIEWING', 'RESOLVED', 'REJECTED']

interface RptRow {
  rpt_id: string
  reporter_id: string
  target_tp_cd: string
  target_id: string
  reason_cd: string
  reason_txt: string | null
  status_cd: string
  admin_memo: string | null
  reg_dtm: string
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const status = sp.get('status') ?? ''
  const page = Math.max(1, Number(sp.get('page') ?? 1))
  const limit = 30
  const from = (page - 1) * limit

  const db = getSupabaseAdmin()
  let q = db
    .from('rpt_report')
    .select(
      'rpt_id, reporter_id, target_tp_cd, target_id, reason_cd, reason_txt, status_cd, admin_memo, reg_dtm',
      { count: 'exact' },
    )
    .eq('del_yn', 'N')
  if (status && STATUS.includes(status)) q = q.eq('status_cd', status)
  q = q.order('reg_dtm', { ascending: false }).range(from, from + limit - 1)

  const { data, count, error } = await q
  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  const rows = (data ?? []) as RptRow[]

  // 신고자명 병합
  const ids = [...new Set(rows.map((r) => r.reporter_id))]
  const nameMap = new Map<string, string>()
  if (ids.length > 0) {
    const { data: us } = await db
      .from('sys_user')
      .select('id, pi_username, nick_nm, display_name')
      .in('id', ids)
    for (const u of (us ?? []) as {
      id: string
      pi_username: string | null
      nick_nm: string | null
      display_name: string | null
    }[]) {
      nameMap.set(u.id, u.nick_nm || u.display_name || u.pi_username || u.id.slice(0, 8))
    }
  }

  const merged = rows.map((r) => ({
    ...r,
    reporter_nm: nameMap.get(r.reporter_id) ?? r.reporter_id.slice(0, 8),
  }))
  return NextResponse.json({ rows: merged, total: count ?? 0, page, limit })
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }
  const { rpt_id, status_cd, admin_memo } = body as {
    rpt_id?: string
    status_cd?: string
    admin_memo?: string
  }
  if (!rpt_id) return NextResponse.json({ error: 'rpt_id 필요' }, { status: 400 })

  const patch: Record<string, unknown> = { modr_id: user!.id, mod_dtm: new Date().toISOString() }
  if (status_cd !== undefined) {
    if (!STATUS.includes(status_cd)) {
      return NextResponse.json({ error: '유효하지 않은 상태' }, { status: 400 })
    }
    patch.status_cd = status_cd
    patch.handler_id = user!.id
    if (status_cd === 'RESOLVED' || status_cd === 'REJECTED') {
      patch.resolved_dtm = new Date().toISOString()
    }
  }
  if (admin_memo !== undefined) patch.admin_memo = String(admin_memo).slice(0, 1000) || null

  const { data, error } = await getSupabaseAdmin()
    .from('rpt_report')
    .update(patch)
    .eq('rpt_id', rpt_id)
    .eq('del_yn', 'N')
    .select('rpt_id, status_cd, admin_memo')
    .maybeSingle()
  if (error || !data) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  return NextResponse.json({ item: data })
}
