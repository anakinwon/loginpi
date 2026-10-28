// 내 Google 일정 가져오기(마스터 2026-10-28, M-2 유지 = OAuth 없음) — 사용자가 붙여 넣은 '비공개 iCal 주소'를 서버가 대신 읽어 기간 안 일정만 돌려준다.
//  POST(주소가 URL·접근 로그에 남지 않게) · 로그인 필수(익명 중계 남용 방지) · calendar.google.com iCal 주소만(SSRF) · 주소는 저장·기록하지 않는다
//  외부 호출 R-P4 : 타임아웃 2초 + 같은 주소 5분 캐시(주소는 해시로만 키)
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { apiError, dbRoute, parseBody, requireUser } from '@/lib/api'
import { icsUrlOk, parseIcs } from '@/lib/ics-read'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const schema = z.object({ url: z.string().max(500).refine(icsUrlOk), from: z.string().regex(DAY), to: z.string().regex(DAY) })
const CACHE_MS = 5 * 60_000
const MAX_BYTES = 2 * 1024 * 1024
// ponytail: 인스턴스 메모리 캐시(최대 200개) — 인스턴스가 여럿이면 각자 읽는다
const cache = new Map<string, { at: number; text: string }>()

async function readIcs(url: string): Promise<string | null> {
  const key = createHash('sha256').update(url).digest('hex')
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.text
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2000), redirect: 'error', headers: { Accept: 'text/calendar' } })
    if (!r.ok) return null
    const text = await r.text()
    if (text.length > MAX_BYTES || !text.startsWith('BEGIN:VCALENDAR')) return null
    if (cache.size >= 200) cache.clear()
    cache.set(key, { at: Date.now(), text })
    return text
  } catch {
    return null
  }
}

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const [user, body] = await Promise.all([requireUser(req), parseBody(req, schema)])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body
    const text = await readIcs(body.url)
    if (!text) return apiError('CAL_READ_FAILED', 502)
    return NextResponse.json({ events: parseIcs(text, body.from, body.to) }, { headers: { 'Cache-Control': 'private, no-store' } })
  }),
)
