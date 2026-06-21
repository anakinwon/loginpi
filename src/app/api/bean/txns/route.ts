import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { listBeanTxns } from '@/lib/bean'
import type { BeanTxnType } from '@/lib/bean-shared'

const VALID_TYPES = ['CHARGE', 'SPEND', 'REWARD', 'REFUND', 'TRANSFER'] as const
const MAX_LIMIT = 100

// GET /api/bean/txns?limit=&offset=&type= — 내 Bean 거래내역 (페이지네이션 + 유형 필터)
// getSessionUser()만 사용 → Pi(쿠키/헤더)·Google 세션 양쪽 자동 지원
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(sp.get('limit') ?? 30)))
  const offset = Math.max(0, Number(sp.get('offset') ?? 0))
  const typeParam = sp.get('type') ?? undefined
  const type =
    typeParam && (VALID_TYPES as readonly string[]).includes(typeParam)
      ? (typeParam as BeanTxnType)
      : undefined

  const { txns, total } = await listBeanTxns(user.id, { limit, offset, type })
  return NextResponse.json({ txns, total, limit, offset })
}
