// 모니터링 API 서버 공용 — 연결 확인(requireLink)·LinkError → JSON 응답 변환. 사용 : const g = await linkGate(req, linkId); if (g instanceof NextResponse) return g
import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { LinkError, requireLink, type LinkCtx } from '@/lib/link/client'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

// LinkError(code·status) → { error, code } — 원문 메시지(접속 정보 가능성)는 내보내지 않는다. 화면은 monitor.errors.<code> 로 번역
export function linkFail(e: unknown): NextResponse {
  if (e instanceof LinkError) {
    const status = e.status >= 400 && e.status < 600 ? e.status : 502
    return NextResponse.json({ error: e.code, code: e.code }, { status })
  }
  throw e // dbRoute 가 500 처리
}

export async function linkGate(req: NextRequest, linkId: string | null): Promise<LinkCtx | NextResponse> {
  if (!isUuid(linkId)) return NextResponse.json({ error: 'LINK_REQUIRED', code: 'LINK_REQUIRED' }, { status: 400 })
  try {
    const r = await requireLink(req, linkId)
    if (r instanceof Response) {
      if (r instanceof NextResponse) return r
      return new NextResponse(r.body, { status: r.status, headers: r.headers })
    }
    return r
  } catch (e) {
    return linkFail(e)
  }
}
