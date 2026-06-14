import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { recordUserAction } from '@/lib/event'

const CONSENT_VER = 'v1.0'

// GET /api/location/consent — 현재 LBS 동의 상태 조회
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  return NextResponse.json({
    consent_yn: user.lbs_consent_yn ?? 'N',
    consent_dtm: user.lbs_consent_dtm,
    consent_ver: user.lbs_consent_ver,
  })
}

// POST /api/location/consent — LBS 동의 등록 (Rule LBS-01 게이트 활성화)
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  let body: { consent_ver?: string } = {}
  try {
    body = await request.json()
  } catch {
    // body 없으면 기본 버전 사용
  }

  const consentVer = body.consent_ver ?? CONSENT_VER
  const headerStore = await headers()
  const clientIp =
    headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headerStore.get('x-real-ip') ??
    'unknown'
  const userAgent = headerStore.get('user-agent') ?? ''
  const now = new Date().toISOString()

  const db = getSupabaseAdmin()

  // sys_user 캐시 업데이트 + sys_user_consent 이력 동시 처리
  const [updateResult, consentResult] = await Promise.all([
    db
      .from('sys_user')
      .update({
        lbs_consent_yn: 'Y',
        lbs_consent_dtm: now,
        lbs_consent_ver: consentVer,
        mod_dtm: now,
      })
      .eq('id', user.id),
    db.from('sys_user_consent').insert({
      user_str_id: user.id,
      consent_tp_cd: 'LBS',
      consent_yn: 'Y',
      consent_ver: consentVer,
      client_ip: clientIp,
      user_agent: userAgent,
      regr_id: user.id,
      modr_id: user.id,
    }),
  ])

  if (updateResult.error || consentResult.error) {
    return NextResponse.json({ error: '동의 처리 중 오류가 발생했습니다' }, { status: 500 })
  }

  // M9: 위치기반서비스 동의 미션 기록 (보증금 예치 bond_deposit와 함께 MULTI_AND, 비블로킹)
  recordUserAction('lbs_consent', user.id, { consent_ver: consentVer })
    .catch((err) => console.error(`[M9] 미션 기록 실패: ${err.message}`))

  return NextResponse.json({ ok: true, consent_yn: 'Y', consent_ver: consentVer })
}

// DELETE /api/location/consent — LBS 동의 철회 + 위치 이력 즉시 논리삭제 (Rule LBS-03)
export async function DELETE() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const headerStore = await headers()
  const clientIp =
    headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headerStore.get('x-real-ip') ??
    'unknown'
  const userAgent = headerStore.get('user-agent') ?? ''
  const now = new Date().toISOString()

  const db = getSupabaseAdmin()

  // 3가지 작업 동시 처리: 캐시 갱신 + 철회 이력 + 위치 이력 논리삭제
  const [updateResult, consentResult, locResult] = await Promise.all([
    db
      .from('sys_user')
      .update({
        lbs_consent_yn: 'N',
        lbs_consent_dtm: now,
        mod_dtm: now,
      })
      .eq('id', user.id),
    db.from('sys_user_consent').insert({
      user_str_id: user.id,
      consent_tp_cd: 'LBS',
      consent_yn: 'N',
      consent_ver: user.lbs_consent_ver ?? CONSENT_VER,
      client_ip: clientIp,
      user_agent: userAgent,
      regr_id: user.id,
      modr_id: user.id,
    }),
    // 위치정보법 제18조: 철회 즉시 파기 의무 → del_yn='Y' 논리삭제
    db
      .from('usr_loc_hist')
      .update({ del_yn: 'Y', del_dtm: now, modr_id: user.id, mod_dtm: now })
      .eq('user_str_id', user.id)
      .eq('del_yn', 'N'),
  ])

  if (updateResult.error || consentResult.error) {
    return NextResponse.json({ error: '철회 처리 중 오류가 발생했습니다' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    consent_yn: 'N',
    deleted_loc_count: locResult.error ? 0 : undefined,
  })
}
