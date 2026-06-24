import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Open Beta 운영 준비 체크리스트 — 관리자 전용. ops_checklist(sql/111) 상태/메모 관리.
const STATUS = ['TODO', 'DOING', 'DONE', 'NA'] as const
type Status = (typeof STATUS)[number]

interface ChkRow {
  chk_id: string
  item_key: string
  sect_cd: string
  sect_nm: string
  title: string
  prio_cd: string
  owner_cd: string
  status_cd: string
  note_txt: string | null
  sort_ord: number
}

export async function GET() {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('ops_checklist')
    .select(
      'chk_id, item_key, sect_cd, sect_nm, title, prio_cd, owner_cd, status_cd, note_txt, sort_ord',
    )
    .eq('del_yn', 'N')
    .order('sort_ord', { ascending: true })

  // 테이블 미적용(sql/111 전)이면 graceful — 빈 목록 + applied:false
  if (error) {
    return NextResponse.json({ items: [], summary: emptySummary(), applied: false })
  }

  const items = (data ?? []) as ChkRow[]
  return NextResponse.json({ items, summary: summarize(items), applied: true })
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

  const { chk_id, status_cd, note_txt } = body as {
    chk_id?: string
    status_cd?: string
    note_txt?: string
  }
  if (!chk_id) {
    return NextResponse.json({ error: 'chk_id가 필요합니다' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {
    modr_id: user!.id,
    mod_dtm: new Date().toISOString(),
  }
  if (status_cd !== undefined) {
    if (!STATUS.includes(status_cd as Status)) {
      return NextResponse.json({ error: '유효하지 않은 상태' }, { status: 400 })
    }
    patch.status_cd = status_cd
  }
  if (note_txt !== undefined) {
    patch.note_txt = String(note_txt).slice(0, 500) || null
  }

  const { data, error } = await getSupabaseAdmin()
    .from('ops_checklist')
    .update(patch)
    .eq('chk_id', chk_id)
    .eq('del_yn', 'N')
    .select(
      'chk_id, item_key, sect_cd, sect_nm, title, prio_cd, owner_cd, status_cd, note_txt, sort_ord',
    )
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  }
  return NextResponse.json({ item: data })
}

function emptySummary() {
  return { total: 0, done: 0, doing: 0, todo: 0, na: 0, blockingLeft: 0, percent: 0 }
}

function summarize(items: ChkRow[]) {
  const done = items.filter((i) => i.status_cd === 'DONE').length
  const doing = items.filter((i) => i.status_cd === 'DOING').length
  const todo = items.filter((i) => i.status_cd === 'TODO').length
  const na = items.filter((i) => i.status_cd === 'NA').length
  const denom = items.length - na // NA 제외
  const blockingLeft = items.filter(
    (i) => i.prio_cd === 'BLOCKING' && i.status_cd !== 'DONE' && i.status_cd !== 'NA',
  ).length
  return {
    total: items.length,
    done,
    doing,
    todo,
    na,
    blockingLeft,
    percent: denom > 0 ? Math.round((done / denom) * 100) : 0,
  }
}
