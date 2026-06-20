import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getChatPlan } from '@/lib/chat-auth'

// TASK-074: 커스텀 스티커 제작 (Business 전용)
// POST /api/stickers/custom — multipart: pack_nm, price_bean, mkt_yn, files(1~10)
// 제작은 Business 플랜 포함 기능 — 마켓 판매 시 구매자는 기존 STICKER_PACK 결제 흐름 사용
const MAX_STICKERS = 10
const MAX_BYTES = 2 * 1024 * 1024 // 스티커 1장 2MB

// SVG는 인라인 스크립트 실행 가능(Stored XSS) — 의도적으로 제외
const ALLOWED_MIME = new Map<string, string>([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
])

const BUCKET = 'chat-attachments'

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const plan = await getChatPlan(user.id)
  if (plan.tier !== 'BUSINESS') {
    return NextResponse.json(
      {
        error: '커스텀 스티커 제작은 Business 플랜 전용 기능입니다',
        businessRequired: true,
      },
      { status: 402 },
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: '잘못된 요청 형식입니다' },
      { status: 400 },
    )
  }

  const packNm = String(formData.get('pack_nm') ?? '').trim()
  const priceBean = Number(formData.get('price_bean') ?? 0)
  const mktYn = formData.get('mkt_yn') === 'Y' ? 'Y' : 'N'
  const files = formData
    .getAll('files')
    .filter((f): f is File => f instanceof File)

  if (!packNm || packNm.length > 100) {
    return NextResponse.json(
      { error: '팩 이름을 입력해주세요 (100자 이내)' },
      { status: 400 },
    )
  }
  if (!Number.isInteger(priceBean) || priceBean < 0 || priceBean > 10000) {
    return NextResponse.json(
      { error: '판매가는 0~10000 Bean 정수여야 합니다' },
      { status: 400 },
    )
  }
  if (files.length < 1 || files.length > MAX_STICKERS) {
    return NextResponse.json(
      { error: `스티커 이미지는 1~${MAX_STICKERS}개여야 합니다` },
      { status: 400 },
    )
  }
  for (const f of files) {
    if (f.size > MAX_BYTES) {
      return NextResponse.json(
        { error: '스티커 이미지는 1장당 2MB 이하여야 합니다' },
        { status: 413 },
      )
    }
    if (!ALLOWED_MIME.has(f.type)) {
      return NextResponse.json(
        { error: '허용되지 않은 이미지 형식입니다 (png/jpg/gif/webp)' },
        { status: 415 },
      )
    }
  }

  const db = getSupabaseAdmin()
  const slug = user.display_name.slice(0, 20)

  // 사용자당 커스텀 팩 최대 10개
  const { count } = await db
    .from('msg_stkr_pack')
    .select('pack_id', { count: 'exact', head: true })
    .eq('ownr_usr_id', user.id)
    .eq('del_yn', 'N')
  if ((count ?? 0) >= 10) {
    return NextResponse.json(
      { error: '커스텀 팩은 최대 10개까지 만들 수 있습니다' },
      { status: 409 },
    )
  }

  // 팩 생성
  const { data: pack, error: packError } = await db
    .from('msg_stkr_pack')
    .insert({
      pack_nm: packNm,
      pack_desc: `${user.display_name} 님의 커스텀 스티커팩`,
      price_bean: priceBean,
      is_dflt_yn: 'N',
      ownr_usr_id: user.id,
      mkt_yn: mktYn,
      regr_id: slug,
      modr_id: slug,
    })
    .select('pack_id, pack_nm')
    .single()

  if (packError || !pack)
    return NextResponse.json({ error: '팩 생성 실패' }, { status: 500 })
  const packId = (pack as { pack_id: string }).pack_id

  // 이미지 업로드 → msg_stkr INSERT (개별 실패 시 전체 롤백 대신 성공분만 유지)
  const stickerRows: {
    pack_id: string
    stkr_nm: string
    stkr_url: string
    sort_ord: number
    regr_id: string
    modr_id: string
  }[] = []
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    const ext = ALLOWED_MIME.get(f.type)!
    const path = `stickers/${packId}/${crypto.randomUUID()}.${ext}`
    const { error: upError } = await db.storage
      .from(BUCKET)
      .upload(path, await f.arrayBuffer(), {
        contentType: f.type,
        upsert: false,
      })
    if (upError) continue

    const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path)
    stickerRows.push({
      pack_id: packId,
      stkr_nm:
        f.name.replace(/\.[^.]+$/, '').slice(0, 100) || `sticker-${i + 1}`,
      stkr_url: urlData.publicUrl,
      sort_ord: i,
      regr_id: slug,
      modr_id: slug,
    })
  }

  if (stickerRows.length === 0) {
    // 전부 업로드 실패 → 팩 논리삭제
    await db
      .from('msg_stkr_pack')
      .update({ del_yn: 'Y', del_dtm: new Date().toISOString() })
      .eq('pack_id', packId)
    return NextResponse.json(
      { error: '스티커 이미지 업로드에 실패했습니다' },
      { status: 500 },
    )
  }

  const { error: stkrError } = await db.from('msg_stkr').insert(stickerRows)
  if (stkrError) {
    await db
      .from('msg_stkr_pack')
      .update({ del_yn: 'Y', del_dtm: new Date().toISOString() })
      .eq('pack_id', packId)
    return NextResponse.json({ error: '스티커 등록 실패' }, { status: 500 })
  }

  // 제작자 자동 보유 처리 (pymnt_id 없이 — 제작 = 소유)
  await db
    .from('msg_usr_stkr')
    .upsert(
      { usr_id: user.id, pack_id: packId, regr_id: slug, modr_id: slug },
      { onConflict: 'usr_id,pack_id' },
    )

  return NextResponse.json(
    {
      pack: {
        pack_id: packId,
        pack_nm: packNm,
        sticker_cnt: stickerRows.length,
        mkt_yn: mktYn,
      },
    },
    { status: 201 },
  )
}
