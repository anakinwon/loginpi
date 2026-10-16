// 개발 전용 사용자 전환 — GET 현재 사용자, POST { pi_usr_nm } 쿠키 설정(빈 값이면 해제). 운영 빌드에서는 404
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { DEV_COOKIE, DEV_USER_RE, apiError, currentUser, parseBody } from '@/lib/api'

const off = () => process.env.NODE_ENV === 'production'

export async function GET() {
  if (off()) return apiError('NOT_FOUND', 404)
  return NextResponse.json({ ok: true, user: await currentUser() })
}

export async function POST(req: Request) {
  if (off()) return apiError('NOT_FOUND', 404)
  const body = await parseBody(req, z.object({ pi_usr_nm: z.union([z.literal(''), z.string().regex(DEV_USER_RE)]) }))
  if (body instanceof NextResponse) return body
  const res = NextResponse.json({ ok: true })
  if (body.pi_usr_nm) res.cookies.set(DEV_COOKIE, body.pi_usr_nm, { httpOnly: true, sameSite: 'lax', path: '/' })
  else res.cookies.delete(DEV_COOKIE)
  return res
}
