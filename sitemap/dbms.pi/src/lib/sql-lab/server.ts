// SQL 튜닝 랩 API 공용(서버 전용) — 연결 확인(requireLink)·LinkError → JSON 응답 변환. 라우트는 withGuard(dbRoute(...)) 안에서 사용
import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import type { UserRow } from '@pi/db'
import { requireUser } from '@/lib/api'
import { LinkError, requireLink, type LinkCtx } from '@/lib/link/client'

// LinkError(LINK_AUTH·CONN_UNSUPPORTED·TIMEOUT …) → { error, code } — 접속 정보는 담지 않는다(클라이언트가 sqlLab.errors.<code> 번역)
export function linkFail(e: unknown): NextResponse {
  if (e instanceof LinkError)
    return NextResponse.json({ error: e.code, code: e.code }, { status: e.status || 502 })
  throw e // dbRoute 가 500 처리
}

// 로그인 사용자 + 연결 소유 확인을 병렬로(R-P1). 실패면 응답
//  ponytail: requireLink 안에서도 세션을 보므로 세션 조회 2회 — LinkCtx 에 usrId 가 생기면 requireUser 제거
export async function requireUserLink(
  req: NextRequest,
  linkId: string,
): Promise<{ user: UserRow; link: LinkCtx } | NextResponse> {
  try {
    const [user, link] = await Promise.all([requireUser(req), requireLink(req, linkId)])
    if (user instanceof NextResponse) return user
    if (link instanceof Response) return link as NextResponse
    return { user, link }
  } catch (e) {
    return linkFail(e)
  }
}

// 연결만 확인(사용자 행이 필요 없는 조회)
export async function resolveLink(req: NextRequest, linkId: string): Promise<LinkCtx | NextResponse> {
  try {
    const link = await requireLink(req, linkId)
    return link instanceof Response ? (link as NextResponse) : link
  } catch (e) {
    return linkFail(e)
  }
}
