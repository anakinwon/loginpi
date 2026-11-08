import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { syncGroupManagers } from '@/lib/shop-staff-access'
import { apiError } from '@/lib/api-errors'

type Params = { params: Promise<{ shopId: string }> }

// 매장 관리직원 등록/해제 (mps_shop_staff, sql/181) — 소유자(또는 관리자)만.
//   등록 직원 = 판매 관리 열람 + 주문 상태 변경(접수·준비완료·거래완료). 취소·환불은 소유자 전용.
//   GET: 등록 직원 목록 / POST { pi_username }: 등록(재등록=del_yn 복구) / DELETE ?usr=: 논리삭제 해제

async function ownShop(
  shopId: string,
  userId: string,
  admin: boolean,
): Promise<{ error: 403 | 404 } | { sellerId: string }> {
  const { data } = await getSupabaseAdmin()
    .from('mps_shop')
    .select('seller_id')
    .eq('shop_id', shopId)
    .eq('del_yn', 'N')
    .maybeSingle()
  const shop = data as { seller_id: string } | null
  if (!shop) return { error: 404 }
  if (shop.seller_id !== userId && !admin) return { error: 403 }
  return { sellerId: shop.seller_id }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { shopId } = await params
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const r = await ownShop(shopId, user.id, isAdmin(user))
  if ('error' in r) return apiError('FORBIDDEN', r.error)

  // 그룹방 멤버 자동 동기화 — 그룹 멤버(앱 가입+개인 연동)를 매니저로 실체화.
  // ×로 제외(del_yn='Y')된 사람은 부활하지 않음. 소유자는 그룹 참여 여부만 표시용 반환.
  const ownerInGroup = await syncGroupManagers(shopId)

  const db = getSupabaseAdmin()
  const { data: rows, error } = await db
    .from('mps_shop_staff')
    .select('usr_id, reg_dtm')
    .eq('shop_id', shopId)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: true })
  // 테이블 미생성(마이그레이션 전) — 빈 목록으로 강등해 화면은 정상 동작
  if (error) return NextResponse.json({ staff: [], owner: null })

  const usrIds = (rows ?? []).map((r) => (r as { usr_id: string }).usr_id)
  // usr_id는 FK 없는 TEXT(sys_user.id) — 임베드 불가, 별도 조회 후 Map 병합.
  // 소유자 이름도 함께 조회(그룹 참여 시 "(소유자)" 칩 표시용)
  const lookupIds = [...new Set([...usrIds, r.sellerId])]
  const { data: users } = await db
    .from('sys_user')
    .select('id, nick_nm, display_name, pi_username')
    .in('id', lookupIds)
  const byId = new Map((users ?? []).map((u) => [(u as { id: string }).id, u]))
  const staff = (rows ?? []).map((r) => {
    const row = r as { usr_id: string; reg_dtm: string }
    const u = byId.get(row.usr_id) as {
      nick_nm: string | null
      display_name: string | null
      pi_username: string | null
    } | null
    return {
      usr_id: row.usr_id,
      pi_username: u?.pi_username ?? null,
      name:
        u?.nick_nm ||
        u?.pi_username ||
        u?.display_name ||
        row.usr_id.slice(0, 8),
      reg_dtm: row.reg_dtm,
    }
  })
  const ow = byId.get(r.sellerId) as {
    nick_nm: string | null
    display_name: string | null
    pi_username: string | null
  } | null
  return NextResponse.json({
    staff,
    // 소유자가 매장 그룹방에 참여 중이면 목록 선두에 "(소유자)" 칩으로 표시
    owner: ownerInGroup
      ? {
          name: ow?.nick_nm || ow?.pi_username || ow?.display_name || 'owner',
        }
      : null,
  })
}

const addSchema = z.object({
  pi_username: z.string().min(1).max(100),
})

export async function POST(req: NextRequest, { params }: Params) {
  const { shopId } = await params
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const r = await ownShop(shopId, user.id, isAdmin(user))
  if ('error' in r) return apiError('FORBIDDEN', r.error)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }
  const parsed = addSchema.safeParse(body)
  if (!parsed.success) return apiError('INVALID_INPUT', 400)

  const db = getSupabaseAdmin()
  // Pi username으로 대상 사용자 식별 — 활성 사용자의 불변 키(uid 재발급 사고 교훈)
  const uname = parsed.data.pi_username.trim().replace(/^@/, '')
  const { data: target } = await db
    .from('sys_user')
    .select('id')
    .eq('pi_username', uname)
    .eq('del_yn', 'N')
    .maybeSingle()
  if (!target) return apiError('STORE_STAFF_USER_NOT_FOUND', 404)
  const targetId = (target as { id: string }).id
  if (targetId === r.sellerId) {
    return apiError('STORE_STAFF_IS_OWNER', 400)
  }

  const now = new Date().toISOString()
  // 재등록(논리삭제 행 복구) 우선 — UNIQUE(shop_id, usr_id WHERE del_yn='N') 충돌 방지
  const { data: existing } = await db
    .from('mps_shop_staff')
    .select('staff_id, del_yn')
    .eq('shop_id', shopId)
    .eq('usr_id', targetId)
    .order('reg_dtm', { ascending: false })
    .limit(1)
    .maybeSingle()
  const ex = existing as { staff_id: string; del_yn: string } | null

  if (ex && ex.del_yn === 'N') return apiError('STORE_STAFF_ALREADY', 409)

  const { error } = ex
    ? await db
        .from('mps_shop_staff')
        .update({ del_yn: 'N', del_dtm: null, modr_id: user.id, mod_dtm: now })
        .eq('staff_id', ex.staff_id)
    : await db.from('mps_shop_staff').insert({
        shop_id: shopId,
        usr_id: targetId,
        regr_id: user.id,
        modr_id: user.id,
      })
  if (error) {
    console.error('[shop-staff] 등록 실패:', error.message)
    return apiError('STORE_STAFF_ADD_FAILED', 500)
  }
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { shopId } = await params
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const r = await ownShop(shopId, user.id, isAdmin(user))
  if ('error' in r) return apiError('FORBIDDEN', r.error)

  const usrId = req.nextUrl.searchParams.get('usr')
  if (!usrId) return apiError('INVALID_INPUT', 400)

  // 논리삭제 (DA 표준 — 물리 DELETE 금지)
  const now = new Date().toISOString()
  await getSupabaseAdmin()
    .from('mps_shop_staff')
    .update({ del_yn: 'Y', del_dtm: now, modr_id: user.id, mod_dtm: now })
    .eq('shop_id', shopId)
    .eq('usr_id', usrId)
    .eq('del_yn', 'N')
  return NextResponse.json({ ok: true })
}
