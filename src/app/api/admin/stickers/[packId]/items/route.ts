import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// 어드민 스티커 추가 — multipart files 업로드 → Storage 저장 → msg_stkr INSERT
// 커스텀 스티커 제작(/api/stickers/custom)과 동일한 보안 정책: SVG 제외(Stored XSS)

type Params = { params: Promise<{ packId: string }> }

const MAX_FILES = 20
const MAX_BYTES = 2 * 1024 * 1024 // 1장 2MB

const ALLOWED_MIME = new Map<string, string>([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
])

const BUCKET = 'chat-attachments'

export async function POST(request: NextRequest, { params }: Params) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }
  const { packId } = await params

  const db = getSupabaseAdmin()
  const { data: pack } = await db
    .from('msg_stkr_pack')
    .select('pack_id')
    .eq('pack_id', packId)
    .eq('del_yn', 'N')
    .maybeSingle()
  if (!pack) return NextResponse.json({ error: '팩을 찾을 수 없습니다' }, { status: 404 })

  let formData: FormData
  try { formData = await request.formData() } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다' }, { status: 400 })
  }

  const files = formData.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length < 1 || files.length > MAX_FILES) {
    return NextResponse.json({ error: `스티커 이미지는 1~${MAX_FILES}개여야 합니다` }, { status: 400 })
  }
  for (const f of files) {
    if (f.size > MAX_BYTES) {
      return NextResponse.json({ error: '스티커 이미지는 1장당 2MB 이하여야 합니다' }, { status: 413 })
    }
    if (!ALLOWED_MIME.has(f.type)) {
      return NextResponse.json({ error: '허용되지 않은 이미지 형식입니다 (png/jpg/gif/webp)' }, { status: 415 })
    }
  }

  // 정렬 순서는 기존 마지막 sort_ord 다음부터 이어붙임
  const { data: lastStkr } = await db
    .from('msg_stkr')
    .select('sort_ord')
    .eq('pack_id', packId)
    .eq('del_yn', 'N')
    .order('sort_ord', { ascending: false })
    .limit(1)
    .maybeSingle()
  const baseOrd = (lastStkr?.sort_ord ?? -1) + 1

  const rows: { pack_id: string; stkr_nm: string; stkr_url: string; sort_ord: number; regr_id: string; modr_id: string }[] = []
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    const ext = ALLOWED_MIME.get(f.type)!
    const path = `stickers/${packId}/${crypto.randomUUID()}.${ext}`
    const { error: upError } = await db.storage
      .from(BUCKET)
      .upload(path, await f.arrayBuffer(), { contentType: f.type, upsert: false })
    if (upError) continue

    const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path)
    rows.push({
      pack_id: packId,
      stkr_nm: f.name.replace(/\.[^.]+$/, '').slice(0, 100) || `sticker-${baseOrd + i + 1}`,
      stkr_url: urlData.publicUrl,
      sort_ord: baseOrd + i,
      regr_id: 'ADMIN',
      modr_id: 'ADMIN',
    })
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: '스티커 이미지 업로드에 실패했습니다' }, { status: 500 })
  }

  const { data: inserted, error } = await db
    .from('msg_stkr')
    .insert(rows)
    .select('stkr_id, stkr_nm, stkr_url, sort_ord')

  if (error) return NextResponse.json({ error: '스티커 등록 실패' }, { status: 500 })
  return NextResponse.json({ stickers: inserted ?? [], uploaded: rows.length }, { status: 201 })
}
