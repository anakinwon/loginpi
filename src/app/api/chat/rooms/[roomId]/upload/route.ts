import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'
import { recordUserAction } from '@/lib/event'

type Params = { params: Promise<{ roomId: string }> }

const MAX_BYTES = 10 * 1024 * 1024 // 10MB
const BUCKET = 'chat-attachments'

// MIME 허용목록 — 확장자는 서버가 결정 (클라이언트 file.name 신뢰 안 함)
// SVG는 인라인 스크립트 실행 가능(Stored XSS)하므로 의도적으로 제외
const ALLOWED_MIME = new Map<string, string>([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
  ['audio/mpeg', 'mp3'],
  ['audio/mp4', 'm4a'],
  ['audio/webm', 'webm'],
  ['audio/ogg', 'ogg'],
  ['audio/wav', 'wav'],
  ['application/pdf', 'pdf'],
  ['text/plain', 'txt'],
  ['application/zip', 'zip'],
  ['application/msword', 'doc'],
  [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'docx',
  ],
])

function getMsgTpCd(mime: string): 'IMAGE' | 'VOICE' | 'FILE' {
  if (mime.startsWith('image/')) return 'IMAGE'
  if (mime.startsWith('audio/')) return 'VOICE'
  return 'FILE'
}

// POST /api/chat/rooms/[roomId]/upload — Supabase Storage에 파일 업로드 후 공개 URL 반환
// 클라이언트는 응답의 url + msg_tp_cd로 메시지 API를 별도 호출한다
export async function POST(request: NextRequest, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr)
    return NextResponse.json({ error: '카페 멤버가 아닙니다' }, { status: 403 })

  let formData: FormData
  try {
    formData = await request.formData()
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
      { error: '파일 크기는 10MB 이하여야 합니다' },
      { status: 413 },
    )
  }

  const ext = ALLOWED_MIME.get(file.type)
  if (!ext) {
    return NextResponse.json(
      { error: '허용되지 않은 파일 형식입니다' },
      { status: 415 },
    )
  }

  const uuid = crypto.randomUUID()
  const path = `${roomId}/${uuid}.${ext}`
  const buffer = await file.arrayBuffer()
  const isMedia =
    file.type.startsWith('image/') || file.type.startsWith('audio/')

  const db = getSupabaseAdmin()
  const { error } = await db
    .storage.from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (error) {
    // KISA IL 완화: 에러 메시지 정제 (내부 정보 노출 금지)
    console.error('[api/chat/rooms/upload/post] 파일 업로드 실패:', {
      roomId,
      userId: user.id,
      fileType: file.type,
      fileSize: file.size,
      error: error.message,
    })
    return NextResponse.json(
      { error: '파일 업로드에 실패했습니다. 잠시 후 다시 시도해주세요' },
      { status: 500 },
    )
  }

  // 미디어 외 파일은 ?download= 파라미터로 Content-Disposition: attachment 강제
  // — 브라우저 인라인 렌더(콘텐츠 스니핑 XSS) 차단. 파일명은 정제 후 사용
  const safeName =
    file.name.replace(/[^\w.\-가-힣 ]/g, '_').slice(0, 80) || `file.${ext}`
  const { data: urlData } = db
    .storage.from(BUCKET)
    .getPublicUrl(path, isMedia ? undefined : { download: safeName })

  // M6: 파일 전송 미션 기록 (비블로킹) — MULTI_OR 중 1개
  recordUserAction('file_send', user.id, {
    roomId,
    file_type: getMsgTpCd(file.type),
    file_size: file.size,
  }).catch((err) => console.error(`[M6-file] 미션 기록 실패: ${err.message}`))

  return NextResponse.json({
    url: urlData.publicUrl,
    msg_tp_cd: getMsgTpCd(file.type),
    file_name: file.name,
    size: file.size,
    mime: file.type,
  })
}
