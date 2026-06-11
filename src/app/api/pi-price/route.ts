import { NextResponse } from 'next/server'

// 5분 캐시 — 암호화폐 시세는 환율보다 자주 변동
export const revalidate = 300

export async function GET() {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=pi-network&vs_currencies=usd',
      { next: { revalidate: 300 } },
    )
    if (!res.ok) throw new Error(`upstream ${res.status}`)
    const data = (await res.json()) as Record<string, { usd?: number }>
    const usd = data['pi-network']?.usd ?? null
    return NextResponse.json({ usd })
  } catch {
    // 시세 조회 실패 시 null 반환 → UI에서 미표시로 degradation
    return NextResponse.json({ usd: null })
  }
}
