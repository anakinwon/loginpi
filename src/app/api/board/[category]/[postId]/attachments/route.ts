import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getCategory } from '@/lib/board'
import { validateMagicBytes } from '@/lib/upload-validate'
import { randomUUID } from 'crypto'
import { apiError } from '@/lib/api-errors'

const BUCKET = 'board-attachments'
const MAX_FILES = 5
const MAX_SIZE = 20 * 1024 * 1024 // 20MB

// MIME 타입 화이트리스트 — 클라이언트 파일명 신뢰 금지, 확장자는 이 맵에서만 결정
// (KISA FU — 파일 업로드 항목: 확장자/MIME 검증 필수)
// 카테고리별 정책: 공지/뉴스=이미지+PDF만, 자유게시판=광범위, 거래=보안제한
const ALLOWED_MIME_BY_CATEGORY: Record<string, Map<string, string>> = {
  // 공지사항·뉴스·업체소식 — 이미지 + PDF만 (악성 파일 차단)
  notice: new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/gif', 'gif'],
    ['image/webp', 'webp'],
    ['application/pdf', 'pdf'],
  ]),
  news: new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/gif', 'gif'],
    ['image/webp', 'webp'],
    ['application/pdf', 'pdf'],
  ]),
  shop: new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/gif', 'gif'],
    ['image/webp', 'webp'],
    ['application/pdf', 'pdf'],
  ]),
  // 자유게시판 — 문서 및 압축 파일 추가 (가장 개방적)
  free: new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/gif', 'gif'],
    ['image/webp', 'webp'],
    ['application/pdf', 'pdf'],
    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'docx',
    ],
    [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'xlsx',
    ],
    ['text/plain', 'txt'],
    ['application/zip', 'zip'],
  ]),
  // 거래게시판 — 이미지 + 영수증 PDF만 (보안 강화)
  trade: new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['application/pdf', 'pdf'],
  ]),
}

// 기본 화이트리스트 (카테고리별 정책 없을 때 fallback)
const ALLOWED_MIME_DEFAULT = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['application/pdf', 'pdf'],
])

type Params = { params: Promise<{ category: string; postId: string }> }

// GET /api/board/[category]/[postId]/attachments — 첨부파일 목록 조회
export async function GET(_request: NextRequest, { params }: Params) {
  const { postId } = await params
  const db = getSupabaseAdmin()

  const { data, error } = await db
    .from('brd_attch')
    .select('attch_id, fl_nm, fl_url, fl_sz, fl_tp, sort_ord, reg_dtm')
    .eq('post_id', postId)
    .eq('del_yn', 'N')
    .order('sort_ord', { ascending: true })
    .order('reg_dtm', { ascending: true })

  if (error) return apiError('BOARD_ATTACH_LIST_FAILED', 500)
  return NextResponse.json({ attachments: data ?? [] })
}

// POST /api/board/[category]/[postId]/attachments — 파일 업로드
export async function POST(request: NextRequest, { params }: Params) {
  const { category, postId } = await params
  const [ctgr, user] = await Promise.all([
    getCategory(category),
    getSessionUser(),
  ])

  if (!ctgr) return apiError('BOARD_NOT_FOUND', 404)
  if (!user) return apiError('AUTH_REQUIRED', 401)
  if (ctgr.attch_yn !== 'Y') {
    return apiError('BOARD_ATTACH_NOT_SUPPORTED', 403)
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

  if (!post) return apiError('BOARD_POST_NOT_FOUND', 404)

  const isOwner = post.rgst_usr_id === user.id
  const isModerator = user.role === 'ADMIN' || user.role === 'MASTER'
  if (!isOwner && !isModerator) {
    return apiError('BOARD_ATTACH_UPLOAD_FORBIDDEN', 403)
  }

  // 기존 첨부파일 수 확인 (5개 제한)
  const { count: existing } = await db
    .from('brd_attch')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', postId)
    .eq('del_yn', 'N')

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return apiError('BAD_REQUEST_FORMAT', 400)
  }

  const files = formData.getAll('files') as File[]
  if (files.length === 0) {
    return apiError('BOARD_ATTACH_FILE_REQUIRED', 400)
  }
  if ((existing ?? 0) + files.length > MAX_FILES) {
    return apiError('BOARD_ATTACH_MAX_FILES', 400, {
      max: MAX_FILES,
      count: existing ?? 0,
    })
  }

  // sort_ord가 FormData에 있으면 사용 (갤러리 업로드 시 명시적 순서 지정)
  const sortOrdRaw = formData.get('sort_ord')
  const baseSortOrd = sortOrdRaw !== null ? Number(sortOrdRaw) : (existing ?? 0)

  const uploaded: {
    attch_id: string
    fl_nm: string
    fl_url: string
    fl_sz: number
    sort_ord: number
  }[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (file.size > MAX_SIZE) {
      return apiError('BOARD_ATTACH_FILE_TOO_LARGE', 400, { name: file.name })
    }

    // KISA FU 검증: 카테고리별 MIME 화이트리스트 적용
    const mimeMap =
      ALLOWED_MIME_BY_CATEGORY[ctgr.ctgr_cd] ?? ALLOWED_MIME_DEFAULT
    const ext = mimeMap.get(file.type)
    if (!ext) {
      return apiError('FILE_TYPE_NOT_ALLOWED', 415)
    }

    // KISA MC: Magic Byte 검증 — 위조된 Content-Type 차단
    const buffer = await file.arrayBuffer()
    if (!validateMagicBytes(buffer, file.type)) {
      return apiError('BOARD_FILE_CONTENT_MISMATCH', 415, { name: file.name })
    }

    const storagePath = `${postId}/${randomUUID()}.${ext}`

    const { error: uploadErr } = await db.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (uploadErr) {
      // KISA IL 완화: 에러 메시지 정제 (내부 정보 노출 금지)
      console.error('[api/board/attachments/post] 파일 업로드 실패:', {
        postId,
        userId: user.id,
        fileType: file.type,
        error: uploadErr.message,
      })
      return apiError('UPLOAD_FAILED', 500)
    }

    const {
      data: { publicUrl },
    } = db.storage.from(BUCKET).getPublicUrl(storagePath)
    const sortOrd = baseSortOrd + i

    const { data: row, error: dbErr } = await db
      .from('brd_attch')
      .insert({
        post_id: postId,
        fl_nm: file.name,
        fl_pth: storagePath,
        fl_url: publicUrl,
        fl_sz: file.size,
        fl_tp: file.type || null,
        sort_ord: sortOrd,
        regr_id: user.display_name.slice(0, 20),
        modr_id: user.display_name.slice(0, 20),
      })
      .select('attch_id, sort_ord')
      .single()

    if (dbErr) {
      // DB 저장 실패 시 Storage 파일 롤백
      await db.storage.from(BUCKET).remove([storagePath])
      console.error('[api/board/attachments/post] DB 저장 실패:', {
        postId,
        userId: user.id,
        storagePath,
        error: dbErr.message,
      })
      return apiError('UPLOAD_FAILED', 500)
    }

    uploaded.push({
      attch_id: row.attch_id,
      fl_nm: file.name,
      fl_url: publicUrl,
      fl_sz: file.size,
      sort_ord: row.sort_ord,
    })
  }

  return NextResponse.json({ uploaded }, { status: 201 })
}
