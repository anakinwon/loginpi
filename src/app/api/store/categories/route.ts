import { NextResponse } from 'next/server'
import { listCategoryTree } from '@/lib/mps-ctgr'

// GET /api/store/categories — 공개 카테고리 트리 (Guest 허용, 상품 목록 필터용)
export async function GET() {
  try {
    const categories = await listCategoryTree()
    return NextResponse.json({ categories })
  } catch {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }
}
