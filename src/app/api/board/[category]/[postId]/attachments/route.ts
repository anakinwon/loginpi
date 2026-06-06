import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getCategory } from '@/lib/board'
import { randomUUID } from 'crypto'

const BUCKET = 'board-attachments'
const MAX_FILES = 5
const MAX_SIZE = 20 * 1024 * 1024 // 20MB

type Params = { params: Promise<{ category: string; postId: string }> }

// POST /api/board/[category]/[postId]/attachments — 파일 업로드
export async function POST(request: NextRequest, { params }: Params) {
  const { category, postId } = await params
  const [ctgr, user] = await Promise.all([getCategory(category), getSessionUser()])

  if (!ctgr) return NextResponse.json({ error: '존재하지 않는 게시판입니다' }, { status: 404 })
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  if (ctgr.attch_yn !== 'Y') {
    return NextResponse.json({ error: '이 게시판은 첨부파일을 지원하지 않습니다' }, { status: 403 })
  }

  const db = getSupabaseAdmin()

  // 게시글 존재 + 작성자 확인
  const { data: post } = await db
    .from('brd_post')
    .select('rgst_usr_id')
    .eq('post_id', postId)
    .eq('ctgr_cd', ctgr.ctgr_cd)
    .eq('del_yn', 'N')
    .single()

  if (!post) return NextResponse.json({ error: '게시글을 찾을 수 없습니다' }, { status: 404 })

  const isOwner = post.rgst_usr_id === user.id
  const isModerator = user.role === 'ADMIN' || user.role === 'MASTER'
  if (!isOwner && !isModerator) {
    return NextResponse.json({ error: '첨부파일 업로드 권한이 없습니다' }, { status: 403 })
  }

  // 기존 첨부파일 수 확인 (5개 제한)
  const { count: existing } = await db
    .from('brd_attch')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', postId)
    .eq('del_yn', 'N')

  let formData: FormData
  try { formData = await request.formData() } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다' }, { status: 400 })
  }

  const files = formData.getAll('files') as File[]
  if (files.length === 0) {
    return NextResponse.json({ error: '업로드할 파일을 선택해주세요' }, { status: 400 })
  }
  if ((existing ?? 0) + files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `첨부파일은 최대 ${MAX_FILES}개까지 가능합니다 (현재 ${existing ?? 0}개)` },
      { status: 400 }
    )
  }

  const uploaded: { attch_id: string; fl_nm: string; fl_url: string; fl_sz: number }[] = []

  for (const file of files) {
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `파일 크기는 20MB를 초과할 수 없습니다 (${file.name})` },
        { status: 400 }
      )
    }

    const ext = file.name.includes('.') ? file.name.split('.').pop() : ''
    const storagePath = `${postId}/${randomUUID()}${ext ? `.${ext}` : ''}`

    const { error: uploadErr } = await db.storage
      .from(BUCKET)
      .upload(storagePath, await file.arrayBuffer(), {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (uploadErr) {
      return NextResponse.json({ error: `업로드 실패: ${file.name}` }, { status: 500 })
    }

    const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(storagePath)

    const { data: row, error: dbErr } = await db
      .from('brd_attch')
      .insert({
        post_id: postId,
        fl_nm: file.name,
        fl_pth: storagePath,
        fl_url: publicUrl,
        fl_sz: file.size,
        fl_tp: file.type || null,
        regr_id: user.display_name.slice(0, 20),
        modr_id: user.display_name.slice(0, 20),
      })
      .select('attch_id')
      .single()

    if (dbErr) {
      // DB 저장 실패 시 Storage 파일 롤백
      await db.storage.from(BUCKET).remove([storagePath])
      return NextResponse.json({ error: `DB 저장 실패: ${file.name}` }, { status: 500 })
    }

    uploaded.push({ attch_id: row.attch_id, fl_nm: file.name, fl_url: publicUrl, fl_sz: file.size })
  }

  return NextResponse.json({ uploaded }, { status: 201 })
}
