import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

const PAGE_SIZE = 30

export async function GET(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) return apiError('FORBIDDEN', 403)

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'PENDING'
  const entity_type = searchParams.get('entity_type') ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))

  let query = getSupabaseAdmin()
    .from('approval_queue')
    .select('*', { count: 'exact' })
    .order('reg_dtm', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  if (status !== 'all') query = query.eq('apv_status', status)
  if (entity_type) query = query.eq('entity_type', entity_type)

  const { data, error, count } = await query
  if (error) return apiError('QUERY_FAILED', 500)

  return NextResponse.json({
    approvals: data ?? [],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  })
}

export async function POST(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) return apiError('FORBIDDEN', 403)

  const body = (await req.json()) as {
    entity_type: string
    entity_id: string
    entity_nm?: string
    req_data?: Record<string, unknown>
  }

  if (!body.entity_type?.trim() || !body.entity_id?.trim()) {
    return apiError('ADM_STD_APV_ENTITY_REQUIRED', 400)
  }

  const { data, error } = await getSupabaseAdmin()
    .from('approval_queue')
    .insert({
      entity_type: body.entity_type.trim(),
      entity_id: body.entity_id.trim(),
      entity_nm: body.entity_nm?.trim() ?? null,
      apv_status: 'PENDING',
      req_data: body.req_data ?? null,
      req_by: requester!.id,
      regr_id: requester!.id,
    })
    .select()
    .single()

  if (error) return apiError('ADM_REQUEST_FAILED', 500)

  return NextResponse.json({ approval: data }, { status: 201 })
}
