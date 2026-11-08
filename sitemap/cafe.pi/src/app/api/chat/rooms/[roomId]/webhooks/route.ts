import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'
import { getChatPlan } from '@/lib/chat-auth'
import { validateWebhookUrl } from '@/lib/chat-webhook'
import { apiError } from '@/lib/api-errors'

type Params = { params: Promise<{ roomId: string }> }

// TASK-072: 카페 봇·Webhook 연동 (Business 전용)
// 방장(OWNER) + BUSINESS 플랜만 등록 가능 — api_key는 봇 메시지 전송 인증에 사용

async function requireOwnerBusiness(roomId: string) {
  const user = await getSessionUser()
  if (!user)
    return {
      error: apiError('AUTH_REQUIRED', 401),
    }

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr || mbr.mbr_role_cd !== 'OWNER') {
    return {
      error: apiError('CHAT_WEBHOOK_OWNER_ONLY', 403),
    }
  }

  const plan = await getChatPlan(user.id)
  if (plan.tier !== 'BUSINESS') {
    return {
      error: NextResponse.json(
        {
          error: 'Webhook은 Business 플랜 전용 기능입니다',
          code: 'CHAT_WEBHOOK_BUSINESS_ONLY',
          businessRequired: true,
        },
        { status: 402 },
      ),
    }
  }
  return { user }
}

// GET /api/chat/rooms/[roomId]/webhooks — 등록된 Webhook 목록 (api_key 마스킹)
export async function GET(_request: NextRequest, { params }: Params) {
  const { roomId } = await params
  const gate = await requireOwnerBusiness(roomId)
  if ('error' in gate) return gate.error

  const { data, error } = await getSupabaseAdmin()
    .from('msg_webhook')
    .select('webhook_id, bot_nm, webhook_url, api_key, use_yn, reg_dtm')
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })

  if (error) return apiError('LIST_FAILED', 500)

  // api_key는 앞 8자만 노출 (등록 시 1회 전체 반환)
  const webhooks = (data ?? []).map(
    (w: { api_key: string } & Record<string, unknown>) => ({
      ...w,
      api_key: `${w.api_key.slice(0, 8)}…`,
    }),
  )
  return NextResponse.json({ webhooks })
}

// POST /api/chat/rooms/[roomId]/webhooks — Webhook·봇 등록
// Body: { bot_nm?: string, webhook_url?: string } — 응답의 api_key는 이때 한 번만 전체 노출
export async function POST(request: NextRequest, { params }: Params) {
  const { roomId } = await params
  const gate = await requireOwnerBusiness(roomId)
  if ('error' in gate) return gate.error
  const { user } = gate

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }
  const { bot_nm, webhook_url } = body as {
    bot_nm?: string
    webhook_url?: string
  }

  if (webhook_url) {
    // SSRF 방어 — https 강제 + DNS 해석 결과의 loopback·사설·link-local 대역 차단
    // (발송 시점에도 pushRoomWebhooks가 재검증 — DNS rebinding 대비 이중 방어)
    const blocked = await validateWebhookUrl(webhook_url)
    if (blocked) {
      return NextResponse.json({ error: blocked }, { status: 400 })
    }
  }

  // 방당 최대 5개 제한
  const db = getSupabaseAdmin()
  const { count } = await db
    .from('msg_webhook')
    .select('webhook_id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
  if ((count ?? 0) >= 5) {
    return apiError('CHAT_WEBHOOK_MAX', 409)
  }

  const apiKey = `pibot_${randomBytes(24).toString('hex')}`
  const slug = user.display_name.slice(0, 20)

  const { data, error } = await db
    .from('msg_webhook')
    .insert({
      room_id: roomId,
      usr_id: user.id,
      bot_nm: (bot_nm?.trim() || 'Bot').slice(0, 50),
      webhook_url: webhook_url?.trim() || null,
      api_key: apiKey,
      regr_id: slug,
      modr_id: slug,
    })
    .select('webhook_id, bot_nm, webhook_url, reg_dtm')
    .single()

  if (error) return apiError('CHAT_WEBHOOK_CREATE_FAILED', 500)

  // api_key는 이 응답에서만 전체 노출 — 이후 조회는 마스킹
  return NextResponse.json(
    { webhook: { ...data, api_key: apiKey } },
    { status: 201 },
  )
}

// DELETE /api/chat/rooms/[roomId]/webhooks?id=<webhook_id> — 논리삭제
export async function DELETE(request: NextRequest, { params }: Params) {
  const { roomId } = await params
  const gate = await requireOwnerBusiness(roomId)
  if ('error' in gate) return gate.error
  const { user } = gate

  const webhookId = new URL(request.url).searchParams.get('id')
  if (!webhookId) return apiError('CHAT_WEBHOOK_ID_REQUIRED', 400)

  const { error } = await getSupabaseAdmin()
    .from('msg_webhook')
    .update({
      del_yn: 'Y',
      del_dtm: new Date().toISOString(),
      modr_id: user.display_name.slice(0, 20),
      mod_dtm: new Date().toISOString(),
    })
    .eq('webhook_id', webhookId)
    .eq('room_id', roomId)
    .eq('del_yn', 'N')

  if (error) return apiError('CHAT_WEBHOOK_DELETE_FAILED', 500)
  return NextResponse.json({ deleted: true })
}
