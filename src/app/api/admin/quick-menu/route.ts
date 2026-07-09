import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { ADMIN_NAV_BY_HREF } from '@/lib/admin-nav-catalog'
import { apiError } from '@/lib/api-errors'

// GET /api/admin/quick-menu — 현재 팝업 노출 메뉴(순서대로 href 목록)
export async function GET() {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
  }

  const { data, error } = await getSupabaseAdmin()
    .from('sys_quick_menu')
    .select('menu_href, sort_ord')
    .eq('use_yn', 'Y')
    .eq('del_yn', 'N')
    .order('sort_ord', { ascending: true })

  if (error) return apiError('QUERY_FAILED', 500)
  return NextResponse.json({
    hrefs: (data ?? []).map((r) => (r as { menu_href: string }).menu_href),
  })
}

// PUT /api/admin/quick-menu — 팝업 노출 메뉴 저장 (전체 교체)
// body: { hrefs: string[] }  순서대로. 카탈로그에 있는 href만 허용.
export async function PUT(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
  }

  const body = (await req.json().catch(() => null)) as {
    hrefs?: unknown
  } | null
  const rawHrefs = Array.isArray(body?.hrefs) ? body!.hrefs : null
  if (!rawHrefs) {
    return apiError('BAD_REQUEST', 400)
  }

  // 카탈로그 존재 href만 + 중복 제거 (순서 보존)
  const seen = new Set<string>()
  const hrefs: string[] = []
  for (const h of rawHrefs) {
    if (typeof h !== 'string' || seen.has(h) || !ADMIN_NAV_BY_HREF.has(h))
      continue
    seen.add(h)
    hrefs.push(h)
  }

  const db = getSupabaseAdmin()
  const now = new Date().toISOString()
  const modrId = requester?.id ?? 'ADMIN'

  // 기존 활성 전부 논리삭제 후 재구성 (설정 스냅샷 교체)
  const { error: clearErr } = await db
    .from('sys_quick_menu')
    .update({ del_yn: 'Y', del_dtm: now, modr_id: modrId, mod_dtm: now })
    .eq('del_yn', 'N')
  if (clearErr) return apiError('SAVE_FAILED', 500)

  if (hrefs.length > 0) {
    const rows = hrefs.map((href, i) => ({
      menu_href: href,
      sort_ord: (i + 1) * 10,
      use_yn: 'Y',
      del_yn: 'N',
      regr_id: modrId,
      modr_id: modrId,
    }))
    const { error: insErr } = await db.from('sys_quick_menu').insert(rows)
    if (insErr) return apiError('SAVE_FAILED', 500)
  }

  return NextResponse.json({ ok: true, count: hrefs.length })
}
