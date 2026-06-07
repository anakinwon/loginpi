import { NextResponse } from 'next/server'

// 15분 캐시 — 환율은 하루 단위 변동이므로 짧은 캐시로 충분
export const revalidate = 900

export async function GET() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      next: { revalidate: 900 },
    })
    if (!res.ok) throw new Error(`upstream ${res.status}`)
    const data = (await res.json()) as {
      rates: Record<string, number>
      time_last_update_utc?: string
    }
    return NextResponse.json({ rates: data.rates, updated: data.time_last_update_utc })
  } catch {
    // 실패 시 빈 rates 반환 → UI에서 '—' 표시로 degradation
    return NextResponse.json({ rates: {}, updated: null })
  }
}
