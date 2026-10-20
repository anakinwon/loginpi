// 모니터링 주기 수집(2026-10-21) — GET(Vercel Cron) : Authorization: Bearer <CRON_SECRET> 일 때만. 전체 사용 URL 점검 + 이력 보관 기간(7일) 정리
// CRON_SECRET 미설정이면 꺼짐(503) — 화면이 열린 동안의 수집만 동작
import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { dbError } from '@/lib/api'
import { collectAll } from '@/lib/mon-srv'

export const maxDuration = 60

export async function GET(req: Request) {
  const sec = process.env.CRON_SECRET
  if (!sec) return NextResponse.json({ ok: false, message: 'CRON_SECRET 미설정 — 주기 수집 꺼짐' }, { status: 503 })
  const got = Buffer.from(req.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${sec}`)
  if (got.length !== want.length || !timingSafeEqual(got, want)) return NextResponse.json({ ok: false }, { status: 401 })
  try {
    return NextResponse.json({ ok: true, ...(await collectAll()) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
