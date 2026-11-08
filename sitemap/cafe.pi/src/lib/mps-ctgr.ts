import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// MPS 상품 카테고리 CRUD + 계층 트리 빌드 (2단계: 대분류 → 소분류)
// 모델은 인접 리스트(parent_ctgr_id 자기참조) — 트리는 앱 레벨에서 재구성

const CTGR_SELECT =
  'ctgr_id, parent_ctgr_id, ctgr_nm, ctgr_desc, sort_ord, use_yn, reg_dtm'

export interface MpsCtgr {
  ctgr_id: string
  parent_ctgr_id: string | null
  ctgr_nm: string
  ctgr_desc: string | null
  sort_ord: number
  use_yn: 'Y' | 'N'
  reg_dtm: string
}

export interface CtgrTreeNode extends MpsCtgr {
  children: CtgrTreeNode[]
}

export interface CtgrInput {
  parent_ctgr_id?: string | null
  ctgr_nm: string
  ctgr_desc?: string | null
  sort_ord?: number
  use_yn?: string
}

// 평면 목록 → 부모-자식 트리. 부모가 목록에 없으면(미사용 등) 루트로 승격
function buildTree(rows: MpsCtgr[]): CtgrTreeNode[] {
  const map = new Map<string, CtgrTreeNode>()
  rows.forEach((r) => map.set(r.ctgr_id, { ...r, children: [] }))

  const roots: CtgrTreeNode[] = []
  for (const node of map.values()) {
    const parent = node.parent_ctgr_id
      ? map.get(node.parent_ctgr_id)
      : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sortRec = (nodes: CtgrTreeNode[]) => {
    nodes.sort(
      (a, b) => a.sort_ord - b.sort_ord || a.ctgr_nm.localeCompare(b.ctgr_nm),
    )
    nodes.forEach((n) => sortRec(n.children))
  }
  sortRec(roots)
  return roots
}

// 공개 트리 — 사용중(use_yn='Y')인 카테고리만 (상품 목록 필터용)
export async function listCategoryTree(): Promise<CtgrTreeNode[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('mps_ctgr')
    .select(CTGR_SELECT)
    .eq('del_yn', 'N')
    .eq('use_yn', 'Y')
    .order('sort_ord', { ascending: true })

  if (error) throw new Error(error.message)
  return buildTree((data ?? []) as unknown as MpsCtgr[])
}

// 어드민 평면 목록 — 미사용 포함, 부모명 부착 (관리 화면용)
export async function listAllCategories(): Promise<
  (MpsCtgr & { parent_nm: string | null })[]
> {
  const { data, error } = await getSupabaseAdmin()
    .from('mps_ctgr')
    .select(CTGR_SELECT)
    .eq('del_yn', 'N')
    .order('sort_ord', { ascending: true })

  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as MpsCtgr[]
  const nameById = new Map(rows.map((r) => [r.ctgr_id, r.ctgr_nm]))
  return rows.map((r) => ({
    ...r,
    parent_nm: r.parent_ctgr_id
      ? (nameById.get(r.parent_ctgr_id) ?? null)
      : null,
  }))
}

export async function createCategory(regrId: string, input: CtgrInput) {
  const { data, error } = await getSupabaseAdmin()
    .from('mps_ctgr')
    .insert({
      parent_ctgr_id: input.parent_ctgr_id ?? null,
      ctgr_nm: input.ctgr_nm.trim(),
      ctgr_desc: input.ctgr_desc?.trim() || null,
      sort_ord: input.sort_ord ?? 0,
      use_yn: input.use_yn === 'N' ? 'N' : 'Y',
      regr_id: regrId,
      modr_id: regrId,
    })
    .select(CTGR_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return data as unknown as MpsCtgr
}

export async function updateCategory(
  ctgrId: string,
  modrId: string,
  patch: Partial<CtgrInput>,
) {
  const upd: Record<string, unknown> = {
    modr_id: modrId,
    mod_dtm: new Date().toISOString(),
  }
  if (patch.parent_ctgr_id !== undefined)
    upd.parent_ctgr_id = patch.parent_ctgr_id || null
  if (patch.ctgr_nm !== undefined) upd.ctgr_nm = patch.ctgr_nm.trim()
  if (patch.ctgr_desc !== undefined)
    upd.ctgr_desc = patch.ctgr_desc?.trim() || null
  if (patch.sort_ord !== undefined) upd.sort_ord = patch.sort_ord
  if (patch.use_yn !== undefined) upd.use_yn = patch.use_yn === 'N' ? 'N' : 'Y'

  const { data, error } = await getSupabaseAdmin()
    .from('mps_ctgr')
    .update(upd)
    .eq('ctgr_id', ctgrId)
    .eq('del_yn', 'N')
    .select(CTGR_SELECT)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as unknown as MpsCtgr | null) ?? null
}

// 논리삭제 — 자식 카테고리가 있으면 거부(무결성). 연결된 상품은 ctgr_id NULL 처리
export async function softDeleteCategory(
  ctgrId: string,
  modrId: string,
): Promise<{ ok: boolean; reason?: 'HAS_CHILDREN' | 'NOT_FOUND' }> {
  const db = getSupabaseAdmin()

  const { count } = await db
    .from('mps_ctgr')
    .select('ctgr_id', { count: 'exact', head: true })
    .eq('parent_ctgr_id', ctgrId)
    .eq('del_yn', 'N')
  if ((count ?? 0) > 0) return { ok: false, reason: 'HAS_CHILDREN' }

  const now = new Date().toISOString()
  const { data } = await db
    .from('mps_ctgr')
    .update({ del_yn: 'Y', del_dtm: now, modr_id: modrId, mod_dtm: now })
    .eq('ctgr_id', ctgrId)
    .eq('del_yn', 'N')
    .select('ctgr_id')
  if (!data || data.length === 0) return { ok: false, reason: 'NOT_FOUND' }

  // 이 카테고리를 쓰던 상품은 미분류로 (상품 자체는 보존)
  await db
    .from('mps_item')
    .update({ ctgr_id: null, modr_id: modrId, mod_dtm: now })
    .eq('ctgr_id', ctgrId)

  return { ok: true }
}
