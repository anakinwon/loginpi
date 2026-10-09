// 사이트 이미지 업로드 API — POST multipart(file) → Supabase Storage 공개 버킷 site-img/<userId>/<UUID>.<ext>, 공개 URL 반환.
// 매직바이트로 형식 판정(선언 MIME 불신, SVG 제외 — 스크립트 삽입 위험), 2MB 제한, 파일명은 서버 생성 UUID. 로그인 필수
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbRoute, requireUser } from '@/lib/api'
import { IMG_BUCKET, LIMITS } from '@/lib/site'

function sniffImage(b: Uint8Array): { ext: string; mime: string } | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x)
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return { ext: 'png', mime: 'image/png' }
  if (at(0, 0xff, 0xd8, 0xff)) return { ext: 'jpg', mime: 'image/jpeg' }
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return { ext: 'gif', mime: 'image/gif' }
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50))
    return { ext: 'webp', mime: 'image/webp' }
  return null
}

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const user = await requireUser(req)
    if (user instanceof NextResponse) return user

    let file: FormDataEntryValue | null
    try {
      file = (await req.formData()).get('file')
    } catch {
      return apiError('BAD_REQUEST_BODY', 400)
    }
    if (!(file instanceof File)) return apiError('INVALID_INPUT', 400)
    if (file.size > LIMITS.imgMaxBytes) return apiError('IMG_TOO_LARGE', 413)

    const bytes = new Uint8Array(await file.arrayBuffer())
    const kind = sniffImage(bytes)
    if (!kind) return apiError('IMG_TYPE', 415)

    const path = `${user.id}/${randomUUID()}.${kind.ext}`
    const storage = db().storage.from(IMG_BUCKET)
    const { error } = await storage.upload(path, bytes, {
      contentType: kind.mime,
      cacheControl: '31536000',
      upsert: false,
    })
    if (error) {
      console.error('[upload]', error.message)
      return /bucket not found/i.test(error.message)
        ? apiError('IMG_BUCKET_MISSING', 503)
        : apiError('SAVE_FAILED', 500)
    }
    return NextResponse.json(
      { url: storage.getPublicUrl(path).data.publicUrl },
      { status: 201 },
    )
  }),
  // 2MB + multipart 헤더 여유 — @pi/guard 기본 64KB 대신
  { maxBodySize: LIMITS.imgMaxBytes + 64 * 1024 },
)
