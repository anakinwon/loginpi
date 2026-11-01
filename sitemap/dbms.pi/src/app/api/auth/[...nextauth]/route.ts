// NextAuth 핸들러 — /api/auth/signin|callback|session|csrf… (정적 /api/auth/pi·me·link-* 가 우선 매칭)
// Google 미설정 환경(env 3종 없음)은 404 — useSession 폴링이 500 로그를 남기지 않게
import { NextResponse, type NextRequest } from 'next/server'
import { googleEnabled, handlers } from '@/auth'

const disabled = () =>
  NextResponse.json({ error: 'not_found', code: 'NOT_FOUND' }, { status: 404 })

export const GET = (req: NextRequest) =>
  googleEnabled() ? handlers.GET(req) : disabled()
export const POST = (req: NextRequest) =>
  googleEnabled() ? handlers.POST(req) : disabled()
