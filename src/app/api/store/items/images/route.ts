import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

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
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json(
      { error: '잘못된 요청 형식입니다' },
      { status: 400 },
    )
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'file 필드가 필요합니다' },
      { status: 400 },
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: '이미지 크기는 1MB 이하여야 합니다' },
      { status: 413 },
    )
  }
  const ext = ALLOWED_MIME.get(file.type)
  if (!ext) {
    return NextResponse.json(
      { error: '허용되지 않은 이미지 형식입니다 (JPEG/PNG/WebP/GIF)' },
      { status: 415 },
    )
  }

  // 업로더별 폴더 분리 + uuid 파일명 (경로 충돌·열거 방지)
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`
  const buffer = await file.arrayBuffer()

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
    return NextResponse.json(
      { error: '이미지 업로드에 실패했습니다. 잠시 후 다시 시도해주세요' },
      { status: 500 },
    )
  }

  const { data } = getSupabaseAdmin().storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
