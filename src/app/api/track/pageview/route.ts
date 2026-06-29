import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// POST /api/track/pageview — 페이지뷰 수집 (Phase 22 §12 ④)
//   클라이언트 라우트 전환 시 fire-and-forget 호출. 게스트 포함, 인증 게이트 없음.
//   ⚠️ 항상 204로 응답(실패해도 클라이언트 흐름 비차단). 핵심 가치(로그인·결제) 무간섭.

const SEARCH_HOSTS = [
  'google.',
  'bing.',
  'yahoo.',
  'naver.',
  'daum.',
  'duckduckgo.',
]
const SOCIAL_HOSTS = [
  'facebook.',
  'instagram.',
  't.co',
  'twitter.',
  'x.com',
  'youtube.',
  'tiktok.',
  'telegram.',
  't.me',
  'reddit.',
  'kakao',
]

// referrer 호스트 → 유입 채널 분류. ourHost와 같으면 INTERNAL.
function classifyChannel(refrHost: string | null, ourHost: string): string {
  if (!refrHost) return 'DIRECT'
  if (refrHost === ourHost) return 'INTERNAL'
  if (refrHost.includes('minepi.') || refrHost.includes('pi.app')) return 'PI'
  if (SEARCH_HOSTS.some((h) => refrHost.includes(h))) return 'SEARCH'
  if (SOCIAL_HOSTS.some((h) => refrHost.includes(h))) return 'SOCIAL'
  return 'REFERRAL'
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      sess_id?: string
      path?: string
      refr?: string
    } | null
    if (!body?.sess_id || !body?.path)
      return new NextResponse(null, { status: 204 })

    const sessId = String(body.sess_id).slice(0, 64)
    const path = String(body.path).slice(0, 300)

    // referrer 호스트 추출 (외부만 의미)
    let refrHost: string | null = null
    if (body.refr) {
      try {
        refrHost = new URL(String(body.refr)).host.toLowerCase().slice(0, 200)
      } catch {
        refrHost = null
      }
    }
    const ourHost = req.nextUrl.host.toLowerCase()
    const chnl = classifyChannel(refrHost, ourHost)

    // 로그인 사용자면 usr_id 기록(쿠키 또는 X-Pi-Token) — 게스트는 NULL
    const user = await getSessionUser().catch(() => null)

    await getSupabaseAdmin()
      .from('stat_pageview')
      .insert({
        sess_id: sessId,
        usr_id: user?.id ?? null,
        page_path: path,
        refr_host: chnl === 'INTERNAL' ? null : refrHost,
        chnl_cd: chnl,
        regr_id: user?.id ?? 'GUEST',
        modr_id: user?.id ?? 'GUEST',
      })
  } catch {
    // 수집 실패는 무시 — 절대 사용자 흐름을 방해하지 않는다
  }
  return new NextResponse(null, { status: 204 })
}
