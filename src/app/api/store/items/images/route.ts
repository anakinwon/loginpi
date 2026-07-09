import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { validateMagicBytes } from '@/lib/upload-validate'
import { apiError } from '@/lib/api-errors'

// POST /api/store/items/images — 상품 이미지 1장을 Storage(mps-items)에 업로드 후 공개 URL 반환
// 클라이언트가 canvas로 리사이즈·압축한 Blob을 보낸다(원본/썸네일 공용).
// 서버는 1MB·이미지 MIME를 재검증 (클라이언트 신뢰 안 함). SVG는 XSS 위험으로 제외.

const MAX_BYTES = 1 * 1024 * 1024 // 1MB
const BUCKET = 'mps-items'
const ALLOWED_MIME = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return apiError('BAD_REQUEST_FORMAT', 400)
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return apiError('FILE_FIELD_REQUIRED', 400)
  }
  if (file.size > MAX_BYTES) {
    return apiError('STORE_IMAGE_TOO_LARGE', 413)
  }
  const ext = ALLOWED_MIME.get(file.type)
  if (!ext) {
    return apiError('STORE_IMAGE_TYPE_NOT_ALLOWED', 415)
  }

  // 업로더별 폴더 분리 + uuid 파일명 (경로 충돌·열거 방지)
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`
  const buffer = await file.arrayBuffer()

  // KISA MC: Magic Byte 검증 — 위조된 Content-Type 차단
  if (!validateMagicBytes(buffer, file.type)) {
    return apiError('FILE_CONTENT_MISMATCH', 415)
  }

  const { error } = await getSupabaseAdmin()
    .storage.from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (error) {
    // KISA IL 완화: 에러 메시지 정제 (내부 정보 노출 금지)
    console.error('[api/store/items/images/post] 파일 업로드 실패:', {
      userId: user.id,
      fileType: file.type,
      fileSize: file.size,
      error: error.message,
    })
    return apiError('UPLOAD_FAILED', 500)
  }

  const { data } = getSupabaseAdmin().storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
